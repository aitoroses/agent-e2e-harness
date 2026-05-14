# Dev MCP Tool Grammar

The default Dev MCP grammar defines reusable Agent E2E Harness vocabulary for local, agent-driven proof loops.

## Default mode

- Dev MCP runs over local Streamable HTTP for standard MCP clients and hot-reloadable journey iteration.
- Dev MCP owns Playwright browser sessions; callers never pass `browser` or `page` over MCP.
- Dev browser sessions are headed by default.
- Verify/CI may run headless by default.

## Implemented tool groups

### Orientation

- `journey.list` — lists textual/executable journeys and profile coverage.
- `journey.inspect` — returns the full Inspectable Journey Contract for one journey.

### Stack and seed

- `stack.start` — starts the managed dev stack.
- `stack.status` — returns service readiness, URLs, warnings, and artifacts.
- `stack.stop` — stops provider-owned infrastructure/processes.
- `run.reseed` — cleans journey-owned resources, then applies Environment Seed.

### Run lifecycle

- `run.begin` — creates or resumes a proof workspace and returns the first recommended action.
- `run.teardown` — deletes journey-owned resources and may close an MCP-owned browser session.

### Browser session and forensics

- `browser.open` — opens an MCP-owned headed browser and returns `browserSessionId`.
- `browser.sessions` — lists open sessions.
- `browser.snapshot` — primary forensics packet: URL, title, semantic tree, interactive refs, visible errors, console/network signals, artifacts, optional visual evidence, and next actions.
- `browser.act` — performs a single Playwright action using snapshot refs or semantic locators.
- `browser.screenshot` — captures an additional named screenshot artifact.
- `browser.close` — closes an MCP-owned browser session.

### Journey execution

- `journey.step` — executes one executable journey step; when `browserSessionId` is supplied, the step receives the MCP-owned Playwright `browser`/`page` execution surface and can emit before/after screenshots.
- `journey.untilPhase` — clean-reruns to a stable phase and parks the headed browser for inspection.
- `journey.phase` — convenience wrapper around repeated steps in one phase.

### Artifacts and cleanup

- `artifact.read` — reads harness-owned artifacts only.
- `cleanup.plan` — previews journey-owned resources that teardown would delete.

## Artifact layout contract

Harness-owned validation evidence is rooted at `.agents-e2e/artifacts` by default. Each run writes directly under `<journey>/<run>`; do not introduce product-specific nesting such as `ui-e2e/` or a generic `steps/` directory. Phase and step ordering is encoded in the directory names:

```text
.agents-e2e/artifacts/<journey>/<run>/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  forensics/browser-snapshot-*.json
  forensics/screenshot-*.png
  01-phase-<phase-id>/01-step-<step-id>/
    before.png
    after.png
    failure.png
    console.json
    network.json
    result.json
    step-feedback.json
```

MCP tools should return artifact refs with `path` plus `uri`; agents should use `artifact.read` for JSON/text and screenshots as base64 when the artifact is inside the configured root.

## First contract tests

Phase 0/1 tests should assert tool names, required inputs, default headed dev mode, no caller-injected Playwright objects, artifact refs, automatic screenshots/snapshots, and consistent feedback envelope fields: `status`, `summary`, `artifacts`, `warnings`, `errors`, and `next.actions`.
