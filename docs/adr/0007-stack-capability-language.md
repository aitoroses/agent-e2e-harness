# ADR 0007: Capability Language

## Status

Accepted

## Context

ADR 0003 introduced provider-declared `stack.explore.*` tools so the Dev MCP server could expose stack-specific operations without hardcoding SQL, queues, caches, or product internals into core. ADR 0006 later added `runtime.explore.*` for attached or managed Runtime Targets.

Dogfooding with Terrarium UI Validation showed that the word "explore" is too narrow. Some provider-declared tools are read-only observations, but others are controlled local mutations required to construct a validation state, such as minting a standalone setup token for a disposable stack. Calling those tools "explore" makes the surface feel accidental and harder for adopters to discover.

## Decision

Use **Capability** as the domain language for provider-declared stack and runtime operations.

Preferred MCP tools:

```text
stack.capability.list
stack.capability.run
runtime.capability.list
runtime.capability.run
```

Preferred TypeScript surface:

```ts
defineStackCapability(...)
defineStackCapabilities(...)
StackProvider.capabilities
execution.stack.capability.run(...)

defineRuntimeCapability(...)
defineRuntimeCapabilities(...)
RuntimeTarget.capabilities
```

Capabilities still declare:

- `id`
- `title`
- `description`
- `availableIn`
- `risk`
- Zod `input`
- Zod `output`
- `run({ input, handle })`

`availableIn` and stack `risk` remain the stack safety model. Verify can run only stack capabilities with `availableIn` including `verify` and `risk: "none"`.

Runtime capabilities keep the Runtime Target safety model: `observation` runs by default, `runMutation` requires Journey Profile opt-in, and `runtimeMutation` is blocked by default.

## Breaking Change

Do not keep compatibility aliases. The following names are removed from the public surface:

```text
stack.explore.list
stack.explore.run
defineStackExploreTool(...)
defineStackExploreTools(...)
StackProvider.explore
execution.stack.explore.run(...)

runtime.explore.list
runtime.explore.run
defineRuntimeExploreTool(...)
RuntimeTarget.explore
```

New documentation and examples should use `capability`. Consumers on the older `explore` names must migrate as part of the 2.0.0 upgrade.

## Consequences

Adopters get a clearer mental model:

- `stack.*` — lifecycle, status, logs
- `journey.*` — deterministic state progression
- `browser.*` — visual/browser interaction
- `artifact.*` — evidence retrieval
- `stack.capability.*` — provider-declared stack-specific tools
- `runtime.capability.*` — product-declared runtime-specific tools

This keeps product-specific behavior out of harness core while making local mutations explicit instead of hiding them under an inspection-sounding name.
