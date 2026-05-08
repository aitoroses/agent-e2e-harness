# Proof Notes Showcase

A Next.js demo app that dogfoods the Agent E2E Harness as a real user would:

1. Dev MCP starts first.
2. `stack.start` creates disposable PostgreSQL with Testcontainers and starts `next dev` as managed infrastructure.
3. `run.begin` seeds a baseline workspace/user through the app API.
4. `browser.open` launches a Playwright-owned headed browser by default.
5. `browser.snapshot` exposes forensic refs.
6. `browser.act` clicks the UI through a fresh snapshot ref.
7. `journey.step` captures the browser-created proof note as a journey-owned resource and runs proofs.
8. `cleanup.plan` and `run.reseed` prove owned-resource cleanup while preserving the seed baseline.
9. `stack.stop` tears the disposable infrastructure down.

The showcase intentionally uses a database in the managed stack so seed, reseed, resource ownership, and teardown are observable beyond in-memory UI state.

## Real proof path

Start Dev MCP. It allocates non-conflicting MCP/app ports by default, prints the URLs, and writes `.agents-e2e/dev-mcp.json`. Set `AGENT_E2E_MCP_PORT` or `AGENT_E2E_SHOWCASE_PORT` only when you intentionally need fixed ports.

```sh
npm run dev:mcp --workspace @agent-e2e/showcase
cat .agents-e2e/dev-mcp.json
```

Then drive everything through MCP using the printed `mcpUrl` and `appUrl`:

```sh
mcporter list <mcp-url> --allow-http --schema --json
mcporter call --http-url <mcp-url> --allow-http --tool stack.start --args '{}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool run.begin --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool browser.open --args '{"targetUrl":"<app-url>","journeyId":"showcase:proof-notes","runId":"showcase-dev-browser"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool browser.snapshot --args '{"browserSessionId":"<id>"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool browser.act --args '{"browserSessionId":"<id>","ref":"<create-button-ref>","action":"click"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool journey.step --args '{"runId":"showcase-dev","phaseId":"phase:proof-notes","stepId":"step:create-proof-note","browserSessionId":"<id>"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool artifact.read --args '{"path":".agents-e2e/artifacts/showcase-proof-notes/showcase-dev/01-phase-phase-proof-notes/01-step-step-create-proof-note/step-feedback.json"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool cleanup.plan --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool run.reseed --args '{"runId":"showcase-dev"}' --output json
mcporter call --http-url <mcp-url> --allow-http --tool stack.stop --args '{}' --output json
```

Artifacts are generated under `.agents-e2e/artifacts/<journey>/<run>/`. The harness deliberately avoids `.scratch`, `ui-e2e/`, and nested `steps/` directories so the returned MCP artifact refs are the debugging map:

```text
.agents-e2e/artifacts/showcase-proof-notes/showcase-dev/
  seed-manifest.json
  result.json
  timeline.json
  metrics.json
  owned-resources.json
  01-phase-phase-proof-notes/01-step-step-create-proof-note/
    before.png
    after.png
    console.json
    network.json
    result.json
    step-feedback.json
```

## Framework surfaces demonstrated

- `@agent-e2e/harness/dev-mcp`: local Streamable HTTP MCP server.
- `@agent-e2e/harness/stack`: reusable managed process stack provider.
- `@agent-e2e/harness/testcontainers`: reusable PostgreSQL Testcontainers provider.
- `@agent-e2e/harness/playwright-mcp`: headed browser sessions, snapshots, actions, screenshots.
- `@agent-e2e/harness/mcp`: run, step, cleanup, reseed control surface.

`scripts/dev-mcp.ts` is only the runnable entrypoint and is compiled to ignored `.agents-e2e/dev-mcp-runtime/` output before Node runs it. Showcase-specific harness composition lives in `src/harness/`; shared ids, schema SQL, proof body, and resource-adapter behavior live in `src/proof-notes-contract.ts`; lifecycle mechanics belong in the framework.

## Validation

```sh
npm run build --workspace @agent-e2e/showcase
npm run test --workspace @agent-e2e/showcase -- --reporter=verbose
```
