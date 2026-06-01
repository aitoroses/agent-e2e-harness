---
name: agent-e2e-harness
description: "Install and adopt Agent E2E Harness in an application: add the package and npx skills setup, create agent-e2e.config.ts, define seeded journeys, wire stack and cleanup resources, run agent-e2e dev with standard MCP clients, build proof loops from artifacts, and run agent-e2e verify in CI."
---

# Agent E2E Harness

Use this skill to help agents install, set up, build journeys for, operate, and verify an application with Agent E2E Harness.

The target outcome is not a hand-written Playwright test or a record-and-replay transcript. The target outcome is an application that exposes a standard MCP development surface with `agent-e2e dev`, lets an agent prove one real user flow from seeded state, cleans owned resources, time-travels through artifacts, and verifies the configured journey suite in CI with `agent-e2e verify`.

Mental model:

- `agent-e2e dev` starts the agent's Exploration Surface: a local Streamable HTTP MCP server at `http://127.0.0.1:3766/mcp` by default.
- The agent explores one or more explicit Stack Instances through MCP tools, binds a run to the selected `stackId` with a Run Stack Binding, learns the stable path, and crystallizes that trajectory into an Executable Journey.
- `agent-e2e verify` runs the crystallized journey suite through worker-scoped verify Stack Instances. It is not a general exploration shell; it can use only verify-safe observation tools.

Contract model:

- **Journey** is the reviewed code contract: profiles, seed, phases, steps, proofs, owned resources, and cleanup.
- **Trajectory** is the path the agent discovers while exploring through Dev MCP. Treat it as development evidence, not as CI's source of truth.
- **Proofs** are deterministic artifacts from running the Journey from seed: observed payloads, step feedback, screenshots/snapshots, console/network signals, ownership ledgers, cleanup results, and verify suite reports.

Promote agent-discovered paths into reviewed Journey code before CI depends on them. Do not leave CI anchored to an unreviewed browser transcript, visual diff, or ad-hoc trajectory. The Journey/Profile owns the seed contract; reusable helper functions are fine, but shared mutable seed state across journeys is discouraged because it makes failures order-dependent. Prefer proof stability and structured failure artifacts over visual or trajectory diffs.

## Load References

Read only the references needed for the current task:

- `references/adoption-workflow.md` - install dependencies, add scripts, choose file layout, inspect the app, and install this skill with `npx skills`.
- `references/journey-patterns.md` - templates for journeys, typed resources, seed, stack providers, tags, profiles, and `agent-e2e.config.ts`.
- `references/dev-mcp-loop.md` - run `agent-e2e dev`, configure Codex or Claude as standard MCP clients, drive the MCP proof loop, and read artifacts.
- `references/verify-ci.md` - run `agent-e2e verify`, define suites, selectors, profiles, reporters, workers, cleanup mode, and GitHub Actions.
- `references/validation-checklist.md` - exact validation evidence required before final response.

## Operating Rules

- Treat the user's application as the source of truth. Inspect its framework, package manager, dev command, service dependencies, existing E2E setup, and one real user-visible flow before editing.
- Use public `@agent-e2e/harness` entrypoints only. Do not copy private showcase details unless the target app has the same domain.
- Use `agent-e2e dev` for development MCP. Do not expose old `agent-e2e-harness dev-mcp` instructions.
- Use `agent-e2e attached --target <id>` for Attached Runtime Mode when the target runtime is already running and externally owned.
- Use `agent-e2e verify` as the default CI path. Do not ask users to write a Playwright, Vitest, or custom wrapper unless the harness cannot express the required orchestration.
- Put app-specific domain logic in the consumer app: routes, selectors, schemas, stack commands, seed data, resource ids, and assertions.
- Keep cleanup ownership-ledger bounded. Never delete by broad prefix, tenant, timestamp, or unscoped query alone.
- Use artifacts as the debugging surface before changing code again.
- Treat stack capability as provider-owned. The harness owns routing, discovery, schemas, validation, and the small grammar; the app stack provider owns concrete runtime knowledge.
- Treat Runtime Targets as target selection, not lifecycle ownership. Attached Runtime Mode does not own infrastructure lifecycle.

## Runtime Targets and Attached Runtime Mode

Use Runtime Targets when a journey can run or collect evidence from more than one place. Use `managedRuntime(...)` for local harness-owned stacks and `attachedRuntime(...)` for staging, production, preview, Docker Compose, Kubernetes, or another already-running runtime.

The attached command is:

```sh
agent-e2e attached --target <id>
```

The attached MCP grammar is:

```text
runtime.list
runtime.status
runtime.logs
runtime.access.status
runtime.capability.list
runtime.capability.run
```

Attached Runtime Mode does not own infrastructure lifecycle. Start and stop the external runtime through product commands. `runtime.logs` requires `tail` and may accept `serviceId` plus best-effort `level`. Access Context status and Access Resolvers must not expose secret material in agent-visible responses; automatic `browser.open` authentication wiring is not part of this v1 attached runtime path unless product code supplies it.

