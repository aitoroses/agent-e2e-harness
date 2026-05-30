# @agent-e2e/harness

Reusable TypeScript package for agent-driven E2E proof loops. Consumer apps use it to expose a local Dev MCP server, define seeded journeys, drive browser/API proof, collect artifacts, clean owned resources, and turn the same flow into CI.

Name map:

- npm package: `@agent-e2e/harness`
- adoption skill / repository: `agent-e2e-harness`
- CLI binary: `agent-e2e`

## Install

```sh
npm install @agent-e2e/harness
```

Install the adoption skill for the agent that will wire the app:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
```

Then invoke `$agent-e2e-harness` in the target app.

Add optional peers for the integrations you use:

```sh
npm install -D @modelcontextprotocol/sdk playwright
```

`@modelcontextprotocol/sdk` is needed for the local Dev MCP HTTP server. `playwright` is needed for browser sessions. The Dev MCP is runtime-agnostic: TypeScript config and journeys load via jiti on Node `>=22`, Bun, or Deno — Bun is no longer required. (If you do run on Bun with the Testcontainers PostgreSQL provider, use Bun `>=1.3.14`; Bun `<=1.3.5` hangs in PostgreSQL startup.) Database clients, containers, queues, and other infrastructure dependencies belong in the consumer app that implements a stack provider.

For the common PostgreSQL case you do not have to hand-write that provider: import `createPostgresTestcontainersProvider` from `@agent-e2e/harness/testcontainers`. Its infra packages (`pg`, `@testcontainers/postgresql`, `testcontainers`) are optional peer dependencies loaded lazily, so they are only required if you actually use this subpath:

```ts
import { createPostgresTestcontainersProvider } from "@agent-e2e/harness/testcontainers";

const postgres = createPostgresTestcontainersProvider({
  database: "app",
  username: "app",
  password: "app",
  schemaSql: SCHEMA_SQL,
});
```

## Quickstart

Scaffold a minimal, runnable setup instead of copying boilerplate:

```sh
npx agent-e2e init
```

This writes `agent-e2e.config.ts` (a `defineAgentE2EConfig` with the sample journey wired in) and `journeys/sample.journey.ts` (one phase = state, one proof-light step = frame), then prints the exact next commands (`agent-e2e dev`, then `agent-e2e list` / `agent-e2e call run.begin …`). It is non-destructive — existing files are skipped, not overwritten, unless you pass `--force` — and takes an optional `agent-e2e init [targetDir]`. The generated config omits `browserSessions` so the Dev MCP auto-creates a Playwright session, and carries commented wiring for an explicit `createPlaywrightMcpBrowserSessionManager()` and a stack provider for when you outgrow the defaults. Point `baseUrl` at your app and grow the journey from there; the sections below show the full shapes.

## Public Exports

```ts
import { defineJourney } from '@agent-e2e/harness/core';
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';
import { runAgentE2EVerifyFromConfig } from '@agent-e2e/harness/verify';
import { createProcessStackProvider, createStackStartContext } from '@agent-e2e/harness/stack';
import { managedRuntime, attachedRuntime } from '@agent-e2e/harness/runtime';
import { createRunArtifactRecorder } from '@agent-e2e/harness/artifacts';
```

Subpaths are intentionally split:

- `core` has no Playwright, MCP transport, consumer infrastructure, database, or app-framework imports.
- `dev-mcp` exposes the local MCP control server and tool grammar.
- `verify` runs configured journeys in CI and writes suite reports.
- `playwright-mcp` owns browser sessions and browser forensics.
- `stack` owns generic app/service lifecycle.
- `runtime` owns Runtime Target helpers and Attached Runtime Mode diagnostics.
- `artifacts` records and reads validation evidence.

## Runtime Targets and Attached Runtime Mode

Runtime Targets declare where journeys run or collect evidence. Use `managedRuntime(...)` for harness-owned local stacks and `attachedRuntime(...)` for an **Attached Runtime Target** whose infrastructure is externally owned.

```ts
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';
import { attachedRuntime, managedRuntime, defineRuntimeExploreTool } from '@agent-e2e/harness/runtime';
import { z } from 'zod/v4';

