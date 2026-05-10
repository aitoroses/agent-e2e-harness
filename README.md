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

## The Idea In One Example

Imagine this user request to a coding agent:

> Instrument my notes app so you can prove that a signed-in user can create a note, see it in the UI, and clean up only the note you created.

With Agent E2E Harness, the app gives the agent a small set of MCP tools instead of a vague instruction to "write an E2E test". The loop becomes:

1. `stack.start` asks the app-owned stack adapter to start the app and disposable services, then returns the app URL.
2. `run.begin` runs the journey seed, creating or checking prerequisite state without creating the note being tested.
3. `browser.open` launches an MCP-owned Playwright browser at the app URL.
4. `browser.snapshot` gives the agent stable refs for visible UI targets.
5. `browser.act` clicks and types through those refs.
6. `journey.step` checks the product-visible result, records owned resources, and writes proof artifacts.
7. `artifact.read` lets the agent time-travel through screenshots, console logs, network logs, result JSON, and step feedback.
8. `cleanup.plan` and `run.reseed` use resource adapters to delete only resources owned by that run.

That touches the whole public surface:

- A **journey** describes the user-visible behavior and proofs.
- A **seed** creates known prerequisites and forbidden-state checks.
- A **stack provider** owns app processes, databases, queues, containers, or other local infrastructure.
- **Resource adapters** know how to clean domain objects created during a run.
- **Browser MCP tools** give the agent refs, actions, snapshots, and screenshots.
- **Artifacts** make the run time-travelable after every step.
- **Cleanup/reseed** turns agent iteration into a safe loop instead of leaving test data behind.

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
npm install -D playwright @modelcontextprotocol/sdk
```

Dev MCP uses Bun as its TypeScript runtime. Install Bun `>=1.3.0` before adding the `dev:mcp` command.

Install database clients, containers, queues, or other infrastructure packages in the consumer app that owns that stack provider.

## Quick Start

Create a conventional `agent-e2e.config.ts` at the app root:

```ts
import { defineAgentE2EConfig } from '@agent-e2e/harness/dev-mcp';

export default defineAgentE2EConfig({
  stackProvider: myStackProvider,
  journeys: [myJourney],
  resourceAdapters: [myResourceAdapter]
});
```

Then make `npm run dev:mcp` start the framework-owned Dev MCP server through the package CLI:

```json
{
  "scripts": {
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
