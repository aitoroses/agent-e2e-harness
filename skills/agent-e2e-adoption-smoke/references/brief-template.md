# Adoption Smoke Brief Template

Use this as the worker prompt. Fill only the bracketed fields. Keep the tone like normal implementation work.

```text
Build a small application and wire it with Agent E2E Harness.

Product idea: [one concrete app idea with one browser workflow worth proving].

Technology stack to use:
- [framework, language, package manager]
- [persistence approach]
- [browser/runtime constraints]
- Playwright only as needed by Agent E2E Harness.

Use Agent E2E Harness from its public repo/package. The repo pointer is: https://github.com/aitoroses/agent-e2e-harness

Before implementing the harness integration, install the local adoption skill from that repo using npx skills. Use the skill as your main guide for setup, journey authoring, Dev MCP, and CI verification.

Target outcome:
1. The app runs locally.
2. The repo has an agent-e2e.config.ts.
3. There is at least one seeded journey that proves: [baseline], [browser action], [persistence], artifacts are written, and owned test data can be cleaned up.
4. npm scripts include a development MCP command and a verify command using the public agent-e2e CLI.
5. Run the verification command and leave it passing.
6. Add short README instructions for a maintainer to run the app and the Agent E2E verification.

Work autonomously. Prefer the documented public surface over importing internals. If something is unclear, make a reasonable implementation choice and record it in your final notes. When done, report: commands run, what passed/failed, artifact paths, and any rough edges in adopting the harness.
```

## Known Good Team Notes Variant

```text
Build a small application and wire it with Agent E2E Harness.

Product idea: create a tiny "Team Notes" web app for a team to track project notes. It should let a user view projects, create a note inside a project from the UI, and see the new note persist after refresh. Keep the app intentionally small; the point is to have one realistic browser/API journey with seeded state and cleanup.

Technology stack to use:
- Next.js with TypeScript and React.
- npm scripts.
- File-backed JSON storage under a local .data/ directory or another simple local persistence layer; avoid external cloud services.
- Playwright only as needed by Agent E2E Harness.

Use Agent E2E Harness from its public repo/package. The repo pointer is: https://github.com/aitoroses/agent-e2e-harness

Before implementing the harness integration, install the local adoption skill from that repo using npx skills. Use the skill as your main guide for setup, journey authoring, Dev MCP, and CI verification.

Target outcome:
1. The app runs locally.
2. The repo has an agent-e2e.config.ts.
3. There is at least one seeded journey that proves: baseline project exists, browser creates a note through the UI, the note is persisted, artifacts are written, and owned test data can be cleaned up.
4. npm scripts include a development MCP command and a verify command using the public agent-e2e CLI.
5. Run the verification command and leave it passing.
6. Add short README instructions for a maintainer to run the app and the Agent E2E verification.

Work autonomously. Prefer the documented public surface over importing internals. If something is unclear, make a reasonable implementation choice and record it in your final notes. When done, report: commands run, what passed/failed, artifact paths, and any rough edges in adopting the harness.
```
