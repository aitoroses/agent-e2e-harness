# Journey Patterns

Use this reference when writing `agent-e2e.config.ts`, journeys, resources, or stack providers.

## Journey Template

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
- Keep tags on journeys, not profiles.
- Return owned resources from steps that create durable data.
- Use real app assertions, not screenshots as the only proof.
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
import { createProcessStackProvider, defineStackExploreTools } from "@agent-e2e/harness/stack";
import { z } from "zod/v4";

const explore = defineStackExploreTools<{ serviceId: string }>()([
  {
    id: "app.health",
    title: "Read app health",
    description: "Read a verify-safe health observation from the active app stack.",
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

Use a custom `StackProvider` when the app must start containers, databases, workers, or multiple processes. `stack.start` should return service URLs that journeys and agents use as browser/API targets. `status` should return the unified stack-state packet; optional `logs` should read live logs for stable service ids; `explore` should expose provider-owned tools with Zod schemas, `availableIn`, and `risk`.

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
