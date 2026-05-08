# Export and Dependency Matrix

This matrix is the Phase 0 contract gate for the Dev MCP / Proof Notes milestone.

## Packaging decision

Use **P3 hybrid** for this milestone: keep one `@agent-e2e/harness` package with strict subpath isolation now, and split adapters into separate packages later if optional peer + dynamic import boundaries cannot preserve isolation.

Rejected alternatives:

- **P1: single package with hard adapter dependencies** — rejected because MCP SDK, Testcontainers, or browser-specific install pressure would leak into core and generic MCP consumers.
- **P2: split all adapter packages immediately** — rejected for now because it adds packaging overhead before the Proof Notes workflow proves the API shape. It remains the fallback when an adapter cannot avoid hard package-level dependencies.

## Subpath contract

| Export | Purpose | May import | Must not import | Dependency rule |
| --- | --- | --- | --- | --- |
| `@agent-e2e/harness/core` | Generic harness contracts, journeys, seed, feedback, closure, ownership, resource/reseed semantics | TypeScript/Node-free generic utilities | Playwright, MCP SDK/transports, Testcontainers, Next/React/showcase app, DB clients | No adapter dependencies. |
| `@agent-e2e/harness` | Default Playwright-specialized ergonomics | Core, Playwright types | MCP SDK/transports, Testcontainers, showcase app | Playwright peer may remain because package root is the default Playwright surface. |
| `@agent-e2e/harness/mcp` | Execution-neutral in-process compatibility seam and protocol-neutral tool contracts | Core | Playwright, HTTP MCP SDK/transports, Testcontainers, Next/React/showcase app | No browser/protocol runtime dependency. |
| `@agent-e2e/harness/stack` | Generic managed stack contracts outside core | Generic types | Testcontainers, Next/React/showcase app, Playwright, MCP transports | No provider-specific dependencies. |
| `@agent-e2e/harness/dev-mcp` | HTTP Dev MCP server contracts and local-dev server entrypoints | Stack contracts, protocol-neutral MCP contracts | Core-forbidden deps inside core; hard package-level MCP SDK dependency | MCP SDK must be optional peer + dynamic import, or this subpath moves to split package first. |
| `@agent-e2e/harness/playwright-mcp` | Playwright-backed MCP browser/session tool handlers | Core, stack/dev-mcp contracts, Playwright via adapter boundary | Testcontainers, showcase app | Playwright peer + dynamic import for runtime handlers where needed. |
| `@agent-e2e/harness/testcontainers` | Public reference stack provider API | Stack contracts, Testcontainers via adapter boundary | Core, mcp-neutral path, showcase app | Testcontainers packages must be optional peers + dynamic imports, or this subpath moves to split package first. |
| `@agent-e2e/harness/cli` | Reference CLI | Public package surfaces | No direct core contamination with adapter-only dependencies | CLI may dynamically import adapter entrypoints selected by command. |

## Hard dependency rule

Under P3, adapter-only packages are **not allowed** as hard package-level dependencies. Use:

1. `peerDependencies` plus `peerDependenciesMeta.optional`, and
2. dynamic imports inside adapter functions, and
3. public type fixtures proving unrelated subpaths compile without adapter ambient types.

If a selected MCP or Testcontainers API cannot work with optional peer + dynamic import isolation, split that adapter into a separate workspace package before implementation.

## Boundary enforcement

Phase 0 must enforce two static boundaries:

1. `packages/harness/src/core/**` rejects Playwright, MCP SDK/transports, Testcontainers, Next/React/showcase app, and selected DB clients.
2. `packages/harness/src/mcp/**` rejects Playwright, HTTP MCP SDK/transports, Testcontainers, Next/React/showcase app, and selected DB clients.

Public type fixtures under `packages/harness/test-d/` must cover every exported subpath.
