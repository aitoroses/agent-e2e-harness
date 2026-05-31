# @agent-e2e/harness v1.4.1

`@agent-e2e/harness` v1.4.1 improves adopter-facing language for provider-declared stack and runtime tools. It introduces **Capabilities** as the preferred model while keeping the existing `stack.explore.*` and `runtime.explore.*` surfaces backwards-compatible.

## Highlights

### Stack Capability MCP tools

Dev MCP now exposes:

```text
stack.capability.list
stack.capability.run
runtime.capability.list
runtime.capability.run
```

These are the preferred names for product/runtime-specific tools that help an agent inspect, prepare, or locally mutate a stack or Runtime Target when universal tools are not enough.

Examples:

- `notes.list`
- `postgres.query`
- `database.seed`
- `featureFlag.set`
- `clock.freeze`
- `setup-token.mint`

The previous tools still work:

```text
stack.explore.list
stack.explore.run
runtime.explore.list
runtime.explore.run
```

They are compatibility aliases for `stack.capability.*`.

## Public TypeScript Surface

Preferred new names:

```ts
defineStackCapability(...)
defineStackCapabilities(...)
defineRuntimeCapability(...)
defineRuntimeCapabilities(...)

type StackCapabilityDefinition
type StackCapabilityDescriptor
type StackCapabilityExecutionClient
```

`StackProvider` now accepts:

```ts
{
  capabilities: defineStackCapabilities<Handle>()([...])
}
```

Verify-safe journey code should use:

```ts
await execution.stack.capability.run("notes.list", { limit: 10 })
```

The existing `StackExplore*` types, `defineStackExplore*` helpers, `StackProvider.explore`, and `execution.stack.explore.run(...)` remain available for compatibility.
The existing `RuntimeExplore*` types, `defineRuntimeExploreTool`, `RuntimeTarget.explore`, and `runtime.explore.*` remain available for compatibility.

## Upgrade Notes

- No breaking runtime change. Existing consumers using `stack.explore.*` or `runtime.explore.*` continue to work.
- New docs, examples, and skills should use `stack.capability.*` and `runtime.capability.*`.
- Keep declaring `availableIn` and `risk`. Verify can still call only capabilities with `availableIn` including `verify` and `risk: "none"`.
