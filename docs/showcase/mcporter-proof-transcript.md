# Dev MCP proof transcript

Captured on 2026-05-14 against the local showcase Dev MCP endpoint using the public user path. Dev MCP used the stable URL `http://127.0.0.1:3766/mcp`; the app URL was returned by `stack.start`.

Generated `runs/` evidence remains ignored. This transcript preserves the durable command path and observed checkpoints.

## Command Path

```sh
npm install
npm run dev:mcp --workspace @agent-e2e/showcase

mcporter list http://127.0.0.1:3766/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"showcase-dev-stack"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"stackId":"showcase-dev-stack","serviceId":"showcase-next-dev","tail":80,"stream":"combined"}' --output json

STACK_ID="showcase-dev-stack"
APP_URL="http://127.0.0.1:58589"
RUN_ID="showcase-dev"

mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev","stackId":"showcase-dev-stack"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.open --args '{"targetUrl":"http://127.0.0.1:58589?agentE2ERunId=showcase-dev","journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.inspect --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.act --args '{"browserSessionId":"browser-1778691174645-4ba879","ref":"@e1","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"browser-1778691174645-4ba879","until":{"kind":"text","text":"Proof note persisted"},"timeoutMs":5000}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.inspect --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"browser-1778691174645-4ba879"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.run --args '{"stackId":"showcase-dev-stack","toolId":"notes.list","input":{"limit":10}}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool browser.close --args '{"browserSessionId":"browser-1778691174645-4ba879"}' --output json
npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2

mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.stop --args '{"stackId":"showcase-dev-stack"}' --output json
```

## Evidence Summary

- `npm install`: completed with `found 0 vulnerabilities`.
- `npm run dev:mcp --workspace @agent-e2e/showcase`: printed `Agent E2E Dev MCP ready` and `MCP: http://127.0.0.1:3766/mcp`.
- `mcporter list`: status `ok`; 25 tools discovered, including `stack.list`, `stack.logs`, `stack.capability.list`, `stack.capability.run`, and the Browser Workbench tools.
- `stack.capability.list`: status `ok`; listed concrete showcase tools `notes.list` and `postgres.query` with JSON Schemas.
- `stack.start`: status `ok`; returned `stackId: "showcase-dev-stack"`; stack status `ready`; `showcase-next-dev` ready at `http://127.0.0.1:58589`; PostgreSQL ready through the showcase Testcontainers provider.
- `stack.list`: status `ok`; recovered the running `showcase-dev-stack` Stack Instance and its dynamic service URLs.
- `stack.logs`: status `ok`; returned recent combined logs for `showcase-next-dev`.
- `journey.list`: listed `showcase:proof-notes`.
- `run.begin`: seed gate `ready`; `canRunSteps: true`; baseline workspace/user checked; run bound to `stackId: "showcase-dev-stack"`.
- `browser.open`: returned headed MCP browser session `browser-1778691174645-4ba879`.
- `browser.inspect` (first call): title `Proof Notes Showcase`; refs included visible app controls including the `Create proof note` button as `@e1`; console errors `0`; network failures `0`; artifacts written to `runs/showcase-dev/inspections/1/`.
- `browser.act`: clicked `@e1` without creating an implicit screenshot.
- `browser.wait`: matched `Proof note persisted` and reported elapsed timeout feedback.
- `browser.inspect` (second call): showed updated page state with created proof note; console errors `0`; network failures `0`; artifacts written to `runs/showcase-dev/inspections/2/`.
- `journey.step`: passed `phase:proof-notes / step:create-proof-note`; both proofs passed; returned before/after screenshots, inspect artifacts, and `step-report` artifact at `runs/showcase-dev/journeys/showcase-proof-notes/phases/phase-proof-notes/steps/step-create-proof-note/step-report.json`.
- `stack.capability.run`: ran verify-safe `notes.list`; returned the created proof note inline without adding artifacts.
- `step-report.json` read directly from the path returned by `journey.step`: content status `passed`; signal counters `consoleErrors: 0`, `networkFailures: 0`.
- `cleanup.plan`: planned one run-owned `note`.
- `run.teardown`: deleted one run-owned `note` through `resource-registry-adapter`.
- `browser.close`: closed the MCP-owned browser session.
- `npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2`: passed; report showed `workers: 2`, lazy worker Stack Instance `worker-0`, run `stackId: "worker-0"`, named allocations for `showcase stack artifacts`, `showcase next dev`, and `next dev log`, plus dynamic `showcase-next-dev` and PostgreSQL service URLs.
- `stack.stop`: stopped `showcase-next-dev` and PostgreSQL.
- Post-run container check: no `postgres:16-alpine` or `testcontainers/ryuk` containers remained after Dev MCP shutdown.

## Artifact Shape Observed

