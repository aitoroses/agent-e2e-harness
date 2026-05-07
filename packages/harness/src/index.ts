/**
 * Scaffold-only package-root surface for the future Default Harness API.
 *
 * This entrypoint is intentionally tiny in issue #2. Later slices will make
 * the package root ergonomic for Playwright while keeping `/core` generic.
 */
export const __agentE2EScaffold = {
  packageName: '@agent-e2e/harness',
  surface: 'default-harness-api',
  status: 'scaffold-only'
} as const;

export type AgentE2EDefaultHarnessApiScaffold = typeof __agentE2EScaffold;
