# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Self-diagnosing `stack.start` cold-start. The bounded retry (default 2 attempts) added in 1.4.0 self-heals the first-call cold-start race, but its root cause (external Docker pull / dev-server compile vs. an internal init-ordering bug) was argued from code, not proven from data. `stack.start` now makes the failure empirical: a failed envelope carries a `diagnostics` field — `{ attempts, services: [{ id, status, logsTail }], note? }` — aligned per-service with the `StackStatusPacket.services` the provider already returns. A `logsTail` is attached **only** to services that are not ready (ready services get `[]`), captured via the same `provider.logs` plumbing `stack.logs` uses (bounded to 20 lines) from the live handle before its teardown, so the payload is small and points straight at the culprit. The tail is redacted at the MCP boundary (the same secret vocabulary as the status/handle redaction): DSN credentials and `token=`/`secret=`-style assignments in log text are masked, so a diagnostics tail can never leak a connection string. When the provider's status throws outright (no packet to enumerate), `services` is `[]` with an explanatory `note` rather than a guess. A successful start now also reports `attempts` on the ok envelope, so a self-heal (`attempts > 1`) is visible instead of silent. Both fields are additive — existing consumers that parse the ok/failed shape are unaffected.
- `agent-e2e init [targetDir]`: a one-command scaffolder that writes a minimal, runnable starting point — `agent-e2e.config.ts` (a `defineAgentE2EConfig` with a sample journey wired in) and `journeys/sample.journey.ts` (one phase = state, one proof-light step = frame) — and prints the exact next commands (`agent-e2e dev`, then `agent-e2e list` / `agent-e2e call run.begin …`). It is idempotent and non-destructive: an existing file is skipped with a notice rather than overwritten, unless `--force` is passed; the report lists what was written vs skipped. The generated config omits `browserSessions` (the Dev MCP auto-creates a Playwright session) and carries commented wiring for an explicit `createPlaywrightMcpBrowserSessionManager()` (which type-checks under strict mode as of 1.4.0) and a stack provider. The generated config type-checks against the public types under strict + `exactOptionalPropertyTypes` and loads through the same jiti loader the Dev MCP uses, so the scaffold is live code rather than dead boilerplate.

### Changed

- Readiness is now a single authority (`status()`), gated by the caller. `createProcessStackProvider.start()` is **launch-only**: it spawns the process and returns the live handle immediately instead of blocking on `waitForReady` and throwing on timeout. The Dev MCP `StackInstanceManager` now owns the readiness gate — after `start()` it polls `provider.status(handle)` until the stack reports `ready`, a terminal `failed`/`stopped` arrives, or a configurable window elapses (`stackStart.readyTimeoutMs` / `pollIntervalMs`, defaults 90000ms / 500ms) — while holding the live handle. The bounded `stackStart` retry composes: each attempt is start + poll-to-ready, and a readiness timeout is a retryable non-ready attempt. This is the change that makes the failed-start diagnostics actually fire for the flagship process provider (see Fixed). Consumers that called the process provider's `start()` directly and relied on it blocking until ready must now poll `status()` themselves (the showcase e2e harness was updated to do so).

### Deprecated

- `ProcessStackProviderConfig.readyTimeoutMs` is ignored as of 1.4.0 (the provider no longer blocks on readiness). The readiness timeout is now the Dev MCP `stackStart.readyTimeoutMs`. The field is kept for config compatibility.

### Removed

### Fixed

- Failed-`stack.start` diagnostics now fire for the flagship `createProcessStackProvider`, not just providers whose `status()` returns a `failed` packet. Previously the process provider waited for readiness *inside* `start()` and threw on timeout, so no handle escaped to diagnose — the manager hit its fallback and returned `diagnostics.services: []` with a "status unavailable" note. The most common real failure ("the service launched but never became ready") therefore produced **empty** diagnostics — exactly the blind cold-start the diagnostics were meant to cure. With `start()` now launch-only and the manager polling `status()` while holding the live handle, a readiness timeout (or a `degraded` service that never came up) is captured via the existing `captureServiceDiagnostics` path: `diagnostics.services[]` carries the failing service with a redacted, bounded `logsTail` of its startup logs, and no "status unavailable" note. Also fixed: a non-ready `status()` packet that is `degraded` (not just `failed`) is now correctly treated as not-ready by the manager's readiness gate.

