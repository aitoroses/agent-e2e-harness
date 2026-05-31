# @agent-e2e/harness v2.0.0

`@agent-e2e/harness` v2.0.0 makes **Capabilities** the single public language for provider-declared stack and runtime operations.

## Highlights

Dev MCP exposes:

```text
stack.capability.list
stack.capability.run
runtime.capability.list
runtime.capability.run
```

Use capabilities for product/runtime-specific operations that help an agent inspect, prepare, or locally mutate a stack or Runtime Target when universal tools are not enough.

Examples:

- `notes.list`
- `postgres.query`
- `database.seed`
- `featureFlag.set`
- `clock.freeze`
- `setup-token.mint`

## Public TypeScript Surface

```ts
defineStackCapability(...)
defineStackCapabilities(...)
defineRuntimeCapability(...)
defineRuntimeCapabilities(...)

type StackCapabilityDefinition
type StackCapabilityDescriptor
type StackCapabilityExecutionClient
```

`StackProvider` accepts:

```ts
{
  capabilities: defineStackCapabilities<Handle>()([...])
}
```

Verify-safe journey code uses:

```ts
await execution.stack.capability.run("notes.list", { limit: 10 })
```

## Breaking Changes

- Removed `stack.explore.list` and `stack.explore.run` from the Dev MCP grammar.
- Removed `runtime.explore.list` and `runtime.explore.run` from the Dev MCP grammar.
- Removed `StackProvider.explore`, `defineStackExplore*`, and `execution.stack.explore.run(...)`.
- Removed `RuntimeTarget.explore` and `defineRuntimeExploreTool`.

## Upgrade Notes

- Rename `stack.explore.*` calls to `stack.capability.*`.
- Rename `runtime.explore.*` calls to `runtime.capability.*`.
- Rename `StackProvider.explore` and `RuntimeTarget.explore` fields to `capabilities`.
- Keep declaring `availableIn` and `risk`. Verify can call only stack capabilities with `availableIn` including `verify` and `risk: "none"`.
