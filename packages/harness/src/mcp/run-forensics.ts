import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  artifactRef,
  stepRelativePath,
  writeJsonArtifact,
  writeTextArtifact,
  type RunArtifactRecorder,
  type RunArtifacts,
} from "../artifacts/index.js";
import {
  asInspectPage,
  buildInspectJson,
  deriveForensics,
  renderInspectMarkdown,
  type InspectTarget,
} from "../forensics/inspect-capture.js";
import type {
  AnyHarnessTypes,
  ArtifactRef,
  ExecutableJourney,
  JourneyRun,
  StepRunResult,
} from "../core/index.js";

export interface RunSignalRecorder {
  consoleEvents: unknown[];
  networkEvents: unknown[];
  mark: () => { console: number; network: number };
  slice: (mark: { console: number; network: number }) => RunSignalSlice;
}

export interface RunSignalSlice {
  console: unknown[];
  network: unknown[];
  signals: {
    consoleErrors: number;
    consoleWarnings: number;
    networkErrors: number;
  };
}

interface PageLike {
  screenshot?: (options: { path: string; fullPage?: boolean }) => Promise<unknown>;
  evaluate?: (...args: unknown[]) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => unknown;
}

export function attachRunSignals(execution: unknown): RunSignalRecorder {
  const consoleEvents: unknown[] = [];
  const networkEvents: unknown[] = [];
  const page = pageFromExecution(execution);
  if (page?.on) {
    page.on("console", (message: unknown) => {
      const record = isRecord(message)
        ? {
            type: callable(message, "type"),
            text: callable(message, "text"),
          }
        : message;
      consoleEvents.push(record);
    });
    page.on("requestfailed", (request: unknown) => {
      networkEvents.push({ event: "requestfailed", url: callable(request, "url"), failure: callable(request, "failure") });
    });
    page.on("response", (response: unknown) => {
      networkEvents.push({ event: "response", url: callable(response, "url"), status: callable(response, "status") });
    });
  }
  return {
    consoleEvents,
    networkEvents,
    mark: () => ({ console: consoleEvents.length, network: networkEvents.length }),
    slice: (mark) => {
      const consoleSlice = consoleEvents.slice(mark.console);
      const networkSlice = networkEvents.slice(mark.network);
      return {
        console: consoleSlice,
        network: networkSlice,
        signals: {
          consoleErrors: consoleSlice.filter((event) => isRecord(event) && event.type === "error").length,
          consoleWarnings: consoleSlice.filter((event) => isRecord(event) && event.type === "warning").length,
          networkErrors: networkSlice.filter((event) => isRecord(event) && (Number(event.status) >= 400 || Boolean(event.failure))).length,
        },
      };
    },
  };
}

export async function captureStepScreenshot<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes>,
  execution: unknown,
  phaseId: string,
  stepId: string,
  name: "before" | "after" | "failure" | "skipped",
): Promise<ArtifactRef | undefined> {
  const page = pageFromExecution(execution);
  if (!page?.screenshot) return undefined;
  const relativePath = stepRelativePath(journey, phaseId, stepId, `${name}.png`);
  const absPath = resolve(run.absDir, relativePath);
  await mkdir(dirname(absPath), { recursive: true });
  await page.screenshot({ path: absPath, fullPage: true });
  return artifactRef(run, absPath, {
    kind: "screenshot",
    name,
    description: name === "failure"
      ? "Visual state at failure time. Read first on failures."
      : `Visual state ${name === "before" ? "before" : name} the step.`,
  });
}

/**
 * Record one journey step's evidence through the SAME inspect machinery as
 * `browser.inspect`: when the step ran against a browser page, derive the UI
 * forensics tree and write `inspect.json` + `inspect.md` into the step dir, then
 * emit a single agent-facing `step-report.json` (raw payload nested under
 * `execution`). There is no second evidence system and no `step-feedback.json`.
 */
