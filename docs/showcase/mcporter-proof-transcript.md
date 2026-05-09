# Dev MCP proof transcript

Captured on 2026-05-07 against the local showcase Dev MCP endpoint using the public user path. This transcript intentionally pins ports for reproducible reading; the current default Dev MCP path dynamically allocates ports and writes `.agents-e2e/dev-mcp.json`. The transcript preserves the proof shape without committing generated `.agents-e2e/` binaries.

## Command path

```sh
AGENT_E2E_MCP_PORT=3491 AGENT_E2E_SHOWCASE_PORT=3117 npm run dev:mcp --workspace @agent-e2e/showcase
mcporter list http://127.0.0.1:3491/mcp --allow-http --schema --json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool stack.start --args '{}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool browser.open --args '{"targetUrl":"http://127.0.0.1:3117","journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool browser.snapshot --args '{"browserSessionId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool browser.act --args '{"browserSessionId":"<id>","ref":"@e2","action":"click"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool artifact.read --args '{"path":"<step_feedback_artifact.path>"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool run.reseed --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool browser.close --args '{"browserSessionId":"<id>"}' --output json
mcporter call --http-url http://127.0.0.1:3491/mcp --allow-http --tool stack.stop --args '{}' --output json
```

## Evidence summary

- `mcporter list`: 19 tools; `artifact.read` present.
- `stack.start`: `showcase-next-dev` ready at `http://127.0.0.1:3117`; PostgreSQL ready through Testcontainers.
- `run.begin`: seeded `showcase-dev`; returned `.agents-e2e/artifacts/showcase-proof-notes/showcase-dev` with `seed-manifest` and `result` artifacts.
- `browser.open`: opened headed Playwright MCP browser; returned `browserSessionId` and `.agents-e2e/artifacts/showcase-proof-notes/showcase-dev`.
- `browser.snapshot`: title `Proof Notes Showcase`; zero visible errors; refs included `@e2` button `Create proof note`; wrote `forensics/browser-snapshot-*.json`.
- `browser.act`: clicked `@e2`; wrote `forensics/action-click-*.png`.
- `journey.step`: passed `phase:proof-notes / step:create-proof-note`; returned before/after screenshots plus `console`, `network`, `result`, and `step-feedback` artifacts.
- `artifact.read`: read `step-feedback.json`; content status `passed`; primary artifacts included `after` and `result`.
- `cleanup.plan`: planned one owned `proof-note` resource and wrote `cleanup-plan.json`.
- `run.reseed`: deleted one owned resource, reseeded, and wrote `cleanup`, `seed-manifest`, and `owned-resources` artifacts.
- `browser.close`: closed the MCP-owned browser session.
- `stack.stop`: stopped Next.js dev process and PostgreSQL container.

## Artifact shape observed

```text
.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  cleanup-plan.json
  cleanup.json
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json

.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/forensics/
  browser-snapshot-*.json
  action-click-*.png
```
