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

- `stack.start` — starts a Stack Instance and returns the effective `stackId`.
- `stack.list` — lists currently running Stack Instances.
- `stack.status` — returns the unified stack-state packet for one explicit `stackId`: services, endpoints, readiness checks, warnings, errors, artifacts, and next actions.
- `stack.logs` — reads recent live logs for one active service on one explicit `stackId`; requires `serviceId` and `tail`, with optional `stream`; optional `runId` captures artifacts only when the run is bound to the same `stackId`.
- `stack.explore.list` — lists provider-declared stack exploration tools with JSON Schemas derived from Zod input/output schemas.
- `stack.explore.run` — runs one provider-declared stack exploration tool against one explicit `stackId`; optional `runId` captures artifacts only when the run is bound to the same `stackId`.
- `stack.stop` — stops one explicit Stack Instance.
- `run.reseed` — cleans journey-owned resources, then applies Environment Seed.

There are no native `stack.services`, `stack.health`, or `stack.env` tools in v1. Service and health data live in `stack.status`; provider-specific config or database/queue/cache inspection belongs in `stack.explore.*`.

Provider-declared stack exploration tools must declare `id`, `title`, `description`, `availableIn`, `risk`, Zod `input`, Zod `output`, and a handler. `agent-e2e verify` can use only Verify Observation Tools: `availableIn` includes `verify` and `risk` is `none`.

### Run lifecycle

- `run.begin` — creates or resumes a proof workspace, requires `stackId` when a stack provider exists, rejects `stackId` when no provider exists, and returns the run's Stack Binding.
- `run.teardown` — deletes journey-owned resources and may close an MCP-owned browser session.

### Browser session and forensics

- `browser.open` — opens an MCP-owned headed browser and returns `browserSessionId`.
- `browser.sessions` — lists open sessions.
- `browser.snapshot` — primary forensics packet: URL, title, semantic tree, interactive refs, visible errors, artifacts, and next actions. Snapshot refs use `@eN`.
- `browser.find` — resolves semantic locators into reusable refs without acting. Find refs use `@fN`.
- `browser.act` — performs one UI action using a current ref or CSS selector. It does not capture screenshots automatically.
- `browser.wait` — waits for an explicit ref, selector, text, URL, load-state, or page-function condition and reports elapsed timeout feedback.
- `browser.get` — reads one targeted value: text, HTML, value, attribute, title, URL, or count.
- `browser.eval` — runs an async page-context function body with JSON input and JSON-serializable output.
- `browser.playwright` — runs an async Playwright-context function body against the live MCP-owned page/browser and optional refs.
- `browser.console` — reads per-session console signals with cursor-based incremental filtering.
- `browser.network` — reads per-session network request, response, and failed-request signals.
- `browser.screenshot` — captures an explicit named screenshot artifact.
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

Phase 0/1 tests should assert tool names, required inputs, default headed dev mode, no caller-injected Playwright objects, artifact refs, explicit screenshot capture, automatic snapshot artifacts, and consistent feedback envelope fields: `status`, `summary`, `artifacts`, `warnings`, `errors`, and `next.actions`.
