import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type {
  AnyHarnessTypes,
  ArtifactRef,
  CleanupPlan,
  ExecutableJourney,
  JourneyRun,
  SeedGateResult,
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
  writeCleanupPlan(plan: CleanupPlan<TTypes>): Promise<ArtifactRef>;
  writeTeardown(result: TeardownResult<TTypes>, name?: string): Promise<ArtifactRef>;
  writeOwnedResources(run: JourneyRun<TTypes>): Promise<ArtifactRef>;
  /**
   * Build the operator-facing run report by SCANNING the run directory, so every
   * file produced for this run (inspections, journey step reports) is linked
   * even if it never passed through this recorder. Writes machine
   * `run-report.json` (the whole-run verdict + index) + human `run-report.md`,
   * and refreshes the `latest` symlink so an operator can open the newest run
   * without knowing its run id. Returns the refs it wrote.
   */
  writeRunReport(runResult: Record<string, unknown>): Promise<RunReportArtifacts>;
}

export interface RunReportArtifacts {
  report: ArtifactRef;
  humanReport: ArtifactRef;
  latest: ArtifactRef;
}

// All run artifacts live under `runs/<runId>/`. The run id is timestamp-first
// and globally unique, so a run directory needs no journey/profile path prefix —
// journey-scoped evidence nests *inside* the run under `journeys/<journeyId>/...`.
// Suite (verify) runs share one suite folder.
export const DEFAULT_AGENT_E2E_ARTIFACT_ROOT = "runs";

export function createRunArtifacts(scope: RunArtifactScope): RunArtifacts {
  const root = resolve(scope.artifactRoot ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT);
  const runSegment = safeRunSegment(scope.runId);
  const absDir = scope.suiteId
    ? resolve(root, "_suites", safePathSegment(scope.suiteId), runSegment)
    : resolve(root, runSegment);
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
  _journey?: ExecutableJourney<TTypes>,
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
    writeRunReport: (runResult) => writeRunReport(run, runResult),
  };
}

const RUN_REPORT_FILENAMES = new Set(["run-report.json", "run-report.md"]);

/**
 * Scan the run directory and emit the operator entry points: `index.json`
 * (machine), `index.md` (human), and a journey-level `latest.json` pointer.
 * The scan is the source of truth, so artifacts written by any module (e.g.
 * `forensics/` screenshots from the Playwright MCP) are linked without this
 * recorder having to know about them.
 */
export async function writeRunReport(
  run: RunArtifacts,
  runResult: Record<string, unknown>,
): Promise<RunReportArtifacts> {
  await mkdir(run.absDir, { recursive: true });
  const files = await scanRunFiles(run.absDir);
  const grouped = groupRunFiles(files);

  // run-report.json is the single entry point: the whole-run verdict merged with
  // a scanned index of inspections and journey step reports. There is no
  // separate result.json — the verdict lives here.
  const report = {
    ...runResult,
    runId: run.runId,
    journeyId: run.journeyId,
    artifactDir: run.relDir,
    report: "run-report.json",
    humanReport: "run-report.md",
    headline: grouped.headline,
    inspections: grouped.inspections,
    steps: grouped.steps,
    files: files.map((file) => ({ path: file, ...classifyRunFile(file) })),
  };

  const reportRef = await writeJsonArtifact(run, "run-report.json", report, {
    name: "run-report",
    kind: "json",
    description:
      "Run report: whole-run verdict, ad-hoc inspections, and per-step reports for this run. Open run-report.md for the human view.",
  });
  const humanRef = await writeTextArtifact(run, "run-report.md", renderRunReportMarkdown(report, grouped), {
    name: "run-report",
    kind: "markdown",
    description: "Human-readable run report. Open this first to discover the verdict, inspections, and step reports.",
  });
  const latestRef = await writeLatestSymlink(run);
  return { report: reportRef, humanReport: humanRef, latest: latestRef };
}

interface GroupedRunFiles {
  headline: Record<string, string | null>;
  steps: Array<{ dir: string; artifacts: Record<string, string> }>;
  inspections: Array<{ dir: string; artifacts: Record<string, string> }>;
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
  return files.filter((file) => !RUN_REPORT_FILENAMES.has(file)).sort();
}

// Step directory shape: journeys/<journeyId>/phases/<phaseId>/steps/<stepId>/...
const STEP_DIR_PATTERN = /^journeys\/[^/]+\/phases\/[^/]+\/steps\/[^/]+$/;
// Inspection directory shape: inspections/<seq>/...
const INSPECTION_DIR_PATTERN = /^inspections\/[^/]+$/;

