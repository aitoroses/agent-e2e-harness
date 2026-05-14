---
name: agent-e2e-harness
description: "Install and adopt Agent E2E Harness in an application: add the package and npx skills setup, create agent-e2e.config.ts, define seeded journeys, wire stack and cleanup resources, run agent-e2e dev with standard MCP clients, build proof loops from artifacts, and run agent-e2e verify in CI."
---

# Agent E2E Harness

Use this skill to help agents install, set up, build journeys for, operate, and verify an application with Agent E2E Harness.

The target outcome is not a hand-written Playwright test. The target outcome is an application that exposes a standard MCP development surface with `agent-e2e dev`, lets an agent prove one real user flow from seeded state, cleans owned resources, time-travels through artifacts, and verifies the configured journey suite in CI with `agent-e2e verify`.

Mental model:

- `agent-e2e dev` starts the agent's Exploration Surface: a local Streamable HTTP MCP server at `http://127.0.0.1:3766/mcp` by default.
- The agent explores the live system through MCP tools, learns the stable path, and crystallizes that trajectory into an Executable Journey.
- `agent-e2e verify` runs the crystallized journey suite. It is not a general exploration shell; it can use only verify-safe observation tools.

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
stack.status
stack.stop
stack.logs
stack.explore.list
stack.explore.run
```

`stack.status` is the unified stack-state packet. It should include services with stable ids, endpoints, checks, warnings, errors, artifacts, and next actions. Do not invent native `stack.services`, `stack.health`, or `stack.env` tools for v1.

`stack.logs` is live exploration. It requires an active stack, one `serviceId`, a required `tail`, and optional `stream: "stdout" | "stderr" | "combined"`.

Provider-declared `stack.explore.*` tools must have:

- `id`, preferably dotted, such as `postgres.schema`, `postgres.query`, or `notes.list`
- `title` and `description`
- `availableIn: ["dev"]` or `["dev", "verify"]`
- `risk: "none" | "local-mutation" | "destructive" | "external-side-effect"`
- mandatory Zod `input` and `output` schemas
- a handler that receives `{ input, handle }`, where `handle` is the active stack handle returned by `start`

Only Verify Observation Tools can be used from journey execution during `agent-e2e verify`: `availableIn` includes `verify` and `risk` is exactly `none`. Dev-only tools must not fake product-visible behavior in CI. Mutations must come through the app path, seed, journey steps, reseed, or cleanup.

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
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.start --args '{}' --output json --timeout 120000
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.status --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.logs --args '{"serviceId":"<service-id>","tail":80,"stream":"combined"}' --output json
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool stack.explore.run --args '{"toolId":"notes.list","input":{"limit":10}}' --output json
```

Before claiming adoption works, prove:

- provider tools are discoverable through `stack.explore.list`
- Dev MCP can run a provider tool through `stack.explore.run`
- the journey uses `execution.stack.explore.run(...)` for at least one verify-safe observation when useful
- dev-only tools are absent or rejected in verify
- `agent-e2e verify` passes and writes a suite report

## Done Means

- The app has `@agent-e2e/harness` installed and scripts for `agent-e2e dev` and `agent-e2e verify`.
- `agent-e2e.config.ts` loads journeys, stack provider, resources, and verify defaults.
- At least one journey proves a real app behavior from seed.
- The MCP loop can start the stack, begin a run, open/snapshot/act in a browser, run a journey step or phase, read artifacts, cleanup/reseed, close the browser, and stop the stack.
- Stack exploration is proven: `stack.status`, `stack.logs`, `stack.explore.list`, and at least one `stack.explore.run` call work against concrete app tools.
- `agent-e2e verify` runs from config and writes suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- Final evidence includes commands run, MCP URL, selected journey/profile, artifact paths, cleanup result, stack stop result, and CI/verify status.
