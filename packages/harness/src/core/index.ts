/**
 * Minimal generic Harness Core contract.
 *
 * This subpath owns product-agnostic journey definition and inspection types.
 * It must not import Playwright, MCP, or product-specific schemas.
 */

export const agentE2ECoreApi = {
  packageName: '@agent-e2e/harness',
  surface: 'harness-core',
  status: 'ready'
} as const;

export type AgentE2EHarnessCoreContract = typeof agentE2ECoreApi;

export type MaybePromise<T> = T | Promise<T>;
export type NonEmptyArray<T> = readonly [T, ...T[]];

export interface HarnessTypes<
  TExecutionSurface = unknown,
  TProfileData extends object = Record<string, unknown>,
  TObserved extends object = Record<string, unknown>,
  TOwnedResource extends object = Record<string, unknown>
> {
  executionSurface: TExecutionSurface;
  profileData: TProfileData;
  observed: TObserved;
  ownedResource: TOwnedResource;
}

export type AnyHarnessTypes = HarnessTypes<unknown, object, object, object>;

export type ExecutionSurface<TTypes extends AnyHarnessTypes = HarnessTypes> = TTypes['executionSurface'];
export type ProfileData<TTypes extends AnyHarnessTypes = HarnessTypes> = TTypes['profileData'];
export type ObservedDomainPayload<TTypes extends AnyHarnessTypes = HarnessTypes> = TTypes['observed'];
export type OwnedResource<TTypes extends AnyHarnessTypes = HarnessTypes> = TTypes['ownedResource'];

export interface JourneyProfile<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  label?: string;
  description?: string;
  data: ProfileData<TTypes>;
  isDefault?: boolean;
  seed?: EnvironmentSeed<TTypes>;
}

export interface ArtifactRef {
  id: string;
  kind: string;
  uri: string;
  path?: string;
  name?: string;
  mediaType?: string;
  description?: string;
}

export type GuidanceActionType = 'continue' | 'inspect' | 'rerun' | 'fix' | 'stop';

export interface GuidanceAction {
  type: GuidanceActionType;
  label: string;
  target?: string;
  detail?: string;
}

export type FeedbackStatus = 'passed' | 'failed' | 'warning' | 'skipped';

export interface FeedbackEnvelope<TTypes extends AnyHarnessTypes = HarnessTypes> {
  status: FeedbackStatus;
  observed?: ObservedDomainPayload<TTypes>;
  artifacts?: readonly ArtifactRef[];
  guidance?: readonly GuidanceAction[];
  warnings?: readonly string[];
  errors?: readonly string[];
  ownedResources?: readonly OwnedResource<TTypes>[];
}


export interface StructuredWarning {
  code: string;
  message: string;
  guidance: NonEmptyArray<GuidanceAction>;
  artifactRefs?: readonly string[];
}

export interface SeedError {
  code: string;
  message: string;
  guidance?: readonly GuidanceAction[];
  artifactRefs?: readonly string[];
}

export interface EnvironmentSeedState<TTypes extends AnyHarnessTypes = HarnessTypes> {
  checked: readonly OwnedResource<TTypes>[];
  created: readonly OwnedResource<TTypes>[];
  forbidden: readonly OwnedResource<TTypes>[];
}

export interface SeedContribution<TTypes extends AnyHarnessTypes = HarnessTypes> {
  environment?: Partial<EnvironmentSeedState<TTypes>>;
  artifacts?: readonly ArtifactRef[];
  warnings?: readonly StructuredWarning[];
  errors?: readonly SeedError[];
  guidance?: readonly GuidanceAction[];
}

interface NormalizedSeedContribution<TTypes extends AnyHarnessTypes = HarnessTypes> {
  environment: EnvironmentSeedState<TTypes>;
  artifacts: readonly ArtifactRef[];
  warnings: readonly StructuredWarning[];
  errors: readonly SeedError[];
  guidance: readonly GuidanceAction[];
}

export interface SeedContext<TTypes extends AnyHarnessTypes = HarnessTypes> {
  profile: JourneyProfile<TTypes>;
  execution?: ExecutionSurface<TTypes>;
}

export type EnvironmentSeed<TTypes extends AnyHarnessTypes = HarnessTypes> = (
  context: SeedContext<TTypes>
) => MaybePromise<SeedContribution<TTypes> | void>;

export type SeedManifestStatus = 'passed' | 'warning' | 'failed';

