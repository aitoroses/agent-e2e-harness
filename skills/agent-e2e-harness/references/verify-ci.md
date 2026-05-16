# Verify And CI

Use this reference when promoting interactive proof into CI.

## Default Command

Run:

```sh
agent-e2e verify
```

This is the default CI path. It loads `agent-e2e.config.ts`, starts worker-scoped Stack Instances lazily, creates one Playwright browser per process, creates an isolated browser context/page per selected run, runs selected journeys from clean seed, cleans owned resources, writes suite reports, and exits non-zero on failure. `--workers 4` means at most four active Verify Worker Stacks; each worker runs its assigned selected runs serially inside a Stack Instance such as `worker-0`.

Do not ask users to maintain a separate Playwright, Vitest, or custom executable wrapper as the primary CI path.

## Selection Defaults

Default behavior:

- select every configured journey
- run each journey's default profile only
- run serially with one worker
- start one lazy worker Stack Instance when the selected runs need a stack provider
- perform per-run cleanup
- complete all scheduled runs
- show warnings without failing
- write Markdown and JSON reports

Useful flags:

```sh
agent-e2e verify --suite smoke
agent-e2e verify --journey "checkout:*"
agent-e2e verify --tag regression
agent-e2e verify --exclude "admin:*"
agent-e2e verify --profile mobile
agent-e2e verify --all-profiles
agent-e2e verify --workers 4
agent-e2e verify --fail-fast
agent-e2e verify --warnings-as-errors
agent-e2e verify --reporter github
agent-e2e verify --cleanup suite-end
agent-e2e verify --artifact-root .agents-e2e/artifacts
```

Selectors combine as:

- `--suite` selects the base set.
- `--journey`, `--tag`, and `--profile` narrow that base set.
- `--exclude` subtracts.
- missing requested profiles fail before execution.

## Config Defaults

Add verify defaults to `agent-e2e.config.ts`:

```ts
export default defineAgentE2EConfig({
  journeys,
  resourceRegistry,
  stackProvider,
  verify: {
    workers: 1,
    reporter: "list",
    cleanup: "per-run",
    failFast: false,
    warningsAsErrors: false,
    suites: [
      { id: "smoke", journeys: ["checkout:*"] },
      { id: "regression", tags: ["regression"], allProfiles: true },
    ],
  },
});
```

Precedence is:

```text
CLI flags > config defaults > CI/environment auto-detection > built-in defaults
```

GitHub annotations auto-enable in GitHub Actions when no reporter is explicitly set.

## Reports And Artifacts

Suite reports live under:

```text
.agents-e2e/artifacts/_suites/<suite-id>/
  report.json
  report.md
  runs/<journey>/<profile>/<run>/
```

Stack-backed suites also include a first-class `stacks[]` section in `report.json` and a Stack Instances section in `report.md`. Use that worker-scoped verify evidence to confirm `worker-0` / `worker-1` stack ids, per-run `stackId`, `StackStatusPacket.services` dynamic URLs, and Named Stack Allocations from `StackStartContext`.

Report statuses distinguish:

- `passed`
- `failed`
- `seed_blocked`
- `cleanup_failed`
- `warning_failed`
- `error`

Cleanup failure is a suite risk and stops scheduling new runs.

## GitHub Actions

Minimal workflow shape:

```yaml
name: Agent E2E

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx agent-e2e verify --reporter github
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: agent-e2e-artifacts
          path: .agents-e2e/artifacts/_suites
```

Use repo-specific service setup only when the stack provider cannot start everything itself.
