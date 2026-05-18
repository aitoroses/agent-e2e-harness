# Validation Checklist

Use this reference before final response.

## Local Static Checks

Run the target repo's relevant checks. Prefer:

```sh
npm run typecheck
npm run lint
npm test
```

Adapt to the package manager and scripts actually present. If a command is unavailable, state the gap and run the closest check.

## Harness Setup Checks

Verify:

```sh
npm pkg get scripts.dev:mcp
npm pkg get scripts.e2e:verify
bun --version
agent-e2e --help
agent-e2e dev --help
agent-e2e attached --help
agent-e2e verify --help
```

Expected:

- dev script calls `agent-e2e dev`
- verify script calls `agent-e2e verify`
- help text shows `dev` and `verify`
- attached help shows `agent-e2e attached --target <id>` and Attached Runtime Mode language
- no adoption doc points users to `agent-e2e-harness dev-mcp`

## Dev MCP Evidence

When the task includes interactive setup, capture:

- exact command used to start Dev MCP
- MCP URL, usually `http://127.0.0.1:3766/mcp`
- agent MCP client setup command or config
- `tools/list`, `mcporter list`, or equivalent tool discovery evidence
- `journey.inspect` result summary
- `stack.explore.list` result showing concrete provider tools
- `stack.start` returned a `stackId` and ready services
- `stack.list` can recover the running Stack Instance
- `stack.status` with `stackId` unified packet summary
- multi-stack Dev MCP evidence when supported: two named Stack Instances, both visible in `stack.list`, with explicit `stack.status` calls for each id
- `stack.logs` with `stackId` result for one service with required `tail`
- `stack.explore.run` with `stackId` result for one concrete provider tool
- `run.begin` seed status and Run Stack Binding for the selected `stackId`
- `StackStatusPacket.services` evidence for the dynamic app URL used by the journey
- StackStartContext / Named Stack Allocations evidence when a stack provider allocates ports, logs, or artifact paths
- browser session id
- `browser.snapshot` evidence with visible refs
- `browser.find` evidence when semantic lookup is used
- `browser.act` result without relying on implicit screenshot artifacts
- `browser.wait` result with `durationMs` and `timeoutMs` when waiting for UI state
- `browser.get` result for targeted state reads when useful
- `browser.console` and `browser.network` cursor evidence when debugging runtime or request behavior
- step or phase proof status
- primary artifact path read with `artifact.read`
- cleanup/reseed result
- browser close result
- stack stop result

Startup logs are not sufficient. `Agent E2E Dev MCP ready` only proves the server booted; the proof loop must call tools. For fresh sessions that do not have the MCP registered, use the portable `mcporter` form:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http
mcporter call --http-url http://127.0.0.1:3766/mcp --allow-http --tool journey.list --args '{}' --output json
```

Do not leave required dev servers running unless the user asked for a runnable handoff.

## Attached Runtime Evidence

When validating an Attached Runtime Target, capture:

- external startup command used, such as a product deploy, preview URL, or Docker Compose command
- exact `agent-e2e attached --target <id>` command
- `runtime.list` target summary
- `runtime.status` readiness and services
- `runtime.logs` with required `tail` and artifact path
- `runtime.access.status` without secret material
- `runtime.explore.list` schemas and risk values
- one `runtime.explore.run` observation result
- selected journey/profile where `runtimeTargetId` resolves the target
- proof that `run.begin` did not use a free `targetId` override
- seed/cleanup evidence if the profile opts into run lifecycle
- confirmation that attached mode does not own infrastructure lifecycle

## Verify Evidence

Run at least:

```sh
npm run e2e:verify
```

or:

```sh
agent-e2e verify
```

For focused local validation, acceptable variants include:

```sh
agent-e2e verify --suite smoke
agent-e2e verify --journey "<pattern>"
agent-e2e verify --reporter json
```

Final evidence must include:

- selected suite or selectors
- run count and pass/fail count
- report directory
- `report.json` and `report.md` existence
- cleanup status
- exit code
- evidence that verify used only Verify Observation Tools if journey code uses `execution.stack.explore.run(...)`
- worker-scoped verify evidence when `--workers > 1` is configured: stack ids such as `worker-0`, per-run `stackId`, report `stacks[]`, and Named Stack Allocations

## Stop Conditions

Stop only when:

- setup files are committed to the working tree changes
- at least one journey exists and is wired into `agent-e2e.config.ts`
- Dev MCP proof loop works through tool calls or a specific blocker is documented
- `agent-e2e verify` works or a specific blocker is documented
- cleanup/reseed restores seeded state or a specific blocker is documented
- artifact paths for both verify and Dev MCP runs are reported
- generated artifacts are ignored by git
- final response names changed files and validation evidence
