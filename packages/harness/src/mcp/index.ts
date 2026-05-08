import {
  beginJourneyRun,
  createCleanupPlan,
  reseedJourneyRun,
  runEnvironmentSeed,
  runJourneyStep,
  teardownOwnedResources,
  type AnyHarnessTypes,
  type ArtifactRef,
  type BeginJourneyRunResult,
  type ExecutableJourney,
  type GuidanceAction,
  type JourneyRun,
  type ResourceAdapter,
  type StepRunResult
} from '../core/index.js';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  artifactRef,
  createRunArtifactRecorder,
  readArtifact,
  stepRelativePath,
  writeJsonArtifact,
  type RunArtifactRecorder,
  type RunArtifacts
} from '../artifacts/index.js';

export interface AgentE2EMcpApiContract {
  surface: 'mcp-control-surface';
}

export const mcpApiContract: AgentE2EMcpApiContract = { surface: 'mcp-control-surface' };

export type McpToolStatus = 'ok' | 'not-found' | 'blocked' | 'error';

export interface McpToolResponse {
  status: McpToolStatus;
  guidance?: readonly GuidanceAction[];
  [key: string]: unknown;
}

export interface McpHarnessServerOptions<TTypes extends AnyHarnessTypes = AnyHarnessTypes> {
  journeys: readonly ExecutableJourney<TTypes>[];
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  artifactContents?: Record<string, unknown>;
  artifactRoot?: string;
}

export interface McpHarnessServer {
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResponse>;
}