export interface SeedManifest<TTypes extends AnyHarnessTypes = HarnessTypes> {
  status: SeedManifestStatus;
  profile: {
    id: string;
    label?: string;
  };
  environment: EnvironmentSeedState<TTypes>;
  artifacts: readonly ArtifactRef[];
  warnings: readonly StructuredWarning[];
  errors: readonly SeedError[];
}

export type SeedGateStatus = 'ready' | 'blocked';

export interface SeedGateResult<TTypes extends AnyHarnessTypes = HarnessTypes> {
  status: SeedGateStatus;
  canRunSteps: boolean;
  manifest: SeedManifest<TTypes>;
  guidance: readonly GuidanceAction[];
}


export interface OwnershipLedger<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId: string;
  resources: readonly OwnedResource<TTypes>[];
}

export interface CleanupSkippedResource<TTypes extends AnyHarnessTypes = HarnessTypes> {
  resource: OwnedResource<TTypes>;
  reason: 'not-owned' | 'unsupported';
}

export interface CleanupDeletedResource<TTypes extends AnyHarnessTypes = HarnessTypes> {
  resource: OwnedResource<TTypes>;
  adapterId: string;
  artifact?: ArtifactRef;
}

export interface CleanupFailedResource<TTypes extends AnyHarnessTypes = HarnessTypes> {
  resource: OwnedResource<TTypes>;
  adapterId: string;
  error: string;
}

export interface CleanupArtifacts<TTypes extends AnyHarnessTypes = HarnessTypes> {
  planned: readonly OwnedResource<TTypes>[];
  deleted: readonly CleanupDeletedResource<TTypes>[];
  skipped: readonly CleanupSkippedResource<TTypes>[];
  failed: readonly CleanupFailedResource<TTypes>[];
}

export interface CleanupPlan<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId: string;
  planned: readonly OwnedResource<TTypes>[];
  skipped: readonly CleanupSkippedResource<TTypes>[];
}

export interface ResourceAdapter<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  supports: (resource: OwnedResource<TTypes>) => boolean;
  delete: (resource: OwnedResource<TTypes>) => MaybePromise<void | { artifact?: ArtifactRef }>;
}

export interface ResourceKindDefinition<
  TKind extends string = string,
  TCreateInput extends object = Record<string, unknown>,
  TResource extends { kind: TKind; id: string } = { kind: TKind; id: string }
> {
  kind: TKind;
  create?: (input: TCreateInput) => MaybePromise<TResource>;
  delete?: (resource: TResource) => MaybePromise<void | { artifact?: ArtifactRef }>;
}

type RegistryResourceKindDefinition<TResource extends { kind: string; id: string }> =
  TResource extends { kind: infer TKind extends string; id: string }
    ? ResourceKindDefinition<TKind, any, TResource>
    : never;

export interface ResourceRegistry<TResource extends { kind: string; id: string } = { kind: string; id: string }> {
  definitions: readonly RegistryResourceKindDefinition<TResource>[];
  create: <TCreateInput extends object>(kind: string, input: TCreateInput) => Promise<TResource>;
  adapter: ResourceAdapter<HarnessTypes<unknown, Record<string, unknown>, Record<string, unknown>, TResource>>;
}

export interface TeardownResult<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId: string;
  plan: CleanupPlan<TTypes>;
  artifacts: CleanupArtifacts<TTypes>;
}

export interface ReseedJourneyRunOptions<TTypes extends AnyHarnessTypes = HarnessTypes> extends BeginJourneyRunOptions<TTypes> {
  previousLedger?: OwnershipLedger<TTypes>;
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  requestedResources?: readonly OwnedResource<TTypes>[];
}

export type ReseedBlockedReason = 'cleanup-failed' | 'seed-gate-blocked';

export type ReseedJourneyRunResult<TTypes extends AnyHarnessTypes = HarnessTypes> =
  | {
      status: 'blocked';
      reason: ReseedBlockedReason;
      canRunSteps: false;
      cleanup: TeardownResult<TTypes>;
      seedGate?: SeedGateResult<TTypes>;
      guidance: readonly GuidanceAction[];
    }
  | {
      status: 'running';
      canRunSteps: true;
      cleanup: TeardownResult<TTypes>;
      seedGate: SeedGateResult<TTypes>;
      run: JourneyRun<TTypes>;
      guidance: readonly GuidanceAction[];
    };


export type RunProgressStatus = 'running' | 'passed' | 'failed';

