/**
 * Scaffold-only Harness Core surface.
 *
 * The core subpath must stay generic: no Playwright, no MCP, and no product
 * schema assumptions. Real Minimal Core Contract types arrive in issue #3.
 */
export const __agentE2ECoreScaffold = {
  packageName: '@agent-e2e/harness',
  surface: 'harness-core',
  status: 'scaffold-only'
} as const;

export type AgentE2EHarnessCoreScaffold = typeof __agentE2ECoreScaffold;
