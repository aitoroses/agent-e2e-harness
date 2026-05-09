# @agent-e2e/harness

Reusable TypeScript package for agent-driven E2E proof loops. Consumer apps use it to expose a local Dev MCP server, define seeded journeys, drive browser/API proof, collect artifacts, clean owned resources, and turn the same flow into CI.

## Install

```sh
npm install @agent-e2e/harness
```

Add optional peers for the integrations you use:

```sh
npm install -D @modelcontextprotocol/sdk playwright
```

`@modelcontextprotocol/sdk` is needed for the local Dev MCP HTTP server. `playwright` is needed for browser sessions. Database clients, containers, queues, and other infrastructure dependencies belong in the consumer app that implements a stack provider.

## Public Exports

```ts
import { defineJourney } from '@agent-e2e/harness/core';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { startDevMcpStreamableHttpServer } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';
import { createProcessStackProvider } from '@agent-e2e/harness/stack';
import { createRunArtifactRecorder } from '@agent-e2e/harness/artifacts';
```

Subpaths are intentionally split:

- `core` has no Playwright, MCP transport, consumer infrastructure, database, or app-framework imports.
- `dev-mcp` exposes the local MCP control server and tool grammar.
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

Create an app-owned command such as `npm run dev:mcp`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { startDevMcpStreamableHttpServer } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

const artifactRoot = '.agents-e2e/artifacts';
const appUrl = 'http://127.0.0.1:3000';

const harness = createMcpHarnessServer({
  journeys: [checkoutJourney],
  resourceAdapters: [orderResourceAdapter],
  artifactRoot
});

const browserSessions = createPlaywrightMcpBrowserSessionManager({
  artifactRoot
});

const server = await startDevMcpStreamableHttpServer({
  harness,
  stackProvider: appStackProvider,
  browserSessions,
  host: '127.0.0.1',
  port: 0
});

await mkdir('.agents-e2e', { recursive: true });
await writeFile(
  '.agents-e2e/dev-mcp.json',
  `${JSON.stringify({ mcpUrl: server.url, appUrl, artifactRoot }, null, 2)}\n`
);
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
