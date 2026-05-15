# Proof Notes Showcase

A Next.js consumer app that dogfoods Agent E2E Harness as a launch-day user would: start Dev MCP, bring up a managed stack, seed a persisted baseline, create a proof note through a Playwright-owned browser, read artifacts, clean only owned resources, and stop the stack.

## Five-Minute Proof Path

Prerequisites:

```sh
node --version   # expect v22+
bun --version    # expect 1.3+
docker --version # Docker must be running
mcporter --version # optional low-level MCP smoke-test client
```

Install dependencies from the repo root. The showcase `postinstall` script installs Playwright's Chromium browser so a fresh consumer can open MCP-owned browser sessions without an extra manual step.

```sh
npm install
```

Expected checkpoint: `found 0 vulnerabilities`.

Start the Bun-backed Dev MCP server. The showcase runs `agent-e2e dev`, which uses Bun to load `agent-e2e.config.ts` directly, starts the framework-owned Dev MCP server at `127.0.0.1:3766/mcp` by default, and hot-reloads the journey registry when the config changes. Set `AGENT_E2E_MCP_PORT` only when you intentionally need a different MCP port.

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
```

Expected checkpoint: `Agent E2E Dev MCP ready` and `MCP: http://127.0.0.1:3766/mcp`.

In another terminal, discover the tools:

```sh
mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json
```

Expected checkpoint: `"status": "ok"` and 29 tools, including `stack.start`, `stack.logs`, `stack.explore.list`, `stack.explore.run`, `run.begin`, `browser.open`, `browser.find`, `browser.wait`, `browser.get`, `browser.console`, `browser.network`, `browser.eval`, `browser.playwright`, `journey.step`, `artifact.read`, `cleanup.plan`, `run.teardown`, and `stack.stop`.

Discover the provider-owned stack exploration surface:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.list --args '{}' --output json
```

Expected checkpoint: `notes.list` is available in `dev` and `verify` with `risk: "none"`; `postgres.query` is `dev`-only with `risk: "local-mutation"`.

Start the managed stack:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{}' --output json --timeout 120000
```

Expected checkpoint: `"status": "ok"`, `"stack": { "status": "ready" }`, and a `showcase-next-dev` service URL. The 120s timeout covers cold Docker/Testcontainers startup; warm local runs should usually complete much faster.

Read recent managed stack logs when the app is not behaving as expected:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"serviceId":"showcase-next-dev","tail":80,"stream":"combined"}' --output json
```

Expected checkpoint: `"logs": { "status": "ok", "serviceId": "showcase-next-dev" }`.

Set the app URL returned by `stack.start`:

```sh
APP_URL="http://127.0.0.1:<returned-port>"
RUN_ID="showcase-dev"
```

Begin the run and seed the baseline:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
```

Expected checkpoint: `"seedGate": { "status": "ready", "canRunSteps": true }`.

Open a Playwright-owned headed browser:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.open --args "{\"targetUrl\":\"${APP_URL}?agentE2ERunId=${RUN_ID}\",\"journeyId\":\"showcase:proof-notes\",\"runId\":\"${RUN_ID}\"}" --output json
```

Expected checkpoint: `"status": "open"` and a `browserSessionId`.

Capture a snapshot, resolve the button with `browser.find`, then click the fresh find ref:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.snapshot --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.find --args '{"browserSessionId":"<browserSessionId>","by":"role","value":"button","name":"Create proof note"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"<browserSessionId>","ref":"@f1","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"<browserSessionId>","until":{"kind":"text","text":"Proof note persisted"},"timeoutMs":5000}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.get --args '{"browserSessionId":"<browserSessionId>","selector":"body","kind":"text"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.console --args '{"browserSessionId":"<browserSessionId>","since":0}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.network --args '{"browserSessionId":"<browserSessionId>","since":0,"urlIncludes":"api/notes"}' --output json
```

