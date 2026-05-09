import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  artifactRef,
  stepRelativePath,
  writeJsonArtifact,
  type RunArtifactRecorder,
  type RunArtifacts,
} from "../artifacts/index.js";
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
  name: "before" | "after" | "failure",
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
      : `Visual state ${name === "before" ? "before" : "after"} the step.`,
  });
}

export async function writeStepArtifacts<TTypes extends AnyHarnessTypes>(input: {
  artifacts: RunArtifactRecorder<TTypes>;
  run: JourneyRun<TTypes>;
  result: StepRunResult<TTypes>;
  beforeArtifact?: ArtifactRef | undefined;
  terminalScreenshot?: ArtifactRef | undefined;
  signalSlice: RunSignalSlice;
}): Promise<ArtifactRef[]> {
  const output: ArtifactRef[] = [];
  if (input.beforeArtifact) output.push(input.beforeArtifact);
  if (input.terminalScreenshot) output.push(input.terminalScreenshot);
  output.push(await writeJsonArtifact(
    input.artifacts.run,
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, "console.json"),
    { messages: input.signalSlice.console },
    { name: "console", kind: "console-log" },
  ));
  output.push(await writeJsonArtifact(
    input.artifacts.run,
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, "network.json"),
    { requests: input.signalSlice.network },
    { name: "network", kind: "network-log" },
  ));
  const resultArtifact = stepArtifactRef(input.artifacts.run, input.run.journey, input.result, "result.json", "result");
  const feedbackRef = stepArtifactRef(input.artifacts.run, input.run.journey, input.result, "step-feedback.json", "step-feedback");
  const allArtifacts = uniqueArtifacts([...input.result.artifacts, ...output, resultArtifact, feedbackRef]);
  const feedbackArtifact = await writeJsonArtifact(
    input.artifacts.run,
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, "step-feedback.json"),
    stepFeedback(input.result, allArtifacts, input.signalSlice),
    { name: "step-feedback", kind: "json" },
  );
  const writtenResultArtifact = await input.artifacts.writeStep({
    ...input.result,
    artifacts: allArtifacts,
  } as StepRunResult<TTypes>);
  return uniqueArtifacts([...output, writtenResultArtifact, feedbackArtifact]) as ArtifactRef[];
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

function stepArtifactRef<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes>,
  result: StepRunResult<TTypes>,
  filename: string,
  name: string,
): ArtifactRef {
  return artifactRef(
    run,
    resolve(run.absDir, stepRelativePath(journey, result.phaseId, result.stepId, filename)),
    { kind: "json", name },
  );
}

function stepFeedback<TTypes extends AnyHarnessTypes>(
  result: StepRunResult<TTypes>,
  artifacts: readonly ArtifactRef[],
  signals: RunSignalSlice,
): Record<string, unknown> {
  const primaryNames = result.status === "passed" ? ["after", "result", "step-feedback"] : ["failure", "result", "console", "network", "step-feedback"];
  const primary = artifacts.filter((artifact) => artifact.name && primaryNames.includes(artifact.name));
  return {
    ids: {
      runId: result.runId,
      phaseId: result.phaseId,
      stepId: result.stepId,
    },
    status: result.status,
    observed: result.observed,
    proofs: result.proofs,
    warnings: result.warnings,
    errors: result.errors,
    signals: signals.signals,
    artifacts: {
      primary: primary.length > 0 ? primary : artifacts.slice(0, 5),
      secondary: artifacts.filter((artifact) => !primary.some((candidate) => candidate.path === artifact.path)),
    },
    next: result.guidance,
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
