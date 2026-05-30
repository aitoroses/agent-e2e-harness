// Consumer-shaped compile check (GOTCHA #4): wiring the public browser-session
// factory explicitly must type-check under strict mode. Before the controller
// param types were aligned with the manager's public input types, this failed
// `tsc` with a strictFunctionTypes variance error, forcing consumers onto the
// non-obvious "omit browserSessions and let the server auto-create it" workaround.
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

// The natural, explicit adoption path: hand the Dev MCP config the public factory.
const explicitlyWired = defineAgentE2EConfig({
  journeys: [],
  browserSessions: createPlaywrightMcpBrowserSessionManager(),
});

// The previously-required workaround must keep working too (server auto-creates
// the same manager via createDefaultBrowserSessions when the field is omitted).
const omittedManager = defineAgentE2EConfig({
  journeys: [],
});

// Explicitly disabling browser sessions stays supported.
const disabledManager = defineAgentE2EConfig({
  journeys: [],
  browserSessions: false,
});

void explicitlyWired;
void omittedManager;
void disabledManager;

export type BrowserSessionsWiringContract = typeof explicitlyWired;
