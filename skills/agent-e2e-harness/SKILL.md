---
name: agent-e2e-harness
description: "Instrument an application with the Agent E2E Harness: install the dependency, expose a hot-reload Dev MCP server, define seeded journeys, drive browser/API proof loops, time-travel with artifacts, clean owned resources, and crystallize the proof into CI."
---

# Agent E2E Harness

Use this skill when a user wants an app instrumented with Agent E2E Harness, asks to add journey-based E2E proof, dogfood the harness, or turn an interactive agent proof into CI.

The goal is not "write a Playwright test." The goal is: give agents a public MCP control surface for iterative development, seeded state, headed browser/API evidence, artifact time travel, owned-resource cleanup, reseed, and a closure test that can run in CI.

## First Decision

Assume the user's application is the source of truth. Before editing, inspect:

- framework and package manager
- existing dev command and test runner
- database, queues, containers, or other required services
- existing Playwright, MCP, or E2E setup
- one user-visible flow worth proving first

Build the harness integration in that app using public `@agent-e2e/harness` entrypoints. If you are using this repository for reference, treat `apps/showcase` as an example only. Do not copy its exact journey ids, UI text, resource names, ports, or app-specific proof-note semantics unless the user's app really has that domain.

## Adoption Target

By the end, the app should have:

- A package dependency on `@agent-e2e/harness` and any needed optional runtime deps such as Playwright or a stack provider.
- A public dev command, usually `npm run dev:mcp`, that starts a hot-reload Dev MCP server and writes a manifest containing `mcpUrl` and app/runtime URLs.
- At least one executable journey that proves a real user-visible behavior from seeded state.
- A seed that prepares prerequisites without pre-creating the behavior under proof.
- A stack provider that starts and stops required local services and app processes.
- Resource adapters or a typed resource registry for every resource the journey may create and later delete.
- Artifact recording under `.agents-e2e/artifacts/<journey>/<run>/`.
- A closure/CI test that reruns the journey from clean seed without agent intervention.

## Development Loop

Use a tracer-bullet loop. One thin vertical proof is better than a broad incomplete harness.

1. Pick one user-real path and write it as a short textual journey: seed state, browser/API action, expected proof, resources created, cleanup rule.
2. Add the minimal stack provider needed to start the app and dependencies through the harness.
3. Add the minimal seed and resource adapter. Cleanup must only delete resources recorded in the run ownership ledger.
4. Add a Dev MCP entrypoint that composes stack, journeys, browser sessions, and artifacts, then writes `.agents-e2e/dev-mcp.json`.
5. Start the Dev MCP server with the app's public command. It should keep running while code and journey files change so the agent can iterate without restarting hidden scratch scripts.
6. Configure the agent's normal MCP client with the `mcpUrl` from the manifest as a Streamable HTTP MCP server.
7. Drive the proof through MCP tools: `stack.start`, `run.begin`, `browser.open`, `browser.snapshot`, `browser.act`, `journey.step` or `journey.phase`, `artifact.read`, `cleanup.plan`, `run.reseed`, `browser.close`, `stack.stop`.
8. Use artifacts for time travel: inspect `seed-manifest.json`, snapshots, screenshots, console/network logs, `result.json`, `step-feedback.json`, cleanup, timeline, and metrics before changing code again.
9. When the interactive loop passes, crystallize it into a normal test command that runs from clean seed in CI.

## Dev MCP Shape

Prefer an app-owned command like:

```sh
npm run dev:mcp
cat .agents-e2e/dev-mcp.json
```

The command should:

- Build or resolve the harness package if needed.
- Allocate non-conflicting local ports unless the user explicitly sets fixed ports.
- Start a local HTTP MCP endpoint for development.
- Start no hidden long-lived process outside the documented command.
- Write a manifest with at least `mcpUrl`, and usually `appUrl` or equivalent target URLs.
- Keep journeys and app integration code easy to reload during agent iteration.
- Shut down cleanly on `SIGINT`/`SIGTERM`; the proof loop should still call `stack.stop` for managed app infrastructure.

Do not substitute private scripts, direct function calls, or raw Playwright snippets as the final proof for an MCP workflow. Those are acceptable only as lower-level debugging and must be labeled as such.

## Minimal File Pattern

Adapt to the user's stack, but keep the boundaries clear:

