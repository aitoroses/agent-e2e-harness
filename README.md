# Agent E2E Harness

Agent E2E Harness gives coding agents MCP tools optimized for discovery and time-travel debugging.

Journeys are executable maps of your product workflows. They give agents coordinates: seed known state, start the app stack, move phase by phase, stop at any step, inspect the browser, read artifacts, clean owned data, and rerun until the flow is ready to crystallize into CI.

Without it, agents burn context rediscovering setup, replaying clicks, reading terminal scrollback, and manually cleaning data. With it, the workflow lives in the harness.

| Without Agent E2E Harness | With Agent E2E Harness |
| --- | --- |
| The agent guesses how to start the app, database, queues, and browser. | `stack.start` exposes a known app stack through MCP. |
| The agent manually recreates data before every debug attempt. | `run.begin` and `run.reseed` return to a known seeded state. |
| The agent repeats clicks just to reach the failing screen again. | Journeys give phase/step coordinates the agent can navigate. |
| Evidence lives in screenshots, terminal scrollback, and memory. | Artifacts attach evidence to every phase/step for later inspection. |

## What It Provides

- Seeded journeys that describe a user-visible flow from known state.
- A local Dev MCP server for tool-driven development loops.
- Playwright MCP browser sessions with snapshots, actions, screenshots, and artifact refs.
- Artifact recording for time travel debugging under `.agents-e2e/artifacts`.
- Ownership-ledger cleanup so reseed deletes only resources created by the current proof.
- Stack contracts for app processes and other consumer-owned infrastructure.
- Public subpath exports so consumer apps import only the surfaces they need.

## How It Works In 60 Seconds

Imagine this user request to a coding agent:

> Instrument my notes app so you can prove that a signed-in user can create a note, see it in the UI, and clean up only the note you created.

With Agent E2E Harness, the app gives the agent a compact MCP toolset instead of a vague instruction to "write an E2E test":

```text
Human request
  -> Agent uses MCP tools optimized for discovery
  -> stack.start starts the app and disposable services
  -> run.begin applies the seed and creates a known starting point
  -> browser.open / browser.snapshot / browser.act drive and inspect the UI
  -> journey.step executes one phase/step and records proof
  -> artifact.read opens screenshots, console, network, result, and feedback
  -> cleanup.plan / run.reseed clean owned data and return to known state
  -> the passing journey crystallizes into CI
```

That touches the whole public surface:

- A **journey** is the executable map: phases, steps, proofs, guidance, and typed observed state.
- A **seed** creates the known starting point and checks forbidden state before steps run.
- A **stack provider** owns app processes, databases, queues, containers, or other disposable infrastructure.
- **Resource adapters** know how to clean domain objects created during a run.
- **Browser MCP tools** give the agent refs, actions, snapshots, screenshots, and visible state.
- **Artifacts** give each phase/step a replayable checkpoint: `before.png`, `after.png` or `failure.png`, `console.json`, `network.json`, `result.json`, and `step-feedback.json`.
- **Cleanup/reseed** turns debugging into a safe loop instead of leaving test data behind.

The journey stays close to the user story:

```ts
export const createNoteJourney = defineJourney({
  id: 'notes:create',
  title: 'Create a note from the UI',
  profiles: [{ id: 'default', label: 'Signed-in user', isDefault: true, data: {} }],
  seed: async () => ({
    environment: {
      checked: [{ type: 'workspace', id: 'agent-proof' }],
      created: [],
      forbidden: [{ type: 'note', id: 'agent-created-note' }]
    }
  }),
  phases: [
    {
      id: 'phase:notes',
      title: 'Notes',
      steps: [
        {
          id: 'step:create-note',
          title: 'Create a note and verify it is visible',
          execute: async ({ execution }) => {
            const note = await execution.notes.findByTitle('Agent proof note');
            return {
              status: note ? 'passed' : 'failed',
              observed: { noteVisible: Boolean(note), noteId: note?.id },
              ownedResources: note ? [{ type: 'note', id: note.id }] : []
            };
          },
          proofs: [
            {
              id: 'proof:note-visible',
              title: 'The created note is visible in the app',
              check: ({ observed }) => observed.noteVisible === true
            }
          ]
        }
      ]
    }
  ]
});
```

During development, the agent can keep the Dev MCP server connected while it edits journeys. When `agent-e2e.config.ts` changes, the journey registry hot-reloads behind the same MCP URL. When the flow works, the same journey shape can be crystallized into a deterministic CI test.

## Install

In a consumer app:

```sh
npm install @agent-e2e/harness
```

Add optional runtime dependencies for the surfaces you use:

```sh
npm install -D playwright @modelcontextprotocol/sdk zod
```

Install the Chromium browser used by Playwright-backed Dev MCP sessions, or add the same command to `postinstall` for a no-surprise fresh checkout:

```sh
npx playwright install chromium
```

Dev MCP uses Bun as its TypeScript runtime. Install Bun `>=1.3.0` before adding the `dev:mcp` command.

Install database clients, containers, queues, or other infrastructure packages in the consumer app that owns that stack provider.

## Quick Start

Create a conventional `agent-e2e.config.ts` at the app root:

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
  stackProvider: myStackProvider,
  journeys: [myJourney],
  resourceRegistry: createResourceRegistry([orderKind])
});
```

Use `resourceAdapters: [myResourceAdapter]` only when you need a lower-level cleanup adapter that cannot be expressed as a typed resource kind.

Then make `npm run dev:mcp` start the framework-owned Dev MCP server through the package CLI:

```json
{
  "scripts": {
    "postinstall": "playwright install chromium",
    "dev:mcp": "agent-e2e-harness dev-mcp"
  }
}
```

`agent-e2e-harness dev-mcp` creates the in-process harness server, Playwright-owned browser sessions, `.agents-e2e/artifacts`, signal handlers, and the hot-reloaded journey registry. It reloads `agent-e2e.config.ts` when it changes, so new MCP calls see updated journeys without reconnecting the MCP client. It uses `127.0.0.1:3766/mcp` by default; override with `AGENT_E2E_MCP_PORT` when needed.

Start the Dev MCP command:

```sh
npm run dev:mcp
```

Configure a standard Streamable HTTP MCP server using the stable local URL:

```json
{
  "mcpServers": {
    "agent-e2e": {
      "url": "http://127.0.0.1:3766/mcp"
    }
  }
}
```

Then drive the tool loop from the agent's MCP tool picker: `stack.start`, `run.begin`, `browser.open`, `browser.snapshot`, `browser.act`, `journey.step`, `artifact.read`, `cleanup.plan`, `run.reseed`, and `stack.stop`.

The app URL is not a Dev MCP setting. Call `stack.start` or `stack.status` and use the returned `services[].url` as the `browser.open` target.

`mcporter` is useful for developing or debugging this repository's MCP server, but it is not required for a consumer app.

## Public Package Surfaces

- `@agent-e2e/harness/core` - framework-neutral journey, seed, feedback, closure, resource, cleanup, and reseed contracts.
- `@agent-e2e/harness` - Playwright-specialized default API.
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
