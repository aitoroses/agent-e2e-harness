#!/usr/bin/env node
import { startAgentE2EDevMcp } from "@agent-e2e/harness/dev-mcp";
import config from "../agent-e2e.config.js";

await startAgentE2EDevMcp(config);
