# @agent-e2e/harness v1.2.0

`@agent-e2e/harness` v1.2.0 adds the Browser Workbench: a standard Dev MCP browser exploration surface for coding agents that need to inspect DOM state, resolve targets, act, wait, read runtime signals, and collect explicit evidence without custom client code.

## Highlights

- Dev MCP browser sessions now expose `browser.find`, expanded `browser.act`, `browser.wait`, `browser.get`, `browser.eval`, `browser.playwright`, `browser.console`, and `browser.network`.
- `browser.find` resolves semantic locators into reusable refs, complementing snapshot refs from `browser.snapshot`.
- `browser.wait` supports explicit browser conditions and returns elapsed timeout feedback.
- `browser.get` reads targeted state without requiring another broad snapshot.
- `browser.console` and `browser.network` provide cursor-based signal buffers for runtime debugging.
- `browser.eval` and `browser.playwright` provide bounded escape hatches for exploration code against the live MCP-owned page/browser.
- `browser.screenshot` is now the explicit visual evidence path; `browser.act` no longer creates implicit screenshots.
- README, package README, showcase docs, proof transcript, launch imagery, and the `agent-e2e-harness` skill now document the Browser Workbench surface.

## Public Package Surface

- `@agent-e2e/harness/dev-mcp` exposes the Browser Workbench tool contracts through the standard Dev MCP endpoint.
- `@agent-e2e/harness/playwright-mcp` includes Browser Workbench packet types and MCP-owned browser session support for the expanded `browser.*` surface.

## Installation

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
```

Install the adoption skill for Codex:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
```

## Quickstart

Start with the [README 5-minute walkthrough](../README.md#install-in-5-minutes). For browser exploration, start `agent-e2e dev`, attach a standard MCP client to `http://127.0.0.1:3766/mcp`, open the app with `browser.open`, inspect state with `browser.snapshot`, then use the Browser Workbench tools to drive and verify the journey.

## Breaking Changes

None.

## Behavior Changes

- `browser.act` no longer captures screenshots implicitly. Call `browser.screenshot` when visual evidence is required.