export default defineAgentE2EConfig({
  journeys: [
    defineJourney({
      id: 'checkout:smoke',
      profiles: [
        { id: 'local', data: {}, isDefault: true, runtimeTargetId: 'local-dev' },
        {
          id: 'staging',
          data: { baseUrl: 'https://staging.example.com' },
          runtimeTargetId: 'staging',
          runtime: { allowRunLifecycle: true, allowRunMutationTools: ['orders.create-owned'] }
        }
      ],
      phases: [/* ... */]
    })
  ],
  runtimeTargets: [
    managedRuntime({ id: 'local-dev', label: 'Local dev stack' }),
    attachedRuntime({
      id: 'staging',
      label: 'Staging',
      status: async () => stagingStatusPacket(),
      logs: async ({ serviceId, tail, level }) => readStagingLogs({ serviceId, tail, level }),
      access: [{ id: 'browser-session', kind: 'browserStorageState' }],
      explore: [
        defineRuntimeExploreTool({
          id: 'release.version',
          title: 'Read release version',
          description: 'Observe the deployed release version.',
          risk: 'observation',
          input: z.object({}),
          output: z.object({ version: z.string() }),
          run: async () => ({ version: await readReleaseVersion() })
        })
      ]
    })
  ]
});
```

Run attached mode with `agent-e2e attached --target <id>`. Attached Runtime Mode does not own infrastructure lifecycle. Start or stop production, staging, preview, Kubernetes, or Docker Compose through product controls, then connect the harness. The attached MCP surface exposes `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.explore.list`, and `runtime.explore.run`. `runtime.logs` requires `tail`, accepts optional `serviceId` and best-effort `level`, and writes an artifact. Runtime Tool Risk values are `observation`, `runMutation`, and `runtimeMutation`; observation runs by default, runMutation requires Journey Profile opt-in, and runtimeMutation is blocked by default. Access Context status and Access Resolvers must not expose secret material in agent-visible responses; automatic `browser.open` authentication wiring is not part of this v1 attached runtime path unless product code supplies it.

## Minimal Journey

```ts
import { defineJourney } from '@agent-e2e/harness/core';

export const checkoutJourney = defineJourney({
  id: 'checkout:happy-path',
  title: 'Checkout happy path',
  profiles: [
    {
      id: 'default',
      label: 'Default buyer',
      isDefault: true,
      data: { email: 'buyer@example.com' }
    }
  ],
  seed: async () => ({
    environment: {
      checked: [{ type: 'user', id: 'buyer@example.com' }],
      created: [],
      forbidden: [{ type: 'order', id: 'latest' }]
    }
  }),
  phases: [
    {
      id: 'phase:checkout',
      title: 'Checkout',
      steps: [
        {
          id: 'step:place-order',
          title: 'Place an order',
          execute: async () => ({
            status: 'passed',
            observed: { confirmationVisible: true },
            ownedResources: [{ type: 'order', id: 'order-123' }]
          }),
          proofs: [
            {
              id: 'proof:confirmation-visible',
              title: 'Order confirmation is visible',
              check: ({ observed }) => observed.confirmationVisible === true
            }
          ]
        }
      ]
    }
  ]
});
```

The seed prepares prerequisites. It should not pre-create the behavior the journey is proving.

## Dev MCP Server

Create a conventional `agent-e2e.config.ts`:

```ts
import { createResourceRegistry, defineResourceKind } from '@agent-e2e/harness/core';
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';

const orderKind = defineResourceKind({
  kind: 'order',
  create: async (input: { id: string }) => ({ kind: 'order', id: input.id }),
  delete: async (resource: { kind: 'order'; id: string }) => {
    await appApi.deleteOrder(resource.id);
  }
});

