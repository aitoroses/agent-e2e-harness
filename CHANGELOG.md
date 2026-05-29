# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [1.4.0] - 2026-05-29

### Added

- First-class Testcontainers PostgreSQL Stack Provider at the `@agent-e2e/harness/testcontainers` subpath export (`createPostgresTestcontainersProvider`). `pg`, `@testcontainers/postgresql`, and `testcontainers` are optional peer dependencies loaded lazily, so the package-root and `/core` surfaces stay provider-agnostic and consumers no longer copy-paste their own provider. The showcase now consumes this export.
- `agent-e2e dev --watch`: reloads journey/config edits by re-exec'ing the Dev MCP server under `bun --watch`, which restarts the process on file change behind the same MCP port and disposes the managed stack on each restart. `createReloadingHarnessSource` and `runtimeSupportsInProcessReload` are now re-exported from `@agent-e2e/harness/dev-mcp`.

### Fixed

- Documented honest hot-reload behavior. Previously the docs claimed Bun hot-reloads journeys behind a stable URL so "new MCP calls see the updated journeys"; in practice Bun ignores cache-busting `import(url?query)` queries (it keys local modules by path), so `createReloadingHarnessSource` could not hot-swap edited journey/config modules in process under the one runtime the Dev MCP mandates. The source now detects this and warns once instead of silently serving stale journeys, and reload is delivered through restart (`dev --watch`). In-process reload still works under Node, where the query bust is honored.

### Changed

- Bumped the package version to `1.4.0` for the next release (the workspace had drifted to a `0.0.0` repo-root version while `1.3.0` was published).
- Raised `engines.bun` to `>=1.3.14`. Bun `<=1.3.5` hangs forever in `PostgreSqlContainer.start()` during PostgreSQL's multi-phase init (initdb -> shutdown -> restart); `1.3.14` resolves it. Documented the minimum Bun and the rationale in the README.

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
