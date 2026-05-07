# Agent E2E Harness Showcase

Small Next.js consumer app for the harness package-root Playwright API.

## Commands

```sh
npm run dev --workspace @agent-e2e/showcase -- --hostname 127.0.0.1 --port 3100
npm test --workspace @agent-e2e/harness -- showcase
```

The showcase journey demonstrates:

- explicit seed/reseed by clearing browser state and navigating to the app;
- MCP/dev iteration through `createMcpHarnessServer`, `beginRun`, and `runStep`;
- closure through `runClosure` from clean seed;
- artifact IDs for seed and proof status;
- teardown compatibility through the shared ownership-ledger APIs.
