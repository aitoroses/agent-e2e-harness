# Agent E2E Harness v3.0.3 Release Notes

v3.0.3 is a focused browser-evidence polish release for the v3 MCP grammar.

## Fixed

- `browser.eval` and `browser.playwright` no longer suggest the removed `browser.snapshot` tool in their next-action hints; they now point back to `browser.inspect`.
- `browser.inspect` writes capped console/network failure details into `inspect.json` and the human `inspect.md` when signal counters are non-zero. The tool output remains a compact index, while the artifact explains what failed.

## Upgrade Notes

No API migration is required for v3 consumers. Existing `browser.inspect` callers keep the same top-level signal counters and receive additional detail fields only when failures exist.
