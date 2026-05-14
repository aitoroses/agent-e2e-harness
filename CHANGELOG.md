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

## [1.0.0] - 2026-05-13

### Added

- Published `@agent-e2e/harness` as the first stable release.
- Stable package exports for `.`, `./core`, `./stack`, `./artifacts`, `./dev-mcp`, `./verify`, and `./playwright-mcp`.
- Public `agent-e2e` CLI with `agent-e2e dev` and `agent-e2e verify`.
- Config-backed verify runner for journey suites, selectors, profiles, worker count, cleanup modes, Markdown/JSON reports, and GitHub annotations.
- Default Playwright-oriented Harness API for browser/API proof loops.
- Generic Harness Core with the Inspectable Journey Contract.
- Dev MCP server with stable Streamable HTTP endpoint and hot-reloaded journey registry.
- `journey.inspect` Dev MCP tool for returning the full Inspectable Journey Contract.
- Typed Resource Registry support through `defineResourceKind`, `createResourceRegistry`, and `defineAgentE2EConfig`.
- Ownership Ledger and Resource Adapter teardown contracts.
- MCP-owned Playwright browser session tools for open, snapshot, act, screenshot, and close flows.
- Published artifact contract under `.agents-e2e/artifacts/`, including verify suite reports under `_suites/<suite-id>/`.
- `agent-e2e-harness` adoption skill with progressive references and `npx skills` install instructions.
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
