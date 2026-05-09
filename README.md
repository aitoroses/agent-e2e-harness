# Agent E2E Harness

Agent E2E Harness is a TypeScript toolkit for turning interactive agent work into repeatable end-to-end proof loops. It gives an agent a local MCP control surface for starting an app stack, seeding known state, driving a Playwright-owned browser, collecting artifacts, cleaning resources it created, and crystallizing the same flow into CI.

Use it when a human asks an agent to instrument an application for E2E development, not just to add a one-off Playwright test.

## What It Provides

- Seeded journeys that describe a user-visible flow from known state.
- A local Dev MCP server for tool-driven development loops.
- Playwright MCP browser sessions with snapshots, actions, screenshots, and artifact refs.
- Artifact recording for time travel debugging under `.agents-e2e/artifacts`.
- Ownership-ledger cleanup so reseed deletes only resources created by the current proof.
- Stack contracts for app processes and other consumer-owned infrastructure.
- Public subpath exports so consumer apps import only the surfaces they need.

## Install

In a consumer app:

```sh
npm install @agent-e2e/harness
```

Add optional runtime dependencies for the surfaces you use:

```sh
npm install -D playwright @modelcontextprotocol/sdk
```

Install database clients, containers, queues, or other infrastructure packages in the consumer app that owns that stack provider.

## Quick Start

Create an app-owned Dev MCP command, usually `npm run dev:mcp`, that composes your app stack, seed, journeys, browser sessions, and artifact store:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { startDevMcpStreamableHttpServer } from '@agent-e2e/harness/dev-mcp';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

const artifactRoot = '.agents-e2e/artifacts';
const appUrl = 'http://127.0.0.1:3000';

const harness = createMcpHarnessServer({
  journeys: [myJourney],
  resourceAdapters: [myResourceAdapter],
  artifactRoot
});

const browserSessions = createPlaywrightMcpBrowserSessionManager({
  artifactRoot
});

const server = await startDevMcpStreamableHttpServer({
  harness,
  stackProvider: myStackProvider,
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

Start the Dev MCP command and register the emitted URL in your MCP client:

```sh
npm run dev:mcp
cat .agents-e2e/dev-mcp.json
```

Configure a standard Streamable HTTP MCP server using the `mcpUrl` from that manifest. Most MCP clients represent it like this:

```json
{
  "mcpServers": {
    "agent-e2e": {
      "url": "http://127.0.0.1:<port>/mcp"
    }
  }
}
```

Then drive the tool loop from the agent's MCP tool picker: `stack.start`, `run.begin`, `browser.open`, `browser.snapshot`, `browser.act`, `journey.step`, `artifact.read`, `cleanup.plan`, `run.reseed`, and `stack.stop`.

`mcporter` is useful for developing or debugging this repository's MCP server, but it is not required for a consumer app.

## Public Package Surfaces

- `@agent-e2e/harness/core` - framework-neutral journey, seed, feedback, closure, resource, cleanup, and reseed contracts.
- `@agent-e2e/harness` - Playwright-specialized default API.
- `@agent-e2e/harness/mcp` - execution-neutral in-process MCP control surface.
- `@agent-e2e/harness/dev-mcp` - local Streamable HTTP Dev MCP server, tool grammar, and router.
- `@agent-e2e/harness/playwright-mcp` - MCP-owned Playwright browser sessions.
- `@agent-e2e/harness/stack` - managed stack and process provider contracts.
- `@agent-e2e/harness/artifacts` - validation artifact recorder and reader.

See `packages/harness/README.md` for API examples.

## Showcase App

`apps/showcase` is a reference consumer app, not the product being tested by the harness. It demonstrates the full proof loop with a Proof Notes app:

1. `dev:mcp` starts the local MCP server.
2. `stack.start` creates showcase-owned disposable PostgreSQL and starts `next dev`.
3. `run.begin` seeds a baseline workspace/user.
4. `browser.open`, `browser.snapshot`, and `browser.act` drive a Playwright-owned browser.
5. `journey.step` proves a note was created and records it as run-owned.
6. `cleanup.plan` and `run.reseed` delete only run-owned resources.
7. `stack.stop` tears down app infrastructure.

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
cat .agents-e2e/dev-mcp.json
```

See `apps/showcase/README.md` for the full walkthrough.

## Artifact Layout

Generated debugging evidence is scoped by journey/run, then numbered phase/step directories:

```text
.agents-e2e/artifacts/<journey>/<run>/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  forensics/browser-snapshot-*.json
  forensics/screenshot-*.png
  01-phase-<phase-id>/01-step-<step-id>/
    before.png
    after.png
    failure.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Repository Map

- `packages/harness` - reusable library package.
- `apps/showcase` - reference consumer app and dogfood proof.
- `skills/agent-e2e-harness` - agent skill for adopting the harness in another app.
- `docs/architecture` - package/export/layout decisions.
- `docs/showcase` - showcase-specific MCP grammar, transcript, and seed/ownership docs.
- `docs/adr` - architectural decision records.

## Development

```sh
npm install
npm run check
```

Useful targeted commands:

```sh
npm run typecheck
npm run build
npm test --workspace @agent-e2e/harness
npm run build --workspace @agent-e2e/showcase
```