Expected checkpoints: `"title": "Proof Notes Showcase"`, a returned `@f1` button ref, `"action": "click"`, a successful wait with `durationMs`, targeted text that includes the created note, and cursor-based console/network packets.

Run the proof step:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"<browserSessionId>"}' --output json
```

Expected checkpoint: `"status": "passed"` with both proofs passed and a `step_feedback_artifact.path`.

Inspect the created note through the verify-safe stack exploration tool:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.run --args '{"toolId":"notes.list","input":{"limit":10}}' --output json
```

Expected checkpoint: `"toolId": "notes.list"` and `"output"` includes the browser-created proof note.

Read the debug packet:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool artifact.read --args '{"path":"<step_feedback_artifact.path>"}' --output json
```

Expected checkpoint: `"content": { "status": "passed" }` and `"consoleErrors": 0`.

Preview and delete owned resources:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-dev"}' --output json
```

Expected checkpoints: `"planned"` contains one `note`; `"deleted"` contains one `note`.

Close the browser and stop the stack:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args '{}' --output json
```

Expected checkpoint: `"stack": { "status": "stopped" }` with stopped `showcase-next-dev` and `postgres` services.

## How The Stack Works

Dev MCP stays Bun-backed so `agent-e2e.config.ts` loads directly and the MCP URL remains stable. The showcase stack provider composes the showcase-owned PostgreSQL Testcontainers provider with the managed `next dev` process in-process.

That direct composition is intentional for the launch showcase:

- Bun owns Dev MCP, hot config loading, MCP tool routing, and browser sessions.
- The showcase provider owns Testcontainers PostgreSQL, explicit readiness, schema initialization, and the managed `next dev` process.
- PostgreSQL readiness uses a container log wait plus bounded `pg` connection retry so the stack starts reliably without a private bridge or harness API change.

Consumer apps should implement `stackProvider` directly in `agent-e2e.config.ts` when their infrastructure clients are compatible with the Dev MCP runtime. Runtime-specific readiness belongs in the consumer provider or a future dedicated adapter package, not in a private lifecycle bridge.

## Artifacts

Interactive artifacts are generated under `.agents-e2e/artifacts/<journey>/<run>/`:

```text
.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  forensics/browser-snapshot-*.json
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

Verify suite reports are generated under `.agents-e2e/artifacts/_suites/<suite-id>/`:

```text
.agents-e2e/artifacts/_suites/<suite-id>/
  report.json
  report.md
  runs/showcase-proof-notes/default/<run>/
```

## Framework Surfaces Demonstrated

- `@agent-e2e/harness/dev-mcp`: local Streamable HTTP MCP server.
- `@agent-e2e/harness/stack`: managed process stack provider composed with showcase-owned infrastructure readiness.
- `apps/showcase/src/harness/postgres-testcontainers.ts`: showcase-owned PostgreSQL Testcontainers provider with explicit readiness and schema initialization.
- `@agent-e2e/harness/playwright-mcp`: headed browser sessions, snapshots, actions, screenshots.

`agent-e2e.config.ts` is the conventional integration point for journeys, the typed resource registry, the showcase stack provider, and verify suites. The runnable entrypoints are the package CLI commands `agent-e2e dev` and `agent-e2e verify`. Showcase-specific harness composition lives in `src/harness/`; shared ids, schema SQL, proof body, and resource-kind behavior live in `src/proof-notes-contract.ts`; lifecycle mechanics belong in the framework.

## CI Verify

The showcase verifies through the same config-backed CLI path consumers should use:

```sh
npm run e2e:verify --workspace @agent-e2e/showcase
```

Expected checkpoint: `Agent E2E verify: 1 passed, 0 failed` and a suite report under `.agents-e2e/artifacts/_suites/`.

## Validation

```sh
npm run build --workspace @agent-e2e/harness
npm run typecheck --workspace @agent-e2e/showcase
npm run e2e:verify --workspace @agent-e2e/showcase
npm run test --workspace @agent-e2e/showcase -- --reporter=verbose
npm audit --json
```