export interface RunProgress {
  status: RunProgressStatus;
  completedStepIds: readonly string[];
  failedStepIds: readonly string[];
  currentStepId?: string;
}

export interface JourneyRun<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  journey: ExecutableJourney<TTypes>;
  profile: JourneyProfile<TTypes>;
  execution: ExecutionSurface<TTypes>;
  seedGate: SeedGateResult<TTypes>;
  startedAt: string;
  progress: RunProgress;
  ownershipLedger: OwnershipLedger<TTypes>;
}

export interface BeginJourneyRunOptions<TTypes extends AnyHarnessTypes = HarnessTypes> {
  profileId?: string;
  execution: ExecutionSurface<TTypes>;
  runId?: string;
}

export type BeginJourneyRunResult<TTypes extends AnyHarnessTypes = HarnessTypes> =
  | {
      status: 'blocked';
      seedGate: SeedGateResult<TTypes>;
    }
  | {
      status: 'running';
      run: JourneyRun<TTypes>;
      seedGate: SeedGateResult<TTypes>;
    };

export type ProofRunStatus = 'passed' | 'failed' | 'error';

export interface ProofRunResult {
  id: string;
  title: string;
  status: ProofRunStatus;
  error?: string;
}

export type StepRunStatus = FeedbackStatus | 'error';

export interface StepRunResult<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId: string;
  phaseId: string;
  stepId: string;
  status: StepRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  feedback: FeedbackEnvelope<TTypes>;
  observed?: ObservedDomainPayload<TTypes>;
  artifacts: readonly ArtifactRef[];
  warnings: readonly string[];
  errors: readonly string[];
  ownedResources: readonly OwnedResource<TTypes>[];
  proofs: readonly ProofRunResult[];
  guidance: readonly GuidanceAction[];
  progress: RunProgress;
}


export type ClosureStatus = 'crystallized' | 'failed';
export type ClosureFailureReason = 'seed-gate-blocked' | 'step-failed';

export interface ClosureEvidence<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId?: string;
  seed: SeedManifest<TTypes>;
  startedAt: string;
  endedAt: string;
}

export interface ClosureResult<TTypes extends AnyHarnessTypes = HarnessTypes> {
  status: ClosureStatus;
  crystallized: boolean;
  intervention: 'none';
  failureReason?: ClosureFailureReason;
  seedGate: SeedGateResult<TTypes>;
  steps: readonly StepRunResult<TTypes>[];
  artifacts: readonly ArtifactRef[];
  warnings: readonly (StructuredWarning | string)[];
  errors: readonly string[];
  evidence: ClosureEvidence<TTypes>;
}

export interface ClosureOptions<TTypes extends AnyHarnessTypes = HarnessTypes> extends BeginJourneyRunOptions<TTypes> {}

export interface StepHandlerContext<TTypes extends AnyHarnessTypes = HarnessTypes> {
  runId: string;
  execution: ExecutionSurface<TTypes>;
  profile: JourneyProfile<TTypes>;
}

export interface ProofCheckContext<TTypes extends AnyHarnessTypes = HarnessTypes> extends StepHandlerContext<TTypes> {
  observed: ObservedDomainPayload<TTypes>;
}

export type StepHandler<TTypes extends AnyHarnessTypes = HarnessTypes> = (
  context: StepHandlerContext<TTypes>
) => MaybePromise<FeedbackEnvelope<TTypes>>;

export type ProofCheck<TTypes extends AnyHarnessTypes = HarnessTypes> = (
  context: ProofCheckContext<TTypes>
) => MaybePromise<boolean | FeedbackEnvelope<TTypes>>;

export interface ProofDefinition<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  check: ProofCheck<TTypes>;
}

export interface StepDefinition<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  execute: StepHandler<TTypes>;
  proofs?: readonly ProofDefinition<TTypes>[];
  artifacts?: readonly ArtifactRef[];
  guidance?: readonly GuidanceAction[];
}

export interface PhaseDefinition<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  steps: NonEmptyArray<StepDefinition<TTypes>>;
}

export interface JourneyDefinition<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  profiles: NonEmptyArray<JourneyProfile<TTypes>>;
  seed?: EnvironmentSeed<TTypes>;
  phases: NonEmptyArray<PhaseDefinition<TTypes>>;
}

export interface InspectableJourneyProfile<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  label?: string;
  description?: string;
  data: ProfileData<TTypes>;
  isDefault: boolean;
}

export interface InspectableProofContract {
  id: string;
  title: string;
  description?: string;
}

