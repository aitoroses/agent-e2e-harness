---
name: agent-e2e-harness
description: "Install and adopt Agent E2E Harness in an application: add the package and npx skills setup, create agent-e2e.config.ts, define seeded journeys, wire stack and cleanup resources, run agent-e2e dev with standard MCP clients, build proof loops from artifacts, and run agent-e2e verify in CI."
---

# Agent E2E Harness

Use this skill to help agents install, set up, build journeys for, operate, and verify an application with Agent E2E Harness.

The target outcome is not a hand-written Playwright test. The target outcome is an application that exposes a standard MCP development surface with `agent-e2e dev`, lets an agent prove one real user flow from seeded state, cleans owned resources, time-travels through artifacts, and verifies the configured journey suite in CI with `agent-e2e verify`.

Mental model:

- `agent-e2e dev` starts the agent's Exploration Surface: a local Streamable HTTP MCP server at `http://127.0.0.1:3766/mcp` by default.
- The agent explores one or more explicit Stack Instances through MCP tools, binds a run to the selected `stackId` with a Run Stack Binding, learns the stable path, and crystallizes that trajectory into an Executable Journey.
- `agent-e2e verify` runs the crystallized journey suite through worker-scoped verify Stack Instances. It is not a general exploration shell; it can use only verify-safe observation tools.

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
- Use `agent-e2e verify` as the default CI path. Do not ask users to write a Playwright, Vitest, or custom wrapper unless the harness cannot express the required orchestration.
- Put app-specific domain logic in the consumer app: routes, selectors, schemas, stack commands, seed data, resource ids, and assertions.
- Keep cleanup ownership-ledger bounded. Never delete by broad prefix, tenant, timestamp, or unscoped query alone.
- Use artifacts as the debugging surface before changing code again.
- Treat stack exploration as provider-owned. The harness owns routing, discovery, schemas, validation, and the small grammar; the app stack provider owns concrete runtime knowledge.

## Stack Exploration Surface

The fixed stack MCP grammar is:

```text
stack.start
stack.list
stack.status
stack.stop
stack.logs
stack.explore.list
stack.explore.run
```

`stack.start` returns a `stackId`; pass that id to `stack.status`, `run.begin`, `stack.logs`, `stack.explore.run`, and `stack.stop`. Use `stack.list` to recover running Stack Instances after compaction or to compare two live stacks during a multi-stack investigation. `run.begin` requires a valid `stackId` when a stack provider exists, creates the run's Run Stack Binding, and rejects `stackId` when no provider exists. `stack.status` is the unified stack-state packet. `StackStatusPacket.services` is the journey-facing runtime contract for dynamic URLs, service ids, endpoints, checks, warnings, errors, artifacts, and next actions. Do not invent native `stack.services`, `stack.health`, or `stack.env` tools for v1.

`stack.logs` is live exploration. It requires a `stackId`, one `serviceId`, a required `tail`, and optional `stream: "stdout" | "stderr" | "combined"`. `stack.logs` and `stack.explore.run` accept optional `runId` only to capture artifacts, and reject capture when the run is bound to a different `stackId`.

Stack providers should use **StackStartContext** and **Named Stack Allocations** as the default stack-provider pattern. In `start(ctx)`, use `ctx.stackId`, `ctx.mode`, `ctx.workerIndex`, `ctx.workerCount`, `ctx.suiteId`, and `ctx.artifactScope` to name resources. Allocate dynamic ports with `await ctx.allocatePort(name)` and stack-scoped files or directories with `ctx.allocateArtifactPath(name, { kind: "file" | "directory" })`. These allocations make parallel Dev MCP checks and worker-scoped verify reports explainable without replacing `StackStatusPacket.services` as the data journeys use.

Provider-declared `stack.explore.*` tools must have:

- `id`, preferably dotted, such as `postgres.schema`, `postgres.query`, or `notes.list`
- `title` and `description`
- `availableIn: ["dev"]` or `["dev", "verify"]`
- `risk: "none" | "local-mutation" | "destructive" | "external-side-effect"`
- mandatory Zod `input` and `output` schemas
- a handler that receives `{ input, handle }`, where `handle` is the selected Stack Instance handle returned by `start`

Only Verify Observation Tools can be used from journey execution during `agent-e2e verify`: `availableIn` includes `verify` and `risk` is exactly `none`. Dev-only tools must not fake product-visible behavior in CI. Mutations must come through the app path, seed, journey steps, reseed, or cleanup.

## Browser Workbench Surface

The fixed browser MCP grammar is:

```text
browser.open
browser.sessions
browser.snapshot
browser.find
browser.act
browser.wait
browser.get
browser.eval
browser.playwright
browser.console
browser.network
browser.screenshot
browser.close
```

Use `browser.snapshot` first to read visible state and receive `@eN` refs. Use `browser.find` when a semantic locator is clearer than a snapshot ref; it returns `@fN` refs for role, text, label, placeholder, test id, or selector queries.

Use `browser.act` for one UI mutation at a time. It accepts refs or CSS selectors and supports click, fill, press, hover, focus, check, uncheck, select, and scroll. It does not take screenshots automatically; call `browser.screenshot` explicitly when visual evidence is useful.

Use `browser.wait` instead of sleep. Wait conditions can target a ref, selector, text, URL pattern, load state, or page-context function and return `durationMs` plus `timeoutMs`.

Use `browser.get` for targeted reads. Use `browser.console` and `browser.network` for cursor-based signal buffers. Use `browser.eval` or `browser.playwright` only when the standard workbench tools are too small for the exploration step; both require JSON input/output and report timeout feedback.

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
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"dev-a"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{"stackId":"dev-b"}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.list --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.status --args '{"stackId":"<stack-id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"stackId":"<stack-id>","serviceId":"<service-id>","tail":80,"stream":"combined"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool run.begin --args '{"journeyId":"<journey-id>","runId":"<run-id>","stackId":"<stack-id>"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.run --args '{"stackId":"<stack-id>","toolId":"notes.list","input":{"limit":10}}' --output json
```

Before claiming adoption works, prove:

- provider tools are discoverable through `stack.explore.list`
- multi-stack Dev MCP behavior works: two Stack Instances can start, `stack.list` shows both ids, and `stack.status` targets the intended id
- Dev MCP can run a provider tool through `stack.explore.run`
- the journey uses `execution.stack.explore.run(...)` for at least one verify-safe observation when useful
- dev-only tools are absent or rejected in verify
- worker-scoped verify evidence exists: `agent-e2e verify --workers 2` passes when the app supports it, reports `worker-0`/`worker-1` or the lazy subset of selected runs, records run `stackId`, and includes Named Stack Allocations
- `agent-e2e verify` passes and writes a suite report

## Done Means

- The app has `@agent-e2e/harness` installed and scripts for `agent-e2e dev` and `agent-e2e verify`.
- `agent-e2e.config.ts` loads journeys, stack provider, resources, and verify defaults.
- At least one journey proves a real app behavior from seed.
- The MCP loop can start the stack, begin a run, open/snapshot/find/act/wait/get in a browser, inspect console/network signals when useful, run a journey step or phase, read artifacts, cleanup/reseed, close the browser, and stop the stack.
- Stack exploration is proven: `stack.status`, `stack.logs`, `stack.explore.list`, and at least one `stack.explore.run` call work against concrete app tools.
- `agent-e2e verify` runs from config and writes suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- Final evidence includes commands run, MCP URL, selected journey/profile, artifact paths, cleanup result, stack stop result, and CI/verify status.
