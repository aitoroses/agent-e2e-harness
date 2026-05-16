# Dev MCP Loop

Use this reference when running and proving the interactive agent loop.

## Start Dev MCP

Run from the app root:

```sh
npm run dev:mcp
```

Expected server log contains:

```text
Agent E2E Dev MCP ready
MCP:       http://127.0.0.1:3766/mcp
Codex:     codex mcp add agent-e2e --url http://127.0.0.1:3766/mcp
Claude:    claude mcp add --scope project --transport http agent-e2e http://127.0.0.1:3766/mcp
Tools:     stack.*, run.*, journey.*, browser.*, artifact.*, cleanup.*
```

This log is a boot check only. It is not a development proof until tools have been called, artifacts have been read, and cleanup or reseed has been proven.

Use `--host`, `--port`, `--path`, or environment variables only when the app requires a different endpoint.

## Configure Standard MCP Clients

Codex:

```sh
codex mcp add agent-e2e --url http://127.0.0.1:3766/mcp
codex mcp get agent-e2e
```

Codex config:

```toml
[mcp_servers.agent-e2e]
url = "http://127.0.0.1:3766/mcp"
```

Claude Code:

```sh
claude mcp add --scope project --transport http agent-e2e http://127.0.0.1:3766/mcp
claude mcp get agent-e2e
```

Do not write a custom MCP client script for normal adoption.

## Dynamic MCP Client For Fresh Agents

Use `mcporter` when the current agent/session does not already have the Dev MCP server registered. This is common for fresh AOE sessions, remote agents, or one-off adoption smokes.

Local HTTP endpoints require `--allow-http`:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http

mcporter call \
  --http-url http://127.0.0.1:3766/mcp \
  --allow-http \
  --tool journey.list \
  --args '{}' \
  --output json
```

Prefer `--http-url ... --tool ...` for localhost. Do not rely on dotted URL selector shapes such as `http://127.0.0.1:3766/mcp.journey.list`; they can fail for local MCP URLs.

## Proof Tool Sequence

Drive the proof through standard MCP calls:

```text
journey.list
journey.inspect
stack.explore.list
stack.start
stack.start  # optional second Stack Instance for multi-stack exploration
stack.list
stack.status
stack.logs
run.begin
browser.open
browser.snapshot
browser.find
browser.act
browser.wait
browser.get
browser.console
browser.network
journey.step
stack.explore.run
artifact.read
cleanup.plan
run.reseed
browser.close
stack.stop
```

For multi-step journeys, use `journey.phase` or `journey.untilPhase` when appropriate.

## Evidence To Capture

Capture these facts before changing implementation again:

- `journey.inspect` shows the intended journey, tags, profiles, phases, steps, and proofs.
- `stack.explore.list` shows provider-owned tools with input/output schemas.
- `stack.start` returns a `stackId` and all required services as `ready`.
- Multi-stack Dev MCP checks work when the provider can run two local stacks: start two named Stack Instances, confirm `stack.list` shows both ids, and use `stack.status` against each explicit `stackId`.
- `stack.list` can recover the running Stack Instance id after compaction or handoff.
- `stack.status` with `stackId` returns the unified stack-state packet. `StackStatusPacket.services` is the journey-facing runtime contract for dynamic URLs and readiness. Do not expect native `stack.services`, `stack.health`, or `stack.env`.
- `stack.logs` with `stackId` returns recent live logs for one active service using `serviceId` and required `tail`.
- `stack.explore.run` with `stackId` can run at least one concrete provider tool.
- `run.begin` with `stackId` returns seed `status: "passed"` or `"warning"`, `canRunSteps: true`, and the run's Run Stack Binding.
- `browser.open` returns a browser session id.
- `browser.snapshot` shows expected app state and no visible runtime error.
- `browser.find` resolves semantic targets when a role, label, text, placeholder, test id, or selector is clearer than a snapshot ref.
- `browser.act` uses a fresh snapshot/find ref or clear CSS selector and performs exactly one UI mutation.
- `browser.wait` waits for explicit page state instead of sleeping.
- `browser.get` reads targeted text/value/HTML/attribute/title/URL/count when the agent needs a small observation.
- `browser.console` and `browser.network` can be read with cursors when diagnosing runtime errors, failed requests, or unexpected behavior.
- `journey.step` or `journey.phase` returns `status: "passed"`.
- `artifact.read` can read the primary step feedback or result artifact.
- `cleanup.plan` contains only resources owned by this run.
- `run.reseed` cleans owned resources and returns a ready seed.
- `stack.stop` with `stackId` stops managed services.

## Artifact Layout

Interactive run artifacts live under:

```text
.agents-e2e/artifacts/<journey>/<run>/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  forensics/
    browser-snapshot-*.json
    screenshot-*.png
  01-phase-<phase-id>/01-step-<step-id>/
    before.png
    after.png
    failure.png
    console.json
    network.json
    result.json
    step-feedback.json
```

Use artifacts for time travel: answer what happened from seed, snapshots, screenshots, console/network logs, step feedback, owned resources, cleanup, and metrics before editing again.
