# Export and Dependency Matrix

This matrix is the Phase 0 contract gate for the Dev MCP / Proof Notes milestone.

## Packaging decision

Use **P3 hybrid** for this milestone: keep one `@agent-e2e/harness` package with strict subpath isolation for reusable harness mechanics, and keep product infrastructure providers in the consumer app unless they become generic enough for a later split package.

Rejected alternatives:

- **P1: single package with hard adapter dependencies** — rejected because MCP SDK, Testcontainers, DB clients, or browser-specific install pressure would leak into core and generic MCP consumers.
- **P2: split all adapter packages immediately** — rejected for now because it adds packaging overhead before the Proof Notes workflow proves the API shape. It remains the fallback when an adapter cannot avoid hard package-level dependencies.

## Subpath contract

| Export | Purpose | May import | Must not import | Dependency rule |
| --- | --- | --- | --- | --- |
| `@agent-e2e/harness/core` | Generic harness contracts, journeys, seed, feedback, closure, ownership, resource/reseed semantics | TypeScript/Node-free generic utilities | Playwright, MCP SDK/transports, consumer infrastructure, Next/React/showcase app, DB clients | No adapter dependencies. |
| `@agent-e2e/harness` | Default Playwright-specialized ergonomics | Core, Playwright types | MCP SDK/transports, consumer infrastructure, showcase app | Playwright peer may remain because package root is the default Playwright surface. |
| `@agent-e2e/harness/mcp` | Execution-neutral in-process control surface, artifact recording, and protocol-neutral tool contracts | Core, artifacts | Playwright, HTTP MCP SDK/transports, consumer infrastructure, Next/React/showcase app | May record artifacts from injected execution surfaces; must not own concrete browser sessions or protocol transports. |
| `@agent-e2e/harness/stack` | Generic managed stack contracts outside core | Generic types | Testcontainers, DB clients, Next/React/showcase app, Playwright, MCP transports | No provider-specific dependencies. |
| `@agent-e2e/harness/dev-mcp` | HTTP Dev MCP server contracts, convention-based local-dev server entrypoints, and default adapter composition | Stack contracts, protocol-neutral MCP contracts, optional dynamic import of internal Playwright MCP adapter | Direct Playwright package imports, consumer infrastructure, Next/React/showcase app, DB clients | MCP SDK and browser adapter dependencies must stay optional/dynamic; no product provider belongs here. |
| `@agent-e2e/harness/playwright-mcp` | Playwright-backed MCP browser/session tool handlers | Core, stack/dev-mcp contracts, Playwright via adapter boundary | consumer infrastructure, showcase app | Playwright peer + dynamic import for runtime handlers where needed. |
| `@agent-e2e/harness/cli` | Reference CLI | Public package surfaces | No direct core contamination with adapter-only dependencies | CLI may dynamically import adapter entrypoints selected by command. |

Showcase-specific infrastructure, including its PostgreSQL Testcontainers provider, lives under `apps/showcase/src/harness/` and is not exported by `@agent-e2e/harness`.

## Hard dependency rule

Under P3, adapter-only packages are **not allowed** as hard package-level dependencies. For reusable package surfaces, use:

1. `peerDependencies` plus `peerDependenciesMeta.optional`, and
2. dynamic imports inside adapter functions, and
3. public type fixtures proving unrelated subpaths compile without adapter ambient types.

If a selected adapter cannot work with optional peer + dynamic import isolation, split that adapter into a separate workspace package before implementation. Do not add product/demo infrastructure providers to the main harness package.

## Boundary enforcement

Phase 0 must enforce two static boundaries:

1. `packages/harness/src/core/**` rejects Playwright, MCP SDK/transports, consumer infrastructure, Next/React/showcase app, and selected DB clients.
2. `packages/harness/src/mcp/**` may import `artifacts`, but rejects Playwright, HTTP MCP SDK/transports, consumer infrastructure, Next/React/showcase app, and selected DB clients.

Public type fixtures under `packages/harness/test-d/` must cover every exported subpath.
