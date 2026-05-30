import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type {
  AnyHarnessTypes,
  ArtifactRef,
  CleanupPlan,
  ExecutableJourney,
  JourneyRun,
  SeedGateResult,
  StepRunResult,
  TeardownResult,
} from "../core/index.js";

export interface RunArtifactScope {
  artifactRoot?: string | undefined;
  suiteId?: string | undefined;
  journeyId: string;
  profileId?: string | undefined;
  runId: string;
}

export interface RunArtifacts {
  journeyId: string;
  runId: string;
  root: string;
  absDir: string;
  relDir: string;
}

export interface ArtifactReadResult {
  status: "ok" | "not-found" | "blocked";
  path?: string;
  kind?: string;
  encoding?: "utf8" | "base64";
  content?: unknown;
  error?: string;
}

export interface RunArtifactRecorder<TTypes extends AnyHarnessTypes = AnyHarnessTypes> {
  readonly run: RunArtifacts;
  writeSeed(seedGate: SeedGateResult<TTypes>): Promise<ArtifactRef>;
  writeStep(result: StepRunResult<TTypes>): Promise<ArtifactRef>;
  writeCleanupPlan(plan: CleanupPlan<TTypes>): Promise<ArtifactRef>;
  writeTeardown(result: TeardownResult<TTypes>, name?: string): Promise<ArtifactRef>;
  writeOwnedResources(run: JourneyRun<TTypes>): Promise<ArtifactRef>;
  writeResult(result: Record<string, unknown>): Promise<ArtifactRef>;
  /**
   * Build the operator-facing run index by SCANNING the run directory, so every
   * file produced for this run (including forensics written by other modules)
   * is linked even if it never passed through this recorder. Writes machine
   * `index.json` + human `index.md`, and refreshes the journey-level
   * `latest.json` pointer so an operator can open the newest run without
   * knowing its run id. Returns the refs it wrote.
   */
  writeRunIndex(runResult: Record<string, unknown>): Promise<RunIndexArtifacts>;
  forensicsDir(): string;
}

export interface RunIndexArtifacts {
  index: ArtifactRef;
  humanIndex: ArtifactRef;
  latest: ArtifactRef;
}

export const DEFAULT_AGENT_E2E_ARTIFACT_ROOT = ".agents-e2e/artifacts";

export function createRunArtifacts(scope: RunArtifactScope): RunArtifacts {
  const root = resolve(scope.artifactRoot ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT);
  const journeySegment = safePathSegment(scope.journeyId);
  const profileSegment = safePathSegment(scope.profileId ?? "default");
  const runSegment = safePathSegment(scope.runId);
  const absDir = scope.suiteId
    ? resolve(root, "_suites", safePathSegment(scope.suiteId), "runs", journeySegment, profileSegment, runSegment)
    : resolve(root, journeySegment, runSegment);
  return {
    journeyId: scope.journeyId,
    runId: scope.runId,
    root,
    absDir,
    relDir: toPortablePath(relative(process.cwd(), absDir)),
  };
}

