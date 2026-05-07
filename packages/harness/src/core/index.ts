/**
 * Minimal generic Harness Core contract.
 *
 * This subpath owns product-agnostic journey definition and inspection types.
 * It must not import Playwright, MCP, or product-specific schemas.
 */

export const __agentE2ECoreScaffold = {
  packageName: '@agent-e2e/harness',
  surface: 'harness-core',
  status: 'scaffold-only'
} as const;

export type AgentE2EHarnessCoreScaffold = typeof __agentE2ECoreScaffold;

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

export type ExecutionSurface<TTypes extends HarnessTypes = HarnessTypes> = TTypes['executionSurface'];
export type ProfileData<TTypes extends HarnessTypes = HarnessTypes> = TTypes['profileData'];
export type ObservedDomainPayload<TTypes extends HarnessTypes = HarnessTypes> = TTypes['observed'];
export type OwnedResource<TTypes extends HarnessTypes = HarnessTypes> = TTypes['ownedResource'];

export interface JourneyProfile<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  label?: string;
  description?: string;
  data: ProfileData<TTypes>;
  isDefault?: boolean;
}

export interface ArtifactRef {
  id: string;
  kind: string;
  uri: string;
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

export interface FeedbackEnvelope<TTypes extends HarnessTypes = HarnessTypes> {
  status: FeedbackStatus;
  observed?: ObservedDomainPayload<TTypes>;
  artifacts?: readonly ArtifactRef[];
  guidance?: readonly GuidanceAction[];
  warnings?: readonly string[];
  errors?: readonly string[];
}

export interface StepHandlerContext<TTypes extends HarnessTypes = HarnessTypes> {
  execution: ExecutionSurface<TTypes>;
  profile: JourneyProfile<TTypes>;
}

export interface ProofCheckContext<TTypes extends HarnessTypes = HarnessTypes> extends StepHandlerContext<TTypes> {
  observed: ObservedDomainPayload<TTypes>;
}

export type StepHandler<TTypes extends HarnessTypes = HarnessTypes> = (
  context: StepHandlerContext<TTypes>
) => MaybePromise<FeedbackEnvelope<TTypes>>;

export type ProofCheck<TTypes extends HarnessTypes = HarnessTypes> = (
  context: ProofCheckContext<TTypes>
) => MaybePromise<boolean | FeedbackEnvelope<TTypes>>;

export interface ProofDefinition<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  check: ProofCheck<TTypes>;
}

export interface StepDefinition<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  execute: StepHandler<TTypes>;
  proofs?: readonly ProofDefinition<TTypes>[];
  artifacts?: readonly ArtifactRef[];
  guidance?: readonly GuidanceAction[];
}

export interface PhaseDefinition<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  steps: NonEmptyArray<StepDefinition<TTypes>>;
}

export interface JourneyDefinition<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  profiles: NonEmptyArray<JourneyProfile<TTypes>>;
  phases: NonEmptyArray<PhaseDefinition<TTypes>>;
}

export interface InspectableJourneyProfile<TTypes extends HarnessTypes = HarnessTypes> {
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

export interface InspectableJourneyContract<TTypes extends HarnessTypes = HarnessTypes> {
  id: string;
  title: string;
  description?: string;
  defaultProfileId: string;
  profiles: NonEmptyArray<InspectableJourneyProfile<TTypes>>;
  phases: NonEmptyArray<InspectablePhaseContract>;
}

export interface ExecutableJourney<TTypes extends HarnessTypes = HarnessTypes> extends JourneyDefinition<TTypes> {
  defaultProfile: JourneyProfile<TTypes>;
  toInspectableContract: () => InspectableJourneyContract<TTypes>;
}

export function defineJourney<TTypes extends HarnessTypes = HarnessTypes>(
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
    toInspectableContract: () => toInspectableContract(journey)
  };

  return journey;
}

export function toInspectableContract<TTypes extends HarnessTypes = HarnessTypes>(
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

function assertNonEmpty<T>(items: readonly T[], message: string): asserts items is NonEmptyArray<T> {
  if (items.length === 0) {
    throw new Error(message);
  }
}

function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
