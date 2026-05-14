# @agent-e2e/harness v1.1.0

`@agent-e2e/harness` v1.1.0 adds the provider-owned stack exploration surface for agent-driven debugging and verification.

## Highlights

- Dev MCP now exposes `stack.status`, `stack.logs`, `stack.explore.list`, and `stack.explore.run`.
- Stack providers can declare typed exploration tools with Zod input and output schemas.
- Dev-mode agents can discover and run provider-owned stack/application tools without the harness hardcoding a database, framework, or runtime.
- Journey and `agent-e2e verify` code receives a narrowed observation client under `execution.stack.explore.run(...)`.
- Verify-safe tools are restricted to observation-only tools, preserving the application path as the cause of product-visible behavior.
- The showcase demonstrates stack exploration with persisted notes observation and PostgreSQL query exploration.
- The `agent-e2e-harness` skill documents the stack exploration setup and verification pattern.

## Public Package Surface

- `@agent-e2e/harness/stack` now includes the stack exploration tool definitions and helpers.
- `@agent-e2e/harness/dev-mcp` exposes the stack exploration tools through the standard Dev MCP endpoint.
- `@agent-e2e/harness/verify` exposes the narrowed verify execution surface for observation-safe stack tools.

## Installation

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
```

Install the adoption skill for Codex:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
```

## Quickstart

Start with the [README 5-minute walkthrough](../README.md#install-in-5-minutes). For stack exploration, expose a provider through `agent-e2e.config.ts`, start `agent-e2e dev`, attach a standard MCP client to `http://127.0.0.1:3766/mcp`, then call `stack.explore.list` to discover provider-declared tools.

## Breaking Changes

None.
