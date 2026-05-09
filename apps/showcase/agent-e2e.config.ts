import { defineAgentE2EConfig } from "@agent-e2e/harness/dev-mcp";
import { createShowcaseDevStackProvider } from "./src/harness/dev-stack.js";
import {
  createShowcaseMcpJourney,
  createShowcaseResourceAdapter,
  type ShowcaseMcpHarness,
} from "./src/harness/dev-mcp-journey.js";

export default defineAgentE2EConfig<ShowcaseMcpHarness>({
  journeys: [createShowcaseMcpJourney()],
  resourceAdapters: [createShowcaseResourceAdapter()],
  stackProvider: createShowcaseDevStackProvider(),
});