### Security

## [1.4.0] - 2026-05-29

### Added

- `journey.untilStep` Dev MCP tool for step-granular time travel. `journey.untilPhase` only lands at phase boundaries; the UI-validation model treats each step as a distinct visual frame, so `journey.untilStep` makes every frame individually addressable — it runs a phase from its first step up to **and including** a target step and parks the managed state exactly there. A step is addressed by its stable `stepId` within a `phaseId` (`{ runId, phaseId, stepId }`, the same address `journey.step` already uses) — never a positional ordinal that shifts when a journey is edited. The tool mirrors `journey.untilPhase`'s contract and envelope (`{ status, results, guidance }`, with the landed step at `results.at(-1)`), reuses the same `runJourneyStep` machinery as `runPhase`/`untilPhase` rather than duplicating the runner, and returns the same coherent not-found envelope (`{ status: "not-found", subject: "step" | "phase" }`) for an unknown step or phase.
- `agent-e2e list` and `agent-e2e call <toolName> [jsonArgs]`: a built-in MCP-over-HTTP client for driving a running Dev MCP server, so consumers no longer hand-write a ~50-line client. `list` prints the server's tool names; `call` invokes a tool, prints its text result (JSON fallback), and exits non-zero on a tool error. Endpoint comes from the same config as `dev` (`AGENT_E2E_MCP_HOST/PORT/PATH`, or a full `AGENT_E2E_MCP_URL` override via the shared `resolveDevMcpEndpoint`/`resolveDevMcpClientUrl`); per-call timeout defaults to 300000ms (`AGENT_E2E_MCP_CALL_TIMEOUT_MS`) so slow tools like `stack.start` don't hit the MCP SDK's 60s default.
- First-class Testcontainers PostgreSQL Stack Provider at the `@agent-e2e/harness/testcontainers` subpath export (`createPostgresTestcontainersProvider`). `pg`, `@testcontainers/postgresql`, and `testcontainers` are optional peer dependencies loaded lazily, so the package-root and `/core` surfaces stay provider-agnostic and consumers no longer copy-paste their own provider. The showcase now consumes this export.
- Runtime-agnostic config loading via [jiti](https://github.com/unjs/jiti): `agent-e2e.config.ts` and the journey files it imports now load on Node, Bun, or Deno — no precompile step. The `"Bun" in globalThis` gate that threw for TypeScript configs off Bun is removed.
- Real in-process journey hot-reload on any runtime: `createReloadingHarnessSource` watches the config directory and re-evaluates the changed TypeScript graph through jiti (fresh instance, module cache disabled), so `journey.list`/`journey.inspect` reflect an edited journey or config file on the next call behind a stable MCP URL — no server restart, no MCP reconnect. `agent-e2e dev --watch` is kept as an optional hard-restart fallback. `createReloadingHarnessSource` / `ReloadingHarnessSource` are re-exported from `@agent-e2e/harness/dev-mcp`.

### Fixed

- First `stack.start` cold-start race. On a freshly-started Dev MCP server the very first `stack.start` could fail (Docker image pull/daemon warmup, a cold dev-server compile tripping the readiness probe) even though an immediate retry brought up a healthy stack — hitting adopters on their literal first call. `stack.start` now retries the provider start/readiness path with a small bounded backoff (default 2 attempts, 750ms apart; tunable/disable via `stackStart: { maxAttempts, backoffMs }`) so the first call self-heals; each failed attempt fully tears its own handle down before retrying, and deterministic precondition failures (e.g. a duplicate `stackId`) are surfaced immediately without retrying. Separately, `stack.start`/`stack.status`/`stack.stop` failures are now always returned as a coherent `{ status: "failed", code, message }` envelope (e.g. `stack-start-failed`) instead of the generic `{ status: "error", error }` shape that omitted `code`/`message`, so clients can branch on `status` without tripping over a missing key. Verified root cause: there is no server/provider init-ordering race (the stack manager is built synchronously and the HTTP server only accepts requests after `listen` binds); the race is an external cold start, so the bounded retry — not a readiness-ordering change — is the fix.
- Explicit `browserSessions` wiring now type-checks under strict mode. `defineAgentE2EConfig({ browserSessions: createPlaywrightMcpBrowserSessionManager() })` previously failed `tsc` because `DevMcpBrowserSessionController` methods declared their parameters as `Record<string, unknown>` while the manager uses narrow input types — a `strictFunctionTypes` parameter-variance mismatch that forced consumers onto the non-obvious "omit `browserSessions` and let the server auto-create it" workaround. The controller method parameters are now typed against the shared public input shapes (`BrowserOpenInput`, `BrowserActInput`, `BrowserFindInput`, `BrowserWaitInput`, `BrowserGetInput`, `BrowserScreenshotInput`, `BrowserCodeRunInput`, `BrowserSignalToolInput`), so the public factory is assignable to the config field and custom controllers gain call-site type-safety. The omit path and `browserSessions: false` remain supported; runtime behavior is unchanged (validated MCP arguments are bridged to the typed inputs at the router boundary).
- Honest, working hot-reload. Earlier docs claimed Bun hot-reloads journeys behind a stable URL, but Bun ignores cache-busting `import(url?query)` queries (it keys local modules by path), so in-process reload never worked under Bun — the runtime the Dev MCP previously mandated. Loading consumer TypeScript through jiti instead delivers genuine in-process reload on every runtime (a known limitation: only TypeScript journeys reload in process; plain `.mjs`/`.js` journeys go through native ESM, which is globally URL-cached — keep journeys in `.ts`).

### Changed

- Bumped the package version to `1.4.0` for the next release (the workspace had drifted to a `0.0.0` repo-root version while `1.3.0` was published).
- The Dev MCP is now runtime-agnostic. Removed the hard `bun` engine requirement (`engines` keeps `node >=22`); the bin shebang is now `node`. Node is the default and recommended runtime (real in-process hot-reload, and ~6s vs ~25s Testcontainers PostgreSQL startup). Bun still works; if you run on Bun with the Testcontainers PostgreSQL provider, use Bun `>=1.3.14` (Bun `<=1.3.5` hangs in `PostgreSqlContainer.start()`) — this is now advisory, not enforced.

### Security

- `stack.start`, `stack.status`, `stack.list`, and `stack.stop` no longer echo the raw provider handle or secret-bearing status into the MCP tool transcript. The `stack.start` handle is now projected to top-level safe scalars only — nested provider internals (docker modems, sockets, the full Testcontainers `inspectResult` with env/mounts/overlay paths) are dropped wholesale, and secret-keyed fields (passwords, tokens, DSNs, connection strings) are redacted. Stack status responses mask the URL of any endpoint declared `sensitive: true` (and matching service URLs). In-process journey handlers still receive the unredacted execution surface, so behavior is unchanged; only the agent-visible transcript and artifacts are sanitized.

## [1.3.0] - 2026-05-16

### Added

- Explicit Dev MCP Stack Instances identified by `stackId`, including `stack.list` recovery and multi-stack start/status/log/explore/stop routing.
- Run Stack Binding for stack-backed Dev MCP journeys, so `run.begin` binds a run to a selected Stack Instance and stack evidence can be attached only to compatible runs.
- `StackStartContext` provider contract with named port and artifact path allocation helpers for isolated stack resources.
- Worker-scoped verify stacks, lazy `worker-*` stack startup, first-class `stacks[]` verify report evidence, and run-to-stack correlation.
- Showcase public-path proof for explicit Stack Instances, named allocations, and `npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2`.

### Changed

- Dev MCP stack-targeting tools now require explicit `stackId` instead of selecting a hidden Stack Instance.
- `agent-e2e verify` now treats `workers` as both the selected-run concurrency limit and the maximum active Verify Worker Stack count.
- README, package README, showcase docs, proof transcript, and the `agent-e2e-harness` skill now teach `stackId`, `stack.list`, Run Stack Binding, `StackStatusPacket.services`, `StackStartContext`, Named Stack Allocations, and worker-scoped verify.

## [1.2.0] - 2026-05-15

### Added

- Browser Workbench Dev MCP surface with `browser.find`, expanded `browser.act`, `browser.wait`, `browser.get`, `browser.eval`, `browser.playwright`, `browser.console`, and `browser.network`.
- Browser ref store, semantic find refs, conditional waits, targeted reads, bounded page/Playwright code runners, and per-session console/network signal buffers.
- Explicit `browser.screenshot` evidence flow and Browser Workbench documentation across README, package README, showcase docs, proof transcript, and `agent-e2e-harness` skill guidance.
- Versioned launch image prompts and regeneration instructions under `docs/launch/v1.0/`.

### Changed

- `browser.act` no longer creates implicit screenshots; callers should request visual evidence explicitly with `browser.screenshot`.
- Maintainer guidance now treats `npx skills` as the canonical public skill install surface and requires release preparation to merge through PRs before tag/workflow publishing.

## [1.1.0] - 2026-05-14

### Added

- Dev MCP stack exploration surface with unified `stack.status`, live `stack.logs`, provider-declared `stack.explore.list` / `stack.explore.run`, and Zod-validated exploration tools.
- Verify-safe stack observation client under `execution.stack.explore.run(...)` for journeys and `agent-e2e verify`.
- Showcase stack exploration examples for `notes.list` and `postgres.query`, plus updated `agent-e2e-harness` skill guidance.

## [1.0.1] - 2026-05-14

### Added

- Public `agent-e2e` CLI with `agent-e2e dev` and `agent-e2e verify`.
- Stable `@agent-e2e/harness/verify` export for config-backed journey suite verification.
- Config-backed verify runner for journey suites, selectors, profiles, worker count, cleanup modes, Markdown/JSON reports, and GitHub annotations.
- Verify suite artifact contract under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- `agent-e2e-harness` adoption skill with progressive references and `npx skills` install instructions.

### Fixed

- Corrected the published package surface after `1.0.0` shipped before the final Dev/Verify CLI surface was merged.
- Hardened the release workflow to require matching versioned release notes before npm publish.

## [1.0.0] - 2026-05-13

### Added

- Published `@agent-e2e/harness` as the first stable release.
- Stable package exports for `.`, `./core`, `./stack`, `./artifacts`, `./dev-mcp`, and `./playwright-mcp`.
- Initial `agent-e2e-harness` CLI with the Dev MCP command surface.
- Default Playwright-oriented Harness API for browser/API proof loops.
- Generic Harness Core with the Inspectable Journey Contract.
- Dev MCP server with stable Streamable HTTP endpoint and hot-reloaded journey registry.
- `journey.inspect` Dev MCP tool for returning the full Inspectable Journey Contract.
- Typed Resource Registry support through `defineResourceKind`, `createResourceRegistry`, and `defineAgentE2EConfig`.
- Ownership Ledger and Resource Adapter teardown contracts.
- MCP-owned Playwright browser session tools for open, snapshot, act, screenshot, and close flows.
- Published artifact contract under `.agents-e2e/artifacts/`.
- Reference Showcase App demonstrating Bun-backed Dev MCP with a direct PostgreSQL/Testcontainers managed stack.

### Changed

- None - first stable release.

### Deprecated

- None.

### Removed

- None.

### Fixed

- None.

### Security

- None disclosed.
