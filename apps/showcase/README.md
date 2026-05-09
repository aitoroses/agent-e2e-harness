# Proof Notes Showcase

A Next.js demo app that dogfoods the Agent E2E Harness as a real user would:

1. Dev MCP starts first.
2. `stack.start` creates disposable PostgreSQL with Testcontainers and starts `next dev` as managed infrastructure.
3. `run.begin` seeds a baseline workspace/user through the app API.
4. `browser.open` launches a Playwright-owned headed browser by default.
5. `browser.snapshot` exposes forensic refs.
6. `browser.act` clicks the UI through a fresh snapshot ref.
7. `journey.step` captures the browser-created proof note as a journey-owned resource and runs proofs.
8. `cleanup.plan` and `run.reseed` prove owned-resource cleanup while preserving the seed baseline.
9. `stack.stop` tears the disposable infrastructure down.

The showcase intentionally uses a database in the managed stack so seed, reseed, resource ownership, and teardown are observable beyond in-memory UI state.

## Real proof path

Start Dev MCP. The showcase runs `agent-e2e-harness dev-mcp`, which uses Bun to load `agent-e2e.config.ts` directly, starts the framework-owned Dev MCP server at `127.0.0.1:3766/mcp` by default, and hot-reloads the journey registry when the config changes. Set `AGENT_E2E_MCP_PORT` only when you intentionally need a different MCP port.

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
```

Then configure your MCP client with the stable local URL:

```json
{
  "mcpServers": {
    "agent-e2e-showcase": {
      "url": "http://127.0.0.1:3766/mcp"
    }
  }
}
```

Use the agent's MCP tools in this order: `stack.start`, `run.begin`, `browser.open`, `browser.snapshot`, `browser.act`, `journey.step`, `artifact.read`, `cleanup.plan`, `run.reseed`, and `stack.stop`. Use the `showcase-next-dev` URL returned by `stack.start` / `stack.status` as the browser target and append `?agentE2ERunId=<runId>` so the visible UI action writes resources owned by the active run.

Artifacts are generated under `.agents-e2e/artifacts/<journey>/<run>/`. The harness deliberately avoids `.scratch`, `ui-e2e/`, and nested `steps/` directories so the returned MCP artifact refs are the debugging map:

```text
.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Framework surfaces demonstrated

- `@agent-e2e/harness/dev-mcp`: local Streamable HTTP MCP server.
- `@agent-e2e/harness/stack`: reusable managed process stack provider.
- `apps/showcase/src/harness/postgres-testcontainers.ts`: showcase-owned PostgreSQL Testcontainers provider.
- `@agent-e2e/harness/playwright-mcp`: headed browser sessions, snapshots, actions, screenshots.
- `@agent-e2e/harness/mcp`: run, step, cleanup, reseed control surface.

`agent-e2e.config.ts` is the conventional integration point for journeys, resource adapters, and the showcase stack provider. The runnable entrypoint is the package CLI, `agent-e2e-harness dev-mcp`. Showcase-specific harness composition lives in `src/harness/`; shared ids, schema SQL, proof body, and resource-adapter behavior live in `src/proof-notes-contract.ts`; lifecycle mechanics belong in the framework.

## Validation

```sh
npm run build --workspace @agent-e2e/showcase
npm run test --workspace @agent-e2e/showcase -- --reporter=verbose
```
