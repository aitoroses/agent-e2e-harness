# @agent-e2e/harness v3.0.0

`@agent-e2e/harness` v3.0.0 makes browser evidence simpler and more useful for agents: `browser.inspect` is now the standard UI-state artifact path, and `browser.refs` is the optional live overlay for mapping visible UI nodes to stable action refs.

## Highlights

- `browser.inspect` writes `inspect.md`, `inspect.json`, and `screenshot.png` under `runs/<runId>/inspections/<seq>/`.
- `inspect.md` now uses an OC-style UI forensics tree: headings, roles, interactive nodes, compact hierarchy, selectors, and a small HTML snippet.
- `inspect.json` keeps the rich structured data for agents that need exact geometry, layout, typography, color, scroll, and visibility facts.
- `browser.refs({ enabled: true })` paints only referencable UI-forensics nodes, without intercepting pointer events or changing layout.
- Run artifacts now use a single entry-point layout: `run-report.md`, `run-report.json`, ad-hoc `inspections/`, and per-step `step-report.json`.

## Breaking Changes

The old parallel browser evidence tools are removed:

```text
browser.snapshot
browser.find
browser.get
browser.screenshot
browser.console
browser.network
artifact.read
```

Use:

- `browser.inspect` for screenshot, UI tree, console-error signals, and network-failure signals.
- `browser.refs` when a visible overlay helps correlate screenshots to `@eN` refs.
- `browser.eval` or `browser.playwright` as the generic escape hatch when a task needs custom inspection.
- Direct filesystem reads for artifact paths returned by tool calls.

## Upgrade Notes

- Replace `browser.snapshot`, `browser.screenshot`, `browser.console`, and `browser.network` proof flows with `browser.inspect`.
- Replace `browser.find` / `browser.get` selector-specific reads with `browser.inspect({ target })`, `browser.eval`, or `browser.playwright` depending on the needed evidence.
- Stop expecting `step-feedback.json`, `result.json`, `index.json`, `latest.json`, `console.json`, or `network.json` in new runs. Their content is consolidated into `run-report.json`, `step-report.json`, and inspect signals.
- Teach agents to treat tool output as an index and open the returned artifact paths only when they need deeper evidence.
