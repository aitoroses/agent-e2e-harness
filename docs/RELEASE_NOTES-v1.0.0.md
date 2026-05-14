# @agent-e2e/harness v1.0.0

`@agent-e2e/harness` is a TypeScript harness for turning agent development proof into repeatable browser/API E2E journeys.

## Why Now

Coding agents can produce working code faster than teams can reliably inspect it. The missing layer is a deterministic proof loop: seeded state, controlled browser/API actions, durable artifacts, and cleanup boundaries that make it clear what the agent proved and what it owned. v1.0.0 freezes that public surface so projects can install the harness, expose a stable Dev MCP endpoint, and carry the same proof path from development into CI.

## Highlights

- Default Harness API specialized for Playwright-driven browser and API proof loops.
- Generic Harness Core with the Inspectable Journey Contract for describing profiles, phases, steps, proofs, and resource expectations.
- Dev MCP server with a stable Streamable HTTP endpoint and a hot-reloaded journey registry.
- Typed Resource Registry threading from `defineAgentE2EConfig`, with `defineResourceKind` and `createResourceRegistry` as the canonical resource pattern.
- Ownership Ledger plus Resource Adapters for bounded teardown of resources the harness created or verified.
- Closure Command path that consolidates a successful development proof into a CI E2E test.
- MCP-Owned Browser Sessions with Playwright-backed `browser.open`, `browser.snapshot`, `browser.act`, and `browser.screenshot` operations.
- Artifact contract under `.agents-e2e/artifacts/`, including top-level run metadata and numbered phase/step folders.
- Reference Showcase App with in-process PostgreSQL/Testcontainers composition under Bun-backed Dev MCP, including explicit readiness and retry.

## Public Package Surface

- `@agent-e2e/harness` - default Playwright-oriented harness API for common consumer usage.
- `@agent-e2e/harness/core` - generic journey, contract, resource, and execution primitives.
- `@agent-e2e/harness/stack` - stack lifecycle contracts for starting, checking, and stopping app dependencies.
- `@agent-e2e/harness/artifacts` - artifact path and writer utilities for the published run layout.
- `@agent-e2e/harness/dev-mcp` - Dev MCP server and config entrypoints for the stable local MCP endpoint.
- `@agent-e2e/harness/playwright-mcp` - Playwright-owned browser session helpers exposed through MCP tools.

The legacy in-process `/mcp` subpath is intentionally not part of the v1.0.0 public package surface.

## Installation

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
```

`playwright`, `@modelcontextprotocol/sdk`, and `zod` are declared as peer dependencies. The MCP SDK and Zod are required for the Dev MCP and Playwright MCP entrypoints; Playwright is required for the default browser proof path. The package requires Bun `>=1.3.0` for the Dev MCP CLI and Node `>=22.0.0`.

## Quickstart

Start with the [README 5-minute walkthrough](../README.md#install-in-5-minutes). It shows the install command, the `dev:mcp` script, the `agent-e2e.config.ts` shape, and standard MCP discovery against `http://127.0.0.1:3766/mcp`.

## Local Runtime Prerequisite

Reference Showcase runs require Docker-compatible Testcontainers support, such as Docker Desktop or OrbStack, so the Bun-backed Dev MCP server can start the showcase-managed PostgreSQL container directly through the in-process stack provider.

## Known Gaps and Deferred Work

- `/mcp` subpath export is deferred for v1.x. The internal MCP implementation remains in source, but the legacy in-process embedding mode is not public until its grammar settles.
- `journey.prompt` and `journey.validate` are deferred for v1.x because the Textual Journey Plan payload is not designed yet.

## Breaking Changes

None. v1.0.0 is the first stable release.
