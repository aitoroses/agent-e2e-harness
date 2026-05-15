# PRD: Stack exploration surface

## Problem Statement

Agent E2E Harness currently gives agents a way to start a stack, inspect a shallow status packet, drive the browser, run journey steps, and verify journeys in CI. That is not enough for the development loop we want.

During development, the Dev MCP Server should help an agent explore a live system. The agent needs to understand runtime state before it can crystallize a useful journey: which services exist, what the app process logged, whether backing services are healthy, what data is in the database, what jobs are in queues, and which stack-specific operations are available. Today too much of that exploration is outside the harness or hidden inside product-specific code.

Users need stack exploration to be discoverable, typed, and stack-provider-owned. The harness should not hardcode PostgreSQL, Docker, Next.js, or shell execution as universal assumptions. It should provide a small vocabulary and let each stack provider expose the concrete exploration tools for that app.

## Solution

Treat the Dev MCP Server as an Exploration Surface for live development. Add a stack exploration surface that keeps the fixed stack grammar small:

- `stack.start`
- `stack.status`
- `stack.stop`
- `stack.logs`
- `stack.explore.list`
- `stack.explore.run`

Deepen `stack.status` into the single unified stack-state packet. It returns services, endpoints, readiness/health checks, warnings, errors, and next actions. Do not add separate `stack.services`, `stack.health`, or `stack.env` tools.

Add `stack.logs` as a native live runtime tool. It reads recent logs for one active service using stable provider service ids.

Add `stack.explore.list` and `stack.explore.run` as the provider-declared extension surface. Stack exploration tools are MCP-like: every tool declares mandatory Zod input and output schemas, discovery exposes JSON Schemas, and the router validates both input and output.

Dev MCP exposes every stack-provider-declared exploration tool, subject to risk policy. Journey execution and `agent-e2e verify` receive only Verify Observation Tools, meaning tools available in verify with `risk: "none"`. That preserves validation integrity: the application path must cause product-visible mutation, not the verification helper.

## User Stories

1. As a coding agent, I want `stack.status` to return services, endpoints, checks, warnings, errors, and next actions, so that one call tells me what stack I am exploring.
2. As a coding agent, I want stack services to use stable ids like `next-dev` and `postgres`, so that I can call stack tools without browser-style ephemeral refs.
3. As a coding agent, I want `stack.logs` to read recent logs for one service, so that I can diagnose app/runtime failures without leaving the MCP loop.
4. As a coding agent, I want `stack.logs` to require `tail`, so that I control how much context I pull into the conversation.
5. As a coding agent, I want `stack.logs` to support stdout, stderr, or combined streams when the provider can distinguish them, so that I can focus on the relevant runtime stream.
6. As a coding agent, I want `stack.explore.list` to show stack-provider exploration tools, so that I can discover how this app lets me inspect or operate its runtime.
7. As a coding agent, I want exploration tool ids to use dotted grammar in examples, so that capabilities like `postgres.schema`, `postgres.query`, and `notes.list` are easy to parse.
8. As a coding agent, I want `stack.explore.run` to validate my input before execution, so that tool misuse fails with a clear error instead of reaching product code.
9. As a coding agent, I want `stack.explore.run` to validate provider output, so that broken provider handlers fail loudly during development.
10. As a stack provider author, I want to define exploration tools with Zod input and output schemas, so that MCP discovery and TypeScript handler typing come from the same source.
11. As a stack provider author, I want exploration handlers to receive the active stack handle, so that tool implementations can use the same runtime object returned by `start`.
12. As a stack provider author, I want to expose product-specific reads such as `notes.list`, so that agents can inspect domain state without the harness knowing the domain.
13. As a stack provider author, I want to expose stack-specific operations such as SQL, queue inspection, cache clearing, or controlled scripts, so that agents can explore realistic systems.
14. As a stack provider author, I want to classify exploration risk, so that agents can see whether a tool is observational, mutates local state, is destructive, or has external side effects.
15. As a library maintainer, I want `availableIn: ["dev", "verify"]` to be allowed only with `risk: "none"`, so that verify-visible tools cannot cause product-visible mutations.
16. As a journey author, I want verify-safe stack exploration to be available through `execution.stack.explore.run`, so that journey code can collect stronger observations while preserving validation integrity.
17. As a journey author, I want the verify-time exploration client to hide dev-only tools, so that CI code cannot accidentally use mutation helpers.
18. As a CI maintainer, I want `agent-e2e verify` to run only crystallized journeys plus Verify Observation Tools, so that verification remains deterministic and trustworthy.
19. As an app maintainer, I want mutations during validation to come through the application path, seed, reseed, cleanup, or journey steps, so that stack helpers do not fake the behavior under test.
20. As a library adopter, I want stack exploration to be stack-provider-owned, so that the harness works with local processes, containers, Kubernetes, databases, queues, or custom services.
21. As a documentation reader, I want examples that show stack exploration as part of the agent discovery loop, so that I understand how exploration turns into an executable journey.
22. As an agent using Dev MCP, I want `stack.explore.list` available before `stack.start`, so that I can plan what the stack can tell me before running it.
23. As an agent using Dev MCP, I want `stack.explore.run` and `stack.logs` to require an active stack, so that live exploration does not pretend to be archive browsing.
24. As an agent using Dev MCP, I want simple failure responses for stack exploration, so that I can recover without handling a large status taxonomy.
25. As a maintainer, I want no automatic artifacts from stack exploration v1, so that live exploration does not pollute the crystallized journey artifact tree.

