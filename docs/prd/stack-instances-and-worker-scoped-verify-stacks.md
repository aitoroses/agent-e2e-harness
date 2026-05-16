# PRD: Stack Instances And Worker-Scoped Verify Stacks

## Problem Statement

Agent E2E currently treats the managed stack as one implicit runtime. In Dev MCP, `stack.start` creates one ambient active stack, and later stack tools operate against that hidden handle. In `agent-e2e verify`, the runner starts one suite-scoped stack before the selected-run worker queue, so `verify.workers > 1` isolates browser contexts but not runtime resources such as app ports, database paths, log paths, queues, or process state.

This makes parallel verification unsafe for product integrations whose stack providers use fixed resources. It also limits agent exploration: an agent cannot intentionally start two stack instances, compare hypotheses, bind different runs to different runtimes, or attach stack logs and stack exploration evidence to the correct run without relying on hidden current-stack state.

## Solution

Introduce explicit **Stack Instances** and **Run Stack Bindings** across Dev MCP and verify.

Dev MCP should be able to manage multiple started stack instances, each identified by `stackId`. Stack-targeting tools should use explicit `stackId`, and `run.begin` should bind a journey run to a specific stack instance when a stack provider exists. Stack logs and stack exploration can optionally attach evidence to a compatible `runId`, but they still target a stack by `stackId`.

`agent-e2e verify` should use the same model with worker-scoped stack instances. `verify.workers` is both the selected-run concurrency limit and the maximum number of active **Verify Worker Stacks**. Worker stacks start lazily only when a worker receives a selected run. Runs execute serially inside their assigned worker stack, while the suite parallelizes across workers.

Stack providers receive a **StackStartContext** with worker identity and named allocation helpers. Providers should use these helpers by default to allocate isolated ports, artifact paths, log paths, and service URLs. Named allocations are automatically surfaced in verify reports so stack failures are diagnosable.

## User Stories

1. As a coding agent, I want to start a stack instance with a clear `stackId`, so that I know which runtime I am about to inspect or use.
2. As a coding agent, I want `stack.start` to generate a `stackId` when I do not provide one, so that quickstart flows stay low-friction.
3. As a coding agent, I want to list running stack instances, so that I can recover context after a long session or compaction.
4. As a coding agent, I want `stack.status` to target one explicit stack instance, so that I do not inspect the wrong runtime.
5. As a coding agent, I want `stack.logs` to target one explicit stack instance, so that service logs come from the runtime I am debugging.
6. As a coding agent, I want `stack.explore.run` to target one explicit stack instance, so that provider-owned exploration happens against the intended runtime.
7. As a coding agent, I want to bind `run.begin` to a `stackId`, so that the run has a stable runtime relationship for later steps and evidence.
8. As a coding agent, I want journey steps to use the run's stack binding, so that changing or starting another stack does not silently affect an existing run.
9. As a coding agent, I want to start multiple stack instances, so that I can compare baseline and candidate behavior during exploration.
10. As a coding agent, I want stack logs to optionally attach to a run, so that relevant runtime evidence is saved with the journey artifacts.
11. As a coding agent, I want stack exploration results to optionally attach to a run, so that useful observations survive beyond the live MCP response.
12. As a coding agent, I want artifact capture to reject mismatched `runId` and `stackId`, so that evidence cannot be attached to the wrong runtime.
13. As a journey author, I want dynamic runtime URLs to live on `execution.stack`, so that journey profile data remains a description of the journey variation rather than mutable runtime state.
14. As a journey author, I want stack services to remain the journey-facing URL/readiness contract, so that my journey code reads normal `StackStatusPacket` service data.
15. As a stack provider author, I want a `StackStartContext`, so that I can allocate isolated ports and paths without hand-rolling parallel-safe resource naming.
16. As a stack provider author, I want named port allocation, so that verify reports can show which port belonged to each worker stack.
17. As a stack provider author, I want named artifact path allocation, so that log files and database files naturally live under the correct worker stack artifact directory.
18. As a stack provider author, I want named allocations to be reportable automatically, so that I do not duplicate resource metadata in my status packet.
19. As a stack provider author, I want no separate `parallel.isolatedResources` flag, so that the provider contract remains simple and `workers > 1` itself implies parallel-safe stack behavior.
20. As a CI maintainer, I want `verify.workers` to control both run scheduling and stack concurrency, so that one setting expresses the suite's parallelism.
21. As a CI maintainer, I want verify stacks to be worker-scoped, so that parallel runs get isolated runtime resources without paying stack startup cost for every selected run.
22. As a CI maintainer, I want worker stacks to start lazily, so that verify does not start more stacks than selected runs need.
23. As a CI maintainer, I want stack start failures to stop new scheduling, so that the suite does not continue after runtime isolation is known to be broken.
24. As a CI maintainer, I want already-active workers to finish and clean up after a stack start failure, so that the report preserves useful results and cleanup still runs.
25. As a CI maintainer, I want verify reports to include a first-class `stacks` section, so that stack failures are not confused with journey proof failures.
26. As a CI maintainer, I want each run report to include `stackId` when applicable, so that failed journey evidence can be correlated with the stack instance that ran it.
27. As a maintainer, I want Dev MCP disposal to stop all remaining stack instances internally, so that server shutdown does not leak processes.
28. As a maintainer, I do not want a public stop-all stack tool, so that agents must be explicit when stopping a runtime.
29. As a documentation reader, I want examples to show stack ids and run bindings, so that I learn the real model from the happy path.
30. As a skill user, I want the self-contained Agent E2E skill to teach isolated stack resources and stack bindings, so that fresh agents do not rediscover the old ambient-stack model.
31. As a showcase maintainer, I want the showcase stack provider to dogfood `StackStartContext`, so that docs and CI prove the public pattern.
32. As a package consumer, I want serial mode to remain understandable, so that `workers: 1` still feels simple while using the same concepts as parallel mode.

