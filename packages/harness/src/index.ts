/**
 * Package-root Default Harness API.
 *
 * The root entrypoint is ergonomic for Playwright journeys. Generic contracts
 * remain available from `@agent-e2e/harness/core`, which must stay Playwright-free.
 */
import { defineJourney, type ExecutableJourney, type HarnessTypes, type JourneyDefinition, type StepHandlerContext } from './core/index.js';
import type { Browser, BrowserContext, Page } from 'playwright';

export * from './core/index.js';

export const __agentE2EScaffold = {
  packageName: '@agent-e2e/harness',
  surface: 'default-harness-api',
  status: 'scaffold-only'
} as const;

export type AgentE2EDefaultHarnessApiScaffold = typeof __agentE2EScaffold;

export interface PlaywrightExecutionSurface {
  browser: Browser;
  page: Page;
  context?: BrowserContext;
}

export type PlaywrightHarnessTypes<
  TProfileData extends object = Record<string, unknown>,
  TObserved extends object = Record<string, unknown>,
  TOwnedResource extends object = Record<string, unknown>
> = HarnessTypes<PlaywrightExecutionSurface, TProfileData, TObserved, TOwnedResource>;

export type PlaywrightStepHandlerContext<TTypes extends PlaywrightHarnessTypes = PlaywrightHarnessTypes> =
  StepHandlerContext<TTypes>;

export type PlaywrightJourneyDefinition<
  TProfileData extends object = Record<string, unknown>,
  TObserved extends object = Record<string, unknown>,
  TOwnedResource extends object = Record<string, unknown>
> = JourneyDefinition<PlaywrightHarnessTypes<TProfileData, TObserved, TOwnedResource>>;

export type PlaywrightExecutableJourney<
  TProfileData extends object = Record<string, unknown>,
  TObserved extends object = Record<string, unknown>,
  TOwnedResource extends object = Record<string, unknown>
> = ExecutableJourney<PlaywrightHarnessTypes<TProfileData, TObserved, TOwnedResource>>;

export function definePlaywrightJourney<
  TProfileData extends object = Record<string, unknown>,
  TObserved extends object = Record<string, unknown>,
  TOwnedResource extends object = Record<string, unknown>
>(
  definition: PlaywrightJourneyDefinition<TProfileData, TObserved, TOwnedResource>
): PlaywrightExecutableJourney<TProfileData, TObserved, TOwnedResource> {
  return defineJourney(definition);
}
