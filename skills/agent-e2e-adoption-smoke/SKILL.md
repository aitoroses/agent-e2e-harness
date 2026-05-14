---
name: agent-e2e-adoption-smoke
description: Run an independent adoption smoke test for Agent E2E Harness by spawning or directing a fresh agent in a clean consumer app, giving it only the app idea plus the agent-e2e-harness repo/skill pointer, then observing whether it can install the skill, build a journey, run agent-e2e verify, prove Dev MCP with tool calls, and report adoption learnings.
---

# Agent E2E Adoption Smoke

Use this skill when the user wants to dogfood how easy Agent E2E Harness is to adopt from a fresh app, validate docs/skill quality, or learn where a real agent gets stuck.

The goal is not to help the worker succeed by leaking internal knowledge. The goal is to run a realistic adoption tracer bullet and collect evidence.

## Core Rule

The worker should think it is doing ordinary implementation work. Do not tell it it is being evaluated. Give it a normal product brief, a technology stack, and only the public repo/skill pointer.

## Workflow

1. **Prepare a clean consumer repo**
   - Prefer `/tmp/<slug>` for throwaway tests.
   - Initialize git.
   - Do not copy files from the official harness repo.
   - Use a short AOE title; long titles can be truncated in tmux targets.

2. **Spawn or direct a persistent worker**
   - Use the `aoe` skill for AOE sessions.
   - Prefer `codex` when testing Codex adoption.
   - Use `--yolo` unless the user asks otherwise.
   - Decide sandbox with the user when needed; for browser/npm-heavy local smoke tests, no sandbox is often cleaner.
   - Complete AOE readiness before sending the brief.

3. **Send a neutral adoption brief**
   - Use `references/brief-template.md`.
   - Include app idea, stack, repo pointer, skill install requirement, and outcome criteria.
   - Do not include known workarounds unless the first attempt gets blocked.

4. **Observe without contaminating**
   - Use `references/observer-protocol.md`.
   - Poll capture and filesystem state.
   - Do not interrupt while it is making observable progress.
   - If it stalls, record the stall before intervening.

5. **Require real proof**
   - `agent-e2e dev` startup is not enough.
   - The worker must either use a configured MCP client or `mcporter` to call tools.
   - Use `references/mcp-proof-checklist.md` as the minimum proof loop.

6. **Collect learnings**
   - Ask for the callback in `references/learning-callback.md`.
   - Capture commands, artifacts, confusing docs, package/API gaps, and recommended fixes.
   - Keep the report grounded in what the worker actually tried.

## Success Criteria

The smoke is successful only when all are true:

- app runs locally;
- `agent-e2e.config.ts` exists;
- `npm run e2e:verify` or equivalent passes;
- Dev MCP tools are called successfully, not merely started;
- artifact paths are reported;
- cleanup restores seeded state or reports a concrete gap;
- the worker reports adoption blockers and documentation improvements.

## Stop Conditions

Stop when the worker provides a complete learning report, asks for human input, hard-stalls without filesystem/capture progress, or leaves unsafe processes running. If servers are still listening, ask the worker to stop them or stop them yourself before closing.
