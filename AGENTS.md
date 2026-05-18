# agent-e2e-harness — Repo Operating Contract

This repository contains a reusable E2E harness for agent workflows. It defines MCP-driven journey harness patterns so agent-built products can run browser/API proofs, collect artifacts, clean up owned resources, and verify configured journey suites in CI.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `aitoroses/agent-e2e-harness`. See `docs/agents/issue-tracker.md`.

When `$to-prd` is invoked, publish the PRD as a GitHub issue and apply `ready-for-agent`. Do not create a local `docs/prd/*` PRD file unless the user explicitly asks for a repo-local PRD artifact in addition to the GitHub issue.

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

Consumer docs should describe a standard Streamable HTTP MCP client configured with the stable Dev MCP URL, `http://127.0.0.1:3766/mcp`, unless the app intentionally overrides `AGENT_E2E_MCP_PORT`. When validating this repository's Dev MCP implementation itself, `mcporter` is an acceptable low-level smoke-test client:

```sh
mcporter list http://127.0.0.1:<port>/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:<port>/mcp --allow-http --tool '<tool.name>' --args '<json>' --output json
```

Do not substitute Browser Skill, raw Playwright scripts, direct function calls, or ad-hoc Node snippets for MCP implementation validation unless explicitly debugging a lower-level failure and label it as such.

### Lifecycle expectation

The stable development path is:

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
```

`dev:mcp` is the canonical Dev MCP entrypoint and should delegate to `agent-e2e dev`. It uses a stable MCP URL by default, `http://127.0.0.1:3766/mcp`, and keeps app URLs as stack-owned data returned by `stack.start` / `stack.status`. Fixed MCP ports are configured with `AGENT_E2E_MCP_PORT`. Consumer usage should connect a standard MCP client to the stable Dev MCP URL. Dev MCP/server/browser sessions must be managed by documented commands with clear start/status/stop behavior. A browser session must not depend on a temporary shell or hidden `.scratch` process staying alive.

Runtime Targets and Attached Runtime Mode use the same public-command proof standard. `agent-e2e attached --target <id>` connects to an already-running Attached Runtime Target and does not own infrastructure lifecycle. Prove attached work through `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.explore.list`, `runtime.explore.run`, profile-selected `run.begin`, artifacts, and ownership-bounded cleanup. Do not replace `stack.*`; managed stack lifecycle remains separate.

The stable CI verification path is:

```sh
npm run e2e:verify --workspace @agent-e2e/showcase
```

`e2e:verify` should delegate to `agent-e2e verify`, load `agent-e2e.config.ts`, start the configured stack once, run the configured journey suite, write suite reports under `.agents-e2e/artifacts/_suites/<suite-id>/`, and exit cleanly. For public command or package-bin changes, validate the exact documented command, not only an equivalent internal import or test helper.

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
- `npm run e2e:verify --workspace @agent-e2e/showcase` passes and exits cleanly when the change affects journey/config/CLI/CI behavior;
- targeted harness/showcase tests pass.

### Validation artifact standard

Generated proof/debug evidence belongs under `.agents-e2e/artifacts/<journey>/<run>/` for interactive runs and `.agents-e2e/artifacts/_suites/<suite-id>/` for verify suite reports. Interactive artifacts should be returned through MCP artifact refs. Do not use `.scratch`, `ui-e2e/`, or an extra `steps/` nesting layer as the primary validation artifact layout.

Expected run evidence includes top-level `seed-manifest.json`, `result.json`, `timeline.json`, `metrics.json`, `owned-resources.json`, cleanup artifacts when applicable, `forensics/` browser snapshots/screenshots, and numbered `01-phase-.../01-step-.../` step folders with `before.png`, `after.png` or `failure.png`, `console.json`, `network.json`, `result.json`, and `step-feedback.json`.

Expected verify suite evidence includes `report.json`, `report.md`, and `runs/<journey>/<profile>/<run>/` entries inside the suite directory.

### Skill and transcript standard

- The consumer workflow skill lives at `skills/agent-e2e-harness/SKILL.md` with one-level progressive references under `skills/agent-e2e-harness/references/`.
- `npx skills` is the canonical install surface for this repo's public skills. Do not document Codex-internal skill installation as the consumer path.
- Public README surfaces should show installation through `npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness ...`.
- For local dogfood or PR validation, install from the working tree with `npx skills add . --skill agent-e2e-harness --agent codex -y` or list first with `npx skills add . --list`.
- Validate skill packaging with `npx skills add . --list`; this must discover `agent-e2e-harness` before claiming the skill is shippable.
- Validate local installation with `npx skills ls --json` or `npx skills ls -a codex --json`, accounting for the agent name that the CLI reports in the current adapter.
- Validate skill structure with the skill validator when changing the skill body or references.
- Do not version local installed skill copies under `.codex/` or `.agents/`.
- Do not commit `skills-lock.json` when it was generated by a local working-tree install; it may contain machine-specific absolute paths.
- Preserve meaningful dogfood runs in `docs/showcase/mcporter-proof-transcript.md` rather than relying on terminal scrollback.

