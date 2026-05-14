# Repository organization notes

This repo is both a reusable library and a dogfood showcase. The organization rule is: framework mechanics live in `packages/harness`; product-specific demo code lives in `apps/showcase`; repeatable agent workflow guidance lives in `skills/` and is installed into agent-specific directories.

## Standard layout

- `packages/harness/src/core` — generic contracts only. No Playwright, MCP transport, consumer infrastructure, app, React, or DB imports.
- `packages/harness/src/mcp` — protocol-neutral harness control surface and artifact orchestration. It may record generic artifacts from injected execution surfaces, but must not import Playwright or MCP HTTP transport.
- `packages/harness/src/dev-mcp` — local HTTP MCP tool grammar/router/server.
- `packages/harness/src/playwright-mcp` — MCP-owned Playwright browser sessions and forensics.
- `packages/harness/src/stack` — generic managed-stack contracts/process provider.
- `packages/harness/src/artifacts` — reusable `.agents-e2e/artifacts` recorder/reader.
- `packages/harness/test` — harness package tests only; no imports from `apps/showcase`.
- `packages/harness/test-d` — public type fixtures for exported harness subpaths.
- `apps/showcase` — the Proof Notes consumer app. App code lives under `app/` and `src/`; showcase tests live under `apps/showcase/test/`, not inside the harness package.
- `skills/agent-e2e-harness` — consumer workflow skill created with `npx skills init`.
- `.codex/` and `.agents/` — local agent install/state directories; do not version installed skill copies there.

## Generated/local-only paths

- `.agents-e2e/` and `apps/*/.agents-e2e/` are generated proof/debug artifacts and ignored.
- `.scratch/` is not a primary proof path. Do not add new workflow scripts or evidence there.
- `apps/showcase/.next/` and `packages/*/dist/` are build outputs and ignored.

## Current accepted compromise

`apps/showcase/agent-e2e.config.ts` is the conventional showcase integration point for journeys, resource adapters, and the stack provider. `npm run dev:mcp` delegates to `agent-e2e dev`, so the showcase does not maintain a separate TypeScript entrypoint, compile/watch bridge, or generated Node runtime. Showcase-specific stack/journey composition and its PostgreSQL Testcontainers provider live under `apps/showcase/src/harness/`; reusable lifecycle mechanics must remain in `@agent-e2e/harness`. Dev MCP uses the stable default URL `http://127.0.0.1:3766/mcp`; app URLs remain stack-owned service data returned by `stack.start` / `stack.status`.

Shared showcase ids, seed constants, proof note body, schema SQL, URLs, and resource-adapter behavior live in `apps/showcase/src/proof-notes-contract.ts` so the typed Playwright journey, MCP journey, app routes, and stack provider do not drift.