export interface InspectableStepContract {
  id: string;
  title: string;
  description?: string;
  proofs: readonly InspectableProofContract[];
  artifacts: readonly ArtifactRef[];
  guidance: readonly GuidanceAction[];
}

export interface InspectablePhaseContract {
  id: string;
  title: string;
  description?: string;
  steps: NonEmptyArray<InspectableStepContract>;
}

export interface InspectableJourneyContract<TTypes extends AnyHarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  tags: readonly string[];
  defaultProfileId: string;
  profiles: NonEmptyArray<InspectableJourneyProfile<TTypes>>;
  phases: NonEmptyArray<InspectablePhaseContract>;
}

export interface ExecutableJourney<TTypes extends AnyHarnessTypes = HarnessTypes> extends JourneyDefinition<TTypes> {
  defaultProfile: JourneyProfile<TTypes>;
  getProfile: (profileId?: string) => JourneyProfile<TTypes>;
  toInspectableContract: () => InspectableJourneyContract<TTypes>;
}

export function defineJourney<TTypes extends AnyHarnessTypes = HarnessTypes>(
  definition: JourneyDefinition<TTypes>
): ExecutableJourney<TTypes> {
  assertNonEmpty(definition.profiles, 'Executable Journey requires at least one Journey Profile');
  assertNonEmpty(definition.phases, 'Executable Journey requires at least one phase');

  for (const phase of definition.phases) {
    assertNonEmpty(phase.steps, `Phase "${phase.id}" requires at least one step`);
  }

  const defaultProfiles = definition.profiles.filter((profile) => profile.isDefault === true);
  if (defaultProfiles.length > 1) {
    throw new Error('Executable Journey can have at most one default Journey Profile');
  }

  const defaultProfile = defaultProfiles[0] ?? definition.profiles[0];

  const journey: ExecutableJourney<TTypes> = {
    ...definition,
    defaultProfile,
    getProfile: (profileId?: string) => selectJourneyProfile(definition.profiles, profileId ?? defaultProfile.id),
    toInspectableContract: () => toInspectableContract(journey)
  };

  return journey;
}





export async function runClosure<TTypes extends AnyHarnessTypes = HarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  options: ClosureOptions<TTypes>
): Promise<ClosureResult<TTypes>> {
  const startedAt = new Date().toISOString();
  const begin = await beginJourneyRun(journey, options);

  if (begin.status === 'blocked') {
    const endedAt = new Date().toISOString();
    return {
      status: 'failed',
      crystallized: false,
      intervention: 'none',
      failureReason: 'seed-gate-blocked',
      seedGate: begin.seedGate,
      steps: [],
      artifacts: begin.seedGate.manifest.artifacts,
      warnings: begin.seedGate.manifest.warnings,
      errors: begin.seedGate.manifest.errors.map((error) => error.message),
      evidence: {
        seed: begin.seedGate.manifest,
        startedAt,
        endedAt
      }
    };
  }

  const steps: StepRunResult<TTypes>[] = [];
  for (const phase of begin.run.journey.phases) {
    for (const step of phase.steps) {
      const result = await runJourneyStep(begin.run, { phaseId: phase.id, stepId: step.id });
      steps.push(result);
      if (result.status === 'failed' || result.status === 'error') {
        return buildClosureResult(begin, steps, startedAt, 'step-failed');
      }
    }
  }

  return buildClosureResult(begin, steps, startedAt);
}

export function createOwnershipLedger<TTypes extends AnyHarnessTypes = HarnessTypes>(
  runId: string,
  resources: readonly OwnedResource<TTypes>[] = []
): OwnershipLedger<TTypes> {
  return { runId, resources: uniqueResources(resources) };
}

export function recordOwnedResource<TTypes extends AnyHarnessTypes>(
  run: JourneyRun<TTypes>,
  resource: OwnedResource<TTypes>
): OwnershipLedger<TTypes> {
  run.ownershipLedger = createOwnershipLedger(run.id, [...run.ownershipLedger.resources, resource]);
  return run.ownershipLedger;
}

export function defineResourceKind<
  TKind extends string,
  TCreateInput extends object,
  TResource extends { kind: TKind; id: string }
>(definition: ResourceKindDefinition<TKind, TCreateInput, TResource>): ResourceKindDefinition<TKind, TCreateInput, TResource> {
  return definition;
}