export function createRunArtifactRecorder<TTypes extends AnyHarnessTypes>(
  scope: RunArtifactScope,
  journey?: ExecutableJourney<TTypes>,
): RunArtifactRecorder<TTypes> {
  const run = createRunArtifacts(scope);

  return {
    run,
    writeSeed: (seedGate) =>
      writeJsonArtifact(run, "seed-manifest.json", seedGate.manifest, {
        name: "seed-manifest",
        description:
          "Seed manifest for this run: profile, checked/created/forbidden environment state, warnings, and errors.",
      }),
    writeStep: (result) =>
      writeJsonArtifact(
        run,
        `${phaseSegment(journey, result.phaseId)}/${stepSegment(journey, result.phaseId, result.stepId)}/result.json`,
        result,
        {
          name: "result",
          description:
            "Step result with status, observed data, owned resources, proofs, timings, warnings, errors, and peer artifacts.",
        },
      ),
    writeCleanupPlan: (plan) =>
      writeJsonArtifact(run, "cleanup-plan.json", plan, {
        name: "cleanup-plan",
        description:
          "Preview of run-owned resources selected for cleanup and resources skipped as not-owned.",
      }),
    writeTeardown: (result, name = "cleanup") =>
      writeJsonArtifact(run, `${safePathSegment(name)}.json`, result, {
        name,
        description:
          "Cleanup/teardown outcome: planned, deleted, skipped, and failed run-owned resources.",
      }),
    writeOwnedResources: (journeyRun) =>
      writeJsonArtifact(run, "owned-resources.json", journeyRun.ownershipLedger.resources, {
        name: "owned-resources",
        description:
          "Resources this run owns. Cleanup and reseed must only delete resources recorded here.",
      }),
    writeResult: (result) =>
      writeJsonArtifact(run, "result.json", result, {
        name: "result",
        description:
          "Run progress summary: current status, phase/step progress, artifact directory, and next actions.",
      }),
    writeRunIndex: (runResult) => writeRunIndex(run, runResult),
    forensicsDir: () => resolve(run.absDir, "forensics"),
  };
}

const RUN_INDEX_FILENAMES = new Set(["index.json", "index.md"]);

/**
 * Scan the run directory and emit the operator entry points: `index.json`
 * (machine), `index.md` (human), and a journey-level `latest.json` pointer.
 * The scan is the source of truth, so artifacts written by any module (e.g.
 * `forensics/` screenshots from the Playwright MCP) are linked without this
 * recorder having to know about them.
 */
export async function writeRunIndex(
  run: RunArtifacts,
  runResult: Record<string, unknown>,
): Promise<RunIndexArtifacts> {
  await mkdir(run.absDir, { recursive: true });
  const files = await scanRunFiles(run.absDir);
  const grouped = groupRunFiles(files);
  const status = typeof runResult.status === "string" ? runResult.status : "running";
  const summary = typeof runResult.summary === "string" ? runResult.summary : undefined;

  const index = {
    runId: run.runId,
    journeyId: run.journeyId,
    profileId: runResult.profileId,
    status,
    summary,
    completion: runResult.completion,
    crystallized: runResult.crystallized ?? false,
    startedAt: runResult.startedAt,
    completedAt: runResult.completedAt,
    artifactDir: run.relDir,
    headline: grouped.headline,
    phases: runResult.phases ?? [],
    steps: grouped.steps,
    forensics: grouped.forensics,
    files: files.map((file) => ({ path: file, ...classifyRunFile(file) })),
  };

  const indexRef = await writeJsonArtifact(run, "index.json", index, {
    name: "index",
    kind: "json",
    description:
      "Run index: headline proof, per-step artifacts, and forensics for this run. Open index.md for the human view.",
  });
  const humanRef = await writeTextArtifact(run, "index.md", renderRunIndexMarkdown(index, grouped), {
    name: "index",
    kind: "markdown",
    description: "Human-readable run index. Open this first to discover headline proof and artifacts.",
  });
  const latestRef = await writeLatestPointer(run, index);
  return { index: indexRef, humanIndex: humanRef, latest: latestRef };
}

interface GroupedRunFiles {
  headline: Record<string, string | null>;
  steps: Array<{ dir: string; artifacts: Record<string, string> }>;
  forensics: Array<{ path: string; kind: string; name: string }>;
}

async function scanRunFiles(absDir: string): Promise<string[]> {
  const entries = await readdir(absDir, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = (entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path?: string }).path
      ?? absDir;
    files.push(toPortablePath(relative(absDir, join(parent, entry.name))));
  }
  return files.filter((file) => !RUN_INDEX_FILENAMES.has(file)).sort();
}