export function createMcpHarnessServer<TTypes extends AnyHarnessTypes = AnyHarnessTypes>(
  options: McpHarnessServerOptions<TTypes>
): McpHarnessServer {
  const journeys = new Map(options.journeys.map((journey) => [journey.id, journey]));
  const runs = new Map<string, JourneyRun<TTypes>>();
  const emittedArtifacts = new Map<string, ArtifactRef>();
  const runArtifacts = new Map<string, RunArtifactRecorder<TTypes>>();
  const runTimelines = new Map<string, Array<Record<string, unknown>>>();
  const runSignals = new Map<string, RunSignalRecorder>();
  const resourceAdapters = options.resourceAdapters ?? [];
  const artifactContents = options.artifactContents ?? {};

  async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse> {
    try {
      switch (name) {
        case 'listJourneys':
          return {
            status: 'ok',
            journeys: [...journeys.values()].map((journey) => ({
              id: journey.id,
              title: journey.title,
              profiles: journey.profiles.map((profile) => ({ id: profile.id, label: profile.label }))
            }))
          };

        case 'inspectJourney': {
          const journey = getJourney(journeys, stringArg(args, 'journeyId'));
          if (!journey) return notFound('journey');
          return { status: 'ok', contract: journey.toInspectableContract() };
        }

        case 'seedJourney': {
          const journey = getJourney(journeys, stringArg(args, 'journeyId'));
          if (!journey) return notFound('journey');
          const seedGate = await runEnvironmentSeed(
            journey,
            optionalArgs({
              profileId: optionalStringArg(args, 'profileId'),
              execution: args.execution as TTypes['executionSurface'] | undefined
            }) as { profileId?: string; execution?: TTypes['executionSurface'] }
          );
          for (const artifact of seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          return { status: seedGate.canRunSteps ? 'ok' : 'blocked', seedGate, guidance: seedGate.guidance };
        }

        case 'beginRun': {
          const journey = getJourney(journeys, stringArg(args, 'journeyId'));
          if (!journey) return notFound('journey');
          const result = (await beginJourneyRun(
            journey,
            optionalArgs({
              profileId: optionalStringArg(args, 'profileId'),
              execution: (args.execution ?? {}) as TTypes['executionSurface'],
              runId: optionalStringArg(args, 'runId')
            }) as { profileId?: string; execution: TTypes['executionSurface']; runId?: string }
          )) as BeginJourneyRunResult<TTypes>;
          if (result.status === 'blocked') return { status: 'blocked', seedGate: result.seedGate, guidance: result.seedGate.guidance };
          runs.set(result.run.id, result.run);
          const artifacts = createRunArtifactRecorder(
            {
              artifactRoot: optionalStringArg(args, 'artifactRoot') ?? optionalStringArg(args, 'artifact_root') ?? options.artifactRoot,
              journeyId: journey.id,
              runId: result.run.id
            },
            journey
          );
          runArtifacts.set(result.run.id, artifacts);
          runTimelines.set(result.run.id, []);
          runSignals.set(result.run.id, attachRunSignals(result.run.execution));
          const seedArtifact = await artifacts.writeSeed(result.seedGate);
          const resultArtifact = await artifacts.writeResult(runProgress(result.run, [], 'running', artifacts.run.relDir, [seedArtifact]));
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          emittedArtifacts.set(seedArtifact.id, seedArtifact);
          emittedArtifacts.set(resultArtifact.id, resultArtifact);
          return {
            status: 'ok',
            runId: result.run.id,
            artifact_dir: artifacts.run.relDir,
            seedGate: result.seedGate,
            artifacts: [seedArtifact, resultArtifact],
            guidance: result.seedGate.guidance
          };
        }

        case 'runStep': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const injectedExecution = args.execution as TTypes['executionSurface'] | undefined;
          const executableRun = injectedExecution ? { ...run, execution: injectedExecution } : run;
          if (injectedExecution) runs.set(run.id, executableRun);
          const artifacts = runArtifacts.get(run.id);
          const signals = injectedExecution ? attachRunSignals(injectedExecution) : runSignals.get(run.id);
          if (injectedExecution && signals) runSignals.set(run.id, signals);
          const mark = signals?.mark();
          const beforeArtifact = artifacts ? await captureStepScreenshot(artifacts.run, executableRun.journey, executableRun.execution, stringArg(args, 'phaseId'), stringArg(args, 'stepId'), 'before') : undefined;
          const result = await runJourneyStep(executableRun, {
            phaseId: stringArg(args, 'phaseId'),
            stepId: stringArg(args, 'stepId')
          });
          const terminalScreenshot = artifacts ? await captureStepScreenshot(
            artifacts.run,
            executableRun.journey,
            executableRun.execution,
            result.phaseId,
            result.stepId,
            result.status === 'passed' ? 'after' : 'failure'
          ) : undefined;
          const signalSlice = signals && mark ? signals.slice(mark) : emptySignalSlice();
          const generatedArtifacts = artifacts
            ? await writeStepArtifacts({
                artifacts,
                run: executableRun,
                result,
                beforeArtifact,
                terminalScreenshot,
                signalSlice
              })
            : [];
          const enhancedResult = {
            ...result,
            artifacts: uniqueArtifacts([...result.artifacts, ...generatedArtifacts]),
            step_feedback_artifact: generatedArtifacts.find((artifact) => artifact.name === 'step-feedback')
          } as StepRunResult<TTypes> & { step_feedback_artifact?: ArtifactRef };
          rememberStepArtifacts(emittedArtifacts, enhancedResult);
          if (artifacts) {
            for (const artifact of generatedArtifacts) emittedArtifacts.set(artifact.id, artifact);
            await artifacts.writeOwnedResources(executableRun);
            const timeline = runTimelines.get(run.id) ?? [];
            timeline.push({
              phaseId: result.phaseId,
              stepId: result.stepId,
              status: result.status,
              startedAt: result.startedAt,
              endedAt: result.endedAt,
              durationMs: result.durationMs
            });
            runTimelines.set(run.id, timeline);
            const timelineArtifact = await writeJsonArtifact(artifacts.run, 'timeline.json', timeline, { name: 'timeline' });
            const metricsArtifact = await writeJsonArtifact(artifacts.run, 'metrics.json', runMetrics(executableRun, timeline), { name: 'metrics' });
            const resultArtifact = await artifacts.writeResult(
              runProgress(executableRun, timeline, executableRun.progress.status, artifacts.run.relDir, [
                ...generatedArtifacts,
                timelineArtifact,
                metricsArtifact
              ])
            );
            for (const artifact of [timelineArtifact, metricsArtifact, resultArtifact]) emittedArtifacts.set(artifact.id, artifact);
          }
          return { status: 'ok', artifact_dir: artifacts?.run.relDir, result: enhancedResult, guidance: result.guidance };
        }

        case 'reseedRun': {
          const currentRun = runs.get(stringArg(args, 'runId'));
          if (!currentRun) return notFound('run');
          const result = await reseedJourneyRun(
            currentRun.journey,
            optionalArgs({
              profileId: currentRun.profile.id,
              execution: currentRun.execution,
              runId: optionalStringArg(args, 'newRunId') ?? currentRun.id,
              previousLedger: currentRun.ownershipLedger,
              resourceAdapters,
              requestedResources: args.requestedResources as TTypes['ownedResource'][] | undefined
            }) as {
              profileId: string;
              execution: TTypes['executionSurface'];
              runId: string;
              previousLedger: typeof currentRun.ownershipLedger;
              resourceAdapters: typeof resourceAdapters;
              requestedResources?: TTypes['ownedResource'][];
            }
          );
          if (result.status === 'blocked') return { status: 'blocked', reason: result.reason, cleanup: result.cleanup, seedGate: result.seedGate, guidance: result.guidance };
          runs.set(result.run.id, result.run);
          const artifacts = runArtifacts.get(currentRun.id) ?? createRunArtifactRecorder(
            {
              artifactRoot: options.artifactRoot,
              journeyId: currentRun.journey.id,
              runId: result.run.id
            },
            currentRun.journey
          );
          runArtifacts.set(result.run.id, artifacts);
          const cleanupArtifact = await artifacts.writeTeardown(result.cleanup, 'cleanup');
          const seedArtifact = await artifacts.writeSeed(result.seedGate);
          const ownedArtifact = await artifacts.writeOwnedResources(result.run);
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          for (const artifact of [cleanupArtifact, seedArtifact, ownedArtifact]) emittedArtifacts.set(artifact.id, artifact);
          return {
            status: 'ok',
            runId: result.run.id,
            artifact_dir: artifacts.run.relDir,
            cleanup: result.cleanup,
            seedGate: result.seedGate,
            artifacts: [cleanupArtifact, seedArtifact, ownedArtifact],
            guidance: result.guidance
          };
        }

        case 'runPhase': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const phase = run.journey.phases.find((candidate) => candidate.id === stringArg(args, 'phaseId'));
          if (!phase) return notFound('phase');
          const results: StepRunResult<TTypes>[] = [];
          for (const step of phase.steps) {
            const result = await runJourneyStep(run, { phaseId: phase.id, stepId: step.id });
            rememberStepArtifacts(emittedArtifacts, result);
            results.push(result);
            if (result.status === 'failed' || result.status === 'error') break;
          }
          return { status: 'ok', results, guidance: results.at(-1)?.guidance ?? [] };
        }

        case 'readArtifact': {
          const artifactPath = optionalStringArg(args, 'path');
          if (artifactPath) {
            const read = await readArtifact(options.artifactRoot, artifactPath);
            return read.status === 'ok'
              ? { status: 'ok', artifact: { path: read.path, kind: read.kind }, content: read.content, encoding: read.encoding }
              : { status: read.status === 'blocked' ? 'blocked' : 'not-found', subject: 'artifact', reason: read.error };
          }
          const artifactId = stringArg(args, 'artifactId');
          if (!isSafeArtifactId(artifactId)) return { ...notFound('artifact'), reason: 'unsafe-artifact-id' };
          const artifact = emittedArtifacts.get(artifactId);
          if (!artifact) return notFound('artifact');
          return { status: 'ok', artifact, content: artifactContents[artifact.id] };
        }

        case 'cleanupPlan': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const plan = createCleanupPlan(run.ownershipLedger);
          const artifacts = runArtifacts.get(run.id);
          const artifact = artifacts ? await artifacts.writeCleanupPlan(plan) : undefined;
          if (artifact) emittedArtifacts.set(artifact.id, artifact);
          return { status: 'ok', artifact_dir: artifacts?.run.relDir, plan, artifact };
        }

        case 'teardown': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const result = await teardownOwnedResources(
            run.ownershipLedger,
            resourceAdapters,
            optionalArgs({ requestedResources: args.requestedResources as TTypes['ownedResource'][] | undefined }) as { requestedResources?: readonly TTypes['ownedResource'][] }
          );
          const artifacts = runArtifacts.get(run.id);
          const artifact = artifacts ? await artifacts.writeTeardown(result, 'cleanup') : undefined;
          if (artifact) emittedArtifacts.set(artifact.id, artifact);
          return { status: 'ok', artifact_dir: artifacts?.run.relDir, result, artifact };
        }

        default:
          return notFound('tool');
      }
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { callTool };
}

