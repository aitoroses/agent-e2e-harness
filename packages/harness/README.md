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

`@modelcontextprotocol/sdk` is needed for the local Dev MCP HTTP server. `playwright` is needed for browser sessions. Dev MCP uses Bun `>=1.3.0` as the TypeScript runtime for the config and entrypoint. Database clients, containers, queues, and other infrastructure dependencies belong in the consumer app that implements a stack provider.

## Public Exports

```ts
import { defineJourney } from '@agent-e2e/harness/core';
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';
import { runAgentE2EVerifyFromConfig } from '@agent-e2e/harness/verify';
import { createProcessStackProvider } from '@agent-e2e/harness/stack';
import { createRunArtifactRecorder } from '@agent-e2e/harness/artifacts';
```

Subpaths are intentionally split:

- `core` has no Playwright, MCP transport, consumer infrastructure, database, or app-framework imports.
- `dev-mcp` exposes the local MCP control server and tool grammar.
- `verify` runs configured journeys in CI and writes suite reports.
- `playwright-mcp` owns browser sessions and browser forensics.
- `stack` owns generic app/service lifecycle.
- `artifacts` records and reads validation evidence.

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

The CLI creates the MCP harness, default Playwright browser sessions, `.agents-e2e/artifacts`, signal handlers, and a hot-reloaded journey registry. Bun runs `agent-e2e.config.ts` directly; when the config file changes, new MCP calls see the updated journeys without reconnecting the MCP client. It uses `127.0.0.1:3766/mcp` by default; set `AGENT_E2E_MCP_PORT` to override it. App URLs come from `stack.start` / `stack.status` service URLs, not from Dev MCP configuration.

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
stack.status
stack.logs
stack.explore.list
stack.explore.run
run.begin
browser.open
browser.snapshot
browser.act
journey.step
artifact.read
cleanup.plan
run.reseed
stack.stop
```

The fixed stack grammar is intentionally small: `stack.start`, `stack.status`, `stack.stop`, `stack.logs`, `stack.explore.list`, and `stack.explore.run`. `stack.status` is the unified stack-state packet: services, stable service ids, endpoints, checks, warnings, errors, artifacts, and next actions. There are no native `stack.services`, `stack.health`, or `stack.env` tools in v1.

`stack.logs` is live exploration. It requires an active stack, one `serviceId`, a required `tail`, and an optional `stream` of `stdout`, `stderr`, or `combined`.

Stack-specific exploration belongs to the stack provider. Providers declare tools with `id`, `title`, `description`, `availableIn`, `risk`, mandatory Zod `input` and `output` schemas, and a handler. Dev MCP exposes them through `stack.explore.list` and `stack.explore.run`; `agent-e2e verify` receives only Verify Observation Tools: `availableIn: ["dev", "verify"]` and `risk: "none"`.

Use returned artifact refs to inspect failures instead of relying on terminal scrollback.

Starting `agent-e2e dev` only proves the server booted. A proof run requires tool calls. For a fresh or remote agent session without this MCP registered, `mcporter` is the portable dynamic client path:

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

`verify` loads `agent-e2e.config.ts`, starts the configured stack once, creates an isolated Playwright context/page per selected run, performs per-run cleanup by default, and writes `report.json` plus `report.md` under `.agents-e2e/artifacts/_suites/<suite-id>/`.

`verify` runs crystallized journeys. It does not expose arbitrary Dev MCP exploration; journey code can only call verify-safe stack observation tools through `execution.stack.explore.run(...)`, so product-visible mutations still come from the app path, seed, journey steps, reseed, or cleanup.
