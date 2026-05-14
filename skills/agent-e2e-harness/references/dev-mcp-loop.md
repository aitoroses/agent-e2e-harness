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

## Proof Tool Sequence

Drive the proof through standard MCP calls:

```text
journey.list
journey.inspect
stack.start
run.begin
browser.open
browser.snapshot
browser.act
journey.step
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
- `stack.start` returns all required services as `ready`.
- `run.begin` returns seed `status: "passed"` or `"warning"` and `canRunSteps: true`.
- `browser.open` returns a browser session id.
- `browser.snapshot` shows expected app state and no visible runtime error.
- `browser.act` uses a fresh snapshot ref or clear semantic locator.
- `journey.step` or `journey.phase` returns `status: "passed"`.
- `artifact.read` can read the primary step feedback or result artifact.
- `cleanup.plan` contains only resources owned by this run.
- `run.reseed` cleans owned resources and returns a ready seed.
- `stack.stop` stops managed services.

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