interface RunSignalRecorder {
  consoleEvents: unknown[];
  networkEvents: unknown[];
  mark: () => { console: number; network: number };
  slice: (mark: { console: number; network: number }) => RunSignalSlice;
}

interface RunSignalSlice {
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

function attachRunSignals(execution: unknown): RunSignalRecorder {
  const consoleEvents: unknown[] = [];
  const networkEvents: unknown[] = [];
  const page = pageFromExecution(execution);
  if (page?.on) {
    page.on('console', (message: unknown) => {
      const record = isRecord(message)
        ? {
            type: callable(message, 'type'),
            text: callable(message, 'text')
          }
        : message;
      consoleEvents.push(record);
    });
    page.on('requestfailed', (request: unknown) => {
      networkEvents.push({ event: 'requestfailed', url: callable(request, 'url'), failure: callable(request, 'failure') });
    });
    page.on('response', (response: unknown) => {
      networkEvents.push({ event: 'response', url: callable(response, 'url'), status: callable(response, 'status') });
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
          consoleErrors: consoleSlice.filter((event) => isRecord(event) && event.type === 'error').length,
          consoleWarnings: consoleSlice.filter((event) => isRecord(event) && event.type === 'warning').length,
          networkErrors: networkSlice.filter((event) => isRecord(event) && (Number(event.status) >= 400 || Boolean(event.failure))).length
        }
      };
    }
  };
}