export function createResourceRegistry<TResource extends { kind: string; id: string }>(
  definitions: readonly RegistryResourceKindDefinition<TResource>[]
): ResourceRegistry<TResource> {
  const runtimeDefinitions = definitions as readonly ResourceKindDefinition<string, any, TResource>[];
  const byKind = new Map(runtimeDefinitions.map((definition) => [definition.kind, definition]));

  return {
    definitions,
    async create<TCreateInput extends object>(kind: string, input: TCreateInput): Promise<TResource> {
      const definition = byKind.get(kind);
      if (!definition?.create) throw new Error(`No resource creator registered for kind: ${kind}`);
      return definition.create(input);
    },
    adapter: {
      id: 'resource-registry-adapter',
      supports: (resource) => byKind.has(resource.kind) && typeof byKind.get(resource.kind)?.delete === 'function',
      delete: async (resource) => {
        const definition = byKind.get(resource.kind);
        if (!definition?.delete) throw new Error(`No resource destroyer registered for kind: ${resource.kind}`);
        return definition.delete(resource);
      }
    }
  };
}

export function createCleanupPlan<TTypes extends AnyHarnessTypes = HarnessTypes>(
  ledger: OwnershipLedger<TTypes>,
  options: { requestedResources?: readonly OwnedResource<TTypes>[] } = {}
): CleanupPlan<TTypes> {
  const ownedByKey = new Map(ledger.resources.map((resource) => [resourceKey(resource), resource]));
  const requested = options.requestedResources ?? ledger.resources;
  const planned: OwnedResource<TTypes>[] = [];
  const skipped: CleanupSkippedResource<TTypes>[] = [];

  for (const resource of requested) {
    const owned = ownedByKey.get(resourceKey(resource));
    if (!owned) {
      skipped.push({ resource, reason: 'not-owned' });
      continue;
    }

    planned.push(owned);
  }

  return { runId: ledger.runId, planned: uniqueResources(planned), skipped };
}

