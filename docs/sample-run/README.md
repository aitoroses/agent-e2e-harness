# Sample run artifact

This directory holds one real run produced by the harness (via
`node scripts/generate-sample-run.mjs`) to demonstrate the `runs/<runId>/`
artifact layout introduced with `browser.inspect` and `browser.refs`.

```text
runs/
  latest -> <runId>                       # local convenience symlink (not committed)
  <runId>/
    run-report.md                         # human entry point: verdict + index
    run-report.json                       # machine entry point (whole-run verdict + index)
    inspections/
      0001/
        inspect.md                        # where am I / visible state / what can I act on / signals / artifacts / UI tree
        inspect.json                      # structured UI forensics refs + bounding boxes
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

The committed run is `2026-05-31T10-24-18Z-auth-boundary-oc7/`. The `latest`
symlink is a local convenience only and is intentionally not committed; durable
references should use the real run id.
