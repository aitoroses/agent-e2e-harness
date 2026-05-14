# @agent-e2e/harness v1.0.1

`@agent-e2e/harness` v1.0.1 is the first package version that contains the final public Dev/Verify launch surface.

## Why This Patch Exists

`v1.0.0` was published before the final `agent-e2e` CLI and config-backed CI verification surface landed on `main`. npm versions are immutable, so v1.0.1 ships the corrected public package instead of moving or republishing v1.0.0.

## Highlights

- Public `agent-e2e` binary.
- `agent-e2e dev` for the standard Dev MCP server.
- `agent-e2e verify` for CI verification from `agent-e2e.config.ts`.
- Stable `@agent-e2e/harness/verify` export for suite selection, execution, and reporting.
- Config-backed verify runner that starts the configured stack once, isolates each run with Playwright context/page, cleans owned resources, and writes Markdown plus JSON suite reports.
- Verify suite artifact layout under `.agents-e2e/artifacts/_suites/<suite-id>/`.
- README, package README, showcase docs, release notes, and the adoption skill aligned on the same CLI and setup language.
- Release workflow now requires `docs/RELEASE_NOTES-v<package version>.md` before npm publish.

## Public Package Surface

- `@agent-e2e/harness` - default Playwright-oriented harness API for common consumer usage.
- `@agent-e2e/harness/core` - generic journey, contract, resource, and execution primitives.
- `@agent-e2e/harness/stack` - stack lifecycle contracts for starting, checking, and stopping app dependencies.
- `@agent-e2e/harness/artifacts` - artifact path and writer utilities for the published run layout.
- `@agent-e2e/harness/dev-mcp` - Dev MCP server and config entrypoints for the stable local MCP endpoint.
- `@agent-e2e/harness/verify` - config-backed verify runner, suite selection, reports, and built-in reporter modes.
- `@agent-e2e/harness/playwright-mcp` - Playwright-owned browser session helpers exposed through MCP tools.

## Installation

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
```

Install the adoption skill for Codex:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
```

## Quickstart

Start with the [README 5-minute walkthrough](../README.md#install-in-5-minutes). It shows the skill install command, package install command, `dev:mcp` and `e2e:verify` scripts, the `agent-e2e.config.ts` shape, standard MCP setup against `http://127.0.0.1:3766/mcp`, and CI verification through `agent-e2e verify`.

## Known Gaps and Deferred Work

- `/mcp` subpath export is deferred for v1.x. The internal MCP implementation remains in source, but the legacy in-process embedding mode is not public until its grammar settles.
- `journey.prompt` and `journey.validate` are deferred for v1.x because the Textual Journey Plan payload is not designed yet.

## Breaking Changes

None.
