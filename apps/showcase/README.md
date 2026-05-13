# Proof Notes Showcase

A Next.js consumer app that dogfoods Agent E2E Harness as a launch-day user would: start Dev MCP, bring up a managed stack, seed a persisted baseline, create a proof note through a Playwright-owned browser, read artifacts, clean only owned resources, and stop the stack.

## Five-Minute Proof Path

Prerequisites:

```sh
node --version   # expect v22+
bun --version    # expect 1.3+
docker --version # Docker must be running
mcporter --version
```

Install from the repo root:

```sh
npm install
```

Expected checkpoint: `found 0 vulnerabilities`.

Start the Bun-backed Dev MCP server:

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
```

Expected checkpoint: `Agent E2E Dev MCP ready` and `MCP: http://127.0.0.1:3766/mcp`.

In another terminal, discover the tools:

```sh
mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json
```

Expected checkpoint: `"status": "ok"` and 19 tools, including `stack.start`, `run.begin`, `browser.open`, `journey.step`, `artifact.read`, `cleanup.plan`, `run.teardown`, and `stack.stop`.

Start the managed stack:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{}' --output json --timeout 120000
```

Expected checkpoint: `"status": "ok"`, `"stack": { "status": "ready" }`, and a `showcase-next-dev` service URL. The 120s timeout covers cold Docker/Testcontainers startup; warm local runs should usually complete much faster.

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

Capture a snapshot, then click the fresh button ref:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.snapshot --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"<browserSessionId>","ref":"@e2","action":"click"}' --output json
```

Expected checkpoints: `"title": "Proof Notes Showcase"` and `"action": "click"`.

Run the proof step:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"<browserSessionId>"}' --output json
```

Expected checkpoint: `"status": "passed"` with both proofs passed and a `step_feedback_artifact.path`.

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

Expected checkpoints: `"planned"` contains one `proof-note`; `"deleted"` contains one `proof-note`.

Close the browser and stop the stack:

```sh
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"<browserSessionId>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args '{}' --output json
```

Expected checkpoint: `"stack": { "status": "stopped" }` with stopped `showcase-next-dev` and `postgres` services.

## How The Stack Works

Dev MCP stays Bun-backed so `agent-e2e.config.ts` loads directly and the MCP URL remains stable. The showcase stack itself runs through a private Node sidecar at `scripts/showcase-stack-sidecar.mjs`.

That split is intentional for the launch showcase:

- Bun owns Dev MCP, hot config loading, MCP tool routing, and browser sessions.
- The Node sidecar owns Testcontainers PostgreSQL, schema initialization, and the managed `next dev` process.
- The Bun stack provider talks to the sidecar over stdio JSON lines, so no extra public port or harness API is needed.

A consumer app does not need this exact sidecar unless its infrastructure tooling expects Node-specific runtime behavior. Apps with Bun-compatible stack providers can implement `stackProvider` directly in `agent-e2e.config.ts`; apps with Node-only infrastructure clients can copy this sidecar shape while still keeping the Dev MCP server Bun-backed.

## Artifacts

Artifacts are generated under `.agents-e2e/artifacts/<journey>/<run>/`:

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
  forensics/action-click-*.png
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Framework Surfaces Demonstrated

- `@agent-e2e/harness/dev-mcp`: local Streamable HTTP MCP server.
- `@agent-e2e/harness/stack`: managed process stack provider used inside the Node sidecar.
- `apps/showcase/scripts/showcase-stack-sidecar.mjs`: showcase-owned Node lifecycle bridge for Testcontainers and `next dev`.
- `@agent-e2e/harness/playwright-mcp`: headed browser sessions, snapshots, actions, screenshots.
- `@agent-e2e/harness/mcp`: run, step, cleanup, reseed, and artifact control surface.

## Validation

```sh
npm run build --workspace @agent-e2e/harness
npm run typecheck --workspace @agent-e2e/showcase
npm run test --workspace @agent-e2e/showcase -- --reporter=verbose
npm audit --json
```