async function captureStepScreenshot<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes>,
  execution: unknown,
  phaseId: string,
  stepId: string,
  name: 'before' | 'after' | 'failure'
): Promise<ArtifactRef | undefined> {
  const page = pageFromExecution(execution);
  if (!page?.screenshot) return undefined;
  const relativePath = stepRelativePath(journey, phaseId, stepId, `${name}.png`);
  const absPath = resolve(run.absDir, relativePath);
  await mkdir(dirname(absPath), { recursive: true });
  await page.screenshot({ path: absPath, fullPage: true });
  return artifactRef(run, absPath, {
    kind: 'screenshot',
    name,
    description: name === 'failure'
      ? 'Visual state at failure time. Read first on failures.'
      : `Visual state ${name === 'before' ? 'before' : 'after'} the step.`
  });
}

async function writeStepArtifacts<TTypes extends AnyHarnessTypes>(input: {
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
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, 'console.json'),
    { messages: input.signalSlice.console },
    { name: 'console', kind: 'console-log' }
  ));
  output.push(await writeJsonArtifact(
    input.artifacts.run,
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, 'network.json'),
    { requests: input.signalSlice.network },
    { name: 'network', kind: 'network-log' }
  ));
  const resultArtifact = stepArtifactRef(input.artifacts.run, input.run.journey, input.result, 'result.json', 'result');
  const feedbackRef = stepArtifactRef(input.artifacts.run, input.run.journey, input.result, 'step-feedback.json', 'step-feedback');
  const allArtifacts = uniqueArtifacts([...input.result.artifacts, ...output, resultArtifact, feedbackRef]);
  const feedbackArtifact = await writeJsonArtifact(
    input.artifacts.run,
    stepRelativePath(input.run.journey, input.result.phaseId, input.result.stepId, 'step-feedback.json'),
    stepFeedback(input.result, allArtifacts, input.signalSlice),
    { name: 'step-feedback', kind: 'json' }
  );
  const writtenResultArtifact = await input.artifacts.writeStep({
    ...input.result,
    artifacts: allArtifacts
  } as StepRunResult<TTypes>);
  return uniqueArtifacts([...output, writtenResultArtifact, feedbackArtifact]) as ArtifactRef[];
}

function stepArtifactRef<TTypes extends AnyHarnessTypes>(
  run: RunArtifacts,
  journey: ExecutableJourney<TTypes>,
  result: StepRunResult<TTypes>,
  filename: string,
  name: string
): ArtifactRef {
  return artifactRef(
    run,
    resolve(run.absDir, stepRelativePath(journey, result.phaseId, result.stepId, filename)),
    { kind: 'json', name }
  );
}