export async function teardownOwnedResources<TTypes extends AnyHarnessTypes = HarnessTypes>(
  ledger: OwnershipLedger<TTypes>,
  adapters: readonly ResourceAdapter<TTypes>[],
  options: { requestedResources?: readonly OwnedResource<TTypes>[] } = {}
): Promise<TeardownResult<TTypes>> {
  const plan = createCleanupPlan(ledger, options);
  const deleted: CleanupDeletedResource<TTypes>[] = [];
  const skipped: CleanupSkippedResource<TTypes>[] = [...plan.skipped];
  const failed: CleanupFailedResource<TTypes>[] = [];

  for (const resource of plan.planned) {
    const adapter = adapters.find((candidate) => candidate.supports(resource));
    if (!adapter) {
      skipped.push({ resource, reason: 'unsupported' });
      continue;
    }

    try {
      const result = await adapter.delete(resource);
      const deletedResource = compactObject({ resource, adapterId: adapter.id, artifact: result?.artifact }) as CleanupDeletedResource<TTypes>;
      deleted.push(deletedResource);
    } catch (error) {
      failed.push({
        resource,
        adapterId: adapter.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    runId: ledger.runId,
    plan,
    artifacts: {
      planned: plan.planned,
      deleted,
      skipped,
      failed
    }
  };
}

export async function reseedJourneyRun<TTypes extends AnyHarnessTypes = HarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  options: ReseedJourneyRunOptions<TTypes>
): Promise<ReseedJourneyRunResult<TTypes>> {
  const cleanup = await teardownOwnedResources(
    options.previousLedger ?? createOwnershipLedger<TTypes>(options.runId ?? deriveRunId(options.execution, journey, journey.getProfile(options.profileId))),
    options.resourceAdapters ?? [],
    compactObject({ requestedResources: options.requestedResources }) as { requestedResources?: readonly OwnedResource<TTypes>[] }
  );

  if (cleanup.artifacts.failed.length > 0) {
    return {
      status: 'blocked',
      reason: 'cleanup-failed',
      canRunSteps: false,
      cleanup,
      guidance: [
        {
          type: 'fix',
          label: 'Fix resource cleanup before reseeding',
          target: cleanup.runId,
          detail: `${cleanup.artifacts.failed.length} owned resource cleanup operation(s) failed.`
        }
      ]
    };
  }

  const begin = await beginJourneyRun(journey, options);
  if (begin.status === 'blocked') {
    return {
      status: 'blocked',
      reason: 'seed-gate-blocked',
      canRunSteps: false,
      cleanup,
      seedGate: begin.seedGate,
      guidance: begin.seedGate.guidance
    };
  }

  return {
    status: 'running',
    canRunSteps: true,
    cleanup,
    seedGate: begin.seedGate,
    run: begin.run,
    guidance: begin.seedGate.guidance
  };
}

export async function beginJourneyRun<TTypes extends AnyHarnessTypes = HarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  options: BeginJourneyRunOptions<TTypes>
): Promise<BeginJourneyRunResult<TTypes>> {
  const seedGate = await runEnvironmentSeed(
    journey,
    compactObject({ profileId: options.profileId, execution: options.execution }) as {
      profileId?: string;
      execution?: ExecutionSurface<TTypes>;
    }
  );

  if (!seedGate.canRunSteps) {
    return { status: 'blocked', seedGate };
  }

  const profile = journey.getProfile(options.profileId);
  const runId = options.runId ?? deriveRunId(options.execution, journey, profile);
  const run: JourneyRun<TTypes> = {
    id: runId,
    journey,
    profile,
    execution: options.execution,
    seedGate,
    startedAt: new Date().toISOString(),
    progress: {
      status: 'running',
      completedStepIds: [],
      failedStepIds: []
    },
    ownershipLedger: createOwnershipLedger(runId)
  };

  return { status: 'running', run, seedGate };
}

export async function runJourneyStep<TTypes extends AnyHarnessTypes = HarnessTypes>(
  run: JourneyRun<TTypes>,
  selection: { phaseId: string; stepId: string }
): Promise<StepRunResult<TTypes>> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const { phase, step } = findJourneyStep(run.journey, selection);

  run.progress = {
    ...run.progress,
    currentStepId: step.id
  };

  let feedback: FeedbackEnvelope<TTypes>;
  try {
    feedback = await step.execute({ runId: run.id, execution: run.execution, profile: run.profile });
  } catch (error) {
    feedback = {
      status: 'failed',
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }

  for (const resource of feedback.ownedResources ?? []) {
    recordOwnedResource(run, resource);
  }

  const proofs = await evaluateProofs(step.proofs ?? [], {
    execution: run.execution,
    profile: run.profile,
    runId: run.id,
    observed: (feedback.observed ?? {}) as ObservedDomainPayload<TTypes>
  });
  const failedProof = proofs.find((proof) => proof.status !== 'passed');
  const status = deriveStepStatus(feedback, proofs);
  const failed = status === 'failed' || status === 'error';
  const ended = Date.now();
  const guidance = failed ? failureGuidance(step, failedProof) : passGuidance(run.journey, phase.id, step.id, feedback.guidance);
  const progress = nextProgress(run.progress, step.id, failed);
  run.progress = progress;

  return compactObject({
    runId: run.id,
    phaseId: phase.id,
    stepId: step.id,
    status,
    startedAt,
    endedAt: new Date(ended).toISOString(),
    durationMs: Math.max(0, ended - started),
    feedback,
    observed: feedback.observed,
    artifacts: feedback.artifacts ?? [],
    warnings: feedback.warnings ?? [],
    errors: feedback.errors ?? [],
    ownedResources: feedback.ownedResources ?? [],
    proofs,
    guidance,
    progress
  }) as StepRunResult<TTypes>;
}

export async function runEnvironmentSeed<TTypes extends AnyHarnessTypes = HarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  options: { profileId?: string; execution?: ExecutionSurface<TTypes> } = {}
): Promise<SeedGateResult<TTypes>> {
  const profile = journey.getProfile(options.profileId);
  const context: SeedContext<TTypes> = compactObject({ profile, execution: options.execution });
  const contributions = [
    normalizeSeedContribution(await journey.seed?.(context)),
    normalizeSeedContribution(await profile.seed?.(context))
  ];
  const manifest = buildSeedManifest(profile, contributions);
  const warningGuidance = manifest.warnings.flatMap((warning) => warning.guidance);
  const errorGuidance = manifest.errors.flatMap((error) => error.guidance ?? []);
  const contributionGuidance = contributions.flatMap((contribution) => contribution.guidance);
  const guidance = [...contributionGuidance, ...warningGuidance, ...errorGuidance];
  const blocked = manifest.errors.length > 0;

  return {
    status: blocked ? 'blocked' : 'ready',
    canRunSteps: !blocked,
    manifest,
    guidance
  };
}

