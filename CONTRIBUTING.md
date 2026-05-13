# Contributing to Agent E2E Harness

Agent E2E Harness is a library-first toolkit for agent-built development. Contributions should preserve the core promise: agents prove product behavior through public harness entrypoints, seeded Executable Journeys, MCP-callable controls, browser/API evidence, artifact capture, and ownership-bounded cleanup.

## Start with the Agent Contract

This repository is designed for agent contributors as well as human contributors. Before making changes, read [AGENTS.md](AGENTS.md). It is the repo operating contract and defines the proof standard for showcase-facing work, the public command path expectation, artifact layout, and triage vocabulary.

The short version:

- Treat `apps/showcase` as the canonical consumer app.
- Prove behavior the way a library user would use it, through documented commands and public harness exports.
- Keep disposable investigation out of the primary proof path.
- Do not claim browser-facing work is done while the app shows runtime errors.

## Filing Issues

Use GitHub Issues for bugs, feature requests, and questions.

Good issues include:

- The harness surface involved, such as `@agent-e2e/harness/core`, `dev-mcp`, `playwright-mcp`, `stack`, or `artifacts`.
- The user-visible workflow or Executable Journey affected.
- The exact command or MCP tool path used.
- Expected proof behavior and actual behavior.
- Artifact refs, snapshots, screenshots, logs, or run ids when available.

New issues start with the `needs-triage` label. Maintainers may move them through the repo's five-label vocabulary:

- `needs-triage`: maintainer needs to evaluate the issue.
- `needs-info`: reporter input is needed before work can continue.
- `ready-for-agent`: fully specified and ready for an AFK agent.
- `ready-for-human`: requires human implementation or judgment.
- `wontfix`: will not be actioned.

## Development Setup

This repo is an npm workspace:

- `packages/*` contains reusable library packages.
- `apps/*` contains consumer apps, including `apps/showcase`.
- The root package is private and owns shared scripts.
- Node `>=22.0.0` and Bun `>=1.3.0` are expected. npm manages the workspace install; Bun is required by the Dev MCP runtime.

Install dependencies from the repo root:

```sh
npm install
```

Useful commands:

```sh
npm run typecheck
npm run build
npm test
npm run check
```

Targeted commands:

```sh
npm test --workspace @agent-e2e/harness
npm run test --workspace @agent-e2e/showcase
npm run build --workspace @agent-e2e/showcase
npm run dev:mcp --workspace @agent-e2e/showcase
```

`npm run check` is the broad local gate. For focused changes, run the smallest targeted test that proves the claim first, then the broader check when the change affects shared behavior, exports, the showcase, or the public proof path.

## Proposing Changes

Keep changes small and reviewable. Prefer existing harness vocabulary and existing extension points over new abstractions.

For API or behavior changes:

- Explain the user story or agent workflow being improved.
- Identify the public package surface affected.
- Include tests for the changed contract.
- Update README, package docs, or showcase docs when user-facing behavior changes.
- Keep the showcase on public harness entrypoints rather than private imports.

For showcase-facing changes, the minimum proof is the same standard in [AGENTS.md](AGENTS.md): documented command path works, MCP tools can be discovered or called, Playwright-owned browser proof has no visible runtime errors, screenshots/snapshots support the claimed state, and targeted harness/showcase tests pass.

## Pull Request Expectations

Before opening a PR, include:

- A concise summary of what changed and why.
- The tests or checks you ran.
- Any known gaps, especially when local infrastructure, browser proof, or MCP smoke validation could not run.
- Links to relevant issues or PRDs when available.

Do not include generated proof artifacts unless they are intentionally documented transcripts or fixtures. Runtime proof/debug evidence belongs under `.agents-e2e/artifacts/<journey>/<run>/` during validation and is normally not committed.
