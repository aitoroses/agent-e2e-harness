# Sample run artifact

This directory holds one real run produced by the harness (via
`node scripts/generate-sample-run.mjs`) to demonstrate the `runs/<runId>/`
artifact layout and the `browser.inspect` evidence format.

```text
runs/
  latest -> <runId>                       # local convenience symlink (not committed)
  <runId>/
    run-report.md                         # human entry point: verdict + index
    run-report.json                       # machine entry point (whole-run verdict + index)
    inspections/
      0001/
        inspect.md                        # compact Terrarium OC dom-ui-forensics format
        inspect.json                      # richer structured data behind the markdown
        screenshot.png                    # includes the refs overlay when it was enabled
    journeys/
      <journeyId>/
        phases/
          <phaseId>/
            steps/
              <stepId>/
                before.png
                after.png                 # or failure.png / skipped.png
                inspect.md
                inspect.json
                step-report.json          # the single agent-facing step report (raw payload under `execution`)
```

## inspect.md format

`inspect.md` follows Terrarium OC's compact `dom-ui-forensics` shape, optimized
for agent scanability and token efficiency:

- a header (`URL`, `Title`, `Viewport`, `Stats`, `Signals`),
- `## Headings`, `## By role`,
- `## Interactive (DOM order)` — only real action targets (links, buttons,
  inputs, selects, checkboxes, …), each carrying its real `@eN` ref,
- `## Tree` — a hierarchical tree in compact shorthand (`⊞ x,y w×h`,
  `flex-row gap:16`, `grid`, `scroll-y(0/232)`, `bg:#hex`, `p:`, `r:`, `bd:`,
  `sh:xs`, `f:14/400`, `hidden:offscreen`, `disabled`) with **no inline
  selectors**,
- `## Selectors` — `@ref → selector` (data-ui / data-testid / id preferred; DOM
  paths only here, never in the tree),
- `## Snippet` — a compact visible-text sample.

The richer per-node data (geometry, visibility, scroll, layout, style) lives in
`inspect.json`. The tool return itself stays a compact path-oriented index;
details live in the artifacts. Everything is factual — no diagnosis.

The committed run is `2026-05-31T10-24-18Z-daemons-console-oc7/`, generated from
the complex fixture at `packages/harness/test/fixtures/console-app.html`. The
sample uses a neutral `fixture://console-app.html` capture URL and never exposes
a local filesystem path. The `latest` symlink is a local convenience only and is
intentionally not committed; durable references should use the real run id.