## Branch and PR Protocol

Branch names should describe the work surface, not the first file touched:

```txt
<type>/<issue-or-release>-<short-slug>
```

Use `feat/` for user-facing behavior or public API, `fix/` for regressions, `docs/` for docs-only work, `chore/` for release workflow/repo hygiene, `release/` for release-prep branches, and `audit/` for read-only investigations. Include the issue number and PRD slug when the work came from a PRD or issue, for example `feat/18-agent-e2e-dev-verify-cli`.

PR titles should use the same intent-oriented type as the branch, for example `feat: add agent-e2e dev/verify launch surface`. Keep PR bodies release-aware:

- `Summary` lists the public behavior and docs surfaces changed.
- `Issues / PRDs` names every GitHub issue and PRD covered by the PR.
- `Validation` lists local commands, GitHub CI state, and any unavailable checks.
- `Release Notes` calls out public CLI/package/skill/release workflow effects when present.
- Link completed GitHub issues and PRDs with closing keywords, for example `Closes #18`. If a PR only partially implements a PRD, say `Part of #<id>` instead of `Closes`.

Open broad launch-surface PRs as draft until local validation and GitHub CI are both green. Tagging and publishing are post-merge release actions, not part of ordinary PR completion.

## Release Maintainer Protocol

Release work in this repo spans code, docs, package metadata, changelog, release notes, tags, GitHub Releases, npm, and skills. Agents working on release-facing changes must keep those surfaces aligned.

### Version and changelog surfaces

- Published package version lives in `packages/harness/package.json`. The root `package.json` is workspace-private and is not the published package version.
- `CHANGELOG.md` is the durable project changelog. Keep `[Unreleased]` current during normal PR work. When preparing a version, move relevant entries into `## [x.y.z] - YYYY-MM-DD`.
- Version-specific GitHub Release notes live in `docs/RELEASE_NOTES-vx.y.z.md`. The release workflow derives the notes path from `packages/harness/package.json` and fails before publish if the matching file is missing.
- Release-facing README/package README examples, `skills/agent-e2e-harness`, and `docs/RELEASE_NOTES-*` must use the same public CLI and install language.

### Release workflow and tags

- The release workflow is `.github/workflows/release.yml`.
- Release preparation is PR-based. Version bumps, package lock updates, changelog sections, release notes, README/package docs, skills, and release workflow edits must merge to `main` through a reviewed PR before publishing.
- Publishing is post-merge release execution. Only create/push the version tag or run `workflow_dispatch` after the release-prep PR has merged to `main`.
- It publishes on `workflow_dispatch` or pushed `v*` tags, checks out the tag, reads `packages/harness/package.json`, and fails unless the tag is exactly `v<package version>`.
- Do not create, move, or push tags without explicit user authorization for that action.
- Before a release tag is created, verify:
  - package version is correct in `packages/harness/package.json`;
  - `package-lock.json` reflects package metadata and bin changes;
  - `CHANGELOG.md` has the release section;
  - `docs/RELEASE_NOTES-vx.y.z.md` exists and release workflow points at it;
  - `npm run check` passes;
  - `npm run e2e:verify --workspace @agent-e2e/showcase` passes and exits cleanly when the release touches harness runtime, CLI, journeys, stack, or docs that claim verify behavior;
  - `npx skills add . --list` still discovers `agent-e2e-harness` when skill surfaces changed.

### npm publish constraints

- npm publish is performed by GitHub Actions using `secrets.NPM_TOKEN`.
- The token must be valid for `@agent-e2e/harness`, have publish rights to the `@agent-e2e` organization/package, and satisfy npm 2FA requirements, typically by using a granular automation token configured to bypass interactive 2FA.
- Do not paste npm tokens into repo files, logs, comments, or issue bodies.
- If publish fails with auth, org/package, or 2FA errors, treat it as release-infrastructure blocked; do not retry by changing package code unless the error proves a package metadata problem.

### Post-release evidence

After a release workflow succeeds, verify and report:

```sh
npm view @agent-e2e/harness@<version> version
gh release view v<version>
```

If a workflow fails after npm publish but before GitHub Release creation, do not republish. The workflow is idempotent for already-published npm versions; rerun after fixing the release blocker.
