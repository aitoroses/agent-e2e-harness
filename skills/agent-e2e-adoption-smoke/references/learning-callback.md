# Learning Callback

Send this after the worker finishes, or when you need to close the smoke with learnings.

```text
callback: Close this adoption smoke as a learning report. Please answer in a compact structured format:

1. Final status: app built? agent-e2e.config.ts present? e2e:verify passing? Dev MCP proof via tools passing?
2. Exact commands that passed and artifact paths.
3. Adoption blockers or confusing points, ranked by severity.
4. What the Agent E2E Harness README should say more clearly.
5. What the agent-e2e-harness skill should say more clearly.
6. Any package/API/docs gaps you had to infer or work around.
7. One recommendation for turning this adoption-smoke process into a reusable dev-tool skill.

Do not continue building unless needed to verify a claim; this is a callback/report request.
```

If the answer truncates, send:

```text
callback continuation: continue the learning report from point <N> only. Do not run more commands unless necessary; just report learnings.
```

## Report Synthesis

When summarizing to the user, separate:

- **Agent E2E learnings**: docs, skill, package/API, verify, MCP, cleanup.
- **Orchestration learnings**: AOE, tmux target, trust prompts, hooks, stalled sessions.
- **Actionable changes**: README edits, skill edits, workflow/tooling changes.

Do not overfit one smoke. Treat one run as a ranked hypothesis list unless the failure is deterministic and reproduced.