Runtime Capabilities are product-owned and schema-declared. Risk must be one of `observation`, `runMutation`, or `runtimeMutation`. Observation runs by default. runMutation requires Journey Profile opt-in through `runtime.allowRunMutationTools`. runtimeMutation is blocked by default. `run.begin` resolves the Runtime Target from the selected Journey Profile and must not use a free `targetId` override.

## Stack Capability Surface

The fixed stack MCP grammar is:

```text
stack.start
stack.list
stack.status
stack.stop
stack.logs
stack.capability.list
stack.capability.run
```

`stack.start` returns a `stackId`; pass that id to `stack.status`, `run.begin`, `stack.logs`, `stack.capability.run`, and `stack.stop`. Use `stack.list` to recover running Stack Instances after compaction or to compare two live stacks during a multi-stack investigation. `run.begin` requires a valid `stackId` when a stack provider exists, creates the run's Run Stack Binding, and rejects `stackId` when no provider exists. `stack.status` is the unified stack-state packet. `StackStatusPacket.services` is the journey-facing runtime contract for dynamic URLs, service ids, endpoints, checks, warnings, errors, artifacts, and next actions. Do not invent native `stack.services`, `stack.health`, or `stack.env` tools for v1.

`stack.logs` is live diagnostics. It requires a `stackId`, one `serviceId`, a required `tail`, and optional `stream: "stdout" | "stderr" | "combined"`. `stack.logs` and `stack.capability.run` accept optional `runId` only to capture artifacts, and reject capture when the run is bound to a different `stackId`.

Stack providers should use **StackStartContext** and **Named Stack Allocations** as the default stack-provider pattern. In `start(ctx)`, use `ctx.stackId`, `ctx.mode`, `ctx.workerIndex`, `ctx.workerCount`, `ctx.suiteId`, and `ctx.artifactScope` to name resources. Allocate dynamic ports with `await ctx.allocatePort(name)` and stack-scoped files or directories with `ctx.allocateArtifactPath(name, { kind: "file" | "directory" })`. These allocations make parallel Dev MCP checks and worker-scoped verify reports explainable without replacing `StackStatusPacket.services` as the data journeys use.

Provider-declared `stack.capability.*` tools must have:

- `id`, preferably dotted, such as `postgres.schema`, `postgres.query`, or `notes.list`
- `title` and `description`
- `availableIn: ["dev"]` or `["dev", "verify"]`
- `risk: "none" | "local-mutation" | "destructive" | "external-side-effect"`
- mandatory Zod `input` and `output` schemas
- a handler that receives `{ input, handle }`, where `handle` is the selected Stack Instance handle returned by `start`

Only Verify Observation Tools can be used from journey execution during `agent-e2e verify`: `availableIn` includes `verify` and `risk` is exactly `none`. Dev-only tools must not fake product-visible behavior in CI. Mutations must come through the app path, seed, journey steps, reseed, or cleanup. Use `execution.stack.capability.run(...)`.

## Browser Workbench Surface

The complete frozen browser MCP grammar is:

```text
browser.open
browser.sessions
browser.inspect
browser.refs
browser.act
browser.wait
browser.eval
browser.playwright
browser.close
```

Removed tools with no aliases or compatibility names: `browser.snapshot`, `browser.find`, `browser.get`, `browser.screenshot`, `browser.console`, `browser.network`, `artifact.read`. Do not present them as available or suggest workarounds using their names.

### inspect → act loop

Use `browser.inspect` as the standard evidence path. It runs the UI forensics pass, writes `runs/<runId>/inspections/<seq>/{inspect.md,inspect.json,screenshot.png}`, captures console errors and network failures as signals, and returns a compact index: `{ status, url, title, target, artifacts, signals, refsOverlayEnabled }`. Read the written artifacts for detail; the tool response is an index, not a dump.

The standard loop is:

```text
browser.open   → navigate to the app
browser.inspect → read compact index; open inspect.md for detail; note @eN refs
browser.act    → perform one user-like action using a @eN ref or selector
browser.wait   → wait for explicit page state (ref, selector, text, URL, load state)
browser.inspect → capture post-action state
```

Use `browser.refs({ enabled: true })` optionally to toggle the live overlay that paints the referenceable nodes from the UI forensics registry. The overlay has `pointer-events:none` and never alters layout. It is captured in inspect screenshots when enabled. Disable with `browser.refs({ enabled: false })`.

`browser.act` accepts `@eN` refs from the UI forensics registry or CSS selectors. It supports click, fill, press, hover, focus, check, uncheck, select, and scroll. It does not take screenshots automatically; inspect already captures a screenshot.

Use `browser.wait` instead of sleep. Wait conditions target a ref, selector, text, URL pattern, load state, or page-context function and return `durationMs` plus `timeoutMs`.

Use `browser.eval` or `browser.playwright` only when the standard workbench tools are insufficient for the exploration step; both accept JSON `input` separately from `code`, execute an async function body, and report timeout feedback. After either runs, inspect refs may be stale — run `browser.inspect` again before ref-based actions.