## Implementation Decisions

- Add or modify a stack-instance manager deep module for Dev MCP. It should own `stackId` generation, duplicate id rejection, handle storage, status/log/explore/stop lookup, and shutdown disposal for all running stack instances.
- Extend the public Dev MCP stack grammar with `stack.list`.
- Change stack-targeting Dev MCP tools so `stack.status`, `stack.logs`, `stack.explore.run`, and `stack.stop` target an explicit `stackId`.
- Keep `stack.explore.list` provider-level and independent of any started stack instance.
- Allow `stack.start` to accept a caller-chosen `stackId`; generate and return one when omitted.
- Keep public `stack.stop` one-stack-at-a-time with required `stackId`; do not add a public stop-all tool.
- Introduce a Run Stack Binding in the run lifecycle. When a stack provider is configured, `run.begin` requires a valid `stackId`. When no stack provider exists, `stackId` is invalid rather than ignored.
- Ensure `journey.step`, `journey.phase`, `journey.untilPhase`, `run.reseed`, `run.teardown`, and cleanup/artifact paths resolve stack execution through the run's binding instead of an ambient active stack.
- Let `stack.logs` and `stack.explore.run` accept optional `runId` only for artifact capture. If `runId` is present, validate that the run is bound to the same `stackId`.
- Add a StackStartContext deep module. It should expose mode, suite id where available, worker index, worker count, stack id, stack artifact directories, and named allocation helpers.
- Named allocation helpers should cover ports and artifact paths first. Avoid product-specific helpers such as SQLite or Postgres in the core contract.
- Named port allocation should return host, port, and URL data suitable for provider status packets and reports.
- Named path allocation should produce deterministic paths under the stack instance artifact scope.
- Named allocations should be recorded by the harness without requiring providers to duplicate metadata in their handle or status packet.
- Preserve `StackStatusPacket.services` as the journey-facing runtime contract for URLs, readiness, and health. Named allocations support reporting and debugging; they do not replace stack status.
- Change verify scheduling so stacks are worker-scoped. Each worker starts at most one stack instance and runs assigned selected runs serially inside it.
- Start verify worker stacks lazily. The maximum active stack count is `min(workers, selectedRuns.length)`.
- Generate verify stack ids such as `worker-0`, `worker-1`, and include them in stack reports and run reports.
- A worker stack start failure stops scheduling new runs, lets already-active workers finish and clean up, records a stack failure, and fails the suite.
- Verify reports should include first-class `stacks[]` entries with stack id, worker index, status, services, allocations, artifacts, warnings, errors, and timing where available.
- Run reports should include `stackId` when a run has a Run Stack Binding.
- Update the process stack provider to use `StackStartContext` for default log paths and resource allocation where appropriate.
- Update the Reference Showcase App stack provider to use isolated resources through `StackStartContext` rather than fixed ports or shared log paths.
- Update README, package README, showcase docs, transcripts, and release-facing docs to show `stackId`, `stack.list`, run binding, and isolated stack resources.
- Update `skills/agent-e2e-harness` so it remains self-contained for fresh agents and teaches the new stack-instance workflow, validation commands, and verify expectations.
- This PRD is governed by ADR 0005, "Stack instances and worker-scoped verify stacks".

