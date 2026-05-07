# Agent E2E Harness

Reusable TypeScript harness for agent-built development proofs that can crystallize into deterministic CI E2E tests.

## Issue #2 scaffold commands

```sh
npm install
npm run typecheck
npm run build
npm test
npm run check:core-boundary
npm run check
```

The package scaffold exposes:

- `@agent-e2e/harness` — package-root placeholder for the future Playwright-specialized Default Harness API.
- `@agent-e2e/harness/core` — generic Harness Core placeholder that must stay Playwright/MCP-free.

Examples and demo apps belong under `examples/` and should consume public package entrypoints, not package source internals.
