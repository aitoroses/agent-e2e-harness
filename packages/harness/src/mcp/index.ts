import {
  beginJourneyRun,
  createCleanupPlan,
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
          for (const artifact of result.seedGate.manifest.artifacts) emittedArtifacts.set(artifact.id, artifact);
          return { status: 'ok', runId: result.run.id, seedGate: result.seedGate, guidance: result.seedGate.guidance };
        }

        case 'runStep': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const result = await runJourneyStep(run, {
            phaseId: stringArg(args, 'phaseId'),
            stepId: stringArg(args, 'stepId')
          });
          rememberStepArtifacts(emittedArtifacts, result);
          return { status: 'ok', result, guidance: result.guidance };
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
          const artifactId = stringArg(args, 'artifactId');
          if (!isSafeArtifactId(artifactId)) return { ...notFound('artifact'), reason: 'unsafe-artifact-id' };
          const artifact = emittedArtifacts.get(artifactId);
          if (!artifact) return notFound('artifact');
          return { status: 'ok', artifact, content: artifactContents[artifact.id] };
        }

        case 'cleanupPlan': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          return { status: 'ok', plan: createCleanupPlan(run.ownershipLedger) };
        }

        case 'teardown': {
          const run = runs.get(stringArg(args, 'runId'));
          if (!run) return notFound('run');
          const result = await teardownOwnedResources(
            run.ownershipLedger,
            resourceAdapters,
            optionalArgs({ requestedResources: args.requestedResources as TTypes['ownedResource'][] | undefined }) as { requestedResources?: readonly TTypes['ownedResource'][] }
          );
          return { status: 'ok', result };
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
