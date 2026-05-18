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
  type JourneyRun,
  type ResourceAdapter,
  type StepRunResult
} from '../core/index.js';
import {
  createRunArtifactRecorder,
  readArtifact,
  writeJsonArtifact,
  type RunArtifactRecorder,
} from '../artifacts/index.js';
import {
  attachRunSignals,
  captureStepScreenshot,
  emptySignalSlice,
  uniqueArtifacts,
  writeStepArtifacts,
  type RunSignalRecorder
} from './run-forensics.js';
import type { ToolResponse, ToolStatus } from './response.js';

export interface AgentE2EMcpApiContract {
  surface: 'mcp-control-surface';
}

export const mcpApiContract: AgentE2EMcpApiContract = { surface: 'mcp-control-surface' };

export type McpToolStatus = ToolStatus;

export interface McpToolResponse extends ToolResponse {}

export interface McpHarnessServerOptions<TTypes extends AnyHarnessTypes = AnyHarnessTypes> {
  journeys: readonly ExecutableJourney<TTypes>[];
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  artifactContents?: Record<string, unknown>;
  artifactRoot?: string;
}

export interface McpHarnessServer {
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResponse>;
}

interface RunMetadata {
  stackBinding?: { stackId: string };
  runtimeBinding?: { targetId: string; kind: string };
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
  const runMetadata = new Map<string, RunMetadata>();
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
          const stackId = optionalStringArg(args, 'stackId');
          const runtimeBinding = runtimeBindingArg(args);
          const metadata: RunMetadata = {
            ...(stackId ? { stackBinding: { stackId } } : {}),
            ...(runtimeBinding ? { runtimeBinding } : {}),
          };
          runMetadata.set(result.run.id, metadata);
          const artifacts = createRunArtifactRecorder(
            {
              artifactRoot: optionalStringArg(args, 'artifactRoot') ?? options.artifactRoot,
              journeyId: journey.id,
              runId: result.run.id
            },
            journey
          );
          runArtifacts.set(result.run.id, artifacts);
          runTimelines.set(result.run.id, []);
          runSignals.set(result.run.id, attachRunSignals(result.run.execution));
          const seedArtifact = await artifacts.writeSeed(result.seedGate);
          const resultArtifact = await artifacts.writeResult(runProgress(result.run, [], 'running', artifacts.run.relDir, [seedArtifact], metadata));
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          emittedArtifacts.set(seedArtifact.id, seedArtifact);
          emittedArtifacts.set(resultArtifact.id, resultArtifact);
          return {
            status: 'ok',
            runId: result.run.id,
            ...runMetadataResponse(metadata),
            artifactDir: artifacts.run.relDir,
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
            stepFeedbackArtifact: generatedArtifacts.find((artifact) => artifact.name === 'step-feedback')
          } as StepRunResult<TTypes> & { stepFeedbackArtifact?: ArtifactRef };
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
            const metricsArtifact = await writeJsonArtifact(artifacts.run, 'metrics.json', runMetrics(executableRun, timeline, runMetadata.get(run.id)), { name: 'metrics' });
            const resultArtifact = await artifacts.writeResult(
              runProgress(executableRun, timeline, executableRun.progress.status, artifacts.run.relDir, [
                ...generatedArtifacts,
                timelineArtifact,
                metricsArtifact
              ], runMetadata.get(run.id))
            );
            for (const artifact of [timelineArtifact, metricsArtifact, resultArtifact]) emittedArtifacts.set(artifact.id, artifact);
          }
          return { status: 'ok', artifactDir: artifacts?.run.relDir, result: enhancedResult, guidance: result.guidance };
        }

        case 'reseedRun': {
          const currentRun = runs.get(stringArg(args, 'runId'));
          if (!currentRun) return notFound('run');
          const injectedExecution = args.execution as TTypes['executionSurface'] | undefined;
          const result = await reseedJourneyRun(
            currentRun.journey,
            optionalArgs({
              profileId: currentRun.profile.id,
              execution: injectedExecution ?? currentRun.execution,
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
          const metadata = runMetadata.get(currentRun.id);
          if (metadata) runMetadata.set(result.run.id, metadata);
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
            artifactDir: artifacts.run.relDir,
            cleanup: result.cleanup,
            seedGate: result.seedGate,
            artifacts: [cleanupArtifact, seedArtifact, ownedArtifact],
            guidance: result.guidance
          };
        }

        case 'runPhase': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const injectedExecution = args.execution as TTypes['executionSurface'] | undefined;
          const executableRun = injectedExecution ? { ...run, execution: injectedExecution } : run;
          if (injectedExecution) runs.set(run.id, executableRun);
          const phase = executableRun.journey.phases.find((candidate) => candidate.id === stringArg(args, 'phaseId'));
          if (!phase) return notFound('phase');
          const results: StepRunResult<TTypes>[] = [];
          for (const step of phase.steps) {
            const result = await runJourneyStep(executableRun, { phaseId: phase.id, stepId: step.id });
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
          return { status: 'ok', artifactDir: artifacts?.run.relDir, plan, artifact };
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
          return { status: 'ok', artifactDir: artifacts?.run.relDir, result, artifact };
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

function runProgress<TTypes extends AnyHarnessTypes>(
  run: JourneyRun<TTypes>,
  timeline: readonly Record<string, unknown>[],
  status: string,
  artifactDir: string | undefined,
  artifacts: readonly ArtifactRef[],
  metadata: RunMetadata | undefined = undefined
): Record<string, unknown> {
  return {
    status,
    runId: run.id,
    ...runMetadataResponse(metadata),
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
  timeline: readonly Record<string, unknown>[],
  metadata: RunMetadata | undefined = undefined
): Record<string, unknown> {
  return {
    runId: run.id,
    ...runMetadataResponse(metadata),
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

function runMetadataResponse(metadata: RunMetadata | undefined): Record<string, unknown> {
  if (!metadata?.stackBinding && !metadata?.runtimeBinding) return {};
  return {
    ...(metadata.stackBinding ? { stackId: metadata.stackBinding.stackId, stackBinding: metadata.stackBinding } : {}),
    ...(metadata.runtimeBinding ? { runtimeTargetId: metadata.runtimeBinding.targetId, runtimeBinding: metadata.runtimeBinding } : {})
  };
}

function runtimeBindingArg(args: Record<string, unknown>): { targetId: string; kind: string } | undefined {
  if (isRecord(args.runtimeBinding) && typeof args.runtimeBinding.targetId === 'string' && typeof args.runtimeBinding.kind === 'string') {
    return { targetId: args.runtimeBinding.targetId, kind: args.runtimeBinding.kind };
  }
  return undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalArgs<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function isSafeArtifactId(artifactId: string): boolean {
  return /^[A-Za-z0-9:_-]+$/.test(artifactId) && !artifactId.includes('..');
}