export async function writeStepArtifacts<TTypes extends AnyHarnessTypes>(input: {
  artifacts: RunArtifactRecorder<TTypes>;
  run: JourneyRun<TTypes>;
  result: StepRunResult<TTypes>;
  execution: unknown;
  beforeArtifact?: ArtifactRef | undefined;
  terminalScreenshot?: ArtifactRef | undefined;
  signalSlice: RunSignalSlice;
}): Promise<ArtifactRef[]> {
  const run = input.artifacts.run;
  const journey = input.run.journey;
  const { phaseId, stepId } = input.result;
  const output: ArtifactRef[] = [];
  if (input.beforeArtifact) output.push(input.beforeArtifact);
  if (input.terminalScreenshot) output.push(input.terminalScreenshot);

  let inspectMd: ArtifactRef | undefined;
  let inspectJson: ArtifactRef | undefined;
  const page = pageFromExecution(input.execution);
  if (page?.evaluate && page.screenshot) {
    try {
      const capture = await deriveForensics(asInspectPage(page));
      const target: InspectTarget = { input: null, kind: "page", resolved: true };
      const signals = {
        consoleErrors: input.signalSlice.signals.consoleErrors,
        networkFailures: input.signalSlice.signals.networkErrors,
      };
      inspectJson = await writeJsonArtifact(
        run,
        stepRelativePath(journey, phaseId, stepId, "inspect.json"),
        buildInspectJson(capture, target, signals),
        { name: "inspect", kind: "json", description: "Structured UI forensics: summary, refs with bounding boxes, and a hierarchical tree captured at step end." },
      );
      inspectMd = await writeTextArtifact(
        run,
        stepRelativePath(journey, phaseId, stepId, "inspect.md"),
        renderInspectMarkdown(capture, target, signals, input.terminalScreenshot?.path, inspectJson.path),
        { name: "inspect", kind: "markdown", description: "Agent-facing OC-grade inspect view captured at step end." },
      );
      output.push(inspectJson, inspectMd);
    } catch {
      // Page may be closed/navigated; the step-report below is still written.
    }
  }

  const paths = {
    before: input.beforeArtifact?.path,
    terminal: input.terminalScreenshot?.path,
    inspect: inspectMd?.path,
    inspectJson: inspectJson?.path,
  };
  const report = stepReport(input.result, paths, input.signalSlice);
  const reportArtifact = await writeJsonArtifact(
    run,
    stepRelativePath(journey, phaseId, stepId, "step-report.json"),
    report,
    { name: "step-report", kind: "json", description: "Single agent-facing step report: status, artifact paths, signals, failure info, and raw execution payload." },
  );
  return uniqueArtifacts([...output, reportArtifact]) as ArtifactRef[];
}

export function uniqueArtifacts(artifacts: readonly ArtifactRef[]): readonly ArtifactRef[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifact.path ?? artifact.uri ?? artifact.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function emptySignalSlice(): RunSignalSlice {
  return { console: [], network: [], signals: { consoleErrors: 0, consoleWarnings: 0, networkErrors: 0 } };
}

function stepReport<TTypes extends AnyHarnessTypes>(
  result: StepRunResult<TTypes>,
  paths: { before?: string | undefined; terminal?: string | undefined; inspect?: string | undefined; inspectJson?: string | undefined },
  signals: RunSignalSlice,
): Record<string, unknown> {
  const failed = result.status === "failed" || result.status === "error";
  return {
    ids: { runId: result.runId, phaseId: result.phaseId, stepId: result.stepId },
    status: result.status,
    ran: { phaseId: result.phaseId, stepId: result.stepId, startedAt: result.startedAt, endedAt: result.endedAt, durationMs: result.durationMs },
    artifacts: {
      ...(paths.before ? { before: paths.before } : {}),
      ...(paths.terminal ? { terminal: paths.terminal } : {}),
      ...(paths.inspect ? { inspect: paths.inspect } : {}),
      ...(paths.inspectJson ? { inspectJson: paths.inspectJson } : {}),
    },
    signals: signals.signals,
    ...(failed ? { failure: { errors: result.errors, warnings: result.warnings } } : {}),
    guidance: result.guidance,
    // Raw execution payload: the full step result plus the console/network slice.
    execution: {
      observed: result.observed,
      proofs: result.proofs,
      ownedResources: result.ownedResources,
      feedback: result.feedback,
      warnings: result.warnings,
      errors: result.errors,
      console: signals.console,
      network: signals.network,
    },
  };
}

function pageFromExecution(execution: unknown): PageLike | undefined {
  if (!isRecord(execution)) return undefined;
  const page = execution.page;
  return isRecord(page) ? page as PageLike : undefined;
}

function callable(value: unknown, method?: string): unknown {
  if (!isRecord(value)) return undefined;
  const candidate = method ? value[method] : value;
  return typeof candidate === "function" ? candidate.call(value) : candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
