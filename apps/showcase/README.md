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

Expected checkpoint: `"status": "ok"` and the Dev MCP tools, including `stack.start`, `stack.list`, `stack.logs`, `stack.capability.list`, `stack.capability.run`, `run.begin`, `browser.open`, `browser.sessions`, `browser.inspect`, `browser.refs`, `browser.act`, `browser.wait`, `browser.eval`, `browser.playwright`, `browser.close`, `journey.step`, `cleanup.plan`, `run.teardown`, and `stack.stop`.

Discover the provider-owned stack capability surface:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.list --args '{}' --output json
```

Expected checkpoint: `notes.list` is available in `dev` and `verify` with `risk: "none"`; `postgres.query` is `dev`-only with `risk: "local-mutation"`.

Start a named Stack Instance:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"showcase-dev-stack"}' --output json --timeout 120000
```

Expected checkpoint: `"status": "ok"`, `"stack": { "status": "ready" }`, and a `showcase-next-dev` service URL. The 120s timeout covers cold Docker/Testcontainers startup; warm local runs should usually complete much faster.

Recover or inspect running Stack Instances:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.list --args '{}' --output json
```

Expected checkpoint: the response includes `"stackId": "showcase-dev-stack"` with `showcase-next-dev` and `postgres` services.

Set the explicit stack id:

```sh
STACK_ID="showcase-dev-stack"
```

Read recent managed stack logs when the app is not behaving as expected:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args "{\"stackId\":\"${STACK_ID}\",\"serviceId\":\"showcase-next-dev\",\"tail\":80,\"stream\":\"combined\"}" --output json
```

Expected checkpoint: `"logs": { "status": "ok", "serviceId": "showcase-next-dev" }`.

Set the app URL returned by `stack.start`:

```sh
APP_URL="http://127.0.0.1:<returned-port>"
RUN_ID="showcase-dev"
```

Begin the run and seed the baseline:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args "{\"journeyId\":\"showcase:proof-notes\",\"runId\":\"showcase-dev\",\"stackId\":\"${STACK_ID}\"}" --output json
```

Expected checkpoint: `"seedGate": { "status": "ready", "canRunSteps": true }`.

Open a Playwright-owned headed browser:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.open --args "{\"targetUrl\":\"${APP_URL}?agentE2ERunId=${RUN_ID}\",\"journeyId\":\"showcase:proof-notes\",\"runId\":\"${RUN_ID}\"}" --output json
```

Expected checkpoint: `"status": "open"` and a `browserSessionId`.

Inspect the page, optionally enable the refs overlay, then act on the button ref:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.inspect --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.refs --args '{"browserSessionId":"<browserSessionId>","enabled":true}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"<browserSessionId>","ref":"@e1","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"<browserSessionId>","until":{"kind":"text","text":"Proof note persisted"},"timeoutMs":5000}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.inspect --args '{"browserSessionId":"<browserSessionId>"}' --output json
```

Expected checkpoints: first `browser.inspect` returns `{ status, url, title, artifacts, signals }` with `signals.consoleErrors: 0`; `browser.refs` confirms overlay enabled; `browser.act` confirms click; `browser.wait` returns successful with `durationMs`; second `browser.inspect` shows post-action state with `signals.consoleErrors: 0`. Open the written `inspect.md` artifact for full page detail.

Run the proof step:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"<browserSessionId>"}' --output json
```

Expected checkpoint: `"status": "passed"` with both proofs passed and a `step_feedback_artifact.path`.

Inspect the created note through the verify-safe stack capability:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.run --args "{\"stackId\":\"${STACK_ID}\",\"toolId\":\"notes.list\",\"input\":{\"limit\":10}}" --output json
```

Expected checkpoint: `"toolId": "notes.list"` and `"output"` includes the browser-created proof note.

Read the step report artifact path returned in the `journey.step` response:

```sh
# The step-report.json path is returned in the journey.step response as step_report_artifact.path
# Read it directly from the filesystem or open it in the runs/<runId>/journeys/... directory
```

Expected checkpoint: `step-report.json` has `"status": "passed"` and `"signals": { "consoleErrors": 0 }`.

Preview and delete owned resources:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-dev"}' --output json
```

Expected checkpoints: `"planned"` contains one `note`; `"deleted"` contains one `note`.

