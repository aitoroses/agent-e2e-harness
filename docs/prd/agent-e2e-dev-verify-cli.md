# PRD: Agent E2E Dev And Verify CLI

## Problem Statement

Agent E2E Harness currently explains an agent-driven development loop, but the public command surface and CI story are not clean enough for adoption. The shipped CLI language exposes package internals, and the README asks users to understand low-level closure code or write their own Playwright wrapper even though they already declared their journeys, stack provider, and resources in `agent-e2e.config.ts`.

Users need one obvious development command for agents and one obvious CI command for verification. CI should run the configured journey suite from the same config file, not require users to duplicate harness orchestration in a separate test runner.

## Solution

Introduce a clean public CLI:

- `agent-e2e dev` starts the agent-facing development MCP server.
- `agent-e2e verify` runs CI verification from `agent-e2e.config.ts`.

`agent-e2e verify` loads the same config used in development, starts the configured stack once for the selected suite, creates isolated Playwright contexts/pages for selected runs, runs journeys from clean seed, cleans owned resources per run, writes suite-level Markdown and JSON reports, and exits non-zero when verification fails.

`verify` runs all configured journeys with default profiles by default. Users can narrow or expand execution with exact selectors, glob selectors, journey tags, named verify suites, profile selectors, and worker count. Reports are suite-scoped so CI can upload one artifact directory.

## User Stories

1. As a library adopter, I want to run `agent-e2e dev`, so that I can connect Codex or Claude to the harness without learning transport-specific internals.
2. As a library adopter, I want startup output to show the MCP URL and agent setup commands, so that I can connect my agent quickly.
3. As a library adopter, I want `agent-e2e verify` to use `agent-e2e.config.ts`, so that I do not write a second orchestration layer for CI.
4. As a CI maintainer, I want `agent-e2e verify` to run every configured journey by default, so that the normal CI command verifies the whole suite.
5. As a CI maintainer, I want verify to run each journey with its default profile by default, so that profile expansion is intentional.
6. As a CI maintainer, I want `--all-profiles`, so that I can intentionally expand coverage across every journey profile.
7. As a CI maintainer, I want `--profile`, so that I can run a named profile across selected journeys.
8. As a CI maintainer, I want missing requested profiles to fail before execution, so that CI does not silently skip coverage or fall back to the wrong profile.
9. As a CI maintainer, I want verify to start the configured stack once for the suite, so that verification is fast and uses the app-level stack provider.
10. As a journey author, I want journey isolation to come from seed, cleanup, run ids, and artifact scoping, so that the shared stack can safely support multiple journey runs.
11. As a CI maintainer, I want verify to run serially by default, so that first adoption is predictable.
12. As a CI maintainer, I want `--workers`, so that I can parallelize journey verification when my seed and cleanup contracts support it.
13. As a CI maintainer, I want parallel verify to use one browser with isolated contexts/pages per run, so that parallel execution is fast and isolated.
14. As a journey author, I want tags on journeys, so that I can classify smoke, regression, domain, or risk coverage.
15. As a CI maintainer, I want named verify suites in config, so that CI can run stable targets such as smoke or regression.
16. As a developer, I want CLI selectors to narrow configured suites, so that local verification can focus on a subset without changing config.
17. As a CI maintainer, I want verify to complete all scheduled runs by default, so that one failure does not hide other failures.
18. As a developer, I want `--fail-fast`, so that local feedback can stop after the first failure.
19. As a CI maintainer, I want cleanup failures to be distinct from proof failures, so that reports show whether product behavior failed or teardown failed.
20. As a CI maintainer, I want cleanup failure to stop scheduling new runs, so that shared stack isolation is not trusted after cleanup boundaries fail.
21. As a CI maintainer, I want per-journey seed failures to be reported while other journeys continue, so that one bad journey seed does not hide unrelated coverage.
22. As a CI maintainer, I want stack startup or stack health failure to stop verification before journeys run, so that CI does not report misleading journey results.
23. As a CI maintainer, I want warnings visible but non-failing by default, so that guidance is preserved without making adoption brittle.
24. As a CI maintainer, I want `--warnings-as-errors`, so that stricter pipelines can fail on warnings.
25. As a maintainer, I want a concise terminal progress list plus final summary, so that CI logs are readable.
26. As a maintainer, I want both Markdown and JSON suite reports, so that humans, agents, and automation can consume the same verification result.
27. As a CI maintainer, I want one suite artifact directory, so that GitHub Actions can upload the whole verification result with one path.
28. As a CI maintainer, I want CI-aware suite ids, so that reports can be tied back to a GitHub Actions run.
29. As a developer, I want local suite ids to avoid collisions, so that repeated local verification runs preserve artifacts.
30. As a GitHub Actions user, I want concise annotations by default in GitHub Actions, so that failures appear inline without replacing the report artifact.
31. As a maintainer, I want CLI flags to override config defaults, so that local and CI runs can tune behavior without editing config.
32. As a maintainer, I want config defaults to override CI auto-detection, so that repo-level behavior stays intentional.
33. As a documentation reader, I want the README to show `agent-e2e dev` and `agent-e2e verify`, so that the adoption path is direct.
34. As a documentation reader, I want images placed near the concepts they explain, so that diagrams support the README instead of decorating it.
35. As an agent, I want reports to link to per-run artifacts, so that failure diagnosis starts from the unified suite result.

