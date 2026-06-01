import {
  beginJourneyRun,
  createCleanupPlan,
  reseedJourneyRun,
  runEnvironmentSeed,
  runJourneyStep,
  summarizeRunProgress,
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

  // Single per-step recording path shared by `runStep` and the phase-level
  // sequences (`runPhase`/`runUntilStep`). It runs the step, captures
  // forensics, writes step artifacts, then finalizes the run-level
  // result.json/timeline/metrics/index. Previously only `runStep` recorded, so
  // a journey driven through `journey.phase` left result.json frozen at the
  // begin-time `running`/pending state with no per-step evidence.
  async function executeStep(
    run: JourneyRun<TTypes>,
    executableRun: JourneyRun<TTypes>,
    phaseId: string,
    stepId: string,
    signals: RunSignalRecorder | undefined
  ): Promise<StepRunResult<TTypes> & { stepFeedbackArtifact?: ArtifactRef }> {
    const artifacts = runArtifacts.get(run.id);
    const mark = signals?.mark();
    const beforeArtifact = artifacts
      ? await captureStepScreenshot(artifacts.run, executableRun.journey, executableRun.execution, phaseId, stepId, 'before')
      : undefined;
    const result = await runJourneyStep(executableRun, { phaseId, stepId });
    const terminalScreenshot = artifacts
      ? await captureStepScreenshot(
          artifacts.run,
          executableRun.journey,
          executableRun.execution,
          result.phaseId,
          result.stepId,
          terminalScreenshotName(result.status)
        )
      : undefined;
    const signalSlice = signals && mark ? signals.slice(mark) : emptySignalSlice();
    const generatedArtifacts = artifacts
      ? await writeStepArtifacts({ artifacts, run: executableRun, result, execution: executableRun.execution, beforeArtifact, terminalScreenshot, signalSlice })
      : [];
    const enhancedResult = {
      ...result,
      artifacts: uniqueArtifacts([...result.artifacts, ...generatedArtifacts]),
      stepReportArtifact: generatedArtifacts.find((artifact) => artifact.name === 'step-report')
    } as StepRunResult<TTypes> & { stepReportArtifact?: ArtifactRef };
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
      const runResultPayload = runProgress(executableRun, timeline, artifacts.run.relDir, [
        ...generatedArtifacts,
        timelineArtifact,
        metricsArtifact
      ], runMetadata.get(run.id));
      const runReport = await artifacts.writeRunReport(runResultPayload);
      for (const artifact of [timelineArtifact, metricsArtifact, runReport.report, runReport.humanReport, runReport.latest]) emittedArtifacts.set(artifact.id, artifact);
    }
    return enhancedResult;
  }

  // Shared runner for runPhase and runUntilStep: executes an ordered slice of a
  // phase's steps through executeStep (so each step records full artifacts and
  // the run finalizes), stopping early on the first failed/error step.
  async function runPhaseStepSequence(
    run: JourneyRun<TTypes>,
    executableRun: JourneyRun<TTypes>,
    phaseId: string,
    steps: readonly { id: string }[],
    signals: RunSignalRecorder | undefined
  ): Promise<McpToolResponse> {
    const results: Array<StepRunResult<TTypes> & { stepFeedbackArtifact?: ArtifactRef }> = [];
    for (const step of steps) {
      const result = await executeStep(run, executableRun, phaseId, step.id, signals);
      results.push(result);
      if (result.status === 'failed' || result.status === 'error') break;
    }
    const artifacts = runArtifacts.get(run.id);
    return { status: 'ok', artifactDir: artifacts?.run.relDir, results, guidance: results.at(-1)?.guidance ?? [] };
  }

  function resolveStepSignals(run: JourneyRun<TTypes>, injectedExecution: TTypes['executionSurface'] | undefined): RunSignalRecorder | undefined {
    const signals = injectedExecution ? attachRunSignals(injectedExecution) : runSignals.get(run.id);
    if (injectedExecution && signals) runSignals.set(run.id, signals);
    return signals;
  }

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
          const runResultPayload = runProgress(result.run, [], artifacts.run.relDir, [seedArtifact], metadata);
          const runReport = await artifacts.writeRunReport(runResultPayload);
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          for (const artifact of [seedArtifact, runReport.report, runReport.humanReport, runReport.latest]) emittedArtifacts.set(artifact.id, artifact);
          return {
            status: 'ok',
            runId: result.run.id,
            ...runMetadataResponse(metadata),
            artifactDir: artifacts.run.relDir,
            report: runReport.humanReport.path,
            seedGate: result.seedGate,
            artifacts: [seedArtifact, runReport.report, runReport.humanReport],
            guidance: result.seedGate.guidance
          };
        }

        case 'runStep': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const injectedExecution = args.execution as TTypes['executionSurface'] | undefined;
          const executableRun = injectedExecution ? { ...run, execution: injectedExecution } : run;
          if (injectedExecution) runs.set(run.id, executableRun);
          const signals = resolveStepSignals(run, injectedExecution);
          const enhancedResult = await executeStep(run, executableRun, stringArg(args, 'phaseId'), stringArg(args, 'stepId'), signals);
          const artifacts = runArtifacts.get(run.id);
          return { status: 'ok', artifactDir: artifacts?.run.relDir, result: enhancedResult, guidance: enhancedResult.guidance };
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
          // The reseeded run starts fresh: reset its timeline, then write a
          // result.json + index so its status path links cleanup/seed/owned from
          // the first call rather than only after the next step.
          runTimelines.set(result.run.id, []);
          const reseedResultPayload = runProgress(result.run, [], artifacts.run.relDir, [cleanupArtifact, seedArtifact, ownedArtifact], runMetadata.get(result.run.id));
          const reseedReport = await artifacts.writeRunReport(reseedResultPayload);
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          for (const artifact of [cleanupArtifact, seedArtifact, ownedArtifact, reseedReport.report, reseedReport.humanReport, reseedReport.latest]) emittedArtifacts.set(artifact.id, artifact);
          return {
            status: 'ok',
            runId: result.run.id,
            artifactDir: artifacts.run.relDir,
            cleanup: result.cleanup,
            seedGate: result.seedGate,
            artifacts: [cleanupArtifact, seedArtifact, ownedArtifact, reseedReport.report, reseedReport.humanReport],
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
          return runPhaseStepSequence(run, executableRun, phase.id, phase.steps, resolveStepSignals(run, injectedExecution));
        }

        case 'runUntilStep': {
          // Step-granular time travel: run the named phase from its first step up
          // to AND INCLUDING the target step, mirroring runPhase's contract and
          // envelope. Reuses the same runJourneyStep machinery as runPhase; the
          // landed step is results.at(-1) (its stepId === the requested stepId).
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const injectedExecution = args.execution as TTypes['executionSurface'] | undefined;
          const executableRun = injectedExecution ? { ...run, execution: injectedExecution } : run;
          if (injectedExecution) runs.set(run.id, executableRun);
          const phase = executableRun.journey.phases.find((candidate) => candidate.id === stringArg(args, 'phaseId'));
          if (!phase) return notFound('phase');
          const targetStepId = stringArg(args, 'stepId');
          const targetIndex = phase.steps.findIndex((step) => step.id === targetStepId);
          if (targetIndex < 0) return notFound('step');
          return runPhaseStepSequence(run, executableRun, phase.id, phase.steps.slice(0, targetIndex + 1), resolveStepSignals(run, injectedExecution));
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
          // Refresh run-report so the just-written cleanup.json is linked from
          // the run's status path (teardown is often the last call).
          if (artifacts) {
            const teardownPayload = runProgress(run, runTimelines.get(run.id) ?? [], artifacts.run.relDir, artifact ? [artifact] : [], runMetadata.get(run.id));
            const teardownReport = await artifacts.writeRunReport(teardownPayload);
            for (const ref of [teardownReport.report, teardownReport.humanReport, teardownReport.latest]) emittedArtifacts.set(ref.id, ref);
          }
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
  artifactDir: string | undefined,
  artifacts: readonly ArtifactRef[],
  metadata: RunMetadata | undefined = undefined
): Record<string, unknown> {
  // The run-level status is the WHOLE-run verdict (summarizeRunProgress), not
  // `run.progress.status` (the last step's status). A passed run that still has
  // steps remaining reads `running`; only a fully-completed run reads `passed`.
  const completion = summarizeRunProgress(run);
  return {
    status: completion.status,
    runId: run.id,
    summary: completion.summary,
    completion: {
      totalSteps: completion.totalSteps,
      completedSteps: completion.completedSteps,
      failedSteps: completion.failedSteps,
      remainingSteps: completion.remainingSteps,
    },
    // Interactive runs produce development evidence; only the non-interactive
    // Closure Command crystallizes proof. Keep that distinction honest so an
    // operator never mistakes a passed dev run for a Crystallized Proof.
    crystallized: false,
    ...(completion.status === 'running' ? {} : { completedAt: new Date().toISOString() }),
    startedAt: run.startedAt,
    // Self-describing pointers to the operator entry points written alongside
    // this report by writeRunReport (relative to artifactDir).
    report: 'run-report.json',
    humanReport: 'run-report.md',
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

function terminalScreenshotName(status: string): 'after' | 'failure' | 'skipped' {
  if (status === 'passed' || status === 'warning') return 'after';
  if (status === 'skipped') return 'skipped';
  return 'failure';
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