export default defineAgentE2EConfig({
  stackProvider: appStackProvider,
  journeys: [checkoutJourney],
  resourceRegistry: createResourceRegistry([orderKind]),
  verify: {
    suites: [{ id: 'smoke', journeys: ['checkout:*'] }]
  }
});
```

`resourceAdapters: [orderResourceAdapter]` remains available for lower-level cleanup adapters that do not fit a typed resource kind.

Then run the Dev MCP server through the package CLI:

```json
{
  "scripts": {
    "dev:mcp": "agent-e2e dev",
    "e2e:verify": "agent-e2e verify"
  }
}
```

The CLI creates the MCP harness, default Playwright browser sessions, `.agents-e2e/artifacts`, and signal handlers. jiti loads `agent-e2e.config.ts` (and the journey files it imports) directly on Node or Bun. Edits to those TypeScript modules hot-reload **in process**: `createReloadingHarnessSource` watches the config directory and re-evaluates the changed graph through jiti, so `journey.list`/`journey.inspect` reflect the edit on the next call behind the same MCP URL — no server restart, no MCP reconnect. (Caveat: jiti owns TypeScript; plain `.mjs`/`.js` journeys go through native ESM, which is globally cached by URL and does not in-process reload — keep journeys in `.ts`. `agent-e2e dev --watch` is an optional hard-restart fallback that disposes the managed stack on each restart.) It uses `127.0.0.1:3766/mcp` by default; set `AGENT_E2E_MCP_PORT` to override it. App URLs come from `stack.start` / `stack.status` service URLs, not from Dev MCP configuration.

### Browser sessions

By default the Dev MCP auto-creates a Playwright-backed Browser Workbench, so you can leave `browserSessions` unset. To customize it (for example, to point sessions at a different artifact root), wire the public factory explicitly — this type-checks under strict mode:

```ts
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