function groupRunFiles(files: readonly string[]): GroupedRunFiles {
  const has = (name: string) => (files.includes(name) ? name : null);
  const headline: Record<string, string | null> = {
    result: has("result.json"),
    timeline: has("timeline.json"),
    metrics: has("metrics.json"),
    seed: has("seed-manifest.json"),
    ownedResources: has("owned-resources.json"),
    cleanup: has("cleanup.json"),
    cleanupPlan: has("cleanup-plan.json"),
  };
  const stepDirs = new Map<string, Record<string, string>>();
  const forensics: Array<{ path: string; kind: string; name: string }> = [];
  for (const file of files) {
    const segments = file.split("/");
    if (segments[0] === "forensics" && segments.length === 2) {
      const meta = classifyRunFile(file);
      forensics.push({ path: file, kind: meta.kind, name: meta.name });
      continue;
    }
    const phaseSeg = segments[0];
    const stepSeg = segments[1];
    if (segments.length >= 3 && phaseSeg && stepSeg && /^\d\d-phase-/.test(phaseSeg) && /^\d\d-step-/.test(stepSeg)) {
      const dir = `${phaseSeg}/${stepSeg}`;
      const bucket = stepDirs.get(dir) ?? {};
      bucket[classifyRunFile(file).name] = file;
      stepDirs.set(dir, bucket);
    }
  }
  return {
    headline,
    steps: [...stepDirs.entries()].map(([dir, artifacts]) => ({ dir, artifacts })),
    forensics,
  };
}

function classifyRunFile(file: string): { kind: string; name: string } {
  const leaf = file.split("/").at(-1) ?? file;
  const ext = extname(leaf).replace(/^\./, "").toLowerCase();
  const name = leaf.replace(/\.[^.]+$/, "");
  if (ext === "png") return { kind: "screenshot", name };
  if (file.startsWith("forensics/") && name.includes("snapshot")) return { kind: "browser-snapshot", name };
  if (name === "console") return { kind: "console-log", name };
  if (name === "network") return { kind: "network-log", name };
  if (ext === "md") return { kind: "markdown", name };
  if (ext === "json") return { kind: "json", name };
  return { kind: ext || "text", name };
}