## Implementation Decisions

- Build or modify these major modules:
  - CLI command router for the public `agent-e2e` binary, `dev`, `verify`, flag parsing, help text, and old command cleanup.
  - Verify config resolver for loading `agent-e2e.config.ts` and resolving verify settings by precedence.
  - Verify selection engine as a deep, pure module that maps journeys, tags, suites, CLI selectors, and profile flags into selected journey/profile runs or selection errors.
  - Verify runner for stack lifecycle, selected-run queue, workers, shared Playwright browser, per-run context/page isolation, seed, journey execution, and cleanup orchestration.
  - Verify artifact layout for suite ids, run ids, suite-scoped artifact paths, and CI-friendly upload shape.
  - Verify reporter as a deep module that produces Markdown, JSON, terminal list output, JSON stdout, and GitHub annotations from one suite result.
  - Dev command presentation for the existing Dev MCP Server startup experience, including Codex and Claude setup guidance.
  - README and package docs integration once the commands are real.
- The public binary is `agent-e2e`.
- The public command pair is `agent-e2e dev` and `agent-e2e verify`.
- `agent-e2e dev` starts the Streamable HTTP Dev MCP Server and prints user-facing setup output for Codex and Claude.
- `agent-e2e verify` is config-backed and uses `agent-e2e.config.ts` as the single integration point.
- `verify` runs all configured journeys with each journey's default profile by default.
- `verify` supports exact journey selectors, glob journey selectors, tags, excludes, profile selectors, all-profile expansion, and named suites.
- Journey tags live on journeys, not profiles.
- Named verify suites are an array of suite objects with `id`, optional `title`, selector fields, profile fields, and optional all-profile expansion.
- `--suite` selects the base set; other CLI selectors narrow it; `--exclude` subtracts.
- Requested profiles must exist on every selected journey or selection fails before execution.
- Verify settings resolve in this order: CLI flags, config defaults, CI/environment auto-detection, built-in defaults.
- The verify stack lifecycle starts the configured stack once for the selected suite and stops it once after suite completion.
- Verify uses a selected-run queue so worker-pool parallelism is built into the runner shape.
- Verify is serial by default and supports explicit `--workers`.
- Verify owns one Playwright browser per process and creates an isolated browser context/page per selected run.
- Verify performs per-run cleanup by default after result capture, even for failed runs.
- Cleanup failures produce a distinct failing status and stop scheduling new runs.
- Per-journey seed failures produce a distinct failing result and do not stop unrelated journeys.
- Stack startup or health failure stops the suite before journey execution.
- Warnings are visible and non-failing by default; strict mode can convert warnings into failures.
- Verify completes all scheduled runs by default and supports fail-fast scheduling.
- Verify writes a suite-level Markdown report and a suite-level JSON report by default.
- Verify writes one suite artifact directory under the configured artifact root, with per-run artifacts scoped inside that suite directory.
- Suite ids are CI-aware when environment variables are available, and timestamp-plus-suffix locally.
- Built-in reporter modes include list, quiet, JSON, and GitHub annotations. Custom reporter plugins are out of scope for the first design.
- GitHub annotations auto-enable in GitHub Actions when no reporter is explicitly set.
- README examples should describe standard agent MCP configuration in development and config-backed verify in CI. They should not lead with custom MCP client code or user-written Playwright wrappers.
- The existing README image pass remains part of this work: optimized README images, contextual placement, and concise captions.

## Testing Decisions

- Tests should exercise public behavior through CLI/config boundaries rather than internal helper details.
- CLI command parsing should cover `dev`, `verify`, selectors, workers, reporters, warnings-as-errors, fail-fast, artifact root, and error cases.
- Selection tests should cover default all-journey/default-profile behavior, exact selectors, glob selectors, tags, excludes, named suites, profile selection, all-profile expansion, and missing-profile errors.
- Verify runner tests should cover stack lifecycle, serial execution, worker-pool scheduling, shared-browser/context isolation, per-run cleanup, cleanup failure scheduling behavior, seed failure continuation, and stack failure stop behavior.
- Report tests should cover Markdown and JSON output, suite artifact layout, per-run artifact links, warnings/errors, status summaries, and CI-aware suite ids.
- GitHub reporter tests should cover auto-detection, explicit reporter override, and concise annotations.
- README and package docs should be checked for truthful command names and absence of stale `agent-e2e-harness dev-mcp` or custom MCP client onboarding.

## Out of Scope

- Custom reporter plugin API.
- Interactive dashboard or TUI for `agent-e2e dev`.
- Profile-level tags.
- Symlinked duplicate artifact layouts for verify.
- Keeping old CLI names as user-facing compatibility aliases.
- Requiring users to write a Playwright Test wrapper as the primary CI path.
- Replacing the Dev MCP Server transport with a non-MCP interface.

## Further Notes

This PRD supersedes the earlier public-doc framing around a "Closure Command". Internally, `runClosure` may remain as an implementation API, but public onboarding should describe `agent-e2e verify` as the CI verification command and "verified proof" as the user-facing outcome.
