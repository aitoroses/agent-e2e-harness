# Dev MCP Tool Grammar

The default Dev MCP grammar defines reusable Agent E2E Harness vocabulary for local, agent-driven proof loops.

## Default mode

- Dev MCP runs over local Streamable HTTP for standard MCP clients; TypeScript journey/config edits hot-reload in process via jiti behind the same endpoint (no restart). `agent-e2e dev --watch` is an optional hard-restart fallback.
- Dev MCP owns Playwright browser sessions; callers never pass `browser` or `page` over MCP.
- Dev browser sessions are headed by default.
- Verify/CI may run headless by default.

## Implemented tool groups

### Orientation

- `journey.list` — lists textual/executable journeys and profile coverage.
- `journey.inspect` — returns the full Inspectable Journey Contract for one journey.

### Stack and seed

- `stack.start` — starts a Stack Instance and returns the effective `stackId`.
- `stack.list` — lists currently running Stack Instances.
- `stack.status` — returns the unified stack-state packet for one explicit `stackId`: `StackStatusPacket.services`, endpoints, readiness checks, warnings, errors, artifacts, and next actions.
- `stack.logs` — reads recent live logs for one active service on one explicit `stackId`; requires `serviceId` and `tail`, with optional `stream`; optional `runId` captures artifacts only when the run is bound to the same `stackId`.
- `stack.capability.list` — lists provider-declared stack capabilities with JSON Schemas derived from Zod input/output schemas.
- `stack.capability.run` — runs one provider-declared stack capability against one explicit `stackId`; optional `runId` captures artifacts only when the run is bound to the same `stackId`.
- `stack.stop` — stops one explicit Stack Instance.
- `run.reseed` — cleans journey-owned resources, then applies Environment Seed.

There are no native `stack.services`, `stack.health`, or `stack.env` tools in v1. Service and health data live in `stack.status`; provider-specific config, database/queue/cache inspection, or local stack mutation belongs in `stack.capability.*`.

Provider-declared stack capabilities must declare `id`, `title`, `description`, `availableIn`, `risk`, Zod `input`, Zod `output`, and a handler. `agent-e2e verify` can use only Verify Observation Tools: `availableIn` includes `verify` and `risk` is `none`.

### Run lifecycle

- `run.begin` — creates or resumes a proof workspace, requires `stackId` when a stack provider exists, rejects `stackId` when no provider exists, and returns the run's **Run Stack Binding**.
- `run.teardown` — deletes journey-owned resources and may close an MCP-owned browser session.

### Stack provider contract

Stack providers receive a **StackStartContext** for every Stack Instance. Use **Named Stack Allocations** through `ctx.allocatePort(name)` and `ctx.allocateArtifactPath(name, ...)` as the default pattern for dynamic app ports, service log paths, database files, and per-worker artifact directories. `StackStatusPacket.services` remains the journey-facing runtime contract for dynamic URLs, readiness, health, and stable service ids; named allocations explain where the resources came from in Dev MCP responses and verify reports.

### Browser session and forensics

- `browser.open` — opens an MCP-owned headed browser and returns `browserSessionId`.
- `browser.sessions` — lists open sessions.
- `browser.inspect` — standard evidence path: captures visible state, refs, signals, and a screenshot in one call. Input: `{ browserSessionId, target?, depth?, maxNodes? }`. `target` omitted = current page; `"@<ref>"` = a UI forensics ref; anything else = a selector / Playwright locator-compatible string. Returns a compact index: `{ status, url, title, target, artifacts, signals, refsOverlayEnabled }`. Writes `inspect.md`, `inspect.json`, and `screenshot.png` under `runs/<runId>/inspections/<seq>/`. Console and network signals are captured here, not via separate tools.
- `browser.refs` — toggles a live overlay (`{ enabled: true|false }`) that paints boxes and labels for exactly the referencable nodes shared by inspect and act. Overlay is `pointer-events:none`, updates on DOM mutation/scroll/resize, and is removed on disable or session-teardown.
- `browser.act` — performs one UI action using a current ref (`@eN`) or a selector. Does not capture screenshots automatically.
- `browser.wait` — waits for an explicit ref, selector, text, URL, load-state, or page-function condition and reports elapsed timeout feedback.
- `browser.eval` — runs an async page-context function body with JSON input and JSON-serializable output.
- `browser.playwright` — runs an async Playwright-context function body against the live MCP-owned page/browser and optional refs.
- `browser.close` — closes an MCP-owned browser session.

### Journey execution

- `journey.step` — executes one executable journey step; when `browserSessionId` is supplied, the step receives the MCP-owned Playwright `browser`/`page` execution surface and can emit before/after screenshots.
- `journey.untilPhase` — clean-reruns to a stable phase and parks the headed browser for inspection.
- `journey.phase` — convenience wrapper around repeated steps in one phase.

### Artifacts and cleanup

- `cleanup.plan` — previews journey-owned resources that teardown would delete.

## Artifact layout contract

Harness-owned validation evidence is written under `runs/<runId>/`. The `runId` is timestamp-first and human-readable (e.g. `2026-05-31T10-24-18Z-auth-boundary-oc7`). A `runs/latest` symlink is kept locally as a convenience pointer only.

```text
runs/
  latest -> <runId>
  <runId>/
    run-report.md
    run-report.json
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

`run-report.json` is the whole-run verdict and index. There is no separate `result.json`, `index.json`, or `latest.json`.

`step-report.json` is the single agent-facing per-step report: status, what ran, relevant artifact paths, signal counters, failure info when present, and raw execution payload nested under `execution`. It replaces the former `step-feedback.json`. There are no separate `console.json` or `network.json` per step; those facts live in step-report signals and execution.

Journey steps use the same inspect machinery as `browser.inspect` — one evidence system for both exploration and verification.

Agents read artifact content directly from the file paths returned in tool responses. Do not assume a separate `artifact.read` tool is available.

## First contract tests

Phase 0/1 tests should assert tool names, required inputs, default headed dev mode, no caller-injected Playwright objects, artifact refs, explicit screenshot capture via inspect, automatic inspect artifacts, and consistent feedback envelope fields: `status`, `summary`, `artifacts`, `warnings`, `errors`, and `next.actions`.
