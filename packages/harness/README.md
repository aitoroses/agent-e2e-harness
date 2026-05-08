# @agent-e2e/harness

Reusable TypeScript package for agent-driven E2E proof loops. Consumer apps use it to expose a local Dev MCP server, define seeded journeys, drive browser/API proof, collect artifacts, clean owned resources, and turn the same flow into CI.

## Install

```sh
npm install @agent-e2e/harness
```

Add optional peers for the integrations you use:

```sh
npm install -D @modelcontextprotocol/sdk playwright
npm install -D @testcontainers/postgresql pg
```

`@modelcontextprotocol/sdk` is needed for the local Dev MCP HTTP server. `playwright` is needed for browser sessions. Testcontainers and `pg` are only needed for the PostgreSQL stack provider.

## Public Exports

```ts
import { defineJourney } from '@agent-e2e/harness/core';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { startDevMcpStreamableHttpServer } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';
import { createProcessStackProvider } from '@agent-e2e/harness/stack';
import { createPostgresTestcontainersProvider } from '@agent-e2e/harness/testcontainers';
import { createRunArtifactRecorder } from '@agent-e2e/harness/artifacts';
```

Subpaths are intentionally split:

- `core` has no Playwright, MCP transport, Testcontainers, database, or app-framework imports.
- `dev-mcp` exposes the local MCP control server and tool grammar.
- `playwright-mcp` owns browser sessions and browser forensics.
- `stack` owns generic app/service lifecycle.
- `testcontainers` adds the optional PostgreSQL provider.
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

Create an app-owned command such as `npm run dev:mcp`:

```ts
import { writeFile } from 'node:fs/promises';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { startDevMcpStreamableHttpServer } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

const harness = createMcpHarnessServer({
  journeys: [checkoutJourney],
  resourceAdapters: [orderResourceAdapter],
  artifactRoot: '.agents-e2e/artifacts'
});

const browserSessions = createPlaywrightMcpBrowserSessionManager({
  artifactRoot: '.agents-e2e/artifacts'
});

const manifest = await startDevMcpStreamableHttpServer({
  harness,
  stackProvider: appStackProvider,
  browserSessions,
  host: '127.0.0.1',
  port: 0
});

await writeFile('.agents-e2e/dev-mcp.json', JSON.stringify(manifest, null, 2));
```

The command should keep running during development, write a manifest with `mcpUrl` and app URLs, and shut down cleanly on `SIGINT`/`SIGTERM`.

## Proof Loop

Drive the app through a standard MCP client configured with the Dev MCP URL:

```json
{
  "mcpServers": {
    "agent-e2e": {
      "url": "http://127.0.0.1:<port>/mcp"
    }
  }
}
```

The proof loop uses these tools:

```sh
stack.start
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

Use returned artifact refs to inspect failures instead of relying on terminal scrollback.

## CI Closure

After the interactive proof passes, add a normal test that starts from a clean seed and runs the same journey deterministically. The reference shape is in `apps/showcase/test/showcase.e2e.test.ts`.
