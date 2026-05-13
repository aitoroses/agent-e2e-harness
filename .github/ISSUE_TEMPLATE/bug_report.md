---
name: Bug report
about: Report a reproducible problem in the harness, Dev MCP server, showcase, or proof artifacts.
title: "bug: "
labels: needs-triage
assignees: ""
---

## What broke?

Describe the bug and the user-visible harness workflow it affects.

## Surface

Which area is involved?

- [ ] `@agent-e2e/harness/core`
- [ ] `@agent-e2e/harness`
- [ ] `@agent-e2e/harness/mcp`
- [ ] `@agent-e2e/harness/dev-mcp`
- [ ] `@agent-e2e/harness/playwright-mcp`
- [ ] `@agent-e2e/harness/stack`
- [ ] `@agent-e2e/harness/artifacts`
- [ ] `apps/showcase`
- [ ] Documentation or agent skill

## Reproduction

Steps, command path, or MCP tool calls:

```sh

```

## Expected behavior

What Deterministic Proof, artifact, cleanup behavior, or browser state did you expect?

## Actual behavior

What happened instead?

## Evidence

Include relevant run ids, artifact refs, browser snapshots, screenshots, console/network output, or logs. If this involves `apps/showcase`, include whether the app showed a visible runtime error.

## Environment

- OS:
- Node version:
- Bun version:
- Package manager and version:
- Browser/headless mode, if relevant:

## Additional context

Anything else maintainers or an AFK agent should know before triage.
