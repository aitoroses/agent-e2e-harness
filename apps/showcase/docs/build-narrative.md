# Showcase Build Narrative

The Proof Notes showcase exists to demonstrate **Journey-Driven Showcase Development**, not only a finished demo app. Its launch path is intentionally the same path a consumer would run: Dev MCP starts at a stable URL, the stack starts through `stack.start`, the journey seeds state, a browser creates the proof note, artifacts explain the run, and cleanup removes only owned resources.

## Runtime Split

The Dev MCP server is Bun-backed because `agent-e2e.config.ts` is the consumer integration point and should load directly during agent iteration. The managed stack is owned by a private Node sidecar at `apps/showcase/scripts/showcase-stack-sidecar.mjs`.

The sidecar is part of the showcase narrative:

- Bun remains responsible for Dev MCP, the tool grammar, hot config loading, browser sessions, artifacts, and the journey registry.
- Node is used only for showcase infrastructure lifecycle: Testcontainers PostgreSQL, schema initialization, and the managed `next dev` process.
- The bridge is stdio JSON lines, so the sidecar does not add a public service or harness API.

This keeps the reusable harness surface small while showing consumers how to isolate runtime-specific infrastructure clients when needed.

## Proof Loop

The current launch proof loop is:

1. `npm run dev:mcp --workspace @agent-e2e/showcase`
2. `mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json`
3. `stack.start` returns ready `showcase-next-dev` and `postgres` services.
4. `run.begin` applies the baseline workspace/user seed.
5. `browser.open`, `browser.snapshot`, and `browser.act` create the proof note through the UI.
6. `journey.step` captures the browser-created proof note as run-owned and verifies persistence.
7. `artifact.read` opens `step-feedback.json` so the agent can debug from artifacts instead of terminal scrollback.
8. `cleanup.plan` and `run.teardown` delete the owned proof note.
9. `stack.stop` tears down Next.js and PostgreSQL.

The same behavior is preserved in `apps/showcase/test/showcase.e2e.test.ts` as the crystallized closure proof.