function groupRunFiles(files: readonly string[]): GroupedRunFiles {
  const has = (name: string) => (files.includes(name) ? name : null);
  const headline: Record<string, string | null> = {
    timeline: has("timeline.json"),
    metrics: has("metrics.json"),
    seed: has("seed-manifest.json"),
    ownedResources: has("owned-resources.json"),
    cleanup: has("cleanup.json"),
    cleanupPlan: has("cleanup-plan.json"),
  };
  const stepDirs = new Map<string, Record<string, string>>();
  const inspectionDirs = new Map<string, Record<string, string>>();
  for (const file of files) {
    const dir = file.split("/").slice(0, -1).join("/");
    if (STEP_DIR_PATTERN.test(dir)) {
      const bucket = stepDirs.get(dir) ?? {};
      bucket[classifyRunFile(file).name] = file;
      stepDirs.set(dir, bucket);
    } else if (INSPECTION_DIR_PATTERN.test(dir)) {
      const bucket = inspectionDirs.get(dir) ?? {};
      bucket[classifyRunFile(file).name] = file;
      inspectionDirs.set(dir, bucket);
    }
  }
  return {
    headline,
    steps: [...stepDirs.entries()].map(([dir, artifacts]) => ({ dir, artifacts })),
    inspections: [...inspectionDirs.entries()].map(([dir, artifacts]) => ({ dir, artifacts })),
  };
}

function classifyRunFile(file: string): { kind: string; name: string } {
  const leaf = file.split("/").at(-1) ?? file;
  const ext = extname(leaf).replace(/^\./, "").toLowerCase();
  const name = leaf.replace(/\.[^.]+$/, "");
  if (ext === "png") return { kind: "screenshot", name };
  if (ext === "md") return { kind: "markdown", name };
  if (ext === "json") return { kind: "json", name };
  return { kind: ext || "text", name };
}

function renderRunReportMarkdown(report: Record<string, unknown>, grouped: GroupedRunFiles): string {
  const lines: string[] = [];
  const status = String(report.status ?? "running");
  lines.push(`# Run ${report.runId}`);
  lines.push("");
  lines.push(`- **Journey:** ${report.journeyId}`);
  if (report.profileId) lines.push(`- **Profile:** ${report.profileId}`);
  lines.push(`- **Status:** ${status}${report.summary ? ` — ${report.summary}` : ""}`);
  lines.push(`- **Crystallized:** ${report.crystallized ? "yes" : "no (interactive dev run)"}`);
  if (report.startedAt) lines.push(`- **Started:** ${report.startedAt}`);
  if (report.completedAt) lines.push(`- **Completed:** ${report.completedAt}`);
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
  if (grouped.inspections.length > 0) {
    lines.push("## Inspections");
    lines.push("");
    for (const inspection of grouped.inspections) {
      lines.push(`### ${inspection.dir}`);
      for (const [name, file] of Object.entries(inspection.artifacts)) {
        lines.push(`- [${name}](${file})`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Refresh the `latest` convenience pointer next to the run directory:
 * `<root>/latest -> <runId>` (or `<root>/_suites/<suiteId>/latest -> <runId>`).
 * Local convenience only — durable references should use the real run id. Falls
 * back to a small text file holding the run id when symlinks are unavailable.
 */
async function writeLatestSymlink(run: RunArtifacts): Promise<ArtifactRef> {
  const parentDir = dirname(run.absDir);
  const runSegment = basename(run.absDir);
  const linkPath = resolve(parentDir, "latest");
  await mkdir(parentDir, { recursive: true });
  // `latest` is convenience only and several runs may finalize concurrently
  // (e.g. parallel verify workers sharing a suite dir). Create the link under a
  // unique temp name then atomically rename it over `latest`, and never throw —
  // a lost race or a symlink-hostile filesystem must not fail the run.
  let kind = "symlink";
  const tmpPath = `${linkPath}.tmp-${runSegment}`;
  try {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    try {
      await symlink(runSegment, tmpPath, "dir");
    } catch {
      await writeFile(tmpPath, `${runSegment}\n`, "utf8");
      kind = "text";
    }
    await rename(tmpPath, linkPath);
  } catch {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
  return {
    id: `artifact:${safePathSegment(run.runId)}:latest`,
    kind,
    name: "latest",
    uri: `file://${linkPath}`,
    path: toPortablePath(relative(process.cwd(), linkPath)),
    description: "Local convenience pointer to the newest run. Durable references should use the real run id.",
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

// Journey-step evidence nests inside the run as
// journeys/<journeyId>/phases/<phaseId>/steps/<stepId>/. Plain, human-readable
// ids (no numeric prefixes); ordering comes from the run-report timeline.
function journeyStepDir<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
): string {
  return `journeys/${safePathSegment(journey?.id ?? "journey")}/phases/${safePathSegment(phaseId)}/steps/${safePathSegment(stepId)}`;
}

export function phaseDir<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
): string {
  return resolve(run.absDir, `journeys/${safePathSegment(journey?.id ?? "journey")}/phases/${safePathSegment(phaseId)}`);
}

export function stepDir<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
): string {
  return resolve(run.absDir, journeyStepDir(journey, phaseId, stepId));
}

export function stepRelativePath<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes> | undefined,
  phaseId: string,
  stepId: string,
  filename: string,
): string {
  return `${journeyStepDir(journey, phaseId, stepId)}/${filename}`;
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

// Run ids are timestamp-first and case-significant (e.g. `2026-05-31T10-24-18Z-...`).
// They become the run directory name verbatim, so this guards path traversal
// WITHOUT lowercasing — the on-disk run dir always equals the run id.
export function safeRunSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
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

function basenameWithoutExtension(path: string): string {
  const leaf = path.split("/").at(-1) ?? path;
  return leaf.replace(/\.[^.]+$/, "");
}

function toPortablePath(path: string): string {
  return path.split(sep).join("/");
}
