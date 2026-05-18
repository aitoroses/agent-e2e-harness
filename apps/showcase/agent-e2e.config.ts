import { defineAgentE2EConfig } from "@agent-e2e/harness/dev-mcp";
import { createShowcaseDevStackProvider } from "./src/harness/dev-stack.js";
import { createShowcaseComposeAttachedRuntimeTarget } from "./src/harness/compose-attached-runtime.js";
import {
  createShowcaseMcpJourney,
  createShowcaseResourceRegistry,
  type ShowcaseMcpHarness,
} from "./src/harness/dev-mcp-journey.js";

export default defineAgentE2EConfig<ShowcaseMcpHarness>({
  journeys: [createShowcaseMcpJourney()],
  resourceRegistry: createShowcaseResourceRegistry(),
  stackProvider: createShowcaseDevStackProvider(),
  runtimeTargets: [createShowcaseComposeAttachedRuntimeTarget()],
  verify: {
    suites: [{ id: "smoke", journeys: ["showcase:*"] }],
  },
});
