# Dev MCP proof transcript

Captured on 2026-05-13 against the local showcase Dev MCP endpoint using the public user path. Dev MCP used the stable URL `http://127.0.0.1:3766/mcp`; the app URL was returned by `stack.start`.

Generated `.agents-e2e/` evidence remains ignored. This transcript preserves the durable command path and observed checkpoints.

## Command Path

```sh
npm install
npm run dev:mcp --workspace @agent-e2e/showcase

mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{}' --output json --timeout 120000

APP_URL="http://127.0.0.1:58589"
RUN_ID="showcase-dev"

mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.open --args '{"targetUrl":"http://127.0.0.1:58589?agentE2ERunId=showcase-dev","journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.snapshot --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"browser-1778691174645-4ba879","ref":"@e2","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool artifact.read --args '{"path":".agents-e2e/artifacts/showcase-proof-notes/showcase-dev/01-phase-phase-proof-notes/01-step-step-create-proof-note/step-feedback.json"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args '{}' --output json
```

## Evidence Summary

- `npm install`: completed with `found 0 vulnerabilities`.
- `npm run dev:mcp --workspace @agent-e2e/showcase`: printed `Agent E2E Dev MCP ready` and `MCP: http://127.0.0.1:3766/mcp`.
- `mcporter list`: status `ok`; 19 tools discovered.
- `stack.start`: status `ok`; stack status `ready`; `showcase-next-dev` ready at `http://127.0.0.1:58589`; PostgreSQL ready through the showcase Node sidecar.
- `journey.list`: listed `showcase:proof-notes`.
- `run.begin`: seed gate `ready`; `canRunSteps: true`; baseline workspace/user checked.
- `browser.open`: returned headed MCP browser session `browser-1778691174645-4ba879`.
- `browser.snapshot`: title `Proof Notes Showcase`; refs included `@e2` button `Create proof note`.
- `browser.act`: clicked `@e2` and wrote a forensics screenshot.
- `journey.step`: passed `phase:proof-notes / step:create-proof-note`; both proofs passed; returned before/after screenshots, console/network logs, result, and `step-feedback` artifacts.
- `artifact.read`: read `step-feedback.json`; content status `passed`; console errors `0`.
- `cleanup.plan`: planned one run-owned `proof-note`.
- `run.teardown`: deleted one run-owned `proof-note` through `showcase-proof-note-api`.
- `browser.close`: closed the MCP-owned browser session.
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
    action-click-*.png
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Runtime Note

The Dev MCP server remains Bun-backed. The showcase stack lifecycle runs through `apps/showcase/scripts/showcase-stack-sidecar.mjs`, a private Node sidecar that owns Testcontainers PostgreSQL and the managed `next dev` process while Dev MCP keeps the stable Streamable HTTP endpoint.