## Implementation Decisions

- Build or modify these major modules:
  - Stack provider contracts for native logs and provider-declared exploration tools.
  - Stack exploration tool definition helpers with Zod-backed input/output inference.
  - Dev MCP tool registry and router for `stack.logs`, `stack.explore.list`, and `stack.explore.run`.
  - Stack status packet types to carry services, endpoints, checks, warnings, errors, and next actions in one disciplined packet.
  - Verify/journey execution-surface wiring for narrowed verify-safe stack exploration through `execution.stack.explore.run`.
  - Showcase stack provider examples that expose useful stack exploration tools.
  - Documentation and skill updates that teach Dev MCP as an Exploration Surface.
- The fixed stack MCP vocabulary is `stack.start`, `stack.status`, `stack.stop`, `stack.logs`, `stack.explore.list`, and `stack.explore.run`.
- `stack.status` remains the single stack state packet. It replaces the need for separate service and health tools.
- `stack.env` is out of scope as a native tool. Provider-specific redacted config can be exposed through `stack.explore.*`.
- `stack.logs` is provider-implemented and requires an active stack handle.
- `stack.logs` input is `serviceId`, `tail`, and optional `stream`.
- `stack.logs` reads one service per call.
- `stack.logs` requires `tail`; the harness does not impose a universal max.
- `stack.logs` is live exploration, not archive browsing.
- `stack.explore.list` is available before stack start and returns all tools visible to the caller context.
- `stack.explore.run` requires an active stack handle.
- Stack exploration tools use provider-owned string ids; dotted grammar is recommended but not enforced.
- Stack exploration tool definitions require Zod input schema and Zod output schema.
- `stack.explore.run` validates input before the provider handler and output after the provider handler.
- Stack exploration handlers receive `{ input, handle }`, where `handle` is the active stack provider handle returned by `start`.
- Tool availability is expressed with `availableIn: ["dev"]` or `availableIn: ["dev", "verify"]`.
- Tool risk is expressed as `none`, `local-mutation`, `destructive`, or `external-side-effect`.
- `availableIn: ["dev", "verify"]` is valid only with `risk: "none"`.
- Dev MCP exposes all stack-provider-declared tools, subject to risk policy.
- Journey execution and `agent-e2e verify` receive a narrowed typed client under `execution.stack.explore.run`.
- The narrowed verify client exposes only tools available in verify.
- `stack.explore.run` does not accept `runId` in v1.
- `stack.explore.run` does not produce automatic artifacts in v1.
- Provider-returned artifacts are out of scope for stack exploration v1.
- Failure responses stay simple: `status: "ok" | "failed"` with a summary and optional error.
- ADR: `docs/adr/0003-dev-mcp-exploration-surface.md`.

## Testing Decisions

- Tests should focus on public MCP behavior, provider extension behavior, and verify-surface narrowing.
- Stack status tests should assert the unified packet shape with services, endpoints, checks, warnings, errors, and next actions.
- Stack logs tests should cover provider-backed logs, required tail, one-service calls, stream handling, inactive-stack failure, and unsupported-provider failure.
- Stack exploration list tests should cover pre-start availability, Dev MCP visibility of all provider tools, and verify-client visibility of verify-safe tools only.
- Stack exploration run tests should cover active-stack requirement, unknown tool failure, input validation failure, provider exception failure, output validation failure, and successful typed output.
- Type tests should prove `defineStackExploreTool` and grouped tool definitions infer handler input/output and execution client return types.
- Verify integration tests should prove journey code can call `execution.stack.explore.run` for verify-safe tools and cannot access dev-only tools.
- Showcase tests should add at least one provider-defined observation tool and one dev-only exploration tool to prove availability/risk behavior.
- Documentation checks should assert the public docs mention `stack.explore.*` as exploration, not CI runner primitives.

## Out of Scope

- Browser exploration tools. They are designed separately as the Browser Workbench under `browser.*`.
- Native `stack.env`.
- Separate `stack.services` or `stack.health`.
- General shell execution as a universal harness tool.
- Automatic artifact creation for every stack exploration call.
- Provider-returned artifacts from stack exploration v1.
- Streaming/following logs.
- Multiple service logs in one call.
- A complex `denied` / `unavailable` / `not-found` status taxonomy.
- Custom risk-policy configuration beyond the minimal behavior needed for this PRD.

## Further Notes

The guiding product language is: Dev MCP is the agent's Exploration Surface. The agent explores the live system and crystallizes the discovered trajectory into an Executable Journey. `agent-e2e verify` runs the crystallized journey, not arbitrary exploration.

Stack exploration is stack-provider-owned. The harness owns schemas, discovery, validation, routing, and the small fixed grammar. The provider owns the actual runtime knowledge.