```text
runs/2026-05-14T10-00-00Z-showcase-dev/
  run-report.md
  run-report.json
  inspections/
    1/
      inspect.md
      inspect.json
      screenshot.png
    2/
      inspect.md
      inspect.json
      screenshot.png
  journeys/showcase-proof-notes/phases/phase-proof-notes/steps/step-create-proof-note/
    before.png
    after.png
    inspect.md
    inspect.json
    step-report.json
```

## Runtime Note

The Dev MCP server remains Bun-backed. The showcase stack lifecycle is composed directly by the showcase stack provider, which owns Testcontainers PostgreSQL readiness and the managed `next dev` process while Dev MCP keeps the stable Streamable HTTP endpoint.

## Attached Runtime Mode Docker Compose proof

Captured on 2026-05-18 against the public attached-mode command path for PRD #66. Docker was available locally (`Docker Engine 29.4.0`, `docker compose v5.1.2`). The showcase Compose stack built from `apps/showcase/Dockerfile`, started externally, and Attached Runtime Mode connected to it through `agent-e2e attached --target showcase-compose --port 3777`.

Public path:

```sh
docker version
docker compose version
npm run compose:up --workspace @agent-e2e/showcase
AGENT_E2E_MCP_PORT=3777 npm run attached:mcp --workspace @agent-e2e/showcase
mcporter list http://127.0.0.1:3777/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.status --args '{"targetId":"showcase-compose"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.access.status --args '{"targetId":"showcase-compose"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.logs --args '{"targetId":"showcase-compose","serviceId":"showcase","tail":20}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.capability.list --args '{"targetId":"showcase-compose"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool runtime.capability.run --args '{"targetId":"showcase-compose","toolId":"compose.services","input":{}}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","profileId":"profile:compose-attached","runId":"showcase-compose-attached-green"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.open --args '{"targetUrl":"http://127.0.0.1:3100?agentE2ERunId=showcase-compose-attached-green","journeyId":"showcase:proof-notes","runId":"showcase-compose-attached-green"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"browser-1779107883589-7fa9e2","until":{"kind":"text","text":"workspace:seed"},"timeoutMs":10000}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.inspect --args '{"browserSessionId":"browser-1779107883589-7fa9e2"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.act --args '{"browserSessionId":"browser-1779107883589-7fa9e2","ref":"@e1","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.wait --args '{"browserSessionId":"browser-1779107883589-7fa9e2","until":{"kind":"text","text":"Proof note persisted"},"timeoutMs":10000}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool journey.step --args '{"runId":"showcase-compose-attached-green","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"browser-1779107883589-7fa9e2"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-compose-attached-green"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool run.teardown --args '{"runId":"showcase-compose-attached-green"}' --output json
mcporter call --http-url http://127.0.0.1:3777/mcp --allow-http --tool browser.close --args '{"browserSessionId":"browser-1779107883589-7fa9e2"}' --output json
npm run compose:down --workspace @agent-e2e/showcase
```

Observed evidence:

- `compose:up` built image `agent-e2e-showcase-compose:local` from `apps/showcase/Dockerfile`, using `.dockerignore` and `npm ci --ignore-scripts`; `postgres` became healthy and `showcase` started.
- `agent-e2e attached --target showcase-compose` stayed running on alternate port `3777`, avoiding the default `agent-e2e dev` port at `3766`.
- `mcporter list` discovered the attached Runtime Tool Surface, including `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.capability.list`, and `runtime.capability.run`.
- `runtime.list` returned attached target `showcase-compose` with capabilities `status`, `logs`, `access`, `capability`,.
- `runtime.status` returned `ready` with service `showcase-web` at `http://127.0.0.1:3100`.
- `runtime.access.status` returned the declared `compose-runtime-logs` Access Context without secret material.
- `runtime.logs` returned structured Compose log entries with `truncated: false` and wrote `runs/_runtime/showcase-compose/runtime-logs-2026-05-18t12-36-00-693z.json`.
- `runtime.capability.list` exposed product-owned observation tool `compose.services`; `runtime.capability.run` returned `postgres` and `showcase` as running services.
- `run.begin` selected profile `profile:compose-attached`, bound `runtimeTargetId: "showcase-compose"`, seeded baseline state through `http://127.0.0.1:3100/api/seed`, and wrote run artifacts under `runs/`.
- The Playwright-owned MCP browser opened `http://127.0.0.1:3100?agentE2ERunId=showcase-compose-attached-green`; `browser.inspect` showed `workspace:seed`, `user:seed`, and the `Create proof note` button as `@e1`.
- `browser.act` clicked `@e1`, `browser.wait` matched `Proof note persisted`, and the subsequent `browser.inspect` showed network failures `0` and confirmed `POST /api/notes` with `201` in the inspect signals.
- `journey.step` passed both proofs, observed note `proof-note:1779107899233:be0333`, recorded it as run-owned, and returned before/after screenshot, inspect artifacts, and `step-report.json`.
- `cleanup.plan` planned one run-owned `note`; `run.teardown` deleted the same note through `resource-registry-adapter`.
- `browser.close` closed the MCP-owned browser session. `compose:down` stopped the externally owned Compose stack separately.