```text
<app>/
  scripts/dev-mcp.ts               # public entrypoint, compiled or run by the app's chosen TS runtime
  src/e2e-harness/
    journey.ts                     # executable journeys
    seed.ts                        # environment seed
    stack.ts                       # app/service lifecycle
    resources.ts                   # owned resource adapters/registry
    dev-mcp.ts                     # composition used by scripts/dev-mcp
  test/
    agent-e2e.test.ts              # closure/CI crystallization
```

Reusable lifecycle mechanics belong in `@agent-e2e/harness`; app-specific ids, routes, schemas, and domain assertions belong in the app integration code.

## MCP Proof Checklist

The exact tool names may evolve, but the proof must establish these facts:

- Tool discovery works against the local Dev MCP endpoint.
- `stack.start` returns every required service as `ready`.
- `run.begin` returns seed `status: "ready"` and `canRunSteps: true`.
- `browser.open` returns an MCP-owned browser session. Use headed mode for interactive dev proof unless the user asks for headless.
- `browser.snapshot` shows the expected app state and no visible runtime errors.
- `browser.act` performs a user-visible action using a fresh snapshot ref, not a hardcoded stale ref.
- `journey.step` or `journey.phase` returns `status: "passed"` and records owned resources created by the journey.
- `artifact.read` can read the returned `step_feedback_artifact.path` or equivalent primary artifact ref.
- `cleanup.plan` includes only resources owned by the current run.
- `run.reseed` deletes planned owned resources and returns seed ready again.
- `browser.close` closes MCP-owned browser state.
- `stack.stop` stops app processes, containers, databases, and other managed services.

Consumer adoption should use the agent's MCP client, not a repo-specific CLI. A typical MCP client config is:

```json
{
  "mcpServers": {
    "agent-e2e": {
      "url": "http://127.0.0.1:<port>/mcp"
    }
  }
}
```

For maintainers developing this harness repository, `mcporter` can still be used as a low-level MCP server smoke-test tool. Do not require it in consumer app instructions.

## Artifact Contract

Generated proof/debug artifacts are part of the validation result, not temporary scratch output. Default to:

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

Do not put primary proof evidence in `.scratch`, product-specific legacy layouts, or generic `steps/` nesting. Use returned artifact refs and safe artifact reads.

## TDD And Time Travel

The intended development rhythm is:

- Write or update the textual journey intent first.
- Run the MCP loop and observe the first missing behavior or failing proof.
- Implement the smallest app/harness slice that moves that proof forward.
- Re-run from MCP without bypassing seed, stack, browser, or cleanup.
- Use artifacts to compare before/after state instead of relying on terminal scrollback.
- Once the journey passes interactively, crystallize the same behavior into a deterministic test.

Time travel means an agent can answer "what happened in that run?" from artifacts alone: seed manifest, browser snapshots, screenshots, console/network logs, step feedback, owned resources, cleanup, and metrics.

## Architecture Rules

- Core journey contracts must not import app frameworks, databases, MCP HTTP transports, Playwright browser implementations, or consumer infrastructure providers directly.
- Stack providers own infrastructure lifecycle; seed owns repeatable application state inside a ready stack.
- Seed must not create the behavior the journey is supposed to prove.
- Cleanup must be ownership-ledger bounded; never delete by broad prefix, tenant, timestamp, or ad-hoc query alone.
- Browser refs are volatile. Always act on refs from a fresh snapshot.
- Generated artifacts must be ignored by git, but meaningful proof transcripts or docs may be committed when they explain a durable workflow.

## Showcase Reference

In this repository, `apps/showcase` demonstrates the pattern with a Proof Notes app:

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
cat .agents-e2e/dev-mcp.json
```

Use it to inspect structure and expected behavior, not as a template to copy blindly. Good reference files include:

- `apps/showcase/scripts/dev-mcp.ts` for the public command shape.
- `apps/showcase/src/harness/` for app-specific Dev MCP composition.
- `apps/showcase/src/journey.ts` for a typed Playwright journey.
- `apps/showcase/test/showcase.e2e.test.ts` for crystallized closure proof.
- `packages/harness/src/dev-mcp`, `playwright-mcp`, `stack`, and `artifacts` for reusable package surfaces.

## Validation Before Final Answer

For app adoption, final evidence should include:

- Dev MCP command and manifest path.
- MCP client configured against the Dev MCP `mcpUrl`.
- Tool discovery result.
- Stack ready services.
- Seed status.
- Headed browser session id and snapshot result.
- Browser action result.
- Journey proof status and primary artifact refs.
- Cleanup/reseed deletion count.
- Stack stopped status.
- CI/closure command added or the explicit gap if not yet crystallized.
