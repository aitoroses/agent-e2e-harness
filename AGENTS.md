# agent-e2e-harness — Repo Operating Contract

This repository contains a reusable E2E harness for agent workflows. It defines MCP-driven journey harness patterns so agent-built products can run browser/API proofs, collect artifacts, and clean up owned resources.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `aitoroses/agent-e2e-harness`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the canonical five-label triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: repo-root `CONTEXT.md` plus repo-root `docs/adr/` when they exist. See `docs/agents/domain.md`.

## User-real-path proof protocol

This project exists to prove that a reusable harness can guide agents through deterministic E2E work. Agents must therefore demonstrate features the way a library user would use them, not through private scratch scripts or direct internal imports.

### Required posture

- Treat `apps/showcase` as the canonical consumer app. It must consume public harness entrypoints and documented workspace commands.
- Prefer versioned scripts/config in the repo over `.scratch/` scripts. `.scratch/` is allowed only for disposable investigation, never as the primary demo/proof path.
- Do not present a capability as proven until it runs through the same public command path a user would run.
- If the browser shows an app/runtime error, the work is not done even if tests pass.

### Repo-internal MCP implementation checks

Consumer docs should describe a standard Streamable HTTP MCP client configured with the `mcpUrl` written by `dev:mcp`. When validating this repository's Dev MCP implementation itself, `mcporter` is an acceptable low-level smoke-test client:

```sh
mcporter list http://127.0.0.1:<port>/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:<port>/mcp --allow-http --tool '<tool.name>' --args '<json>' --output json
```

Do not substitute Browser Skill, raw Playwright scripts, direct function calls, or ad-hoc Node snippets for MCP implementation validation unless explicitly debugging a lower-level failure and label it as such.

### Lifecycle expectation

The stable path is:

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
cat .agents-e2e/dev-mcp.json
```

`dev:mcp` is the canonical Dev MCP entrypoint. It uses a stable MCP port by default, writes `mcpUrl` to `.agents-e2e/dev-mcp.json`, and keeps app URLs as stack-owned data returned by `stack.start` / `stack.status`. Fixed MCP ports are configured with `AGENT_E2E_MCP_PORT`. Consumer usage should connect a standard MCP client to `mcpUrl`. Dev MCP/server/browser sessions must be managed by documented commands with clear start/status/stop behavior. A browser session must not depend on a temporary shell or hidden `.scratch` process staying alive.

### Browser proof expectation

For visual/app proof, use the Playwright-owned MCP browser tools:

1. `browser.open` with `headed: true` when the user needs to see the browser.
2. `browser.snapshot` as the primary forensics packet.
3. `browser.screenshot` for visual evidence.
4. `browser.close` only when the user asks or cleanup/teardown explicitly requires it.

The visible window may be a Chromium engine window, but the proof must identify it as a Playwright-owned MCP browser session and include the `browserSessionId`.

### Completion bar for showcase work

For showcase-facing changes, minimum evidence is:

- documented command path works;
- a standard MCP client can discover/call the relevant MCP tools, or `mcporter` can do so for repo-internal MCP smoke testing;
- Playwright-owned MCP browser can open the app;
- `browser.snapshot` has no visible app/runtime errors;
- screenshot looks acceptable for the claimed UX state;
- targeted harness/showcase tests pass.

### Validation artifact standard

Generated proof/debug evidence belongs under `.agents-e2e/artifacts/<journey>/<run>/` and should be returned through MCP artifact refs. Do not use `.scratch`, `ui-e2e/`, or an extra `steps/` nesting layer as the primary validation artifact layout.

Expected run evidence includes top-level `seed-manifest.json`, `result.json`, `timeline.json`, `metrics.json`, `owned-resources.json`, cleanup artifacts when applicable, `forensics/` browser snapshots/screenshots, and numbered `01-phase-.../01-step-.../` step folders with `before.png`, `after.png` or `failure.png`, `console.json`, `network.json`, `result.json`, and `step-feedback.json`.

### Skill and transcript standard

- The consumer workflow skill lives at `skills/agent-e2e-harness/SKILL.md`, initialized through `npx skills init`.
- Do not version local installed skill copies under `.codex/` or `.agents/`.
- Preserve meaningful dogfood runs in `docs/showcase/mcporter-proof-transcript.md` rather than relying on terminal scrollback.