export default defineAgentE2EConfig({
  journeys: [checkoutJourney],
  // Explicit wiring is supported; omit this field to use the same default.
  browserSessions: createPlaywrightMcpBrowserSessionManager({ artifactRoot: '.agents-e2e/artifacts' })
});
```

Pass `browserSessions: false` to disable the Browser Workbench entirely (no Playwright launch). `DevMcpBrowserSessionController` method parameters are typed against the shared public input shapes (`BrowserActInput`, `BrowserFindInput`, …) so a custom controller gets full call-site type-safety too.

## Proof Loop

Drive the app through a standard MCP client configured with the Dev MCP URL:

```json
{
  "mcpServers": {
    "agent-e2e": {
      "url": "http://127.0.0.1:3766/mcp"
    }
  }
}
```

The proof loop uses these tools:

```sh
stack.start
stack.list
stack.status
stack.logs
stack.explore.list
stack.explore.run
run.begin
browser.open
browser.snapshot
browser.find
browser.act
browser.wait
browser.get
browser.console
browser.network
browser.eval
browser.playwright
browser.screenshot
journey.step
journey.untilStep
journey.phase
journey.untilPhase
artifact.read
cleanup.plan
run.reseed
stack.stop
```

The journey time-travel grammar is `journey.step` (one step), `journey.untilStep` (a phase up to and including a target step), `journey.phase` / `journey.untilPhase` (a whole phase to its boundary). The UI-validation model treats each step as a distinct visual frame, so `journey.untilStep` makes every frame individually addressable: it runs a phase from its first step up to **and including** the target step and parks the managed state there, mirroring `journey.untilPhase`'s envelope (`results[]`, landed step at `results.at(-1)`). A step is addressed by its stable `stepId` within a `phaseId` (`{ runId, phaseId, stepId }`, the same address `journey.step` uses) — never a positional ordinal — and an unknown journey/phase/step returns the same coherent not-found envelope as the other journey tools.

The fixed stack grammar is intentionally small: `stack.start`, `stack.list`, `stack.status`, `stack.stop`, `stack.logs`, `stack.explore.list`, and `stack.explore.run`. `stack.start` accepts an optional caller-chosen `stackId` and returns the effective id. `stack.list` recovers running Stack Instances. `stack.status`, `stack.logs`, `stack.explore.run`, and `stack.stop` require an explicit `stackId`; there is no public stop-all tool. `run.begin` requires a valid `stackId` when a stack provider exists, creates the run's **Run Stack Binding**, and rejects `stackId` when no provider exists. `stack.status` is the unified stack-state packet: `StackStatusPacket.services` is the journey-facing runtime contract for dynamic URLs, stable service ids, endpoints, checks, warnings, errors, artifacts, and next actions. There are no native `stack.services`, `stack.health`, or `stack.env` tools in v1.

A freshly-started server's very first `stack.start` can trip provider readiness (Docker image pull/daemon warmup, a cold dev-server compile) and fail even though an immediate retry succeeds. `stack.start` therefore retries the provider start/readiness path with a small bounded backoff — **2 attempts, 750ms apart** by default — so the first call self-heals. Each failed attempt fully tears its own handle down before retrying, so retries never leak or stack handles, and a deterministic precondition failure (for example a duplicate `stackId`) is surfaced immediately without retrying. Tune or disable it with `stackStart: { maxAttempts, backoffMs }` in `defineAgentE2EConfig` (`maxAttempts: 1` disables the retry). On a real failure — including retry exhaustion — `stack.start` always returns a coherent envelope (`{ status: "failed", code: "stack-start-failed", message }`), never a partial object missing `code`/`message`, so a client can branch on `status` without tripping over a missing key.

When a provider starts, `start(ctx)` receives a `StackStartContext` with mode, stack id, serial worker identity, suite id when verify supplies one, and a stack artifact scope. Providers should use **Named Stack Allocations** by default: call `ctx.allocatePort(name)` or `ctx.allocateArtifactPath(name, { kind: "file" | "directory" })` for isolated ports, log paths, database paths, queues, and app artifact directories. The harness records those named allocations for stack evidence without requiring duplicate metadata in the provider handle or status packet. Product-specific helpers such as database or queue allocators stay outside the core stack contract.

`stack.logs` is live exploration. It requires a `stackId`, one `serviceId`, a required `tail`, and an optional `stream` of `stdout`, `stderr`, or `combined`. `stack.logs` and `stack.explore.run` accept optional `runId` only to capture artifacts, and reject capture when the run is bound to a different `stackId`.

Stack-specific exploration belongs to the stack provider. Providers declare tools with `id`, `title`, `description`, `availableIn`, `risk`, mandatory Zod `input` and `output` schemas, and a handler. Dev MCP exposes them through `stack.explore.list` and `stack.explore.run`; `agent-e2e verify` receives only Verify Observation Tools: `availableIn: ["dev", "verify"]` and `risk: "none"`.

Use returned artifact refs to inspect failures instead of relying on terminal scrollback.

Starting `agent-e2e dev` only proves the server booted. A proof run requires tool calls. The CLI ships its own MCP client, so you do not have to hand-write one or register the server first — `agent-e2e list` and `agent-e2e call` are the canonical way to drive the running server:

```sh
agent-e2e list                                   # tool names exposed by the running server
agent-e2e call stack.start '{"stackId":"dev"}'   # call a tool with JSON args (defaults to {})
agent-e2e call run.begin '{"journeyId":"my:journey","stackId":"dev"}'
```

`list`/`call` resolve the endpoint from the same config as `dev` (`AGENT_E2E_MCP_HOST/PORT/PATH`, or a full `AGENT_E2E_MCP_URL` override). `call` prints the tool's text result (JSON fallback), exits non-zero on a tool error, and uses a 300000ms per-call timeout (`AGENT_E2E_MCP_CALL_TIMEOUT_MS`) since `stack.start` exceeds the MCP SDK's 60s default. This replaces the previous "copy a ~50-line mcp-call.ts client" recipe.

For a fresh or remote agent session that prefers a portable dynamic client, `mcporter` is an alternative:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http

mcporter call \
  --http-url http://127.0.0.1:3766/mcp \
  --allow-http \
  --tool stack.explore.list \
  --args '{}' \
  --output json
```

Use `--allow-http` for localhost HTTP MCP endpoints. Prefer `--http-url ... --tool ...`; dotted URL selector forms can fail for local MCP URLs.

## CI Verify

After the interactive proof passes, run the same configured journeys in CI:

```sh
agent-e2e verify
agent-e2e verify --suite smoke
agent-e2e verify --all-profiles --workers 4 --reporter github
```

`verify` loads `agent-e2e.config.ts`, starts worker-scoped Stack Instances lazily, creates an isolated Playwright context/page per selected run, performs per-run cleanup by default, and writes `report.json` plus `report.md` under `.agents-e2e/artifacts/_suites/<suite-id>/`. `--workers 4` means at most four active Verify Worker Stacks; selected runs execute serially inside each worker stack. Verify stack ids are generated as `worker-0`, `worker-1`, and so on, and stack-backed run reports include the bound `stackId`.

`verify` runs crystallized journeys. It does not expose arbitrary Dev MCP exploration; journey code can only call verify-safe stack observation tools through `execution.stack.explore.run(...)`, so product-visible mutations still come from the app path, seed, journey steps, reseed, or cleanup.
