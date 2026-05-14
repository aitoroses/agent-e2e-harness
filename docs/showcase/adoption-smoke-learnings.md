# Adoption Smoke Learnings

Captured from a fresh-agent adoption smoke against `@agent-e2e/harness@1.0.1`.

## Setup

- Clean consumer repo under `/tmp`.
- Fresh Codex AOE session.
- Worker received only a normal app brief, the public repo pointer, and the instruction to install the `agent-e2e-harness` skill with `npx skills`.
- App target: small Next.js Team Notes app with file-backed JSON persistence.

## Result

- App built successfully.
- `agent-e2e.config.ts` was created.
- `npm run e2e:verify` passed.
- Dev MCP proof passed through actual tool calls using `mcporter`.
- Cleanup/reseed restored the seeded baseline.

## Learnings

- `agent-e2e dev` startup is not proof. It only proves the server booted.
- A real development proof must call tools, read artifacts, and prove cleanup or reseed.
- Fresh or remote agent sessions may not have the Dev MCP server registered, so `mcporter` is the portable dynamic client.
- Local HTTP MCP endpoints require `--allow-http`.
- The reliable `mcporter` shape is `--http-url <url> --tool <tool> --args <json>`, not dotted URL selector syntax.
- Naming needs to be explicit:
  - npm package: `@agent-e2e/harness`
  - repo/skill: `agent-e2e-harness`
  - CLI: `agent-e2e`

## Follow-Up

The reusable `skills/agent-e2e-adoption-smoke` skill captures this process so maintainers can repeat the dogfood test and collect future adoption blockers without leaking internal implementation knowledge to the worker.
