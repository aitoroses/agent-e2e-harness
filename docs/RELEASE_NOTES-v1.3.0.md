# @agent-e2e/harness v1.3.0

`@agent-e2e/harness` v1.3.0 prepares the Stack Instances release: Dev MCP can manage explicit stack runtimes by `stackId`, journey runs bind to a selected Stack Instance, and `agent-e2e verify` runs stack-backed suites through worker-scoped stack instances.

These notes are release-prep notes. They describe the package state intended for v1.3.0 and do not mean the tag, npm package, or GitHub Release has been published.

## Highlights

- Dev MCP now treats each started runtime as an explicit **Stack Instance**. `stack.start` returns the effective `stackId`, `stack.list` recovers running instances, and `stack.status`, `stack.logs`, `stack.explore.run`, and `stack.stop` target one explicit `stackId`.
- `run.begin` creates a **Run Stack Binding** when a stack provider exists. Later journey execution, reseed, teardown, logs, and stack exploration evidence resolve through that binding instead of hidden runtime selection.
- Stack evidence capture validates the target runtime: optional `runId` on `stack.logs` and `stack.explore.run` attaches artifacts only when the run is bound to the same `stackId`.
- Stack providers now receive a **StackStartContext** with mode, stack id, worker identity, suite id when available, stack artifact scope, and allocation helpers.
- **Named Stack Allocations** record ports and artifact paths allocated through `StackStartContext`, making dynamic service URLs, log paths, database files, and worker artifact scopes explainable in Dev MCP responses and verify reports.
- `StackStatusPacket.services` remains the journey-facing runtime contract for service ids, URLs, readiness, health checks, warnings, errors, artifacts, and next actions.
- `agent-e2e verify` now starts worker-scoped Verify Stack Instances lazily. `--workers N` means at most N active worker stacks, with selected runs executing serially inside their assigned worker stack.
- Verify reports now include first-class Stack Instance evidence in `stacks[]`, stack failures, named allocations, services, timing, artifacts, diagnostics, and per-run `stackId` correlation.
- The Reference Showcase App dogfoods the public pattern through dynamic Next.js ports, stack-scoped logs, `stack.list` recovery, explicit `run.begin stackId`, and worker-scoped verify evidence.
- README, package README, showcase docs, proof transcript, and the `agent-e2e-harness` skill now teach the explicit Stack Instance workflow.

## Public Package Surface

- `@agent-e2e/harness/stack` exposes `StackStartContext`, named allocation helpers, `StackStatusPacket.services`, and stack provider contracts for isolated runtime resources.
- `@agent-e2e/harness/dev-mcp` exposes the explicit Stack Instance grammar through the standard Dev MCP endpoint.
- `@agent-e2e/harness/verify` runs configured suites through worker-scoped stacks and writes stack evidence into suite reports.

## Upgrade Notes

- Update Dev MCP clients and scripts to keep the `stackId` returned by `stack.start`.
- Use `stack.list` to recover running Stack Instances after compaction, handoff, or reconnect.
- Pass `stackId` to `stack.status`, `stack.logs`, `stack.explore.run`, `stack.stop`, and stack-backed `run.begin`.
- Remove assumptions about a hidden selected Stack Instance. Dev MCP requires callers to choose the target `stackId` for stack-targeting tools.
- In stack providers, prefer `start(ctx)` with `ctx.allocatePort(name)` and `ctx.allocateArtifactPath(name, { kind })` over fixed ports or shared log paths.
- Keep dynamic app URLs in `StackStatusPacket.services`; use Named Stack Allocations for report/debug evidence rather than as a replacement for service status.
- For CI, set `verify.workers` or pass `agent-e2e verify --workers <n>` based on the number of isolated worker stacks the app can run locally.

## Adoption Example

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
npm run dev:mcp
```

Then connect a standard MCP client to `http://127.0.0.1:3766/mcp` and use the explicit stack flow:

```sh
stack.start
stack.list
stack.status      # with stackId
run.begin         # with stackId when a stack provider exists
stack.logs        # with stackId, optional compatible runId for artifacts
stack.explore.run # with stackId, optional compatible runId for artifacts
stack.stop        # with stackId
```

## Validation Commands

Release preparation should validate the exact public paths:

```sh
npm run check
npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2
npx skills add . --list
```

Before creating a release tag, maintainers should also confirm the package version, package lock, changelog section, and this release notes file all match `1.3.0`.

## Breaking Changes

Stack-backed Dev MCP flows must use explicit `stackId` values. Hidden Stack Instance selection is not retained as a compatibility mode when a stack provider exists.
