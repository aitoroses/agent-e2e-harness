# Journey Patterns

Use this reference when writing `agent-e2e.config.ts`, journeys, resources, or stack providers.

## Journey Template

A Journey is the durable contract CI will run. It is not the agent's exploratory transcript. Encode the reviewed path as explicit profiles, seed, phases, steps, proofs, owned resources, and cleanup rules.

```ts
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";

interface Observed {
  visible: boolean;
  resourceId: string;
}

type AppHarness = HarnessTypes<
  { page: import("playwright").Page; stack?: unknown },
  { variant?: string },
  Observed,
  { kind: "thing"; id: string; baseUrl: string }
>;

export const exampleJourney = defineJourney<AppHarness>({
  id: "domain:action",
  title: "Prove a real user-visible flow",
  tags: ["smoke"],
  profiles: [
    { id: "default", isDefault: true, data: {} },
    { id: "alternate", data: { variant: "alternate" } },
  ],
  seed: async ({ profile }) => ({
    environment: {
      checked: [{ kind: "workspace", id: `workspace:${profile.id}` }],
      created: [],
      forbidden: [{ kind: "thing", id: "proof-target" }],
    },
  }),
  phases: [
    {
      id: "phase:main",
      title: "Main proof",
      steps: [
        {
          id: "step:perform-action",
          title: "Perform the user action",
          execute: async ({ execution }) => {
            await execution.page.goto("/target");
            await execution.page.getByRole("button", { name: "Create" }).click();
            const visible = await execution.page.getByText("Created").isVisible();
            const resourceId = "replace-with-app-id";
            return {
              status: visible ? "passed" : "failed",
              observed: { visible, resourceId },
              ownedResources: visible
                ? [{ kind: "thing", id: resourceId, baseUrl: execution.page.url() }]
                : [],
              errors: visible ? [] : ["Expected created state was not visible"],
            };
          },
          proofs: [
            {
              id: "proof:visible",
              title: "Created state is visible",
              check: ({ observed }) => observed.visible === true,
            },
          ],
        },
      ],
    },
  ],
});
```

Rules:

- Seed prerequisites, not the behavior being proven.
- Treat the Journey/Profile as the owner of the seed contract: checked prerequisites, created setup, forbidden product-visible state, and cleanup boundary should be visible from the journey contract.
- Reuse seed helper functions when they reduce duplication, but avoid shared mutable seed state across journeys.
- Keep tags on journeys, not profiles.
- Return owned resources from steps that create durable data.
- Use real app assertions, not screenshots as the only proof.
- Promote agent-discovered paths into reviewed Journey code before adding them to verify suites.
- Keep one journey thin at first; add more after the tracer bullet passes.

## Resource Registry Template

```ts
import { createResourceRegistry, defineResourceKind } from "@agent-e2e/harness/core";

interface OwnedThing {
  kind: "thing";
  id: string;
  baseUrl: string;
}

const thingKind = defineResourceKind({
  kind: "thing",
  create: async (input: { baseUrl: string; id: string }): Promise<OwnedThing> => ({
    kind: "thing",
    id: input.id,
    baseUrl: input.baseUrl,
  }),
  delete: async (resource: OwnedThing) => {
    const response = await fetch(`${resource.baseUrl}/api/things/${resource.id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`delete thing ${resource.id} ${response.status}`);
  },
});

export const resourceRegistry = createResourceRegistry([thingKind]);
```

Prefer `resourceRegistry` for typed cleanup. Use `resourceAdapters` only for one-off mechanics that do not fit a typed resource kind.

## Stack Provider Template

```ts
import { createProcessStackProvider, defineStackExploreTools, type StackProvider } from "@agent-e2e/harness/stack";
import { z } from "zod/v4";

const explore = defineStackExploreTools<{ serviceId: string }>()([
  {
    id: "app.health",
    title: "Read app health",
    description: "Read a verify-safe health observation from the selected Stack Instance.",
    availableIn: ["dev", "verify"],
    risk: "none",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    run: async () => ({ ok: true }),
  },
]);

export const appStackProvider = createProcessStackProvider({
  id: "app",
  command: "npm",
  args: ["run", "dev"],
  serviceId: "web",
  serviceUrl: "http://127.0.0.1:3000",
  readyUrl: "http://127.0.0.1:3000",
  readyTimeoutMs: 90_000,
  logPath: ".agents-e2e/stack/web.log",
});

export const stackProvider = {
  ...appStackProvider,
  explore,
};
```

Use a custom `StackProvider` when the app must start containers, databases, workers, or multiple processes. The default pattern is `start(ctx)`: use `StackStartContext` for stack id, mode, worker identity, suite id, and artifact scope, then create **Named Stack Allocations** for dynamic ports and stack-scoped files.

```ts
export const stackProvider: StackProvider<{ appUrl: string; logPath: string }> = {
  id: "app-stack",
  async start(ctx) {
    const app = await ctx.allocatePort("app server");
    const log = ctx.allocateArtifactPath("app server log", { kind: "file", extension: "log" });
    return { appUrl: app.url, logPath: log.path };
  },
  async status(handle) {
    return {
      status: "ready",
      summary: "app ready",
      services: [{ id: "web", status: "ready", kind: "http", url: handle.appUrl }],
      artifacts: [],
      warnings: [],
      errors: [],
    };
  },
  async stop() {
    return { status: "stopped", summary: "stopped", services: [], artifacts: [], warnings: [], errors: [] };
  },
};
```

`stack.start` should return service URLs through `status`: `StackStatusPacket.services` is the journey-facing runtime contract for browser/API targets. Named Stack Allocations make Dev MCP and worker-scoped verify reports explain which ports, logs, and paths belonged to each Stack Instance; they do not replace services. Optional `logs` should read live logs for stable service ids. `explore` should expose provider-owned tools with Zod schemas, `availableIn`, and `risk`.

## Config Template

```ts
import { defineAgentE2EConfig } from "@agent-e2e/harness/dev-mcp";
import { exampleJourney } from "./src/e2e-harness/journeys/example.js";
import { resourceRegistry } from "./src/e2e-harness/resources.js";
import { appStackProvider } from "./src/e2e-harness/stack.js";

export default defineAgentE2EConfig({
  journeys: [exampleJourney],
  resourceRegistry,
  stackProvider: appStackProvider,
  verify: {
    workers: 1,
    cleanup: "per-run",
    suites: [
      { id: "smoke", journeys: ["domain:*"] },
      { id: "regression", tags: ["regression"], allProfiles: true },
    ],
  },
});
```

Config is the single integration point for both `agent-e2e dev` and `agent-e2e verify`.
