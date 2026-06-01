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

## Attached Runtime Mode

For an already-running Runtime Target, start the attached MCP surface:

```sh
agent-e2e attached --target <id>
```

Attached Runtime Mode does not own infrastructure lifecycle. Use product commands to start/stop staging, production, preview, Kubernetes, or Docker Compose. Then validate with:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.status --args '{"targetId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.logs --args '{"targetId":"<id>","tail":80}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.access.status --args '{"targetId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.capability.list --args '{"targetId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool runtime.capability.run --args '{"targetId":"<id>","toolId":"<observation-tool>","input":{}}' --output json
```

Use Journey Profiles with `runtimeTargetId` to run attached journeys. Seed and cleanup are allowed only when the profile opts into run lifecycle and must stay ownership-ledger bounded.

## Proof Tool Sequence

Drive the proof through standard MCP calls:

```text
journey.list
journey.inspect
stack.capability.list
stack.start
stack.start  # optional second Stack Instance for multi-stack capability
stack.list
stack.status
stack.logs
run.begin
browser.open
browser.inspect          # standard evidence path: compact index + artifacts
browser.refs             # optional: toggle live overlay to correlate pixels to @eN refs
browser.act
browser.wait
browser.inspect          # capture post-action state
journey.step
stack.capability.run
cleanup.plan
run.reseed
browser.close
stack.stop
```

The `browser.inspect` → `browser.act` → `browser.wait` → `browser.inspect` loop is the standard agent interaction pattern. Use `browser.refs({ enabled: true })` before inspect when you want the overlay painted in the screenshot. Use `browser.eval` or `browser.playwright` only when standard tools are insufficient.

For multi-step journeys, use `journey.phase` or `journey.untilPhase` when appropriate, or `journey.untilStep` to land the managed state exactly at a single step (`{ runId, phaseId, stepId }`) when you want to inspect one visual frame.

The call sequence is the development Trajectory. It can include false starts, debugging probes, and stack capabilities. Keep it as evidence while learning the app, then promote only the stable user path into reviewed Journey code before CI depends on it.

## Evidence To Capture

Capture these facts before changing implementation again:

- `journey.inspect` shows the intended journey, tags, profiles, phases, steps, and proofs.
- `stack.capability.list` shows provider-owned tools with input/output schemas.
- `stack.start` returns a `stackId` and all required services as `ready`.
- Multi-stack Dev MCP checks work when the provider can run two local stacks: start two named Stack Instances, confirm `stack.list` shows both ids, and use `stack.status` against each explicit `stackId`.
- `stack.list` can recover the running Stack Instance id after compaction or handoff.
- `stack.status` with `stackId` returns the unified stack-state packet. `StackStatusPacket.services` is the journey-facing runtime contract for dynamic URLs and readiness. Do not expect native `stack.services`, `stack.health`, or `stack.env`.
- `stack.logs` with `stackId` returns recent live logs for one active service using `serviceId` and required `tail`.
- `stack.capability.run` with `stackId` can run at least one concrete provider tool.
- `run.begin` with `stackId` returns seed `status: "passed"` or `"warning"`, `canRunSteps: true`, and the run's Run Stack Binding.
- `browser.open` returns a browser session id.
- `browser.inspect` returns a compact index (`{ status, url, title, target, artifacts, signals, refsOverlayEnabled }`); `signals.consoleErrors` and `signals.networkFailures` are zero for a healthy page; the written `inspect.md` shows expected app state and no visible runtime error.
- `browser.inspect` artifacts are written to `runs/<runId>/inspections/<seq>/{inspect.md,inspect.json,screenshot.png}`.
- `browser.act` uses a `@eN` ref from the UI forensics registry or a CSS selector and performs exactly one UI mutation.
- `browser.wait` waits for explicit page state instead of sleeping.
- `browser.refs` toggles the overlay without altering layout or intercepting clicks; it is captured in the next inspect screenshot.
- `journey.step` or `journey.phase` returns `status: "passed"`.
- Step artifacts are written to `runs/<runId>/journeys/<journeyId>/phases/<phaseId>/steps/<stepId>/`; `step-report.json` is the single agent-facing per-step report.
- `cleanup.plan` contains only resources owned by this run.
- `run.reseed` cleans owned resources and returns a ready seed.
- `stack.stop` with `stackId` stops managed services.

## Artifact Layout

Run artifacts live under a timestamp-first run directory:

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
    journeys/<journeyId>/phases/<phaseId>/steps/<stepId>/
      before.png
      after.png | failure.png | skipped.png
      inspect.md
      inspect.json
      step-report.json
```

There is no separate `result.json`, `index.json`, `latest.json`, `console.json`, `network.json`, or `step-feedback.json`. `run-report.md` and `run-report.json` are the whole-run entry points. `step-report.json` is the single agent-facing per-step report. Console and network facts are signals inside inspect artifacts.

Use artifacts for time travel: answer what happened from seed, inspect artifacts, screenshots, step reports, owned resources, cleanup, and metrics before editing again.
