#!/usr/bin/env node
import { startAgentE2EDevMcpFromConfig } from "@agent-e2e/harness/dev-mcp";

await startAgentE2EDevMcpFromConfig({
  configPath: new URL("../agent-e2e.config.ts", import.meta.url).pathname,
});
