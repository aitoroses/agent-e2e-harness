# Dev MCP as an exploration surface

## Status

Accepted

## Context

The v1 launch surface made `agent-e2e dev` useful as a Dev MCP server and `agent-e2e verify` useful as the CI command. That split is correct, but the Dev MCP tool surface is still too runner-shaped for the way agents actually build journeys.

An agent validating a live app needs to explore before it can crystallize a stable journey. It needs to inspect the browser, read runtime logs, query stack/application state, try controlled operations, and discover which observations should become phases, steps, proofs, seed, and cleanup. The crystallized result is the **Executable Journey** that later runs through `agent-e2e verify`.

The current stack surface only exposes lifecycle and shallow status:

- `stack.start`
- `stack.status`
- `stack.stop`

That is not enough for exploration. At the same time, making the harness expose arbitrary code execution or hardcoded database tools would violate the product model. Stacks differ across products, and stack-specific mechanics should remain stack-provider-owned.

## Decision

Treat the **Dev MCP Server** as an **Exploration Surface** first.

Add a small stack exploration vocabulary:

```txt
stack.start
stack.status
stack.stop
stack.logs
stack.explore.list
stack.explore.run
```

Keep `stack.status` as the single unified stack-state packet. It should return services, endpoints, readiness/health checks, warnings, errors, and next actions. Do not split separate `stack.services`, `stack.health`, or `stack.env` tools.

Add `stack.logs` as a native live stack runtime tool:

```ts
{
  serviceId: string;
  tail: number;
  stream?: "stdout" | "stderr" | "combined";
}
```

`tail` is required. The harness does not impose a universal max. Logs are one service per call. Logs are live exploration, not archive browsing, and require an active stack handle.

Add `stack.explore.list` and `stack.explore.run` for stack-provider-declared exploration tools. These tools are MCP-like: every tool must declare Zod input and output schemas, and the harness exposes those schemas through discovery.

Stack exploration tool ids are provider-owned strings. Dotted grammar is recommended, for example:

```txt
postgres.schema
postgres.query
notes.list
queue.jobs
cache.clear
```

Each stack exploration tool declares:

```ts
{
  id: string;
  title: string;
  description: string;
  availableIn: readonly ("dev" | "verify")[];
  risk: "none" | "local-mutation" | "destructive" | "external-side-effect";
  input: ZodType;
  output: ZodType;
  run(args: { input: TInput; handle: THandle }): MaybePromise<TOutput>;
}
```

`availableIn: ["dev", "verify"]` is allowed only when `risk: "none"`. These are **Verify Observation Tools**. Journey execution and `agent-e2e verify` receive a narrowed typed client:

```ts
execution.stack.explore.run("notes.list", input)
```

Dev MCP receives the full stack-provider-declared **Stack Exploration Surface**:

```txt
stack.explore.list
stack.explore.run
```

`stack.explore.run` validates input before calling the provider handler and validates output after the handler returns. It requires an active stack handle.

Do not bake artifact capture into `stack.explore.run` or `stack.logs` in this first design. The exploration result is returned inline as typed output. The crystallized journey and its run forensics remain the durable time-travel artifact path.

Use stable stack service ids such as `next-dev` or `postgres`. Do not introduce browser-style ephemeral refs for stack services.

## Consequences

Agents get a richer live exploration surface without turning the harness into a hardcoded Docker/Postgres/Next.js framework.

Stack providers become the extension point for stack-specific exploration. The harness owns discovery, schemas, validation, risk vocabulary, and routing. Providers own actual mechanics.

The verify path stays honest. Verification code can observe stack/application state through **Verify Observation Tools**, but cannot use stack exploration to cause the behavior it claims to validate. Product-visible mutations must come from the application path, journey steps, seed, reseed, or cleanup.

The public Dev MCP grammar remains small. `stack.status` stays the canonical state packet. Stack runtime additions are limited to logs plus provider-declared exploration.

## Rejected alternatives

- **Arbitrary command execution as the core API.** Too broad and too close to a remote shell. It makes the public surface harder to reason about and less safe by default.
- **A generic `diagnostic.*` namespace.** Too detached from the product model. These capabilities are part of stack exploration, and the stack provider owns the concrete mechanics.
- **`stack.action.*`.** Better than diagnostics, but still frames the surface around operations rather than exploration. The core workflow is discovery that crystallizes into a journey.
- **Separate `stack.services` and `stack.health` tools.** Splitting them creates more calls and more concepts. `stack.status` should be the unified state packet.
- **Native `stack.env`.** Environment/config data is sensitive and provider-specific. If useful, expose a redacted provider-declared stack exploration tool.
- **Artifacts from every stack exploration call.** This bloats the artifact tree and blurs live exploration with crystallized journey evidence. Keep v1 exploration output inline.

## Follow-up

The next design pass should define `browser.explore.*` separately. Browser exploration has different ergonomics because DOM snapshots are volatile and browser refs are useful there. Stack exploration should keep stable service ids.
