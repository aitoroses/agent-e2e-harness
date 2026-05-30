# @agent-e2e/harness v1.4.0

`@agent-e2e/harness` v1.4.0 makes the Dev MCP runtime-agnostic, hardens `stack.start` into a self-healing and self-diagnosing operation, and turns interactive run artifacts into an operator-consumable proof tree. It is the first release that runs the Dev MCP on plain Node (no Bun requirement) with genuine in-process journey hot-reload.

These notes are release-prep notes. They describe the package state intended for v1.4.0 and do not mean the tag, npm package, or GitHub Release has been published.

## Highlights

### Runtime-agnostic Dev MCP

- The Dev MCP no longer requires Bun. `engines` keeps `node >=22`, the bin shebang is `node`, and Node is the default/recommended runtime (real in-process hot-reload; ~6s vs ~25s Testcontainers PostgreSQL startup). Bun still works (use Bun `>=1.3.14` with the Testcontainers PostgreSQL provider).
- Config and journeys load through [jiti](https://github.com/unjs/jiti): `agent-e2e.config.ts` and the journey files it imports load on Node, Bun, or Deno with no precompile step.
- Genuine in-process journey hot-reload on any runtime via `createReloadingHarnessSource` (re-exported from `@agent-e2e/harness/dev-mcp`): editing a journey or config file is reflected on the next `journey.list`/`journey.inspect` behind a stable MCP URL — no server restart, no MCP reconnect. (Known limitation: only `.ts` journeys reload in process; keep journeys in TypeScript.)

### CLI and adoption

- `agent-e2e list` and `agent-e2e call <toolName> [jsonArgs]`: a built-in MCP-over-HTTP client for driving a running Dev MCP server, so consumers no longer hand-write a client. Endpoint resolves from the same config as `dev`; per-call timeout defaults to 300000ms so slow tools like `stack.start` don't hit the SDK's 60s default.
- `agent-e2e init [targetDir]`: a one-command, idempotent scaffolder that writes a minimal, runnable `agent-e2e.config.ts` + `journeys/sample.journey.ts` and prints the exact next commands. The generated config type-checks against the public types under strict + `exactOptionalPropertyTypes`.
- First-class Testcontainers PostgreSQL stack provider at `@agent-e2e/harness/testcontainers` (`createPostgresTestcontainersProvider`); `pg`/`testcontainers` are lazily-loaded optional peers, so the package-root and `/core` surfaces stay provider-agnostic.
- `journey.untilStep` Dev MCP tool for step-granular time travel — every step is an individually addressable visual frame.

### Self-healing and self-diagnosing `stack.start`

- The first `stack.start` on a fresh server self-heals a cold-start race with a small bounded retry (`stackStart: { maxAttempts, backoffMs }`, default 2 / 750ms). `stack.start`/`status`/`stop` failures are returned as a coherent `{ status: "failed", code, message }` envelope.
- A failed `stack.start` is now empirical: the envelope carries `diagnostics` — `{ attempts, services: [{ id, status, logsTail }], note? }` — with a redacted, bounded (20-line) `logsTail` on each not-ready service, captured from the live handle before teardown. A successful start reports `attempts`, so a self-heal (`attempts > 1`) is visible.
- Readiness is now a single authority (`status()`), gated by the caller. `createProcessStackProvider.start()` is **launch-only**; the Dev MCP `StackInstanceManager` and the verify worker-stack scheduler poll `status()` until ready / terminal / timeout while holding the live handle (`stackStart.readyTimeoutMs` / `pollIntervalMs`). This is what makes the failed-start diagnostics fire for the flagship process provider, and a `degraded` service is now correctly treated as not-ready.

### Operator-consumable interactive run artifacts

- Each interactive run gets its own directory: an unnamed `run.begin` mints a unique, sortable `run-<utc-timestamp>-<suffix>` instead of the static `run:<journey>:<profile>`, so re-running a journey never overwrites a prior run's evidence.
- `result.json` reports the **whole-run verdict** (`running` until every step completes, then `passed`/`failed`) with a `completion` breakdown, `summary`, `completedAt`, and an honest `crystallized: false` — not the last step's status.
- Every run writes a run-level `index.json` (machine) and `index.md` (human, "open this first") built by scanning the run directory, so all artifacts — headline proof, per-step folders, and `forensics/` snapshots/screenshots — are linked. A journey-level `latest.json` pointer names the newest run.
- The phase-level run paths (`journey.phase` / `untilStep` / `untilPhase`) now persist per-step artifacts and finalize the run instead of leaving `result.json` frozen at the begin-time state.
- Forensics filenames are capture-sequenced and action-tagged (`0001-browser-snapshot.json`, `0001-browser-screenshot-<label>.png`), not timestamp-only.

## Public Package Surface

- `@agent-e2e/harness/core` adds `summarizeRunProgress(run)` (whole-run verdict) and `generateRunId()` (unique sortable interactive run id).
- `@agent-e2e/harness/testcontainers` exposes `createPostgresTestcontainersProvider` (optional peers).
- `@agent-e2e/harness/dev-mcp` exposes `createReloadingHarnessSource` / `ReloadingHarnessSource`.
- The CLI exposes `agent-e2e dev`, `verify`, `init`, `list`, and `call`.

## Security

- `stack.start`/`status`/`list`/`stop` no longer echo the raw provider handle or secret-bearing status into the MCP transcript: the handle is projected to safe scalars, secret-keyed fields (passwords, tokens, DSNs) are redacted, and `sensitive: true` endpoint URLs are masked. `stack.start` diagnostics `logsTail` is redacted with the same vocabulary, so a tail can never leak a connection string. In-process journey handlers still receive the unredacted execution surface.

## Upgrade Notes

- Default to Node for the Dev MCP. Keep journeys in `.ts` for in-process hot-reload.
- Consumers that called `createProcessStackProvider.start()` directly and relied on it blocking until ready must now poll `status()` themselves (readiness is caller-gated). `ProcessStackProviderConfig.readyTimeoutMs` is ignored (kept for config compatibility); use the Dev MCP `stackStart.readyTimeoutMs` instead.
- Interactive run directories are now unique per run; scripts that hard-coded the static `run:<journey>:<profile>` directory should read the `runId`/`artifactDir` returned by `run.begin`, or open the journey-level `latest.json` pointer.

## Adoption Example

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
npm run dev:mcp
```

Then connect a standard MCP client to `http://127.0.0.1:3766/mcp`, or drive it with the built-in client:

```sh
agent-e2e list
agent-e2e call stack.start '{"stackId":"dev"}'
agent-e2e call run.begin '{"journeyId":"<id>","stackId":"dev"}'
agent-e2e call journey.phase '{"runId":"<runId>","phaseId":"<phaseId>"}'
# open .agents-e2e/artifacts/<journey>/latest.json -> newest run's index.md
```

## Validation Commands

Release preparation should validate the exact public paths:

```sh
npm run check
npm run e2e:verify --workspace @agent-e2e/showcase
npx skills add . --list
```

Before creating a release tag, maintainers should confirm the package version, package lock, changelog section, and this release notes file all match `1.4.0`.

## Breaking Changes

- `createProcessStackProvider.start()` is launch-only: direct callers must poll `status()` for readiness (the Dev MCP and verify already do). `ProcessStackProviderConfig.readyTimeoutMs` is ignored.
- Unnamed interactive runs now use unique per-run directories instead of a single static directory.