Close the browser and stop the stack:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args "{\"stackId\":\"${STACK_ID}\"}" --output json
```

Expected checkpoint: `"stack": { "status": "stopped" }` with stopped `showcase-next-dev` and `postgres` services.

## How The Stack Works

Dev MCP stays Bun-backed so `agent-e2e.config.ts` loads directly and the MCP URL remains stable. The showcase stack provider composes the showcase-owned PostgreSQL Testcontainers provider with the managed `next dev` process in-process.

That direct composition is intentional for the launch showcase:

- Bun owns Dev MCP, hot config loading, MCP tool routing, and browser sessions.
- The showcase provider owns Testcontainers PostgreSQL, explicit readiness, schema initialization, and the managed `next dev` process.
- PostgreSQL readiness uses a container log wait plus bounded `pg` connection retry so the stack starts reliably without a private bridge or harness API change.

Consumer apps should implement `stackProvider` directly in `agent-e2e.config.ts` when their infrastructure clients are compatible with the Dev MCP runtime. Runtime-specific readiness belongs in the consumer provider or a future dedicated adapter package, not in a private lifecycle bridge.

## Attached Docker Compose Runtime

The showcase also dogfoods **Attached Runtime Mode** with Docker Compose. Compose startup is intentionally separate because attached mode does not own infrastructure lifecycle.

```sh
npm run compose:up --workspace @agent-e2e/showcase
npm run attached:mcp --workspace @agent-e2e/showcase
```

`compose:up` builds the showcase service from `apps/showcase/Dockerfile` instead of mounting host `node_modules` into a Linux container. The image installs workspaces with `npm ci --ignore-scripts` and skips Playwright browser downloads because Compose only serves the app; browser sessions still run from the MCP host.

`attached:mcp` runs `agent-e2e attached --target showcase-compose`. The attached target is declared with `attachedRuntime(...)` in `agent-e2e.config.ts`, and the attached Journey Profile selects it through `runtimeTargetId: "showcase-compose"`. Use `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.capability.list`, and `runtime.capability.run` to inspect the already-running Compose app. Access Context status is reported without exposing secret material; browser.open authentication wiring is not automatic in this v1 path and must be supplied by product code when a runtime needs authenticated browser state. The product-owned diagnostic `compose.services` is an `observation` Runtime Capability; Docker-specific behavior stays in `apps/showcase`, not harness core.

`agent-e2e attached` shares the default MCP port with `agent-e2e dev` (`127.0.0.1:3766/mcp`); in short, attached shares the default MCP port. Pass `--port` when Dev MCP is already running, for example `agent-e2e attached --target showcase-compose --port 3777`. The attached target resolves `compose.yaml` relative to the showcase package; set `AGENT_E2E_SHOWCASE_ROOT=/absolute/path/to/apps/showcase` only when running from a nonstandard copied or compiled location.

The attached smoke path uses the same proof-notes journey and ownership ledger. Seed and cleanup operate only on run-owned proof-note resources after the selected profile opts into run lifecycle; Compose containers remain externally owned. Stop Compose separately:

```sh
npm run compose:down --workspace @agent-e2e/showcase
```

## Artifacts

Run artifacts are generated under a timestamp-first run directory:

```text
runs/
  latest -> <runId>                 # local convenience symlink only
  <runId>/
    run-report.md                   # human entry point — open this first
    run-report.json                 # whole-run verdict + index
    seed-manifest.json
    timeline.json
    metrics.json
    owned-resources.json
    inspections/<seq>/
      inspect.md
      inspect.json
      screenshot.png
    journeys/showcase:proof-notes/phases/phase:proof-notes/steps/step:create-proof-note/
      before.png
      after.png
      inspect.md
      inspect.json
      step-report.json
```

There is no separate `result.json`, `index.json`, `latest.json`, `console.json`, `network.json`, or `step-feedback.json`. `run-report.md` and `run-report.json` are the whole-run entry points. `step-report.json` is the single agent-facing per-step report. Console and network facts are signals inside inspect artifacts (`signals.consoleErrors`, `signals.networkFailures`).

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
npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2
```

Expected checkpoint: `Agent E2E verify: 1 passed, 0 failed, 0 stack failed` and a suite report under `.agents-e2e/artifacts/_suites/`. With the current single selected showcase journey, verify starts one lazy worker Stack Instance such as `worker-0` even when `--workers 2` is configured; the report still records `workers: 2`, the run `stackId`, named allocations, and dynamic service URLs.

## Validation

```sh
npm run build --workspace @agent-e2e/harness
npm run typecheck --workspace @agent-e2e/showcase
npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2
npm run test --workspace @agent-e2e/showcase -- --reporter=verbose
npm audit --json
```