export function toInspectableContract<TTypes extends AnyHarnessTypes = HarnessTypes>(
  journey: JourneyDefinition<TTypes> & { defaultProfile?: JourneyProfile<TTypes> }
): InspectableJourneyContract<TTypes> {
  assertNonEmpty(journey.profiles, 'Inspectable Journey Contract requires at least one Journey Profile');
  assertNonEmpty(journey.phases, 'Inspectable Journey Contract requires at least one phase');

  const defaultProfiles = journey.profiles.filter((profile) => profile.isDefault === true);
  const defaultProfile = journey.defaultProfile ?? defaultProfiles[0] ?? journey.profiles[0];

  return compactObject({
    id: journey.id,
    title: journey.title,
    description: journey.description,
    tags: journey.tags ?? [],
    defaultProfileId: defaultProfile.id,
    profiles: journey.profiles.map((profile) =>
      compactObject({
        id: profile.id,
        label: profile.label,
        description: profile.description,
        data: profile.data,
        isDefault: profile.id === defaultProfile.id
      })
    ) as unknown as NonEmptyArray<InspectableJourneyProfile<TTypes>>,
    phases: journey.phases.map((phase) =>
      compactObject({
        id: phase.id,
        title: phase.title,
        description: phase.description,
        steps: phase.steps.map((step) =>
          compactObject({
            id: step.id,
            title: step.title,
            description: step.description,
            proofs: (step.proofs ?? []).map((proof) =>
              compactObject({
                id: proof.id,
                title: proof.title,
                description: proof.description
              })
            ),
            artifacts: step.artifacts ?? [],
            guidance: step.guidance ?? []
          })
        ) as unknown as NonEmptyArray<InspectableStepContract>
      })
    ) as unknown as NonEmptyArray<InspectablePhaseContract>
  }) as InspectableJourneyContract<TTypes>;
}





function buildClosureResult<TTypes extends AnyHarnessTypes>(
  begin: Extract<BeginJourneyRunResult<TTypes>, { status: 'running' }>,
  steps: readonly StepRunResult<TTypes>[],
  startedAt: string,
  failureReason?: ClosureFailureReason
): ClosureResult<TTypes> {
  const failed = failureReason !== undefined;
  const endedAt = new Date().toISOString();
  return compactObject({
    status: failed ? 'failed' : 'crystallized',
    crystallized: !failed,
    intervention: 'none',
    failureReason,
    seedGate: begin.seedGate,
    steps,
    artifacts: [...begin.seedGate.manifest.artifacts, ...steps.flatMap((step) => step.artifacts)],
    warnings: [...begin.seedGate.manifest.warnings, ...steps.flatMap((step) => step.warnings)],
    errors: [...begin.seedGate.manifest.errors.map((error) => error.message), ...steps.flatMap((step) => step.errors)],
    evidence: compactObject({
      runId: begin.run.id,
      seed: begin.seedGate.manifest,
      startedAt,
      endedAt
    })
  }) as ClosureResult<TTypes>;
}

function uniqueResources<TTypes extends AnyHarnessTypes>(
  resources: readonly OwnedResource<TTypes>[]
): readonly OwnedResource<TTypes>[] {
  const seen = new Set<string>();
  const unique: OwnedResource<TTypes>[] = [];
  for (const resource of resources) {
    const key = resourceKey(resource);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(resource);
    }
  }
  return unique;
}