function renderRunIndexMarkdown(index: Record<string, unknown>, grouped: GroupedRunFiles): string {
  const lines: string[] = [];
  const status = String(index.status ?? "running");
  lines.push(`# Run ${index.runId}`);
  lines.push("");
  lines.push(`- **Journey:** ${index.journeyId}`);
  if (index.profileId) lines.push(`- **Profile:** ${index.profileId}`);
  lines.push(`- **Status:** ${status}${index.summary ? ` — ${index.summary}` : ""}`);
  lines.push(`- **Crystallized:** ${index.crystallized ? "yes" : "no (interactive dev run)"}`);
  if (index.startedAt) lines.push(`- **Started:** ${index.startedAt}`);
  if (index.completedAt) lines.push(`- **Completed:** ${index.completedAt}`);
  lines.push("");
  lines.push("## Headline proof");
  lines.push("");
  for (const [label, file] of Object.entries(grouped.headline)) {
    if (file) lines.push(`- [${label}](${file})`);
  }
  lines.push("");
  if (grouped.steps.length > 0) {
    lines.push("## Steps");
    lines.push("");
    for (const step of grouped.steps) {
      lines.push(`### ${step.dir}`);
      for (const [name, file] of Object.entries(step.artifacts)) {
        lines.push(`- [${name}](${file})`);
      }
      lines.push("");
    }
  }
  if (grouped.forensics.length > 0) {
    lines.push("## Forensics");
    lines.push("");
    for (const item of grouped.forensics) lines.push(`- [${item.name}](${item.path}) (${item.kind})`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

async function writeLatestPointer(run: RunArtifacts, index: Record<string, unknown>): Promise<ArtifactRef> {
  // The journey directory is the parent of the run directory for interactive
  // runs (`<root>/<journey>/<run>/`). A `latest.json` there lets an operator
  // jump to the newest run without scanning timestamps.
  const journeyDir = dirname(run.absDir);
  const runSegment = basename(run.absDir);
  const pointer = {
    runId: run.runId,
    journeyId: run.journeyId,
    profileId: index.profileId,
    status: index.status,
    summary: index.summary,
    completedAt: index.completedAt,
    updatedAt: new Date().toISOString(),
    runDir: runSegment,
    index: `${runSegment}/index.md`,
    indexJson: `${runSegment}/index.json`,
    result: `${runSegment}/result.json`,
  };
  const absPath = resolve(journeyDir, "latest.json");
  await mkdir(journeyDir, { recursive: true });
  await writeFile(absPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  return {
    id: `artifact:${safePathSegment(run.journeyId)}:latest`,
    kind: "json",
    name: "latest",
    uri: `file://${absPath}`,
    path: toPortablePath(relative(process.cwd(), absPath)),
    description: "Pointer to the newest run for this journey: status, summary, and index links.",
  };
}

export async function writeJsonArtifact(
  run: RunArtifacts,
  relativePath: string,
  value: unknown,
  metadata: { name?: string; kind?: string; description?: string | undefined } = {},
): Promise<ArtifactRef> {
  const absPath = resolveSafeRunPath(run, relativePath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return artifactRef(run, absPath, {
    kind: metadata.kind ?? "json",
    name: metadata.name ?? basenameWithoutExtension(relativePath),
    description: metadata.description,
  });
}

export async function writeTextArtifact(
  run: RunArtifacts,
  relativePath: string,
  value: string,
  metadata: { name?: string; kind?: string; description?: string | undefined } = {},
): Promise<ArtifactRef> {
  const absPath = resolveSafeRunPath(run, relativePath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, value, "utf8");
  return artifactRef(run, absPath, {
    kind: metadata.kind ?? "text",
    name: metadata.name ?? basenameWithoutExtension(relativePath),
    description: metadata.description,
  });
}

export async function writeBinaryArtifact(
  run: RunArtifacts,
  relativePath: string,
  value: Uint8Array,
  metadata: { name?: string; kind?: string; description?: string | undefined } = {},
): Promise<ArtifactRef> {
  const absPath = resolveSafeRunPath(run, relativePath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, value);
  return artifactRef(run, absPath, {
    kind: metadata.kind ?? "binary",
    name: metadata.name ?? basenameWithoutExtension(relativePath),
    description: metadata.description,
  });
}

export function artifactRef(
  run: RunArtifacts,
  absPath: string,
  metadata: { kind: string; name: string; description?: string | undefined },
): ArtifactRef {
  const runRelativePath = toPortablePath(relative(run.absDir, absPath));
  const ref: ArtifactRef = {
    id: `artifact:${safePathSegment(run.runId)}:${safePathSegment(runRelativePath)}`,
    kind: metadata.kind,
    name: metadata.name,
    uri: `file://${absPath}`,
    path: toPortablePath(relative(process.cwd(), absPath)),
    description: metadata.description ?? describeArtifact(metadata.kind, metadata.name),
  };
  return ref;
}

export function phaseDir<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
): string {
  return resolve(run.absDir, phaseSegment(journey, phaseId));
}

export function stepDir<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
): string {
  return resolve(
    phaseDir(run, journey, phaseId),
    stepSegment(journey, phaseId, stepId),
  );
}

export function stepRelativePath<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
  filename: string,
): string {
  return `${phaseSegment(journey, phaseId)}/${stepSegment(journey, phaseId, stepId)}/${filename}`;
}

export function forensicsRelativePath(filename: string): string {
  return `forensics/${filename}`;
}

export function resolveArtifactPath(
  artifactRoot: string | undefined,
  artifactPath: string,
): string | undefined {
  const root = resolve(artifactRoot ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT);
  const absPath = resolve(process.cwd(), artifactPath);
  if (isInside(root, absPath)) return absPath;
  const portableArtifactPath = artifactPath.replace(/\\/g, "/");
  const rootMarker = `${DEFAULT_AGENT_E2E_ARTIFACT_ROOT}/`;
  const markerIndex = portableArtifactPath.indexOf(rootMarker);
  if (markerIndex >= 0) {
    const markerRelative = resolve(
      root,
      portableArtifactPath.slice(markerIndex + rootMarker.length),
    );
    if (isInside(root, markerRelative)) return markerRelative;
  }
  const rootRelative = resolve(root, artifactPath);
  if (isInside(root, rootRelative)) return rootRelative;
  return undefined;
}

export async function readArtifact(
  artifactRoot: string | undefined,
  artifactPath: string,
): Promise<ArtifactReadResult> {
  const absPath = resolveArtifactPath(artifactRoot, artifactPath);
  if (!absPath) return { status: "blocked", error: "artifact path is outside artifact root" };
  if (!existsSync(absPath)) return { status: "not-found", path: artifactPath };
  const rel = toPortablePath(relative(process.cwd(), absPath));
  if (/\.png$/i.test(absPath)) {
    return {
      status: "ok",
      path: rel,
      kind: "screenshot",
      encoding: "base64",
      content: (await readFile(absPath)).toString("base64"),
    };
  }
  const content = await readFile(absPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }
  return {
    status: "ok",
    path: rel,
    kind: extname(absPath).replace(/^\./, "") || "text",
    encoding: "utf8",
    content: parsed,
  };
}

export function ensureRunDir(run: RunArtifacts): void {
  mkdirSync(run.absDir, { recursive: true });
}

export function safePathSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed"
  );
}