### inspect target forms

- Omit `target`: inspect the current page.
- `"@<ref>"`: UI forensics mode — inspect the node at that ref.
- Any other string: treated as a selector or locator-compatible target.

### inspect signals

Console errors and network failures are captured as `signals.consoleErrors` and `signals.networkFailures` inside every `browser.inspect` result. There are no separate console or network tools.

## Agent UX Principles

These principles govern the design of MCP tools and the browser workbench surface. Follow them when proposing tool additions, evaluating whether a capability needs a dedicated tool, or documenting the harness for a new consumer.

- **Simple tools, smart agents.** Tools expose facts and perform atomic actions. Agents reason, plan, and sequence.
- **Few generic tools over many narrow wrappers.** A narrow tool that duplicates what `browser.eval` or `browser.playwright` already expresses adds cognitive surface without adding capability.
- **Tools observe facts; agents reason.** A tool should return raw evidence — a compact index, a signal count, a status — not a diagnosis or a synthesized interpretation.
- **Tool output should be a compact index, not a dump.** Inline payloads bloat the context window. Details live in artifacts; the tool response names where to find them.
- **Details live in artifacts.** `inspect.md`, `inspect.json`, `screenshot.png`, `step-report.json` are the debugging surface. Tool responses point to them.
- **Tool names should be obvious and single-purpose.** `browser.inspect` does one thing. `browser.act` does one thing. Names that describe exactly what the tool does are always preferred.
- **No legacy aliases; no compatibility names that teach two ways to do one thing.** Removed tools are gone without aliases.
- **If a capability is cleanly expressible via `browser.eval` or `browser.playwright`, do not add a narrow tool.**
- **`browser.inspect` exists because it packages a costly, repeated evidence pattern.** Running the UI forensics pass, writing artifacts, and capturing signals is a multi-step sequence agents run on every meaningful state transition.
- **`browser.refs` exists because it connects live pixels to the UI forensics ref system.** The overlay lets agents correlate what they see with the `@eN` refs they use in `browser.inspect` and `browser.act`.

## Adoption Flow

1. Read `references/adoption-workflow.md`; inspect the app and add the package/scripts/files.
2. Read `references/journey-patterns.md`; implement one thin journey for a real flow with seed, proof, and cleanup.
3. Read `references/dev-mcp-loop.md`; start `agent-e2e dev`, connect the user's agent MCP client, and drive the proof through MCP tools.
4. Iterate from artifacts until the journey passes interactively and reseed/cleanup is proven.
5. Read `references/verify-ci.md`; add `agent-e2e verify` config and CI wiring.
6. Read `references/validation-checklist.md`; run the required validations and report evidence.

## Standard MCP Validation Examples

Use a normal MCP client when already configured:

```sh
codex mcp add agent-e2e --url http://127.0.0.1:3766/mcp
claude mcp add --scope project --transport http agent-e2e http://127.0.0.1:3766/mcp
```

Use `mcporter` for fresh or remote agents without a registered MCP client:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"dev-a"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"dev-b"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.status --args '{"stackId":"<stack-id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"stackId":"<stack-id>","serviceId":"<service-id>","tail":80,"stream":"combined"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"<journey-id>","runId":"<run-id>","stackId":"<stack-id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.capability.run --args '{"stackId":"<stack-id>","toolId":"notes.list","input":{"limit":10}}' --output json
```

Before claiming adoption works, prove:

- provider tools are discoverable through `stack.capability.list`
- multi-stack Dev MCP behavior works: two Stack Instances can start, `stack.list` shows both ids, and `stack.status` targets the intended id
- Dev MCP can run a provider tool through `stack.capability.run`
- the journey uses `execution.stack.capability.run(...)` for at least one verify-safe observation when useful
- dev-only tools are absent or rejected in verify
- worker-scoped verify evidence exists: `agent-e2e verify --workers 2` passes when the app supports it, reports `worker-0`/`worker-1` or the lazy subset of selected runs, records run `stackId`, and includes Named Stack Allocations
- `agent-e2e verify` passes and writes a suite report

## Done Means

- The app has `@agent-e2e/harness` installed and scripts for `agent-e2e dev` and `agent-e2e verify`.
- `agent-e2e.config.ts` loads journeys, stack provider, resources, and verify defaults.
- At least one journey proves a real app behavior from seed.
- The MCP loop can start the stack, begin a run, open/inspect/refs/act/wait in a browser, read inspect signals and artifact files, run a journey step or phase, read step-report artifacts, cleanup/reseed, close the browser, and stop the stack.
- Stack capability surface is proven: `stack.status`, `stack.logs`, `stack.capability.list`, and at least one `stack.capability.run` call work against concrete app tools.
- `agent-e2e verify` runs from config and writes suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- Final evidence includes commands run, MCP URL, selected journey/profile, artifact paths, cleanup result, stack stop result, and CI/verify status.