function resourceKey(resource: unknown): string {
  return stableStringify(resource);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, field]) => `${JSON.stringify(key)}:${stableStringify(field)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function deriveRunId<TTypes extends AnyHarnessTypes>(
  execution: ExecutionSurface<TTypes>,
  journey: ExecutableJourney<TTypes>,
  profile: JourneyProfile<TTypes>
): string {
  if (typeof execution === 'object' && execution !== null && 'runId' in execution) {
    const runId = (execution as { runId?: unknown }).runId;
    if (typeof runId === 'string' && runId.length > 0) return runId;
  }

  return `run:${journey.id}:${profile.id}`;
}

function findJourneyStep<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  selection: { phaseId: string; stepId: string }
): { phase: PhaseDefinition<TTypes>; step: StepDefinition<TTypes> } {
  const phase = journey.phases.find((candidate) => candidate.id === selection.phaseId);
  if (!phase) throw new Error(`Unknown phase: ${selection.phaseId}`);

  const step = phase.steps.find((candidate) => candidate.id === selection.stepId);
  if (!step) throw new Error(`Unknown step: ${selection.stepId}`);

  return { phase, step };
}

async function evaluateProofs<TTypes extends AnyHarnessTypes>(
  proofs: readonly ProofDefinition<TTypes>[],
  context: ProofCheckContext<TTypes>
): Promise<ProofRunResult[]> {
  const results: ProofRunResult[] = [];

  for (const proof of proofs) {
    try {
      const result = await proof.check(context);
      const passed = typeof result === 'boolean' ? result : result.status === 'passed' || result.status === 'warning';
      results.push({ id: proof.id, title: proof.title, status: passed ? 'passed' : 'failed' });
    } catch (error) {
      results.push({
        id: proof.id,
        title: proof.title,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

function deriveStepStatus<TTypes extends AnyHarnessTypes>(
  feedback: FeedbackEnvelope<TTypes>,
  proofs: readonly ProofRunResult[]
): StepRunStatus {
  if (feedback.errors && feedback.errors.length > 0) return 'failed';
  if (proofs.some((proof) => proof.status === 'error')) return 'error';
  if (proofs.some((proof) => proof.status === 'failed')) return 'failed';
  return feedback.status;
}

function passGuidance<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  phaseId: string,
  stepId: string,
  existingGuidance: readonly GuidanceAction[] = []
): readonly GuidanceAction[] {
  const flattened = journey.phases.flatMap((phase) => phase.steps.map((step) => ({ phaseId: phase.id, stepId: step.id })));
  const currentIndex = flattened.findIndex((step) => step.phaseId === phaseId && step.stepId === stepId);
  const next = flattened[currentIndex + 1];

  return [
    ...existingGuidance,
    next
      ? { type: 'continue', label: 'Continue to next step', target: next.stepId }
      : { type: 'continue', label: 'Run complete', target: 'run:complete' }
  ];
}

function failureGuidance<TTypes extends AnyHarnessTypes>(
  step: StepDefinition<TTypes>,
  failedProof: ProofRunResult | undefined
): readonly GuidanceAction[] {
  return [
    { type: 'inspect', label: 'Inspect failed step', target: step.id },
    {
      type: 'fix',
      label: failedProof ? 'Fix failed proof' : 'Fix failed step',
      target: failedProof?.id ?? step.id
    }
  ];
}

function nextProgress(progress: RunProgress, stepId: string, failed: boolean): RunProgress {
  return failed
    ? {
        status: 'failed',
        currentStepId: stepId,
        completedStepIds: progress.completedStepIds,
        failedStepIds: [...progress.failedStepIds, stepId]
      }
    : {
        status: 'passed',
        currentStepId: stepId,
        completedStepIds: [...progress.completedStepIds, stepId],
        failedStepIds: progress.failedStepIds
      };
}

function selectJourneyProfile<TTypes extends AnyHarnessTypes>(
  profiles: NonEmptyArray<JourneyProfile<TTypes>>,
  profileId: string
): JourneyProfile<TTypes> {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Unknown Journey Profile: ${profileId}`);
  }

  return profile;
}

function normalizeSeedContribution<TTypes extends AnyHarnessTypes>(
  contribution: SeedContribution<TTypes> | void
): NormalizedSeedContribution<TTypes> {
  return {
    environment: {
      checked: contribution?.environment?.checked ?? [],
      created: contribution?.environment?.created ?? [],
      forbidden: contribution?.environment?.forbidden ?? []
    },
    artifacts: contribution?.artifacts ?? [],
    warnings: contribution?.warnings ?? [],
    errors: contribution?.errors ?? [],
    guidance: contribution?.guidance ?? []
  };
}

function buildSeedManifest<TTypes extends AnyHarnessTypes>(
  profile: JourneyProfile<TTypes>,
  contributions: readonly NormalizedSeedContribution<TTypes>[]
): SeedManifest<TTypes> {
  const warnings = contributions.flatMap((contribution) => contribution.warnings);
  const errors = contributions.flatMap((contribution) => contribution.errors);

  return {
    status: errors.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
    profile: compactObject({ id: profile.id, label: profile.label }) as SeedManifest<TTypes>['profile'],
    environment: {
      checked: contributions.flatMap((contribution) => contribution.environment.checked),
      created: contributions.flatMap((contribution) => contribution.environment.created),
      forbidden: contributions.flatMap((contribution) => contribution.environment.forbidden)
    },
    artifacts: contributions.flatMap((contribution) => contribution.artifacts),
    warnings,
    errors
  };
}

function assertNonEmpty<T>(items: readonly T[], message: string): asserts items is NonEmptyArray<T> {
  if (items.length === 0) {
    throw new Error(message);
  }
}

function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
