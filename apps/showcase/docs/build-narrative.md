# Showcase Build Narrative

The Proof Notes showcase exists to demonstrate **Journey-Driven Showcase Development**, not only a finished demo app. Its launch path is intentionally the same path a consumer would run: Dev MCP starts at a stable URL, the stack starts through `stack.start`, the journey seeds state, a browser creates the proof note, artifacts explain the run, and cleanup removes only owned resources.

## Runtime Shape

The Dev MCP server is Bun-backed because `agent-e2e.config.ts` is the consumer integration point and should load directly during agent iteration. The managed stack is composed directly in the showcase provider: PostgreSQL Testcontainers for infrastructure and `createProcessStackProvider` for the managed `next dev` process.

The runtime boundary is part of the showcase narrative:

- Bun remains responsible for Dev MCP, the tool grammar, hot config loading, browser sessions, artifacts, and the journey registry.
- The showcase infrastructure provider owns Testcontainers PostgreSQL readiness, schema initialization, and teardown.
- PostgreSQL readiness is explicit: wait for the Postgres-ready log line, then use bounded client connection retry and schema timeout.

This keeps the reusable harness surface small while showing consumers where runtime-specific infrastructure readiness belongs: inside the consumer provider or a future adapter package.

## Proof Loop

The current launch proof loop is:

1. `npm run dev:mcp --workspace @agent-e2e/showcase`
2. `mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json`
3. `stack.start` returns a `stackId` plus ready `showcase-next-dev` and `postgres` services.
4. `run.begin` applies the baseline workspace/user seed.
5. `browser.open`, `browser.inspect`, `browser.refs` (optional overlay), `browser.act`, `browser.wait`, and a second `browser.inspect` create and capture evidence for the proof note through the UI. Console errors and network failures surface as `signals` in each inspect result; detail lives in the written `inspect.md` and `inspect.json` artifacts under `runs/<runId>/inspections/<seq>/`.
6. `journey.step` captures the browser-created proof note as run-owned and verifies persistence. The step uses the same inspect machinery as `browser.inspect`; per-step artifacts land under `runs/<runId>/journeys/<journeyId>/phases/<phaseId>/steps/<stepId>/` including `step-report.json`.
7. Open `step-report.json` from the artifact path returned in the `journey.step` response to debug from artifacts instead of terminal scrollback.
8. `cleanup.plan` and `run.teardown` delete the owned proof note.
9. `stack.stop` with the explicit `stackId` tears down Next.js and PostgreSQL.

The same configured journey is promoted through `npm run e2e:verify --workspace @agent-e2e/showcase`, which runs `agent-e2e verify`, writes suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`, and exits non-zero on failure.
