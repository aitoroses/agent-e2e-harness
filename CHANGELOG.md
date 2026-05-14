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