## Testing Decisions

- Test behavior through public CLI, Dev MCP router, and verify runner boundaries rather than private implementation details.
- Add stack-instance manager tests for id generation, duplicate ids, list/status/log/explore/stop routing, and disposal cleanup.
- Add Dev MCP router tests for multi-stack flows: start two stacks, list both, query each status, read logs from a chosen stack, run exploration against a chosen stack, stop one stack, and confirm the other remains running.
- Add Dev MCP router tests for `run.begin` stack binding: required with stack provider, invalid without stack provider, rejects missing stack id, rejects unknown stack id.
- Add artifact-capture tests for `stack.logs` and `stack.explore.run` with `runId`, including rejection when the run is bound to a different stack id.
- Add journey execution tests proving `journey.step`, `journey.phase`, and `journey.untilPhase` use the run's stack binding rather than a later-started stack.
- Add verify runner tests for worker-scoped stacks: serial default uses one worker stack, parallel verify starts multiple worker stacks, runs are assigned serially within each worker, and each run report includes the correct `stackId`.
- Add verify runner tests for lazy worker start: with more workers than selected runs, only selected-run workers start stacks.
- Add verify runner tests for stack start failure semantics: scheduling stops, active workers finish, suite exits non-zero, stack failure appears in `stacks[]`, and unstarted journeys are not reported as proof failures.
- Add reporting tests for `stacks[]`, named allocations, stack service summaries, and run-to-stack correlation in Markdown and JSON reports.
- Add stack context tests for named port and path allocation, collision-free allocations across workers, artifact path scoping, and allocation recording.
- Add process stack provider tests or update existing stack tests to prove default log paths and service URLs can be built from `StackStartContext`.
- Add showcase tests or e2e verification proving the showcase works with the new stack-id workflow and with `verify.workers > 1` if the showcase seed/cleanup contract supports it.
- Update skill validation checks when the skill body changes, and run the skill validator plus `npx skills add . --list`.

## Out of Scope

- Product-specific helpers such as `ctx.sqlite()`, `ctx.postgres()`, queue adapters, cache adapters, or database lifecycle abstractions.
- A public `stack.stopAll` MCP tool.
- A separate `parallel.isolatedResources` capability flag.
- Run-scoped stacks as the default verify mode.
- Replacing `StackStatusPacket.services` with allocation lookup as the journey-facing runtime contract.
- Remote or production stack orchestration.
- Keeping implicit single-active-stack behavior as a compatibility mode when a stack provider exists.
- Solving heterogeneous journey observed payload registration. That related DX issue should be handled separately.

## Further Notes

This PRD expands issue #49 from "per-run stack context" into the broader stack-instance model needed for flexible agent exploration and parallel-safe verify. The core clarification is that stack resources are not run-scoped by default; they are stack-instance-scoped, with verify using worker-scoped stack instances and Dev MCP allowing agents to manage multiple explicit stack instances.