export function timestampSegment(date = new Date()): string {
  return date.toISOString().toLowerCase().replace(/[:.]/g, "-");
}

export function describeArtifact(kind: string, name?: string): string {
  if (kind === "screenshot") {
    if (name === "before") return "Visual state before the step ran.";
    if (name === "after") return "Visual state after a passing step.";
    if (name === "failure") return "Visual state at failure time. Read first on failures.";
    return `Browser screenshot ${name ?? "artifact"}.`;
  }
  if (kind === "console-log") return "Browser console events scoped to this step.";
  if (kind === "network-log") return "Browser network events scoped to this step.";
  if (kind === "browser-snapshot") return "Full browser snapshot with URL, title, refs, visible errors, and next actions.";
  if (kind === "json" && name === "step-feedback") return "Agent-first debug packet ranking primary and secondary artifacts for this step.";
  if (kind === "json" && name === "result") return "Run or step result JSON. Use as the single source of truth.";
  if (kind === "json" && name === "timeline") return "Compact phase/step status and timing timeline.";
  if (kind === "json" && name === "metrics") return "Per-step and aggregate run timing metrics.";
  if (kind === "json" && name === "cleanup") return "Cleanup/teardown outcome for run-owned resources.";
  return `${kind} artifact${name ? ` ${name}` : ""}.`;
}

function resolveSafeRunPath(run: RunArtifacts, relativePath: string): string {
  const absPath = resolve(run.absDir, relativePath);
  if (!isInside(run.absDir, absPath))
    throw new Error(`Artifact path escapes run directory: ${relativePath}`);
  return absPath;
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
}

function phaseSegment<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
): string {
  const phaseIndex = journey?.phases.findIndex((phase) => phase.id === phaseId) ?? -1;
  return `${padIndex(phaseIndex)}-phase-${safePathSegment(phaseId)}`;
}

function stepSegment<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
): string {
  const phase = journey?.phases.find((candidate) => candidate.id === phaseId);
  const stepIndex = phase?.steps.findIndex((step) => step.id === stepId) ?? -1;
  return `${padIndex(stepIndex)}-step-${safePathSegment(stepId)}`;
}

function padIndex(index: number): string {
  return String(index >= 0 ? index + 1 : 0).padStart(2, "0");
}

function basenameWithoutExtension(path: string): string {
  const leaf = path.split("/").at(-1) ?? path;
  return leaf.replace(/\.[^.]+$/, "");
}

function toPortablePath(path: string): string {
  return path.split(sep).join("/");
}