function stepFeedback<TTypes extends AnyHarnessTypes>(
  result: StepRunResult<TTypes>,
  artifacts: readonly ArtifactRef[],
  signals: RunSignalSlice
): Record<string, unknown> {
  const primaryNames = result.status === 'passed' ? ['after', 'result', 'step-feedback'] : ['failure', 'result', 'console', 'network', 'step-feedback'];
  const primary = artifacts.filter((artifact) => artifact.name && primaryNames.includes(artifact.name));
  return {
    ids: {
      runId: result.runId,
      phaseId: result.phaseId,
      stepId: result.stepId
    },
    status: result.status,
    observed: result.observed,
    proofs: result.proofs,
    warnings: result.warnings,
    errors: result.errors,
    signals: signals.signals,
    artifacts: {
      primary: primary.length > 0 ? primary : artifacts.slice(0, 5),
      secondary: artifacts.filter((artifact) => !primary.some((candidate) => candidate.path === artifact.path))
    },
    next: result.guidance
  };
}

function runProgress<TTypes extends AnyHarnessTypes>(
  run: JourneyRun<TTypes>,
  timeline: readonly Record<string, unknown>[],
  status: string,
  artifactDir: string | undefined,
  artifacts: readonly ArtifactRef[]
): Record<string, unknown> {
  return {
    status,
    runId: run.id,
    journeyId: run.journey.id,
    profileId: run.profile.id,
    artifactDir,
    phases: run.journey.phases.map((phase) => ({
      phaseId: phase.id,
      status: phase.steps.every((step) => run.progress.completedStepIds.includes(step.id))
        ? 'passed'
        : phase.steps.some((step) => run.progress.failedStepIds.includes(step.id))
          ? 'failed'
          : 'pending',
      steps: phase.steps.map((step) => ({
        stepId: step.id,
        status: run.progress.completedStepIds.includes(step.id)
          ? 'passed'
          : run.progress.failedStepIds.includes(step.id)
            ? 'failed'
            : 'pending'
      }))
    })),
    current: run.progress.currentStepId,
    timeline,
    artifacts
  };
}

function runMetrics<TTypes extends AnyHarnessTypes>(
  run: JourneyRun<TTypes>,
  timeline: readonly Record<string, unknown>[]
): Record<string, unknown> {
  return {
    runId: run.id,
    journeyId: run.journey.id,
    stepCount: timeline.length,
    totalDurationMs: timeline.reduce((total, event) => total + (typeof event.durationMs === 'number' ? event.durationMs : 0), 0),
    steps: timeline.map((event) => ({
      phaseId: event.phaseId,
      stepId: event.stepId,
      status: event.status,
      durationMs: event.durationMs
    }))
  };
}

function uniqueArtifacts(artifacts: readonly ArtifactRef[]): readonly ArtifactRef[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifact.path ?? artifact.uri ?? artifact.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptySignalSlice(): RunSignalSlice {
  return { console: [], network: [], signals: { consoleErrors: 0, consoleWarnings: 0, networkErrors: 0 } };
}

function pageFromExecution(execution: unknown): PageLike | undefined {
  if (!isRecord(execution)) return undefined;
  const page = execution.page;
  return isRecord(page) ? page as PageLike : undefined;
}

function callable(value: unknown, method?: string): unknown {
  if (!isRecord(value)) return undefined;
  const candidate = method ? value[method] : value;
  return typeof candidate === 'function' ? candidate.call(value) : candidate;
}

function getJourney<TTypes extends AnyHarnessTypes>(
  journeys: ReadonlyMap<string, ExecutableJourney<TTypes>>,
  journeyId: string
): ExecutableJourney<TTypes> | undefined {
  return journeys.get(journeyId);
}

function rememberStepArtifacts<TTypes extends AnyHarnessTypes>(
  emittedArtifacts: Map<string, ArtifactRef>,
  result: StepRunResult<TTypes>
): void {
  for (const artifact of result.artifacts) emittedArtifacts.set(artifact.id, artifact);
}

function notFound(subject: string): McpToolResponse {
  return { status: 'not-found', subject };
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required string argument: ${name}`);
  return value;
}

function optionalStringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalArgs<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function isSafeArtifactId(artifactId: string): boolean {
  return /^[A-Za-z0-9:_-]+$/.test(artifactId) && !artifactId.includes('..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
