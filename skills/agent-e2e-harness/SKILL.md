---
name: agent-e2e-harness
description: "Install and adopt Agent E2E Harness in an application: add the package and npx skills setup, create agent-e2e.config.ts, define seeded journeys, wire stack and cleanup resources, run agent-e2e dev with standard MCP clients, build proof loops from artifacts, and run agent-e2e verify in CI."
---

# Agent E2E Harness

Use this skill to help agents install, set up, build journeys for, operate, and verify an application with Agent E2E Harness.

The target outcome is not a hand-written Playwright test. The target outcome is an application that exposes a standard MCP development surface with `agent-e2e dev`, lets an agent prove one real user flow from seeded state, cleans owned resources, time-travels through artifacts, and verifies the configured journey suite in CI with `agent-e2e verify`.

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

## Adoption Flow

1. Read `references/adoption-workflow.md`; inspect the app and add the package/scripts/files.
2. Read `references/journey-patterns.md`; implement one thin journey for a real flow with seed, proof, and cleanup.
3. Read `references/dev-mcp-loop.md`; start `agent-e2e dev`, connect the user's agent MCP client, and drive the proof through MCP tools.
4. Iterate from artifacts until the journey passes interactively and reseed/cleanup is proven.
5. Read `references/verify-ci.md`; add `agent-e2e verify` config and CI wiring.
6. Read `references/validation-checklist.md`; run the required validations and report evidence.

## Done Means

- The app has `@agent-e2e/harness` installed and scripts for `agent-e2e dev` and `agent-e2e verify`.
- `agent-e2e.config.ts` loads journeys, stack provider, resources, and verify defaults.
- At least one journey proves a real app behavior from seed.
- The MCP loop can start the stack, begin a run, open/snapshot/act in a browser, run a journey step or phase, read artifacts, cleanup/reseed, close the browser, and stop the stack.
- `agent-e2e verify` runs from config and writes suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- Final evidence includes commands run, MCP URL, selected journey/profile, artifact paths, cleanup result, stack stop result, and CI/verify status.
