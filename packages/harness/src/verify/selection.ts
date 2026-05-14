import type { AnyHarnessTypes, ExecutableJourney, JourneyProfile } from "../core/index.js";

export interface VerifySuiteConfig {
  id: string;
  title?: string;
  journeys?: readonly string[];
  tags?: readonly string[];
  exclude?: readonly string[];
  profiles?: readonly string[];
  allProfiles?: boolean;
}

export interface VerifySelectionOptions {
  suite?: string;
  journey?: readonly string[];
  tag?: readonly string[];
  exclude?: readonly string[];
  profile?: readonly string[];
  allProfiles?: boolean;
}

export interface SelectedVerifyRun<TTypes extends AnyHarnessTypes = AnyHarnessTypes> {
  journey: ExecutableJourney<TTypes>;
  profile: JourneyProfile<TTypes>;
  index: number;
}

export interface VerifySelectionResult<TTypes extends AnyHarnessTypes = AnyHarnessTypes> {
  suite?: VerifySuiteConfig;
  selected: readonly SelectedVerifyRun<TTypes>[];
}

export function selectVerifyRuns<TTypes extends AnyHarnessTypes = AnyHarnessTypes>(input: {
  journeys: readonly ExecutableJourney<TTypes>[];
  suites?: readonly VerifySuiteConfig[];
  options?: VerifySelectionOptions;
}): VerifySelectionResult<TTypes> {
  const options = input.options ?? {};
  const suite = options.suite ? findSuite(input.suites ?? [], options.suite) : undefined;
  let journeys = suite
    ? applySuiteBase(input.journeys, suite)
    : [...input.journeys];

  journeys = applyNarrowing(journeys, options.journey, options.tag);
  journeys = applyExcludes(journeys, [...(suite?.exclude ?? []), ...(options.exclude ?? [])]);

  if (journeys.length === 0) throw new Error("Verify selection matched no journeys.");

  const selected: SelectedVerifyRun<TTypes>[] = [];
  for (const journey of journeys) {
    const profiles = selectedProfiles(journey, suite, options);
    for (const profile of profiles) {
      selected.push({ journey, profile, index: selected.length + 1 });
    }
  }

  return suite ? { suite, selected } : { selected };
}

function findSuite(suites: readonly VerifySuiteConfig[], id: string): VerifySuiteConfig {
  const suite = suites.find((candidate) => candidate.id === id);
  if (!suite) throw new Error(`Unknown verify suite: ${id}`);
  return suite;
}

function applySuiteBase<TTypes extends AnyHarnessTypes>(
  journeys: readonly ExecutableJourney<TTypes>[],
  suite: VerifySuiteConfig,
): ExecutableJourney<TTypes>[] {
  const hasJourneySelectors = (suite.journeys?.length ?? 0) > 0;
  const hasTagSelectors = (suite.tags?.length ?? 0) > 0;
  if (!hasJourneySelectors && !hasTagSelectors) return [...journeys];
  return journeys.filter((journey) =>
    (hasJourneySelectors && matchesAny(journey.id, suite.journeys ?? [])) ||
    (hasTagSelectors && hasAnyTag(journey, suite.tags ?? []))
  );
}

function applyNarrowing<TTypes extends AnyHarnessTypes>(
  journeys: readonly ExecutableJourney<TTypes>[],
  journeySelectors: readonly string[] | undefined,
  tagSelectors: readonly string[] | undefined,
): ExecutableJourney<TTypes>[] {
  let narrowed = [...journeys];
  if ((journeySelectors?.length ?? 0) > 0) {
    narrowed = narrowed.filter((journey) => matchesAny(journey.id, journeySelectors ?? []));
  }
  if ((tagSelectors?.length ?? 0) > 0) {
    narrowed = narrowed.filter((journey) => hasAnyTag(journey, tagSelectors ?? []));
  }
  return narrowed;
}

function applyExcludes<TTypes extends AnyHarnessTypes>(
  journeys: readonly ExecutableJourney<TTypes>[],
  excludes: readonly string[],
): ExecutableJourney<TTypes>[] {
  if (excludes.length === 0) return [...journeys];
  return journeys.filter((journey) => !matchesAny(journey.id, excludes));
}

function selectedProfiles<TTypes extends AnyHarnessTypes>(
  journey: ExecutableJourney<TTypes>,
  suite: VerifySuiteConfig | undefined,
  options: VerifySelectionOptions,
): readonly JourneyProfile<TTypes>[] {
  if (options.allProfiles && options.profile?.length) {
    throw new Error("Use either --all-profiles or explicit profiles, not both.");
  }
  const hasCliProfiles = (options.profile?.length ?? 0) > 0;
  const requestedProfiles = options.profile?.length
    ? options.profile
    : suite?.profiles?.length
      ? suite.profiles
      : undefined;
  const allProfiles = hasCliProfiles ? false : options.allProfiles ?? suite?.allProfiles ?? false;
  if (allProfiles) return journey.profiles;
  if (!requestedProfiles?.length) return [journey.defaultProfile];
  return requestedProfiles.map((profileId) => {
    const profile = journey.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error(`Journey ${journey.id} has no requested profile: ${profileId}`);
    return profile;
  });
}

function hasAnyTag<TTypes extends AnyHarnessTypes>(journey: ExecutableJourney<TTypes>, tags: readonly string[]): boolean {
  const journeyTags = new Set(journey.tags ?? []);
  return tags.some((tag) => journeyTags.has(tag));
}

function matchesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globMatch(value, pattern));
}

function globMatch(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return value === pattern;
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}
