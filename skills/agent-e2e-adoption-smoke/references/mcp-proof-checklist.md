# Dev MCP Proof Checklist

`agent-e2e dev` printing a URL is only a boot check. Adoption proof requires tool calls.

## Portable Dynamic Client Path

Use `mcporter` when the worker session does not already have the Dev MCP registered as a standard MCP client.

Local HTTP endpoints require `--allow-http`.

Reliable command shape:

```sh
mcporter list http://127.0.0.1:3766/mcp --schema --json --allow-http

mcporter call \
  --http-url http://127.0.0.1:3766/mcp \
  --allow-http \
  --tool journey.list \
  --args '{}' \
  --output json
```

Avoid relying on dotted URL selector forms such as:

```sh
http://127.0.0.1:3766/mcp.journey.list
```

That shape can fail for localhost MCP URLs.

## Minimum Tool Loop

The worker should prove at least this sequence:

1. `journey.list` sees the journey.
2. `journey.inspect` returns profiles, phases, steps, proofs, and resource expectations.
3. `stack.start` starts the app and returns service URL.
4. `browser.open` opens the app.
5. `browser.snapshot` sees seeded baseline and interactive controls.
6. `browser.find` resolves at least one stable UI target when semantic lookup is useful.
7. `browser.act`, `browser.wait`, and `browser.get` prove the agent can mutate, wait on, and inspect live app state.
8. `run.begin` seeds the run and returns `canRunSteps: true`.
9. `journey.step` performs the browser/API proof and passes.
10. `artifact.read` reads a step feedback or proof artifact.
11. `cleanup.plan` reports owned resources.
12. `run.reseed` or cleanup removes owned data and restores baseline.
13. `browser.close` closes the browser session.
14. `stack.stop` stops the app.

## Evidence To Capture

- verify suite directory: `.agents-e2e/artifacts/_suites/<suite-id>/`
- Dev MCP run directory: `.agents-e2e/artifacts/<journey>/<run-id>/`
- `report.json` and `report.md`
- step feedback artifact path
- cleanup artifact path
- app data file state before/after cleanup when relevant
