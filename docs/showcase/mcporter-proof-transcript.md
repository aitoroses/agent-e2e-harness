# Dev MCP proof transcript

Captured on 2026-05-14 against the local showcase Dev MCP endpoint using the public user path. Dev MCP used the stable URL `http://127.0.0.1:3766/mcp`; the app URL was returned by `stack.start`.

Generated `.agents-e2e/` evidence remains ignored. This transcript preserves the durable command path and observed checkpoints.

## Command Path

```sh
npm install
npm run dev:mcp --workspace @agent-e2e/showcase

mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"showcase-dev-stack"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"stackId":"showcase-dev-stack","serviceId":"showcase-next-dev","tail":80,"stream":"combined"}' --output json

STACK_ID="showcase-dev-stack"
APP_URL="http://127.0.0.1:58589"
RUN_ID="showcase-dev"

mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev","stackId":"showcase-dev-stack"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.open --args '{"targetUrl":"http://127.0.0.1:58589?agentE2ERunId=showcase-dev","journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.snapshot --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.find --args '{"browserSessionId":"browser-1778691174645-4ba879","by":"role","value":"button","name":"Create proof note"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"browser-1778691174645-4ba879","ref":"@f1","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"browser-1778691174645-4ba879","until":{"kind":"text","text":"Proof note persisted"},"timeoutMs":5000}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.get --args '{"browserSessionId":"browser-1778691174645-4ba879","selector":"body","kind":"text"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.console --args '{"browserSessionId":"browser-1778691174645-4ba879","since":0}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.network --args '{"browserSessionId":"browser-1778691174645-4ba879","since":0,"urlIncludes":"api/notes"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.run --args '{"stackId":"showcase-dev-stack","toolId":"notes.list","input":{"limit":10}}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool artifact.read --args '{"path":".agents-e2e/artifacts/showcase-proof-notes/showcase-dev/01-phase-phase-proof-notes/01-step-step-create-proof-note/step-feedback.json"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2

mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args '{"stackId":"showcase-dev-stack"}' --output json
```

## Evidence Summary

- `npm install`: completed with `found 0 vulnerabilities`.
- `npm run dev:mcp --workspace @agent-e2e/showcase`: printed `Agent E2E Dev MCP ready` and `MCP: http://127.0.0.1:3766/mcp`.
- `mcporter list`: status `ok`; 30 tools discovered, including `stack.list`, `stack.logs`, `stack.explore.list`, `stack.explore.run`, and the Browser Workbench tools.
- `stack.explore.list`: status `ok`; listed concrete showcase tools `notes.list` and `postgres.query` with JSON Schemas.
- `stack.start`: status `ok`; returned `stackId: "showcase-dev-stack"`; stack status `ready`; `showcase-next-dev` ready at `http://127.0.0.1:58589`; PostgreSQL ready through the showcase Testcontainers provider.
- `stack.list`: status `ok`; recovered the running `showcase-dev-stack` Stack Instance and its dynamic service URLs.
- `stack.logs`: status `ok`; returned recent combined logs for `showcase-next-dev`.
- `journey.list`: listed `showcase:proof-notes`.
- `run.begin`: seed gate `ready`; `canRunSteps: true`; baseline workspace/user checked; run bound to `stackId: "showcase-dev-stack"`.
- `browser.open`: returned headed MCP browser session `browser-1778691174645-4ba879`.
- `browser.snapshot`: title `Proof Notes Showcase`; refs included visible app controls.
- `browser.find`: returned `@f1` for the `Create proof note` button via role/name lookup.
- `browser.act`: clicked `@f1` without creating an implicit screenshot.
- `browser.wait`: matched `Proof note persisted` and reported elapsed timeout feedback.
- `browser.get`: read the page body and included the created proof note state.
- `browser.console`: returned cursor-based console entries for the session.
- `browser.network`: returned cursor-based request/response entries for `api/notes`.
- `journey.step`: passed `phase:proof-notes / step:create-proof-note`; both proofs passed; returned before/after screenshots, console/network logs, result, and `step-feedback` artifacts.
- `stack.explore.run`: ran verify-safe `notes.list`; returned the created proof note inline without adding artifacts.
- `artifact.read`: read `step-feedback.json`; content status `passed`; console errors `0`.
- `cleanup.plan`: planned one run-owned `note`.
- `run.teardown`: deleted one run-owned `note` through `resource-registry-adapter`.
- `browser.close`: closed the MCP-owned browser session.
- `npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2`: passed; report showed `workers: 2`, lazy worker Stack Instance `worker-0`, run `stackId: "worker-0"`, named allocations for `showcase stack artifacts`, `showcase next dev`, and `next dev log`, plus dynamic `showcase-next-dev` and PostgreSQL service URLs.
- `stack.stop`: stopped `showcase-next-dev` and PostgreSQL.
- Post-run container check: no `postgres:16-alpine` or `testcontainers/ryuk` containers remained after Dev MCP shutdown.

## Artifact Shape Observed

```text
.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  forensics/
    browser-snapshot-*.json
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Runtime Note

The Dev MCP server remains Bun-backed. The showcase stack lifecycle is composed directly by the showcase stack provider, which owns Testcontainers PostgreSQL readiness and the managed `next dev` process while Dev MCP keeps the stable Streamable HTTP endpoint.
