# @agent-e2e/harness v3.0.1

`@agent-e2e/harness` v3.0.1 fixes generated interactive run ids after the v3.0.0 browser evidence release.

## Fix

Unnamed `run.begin` calls now generate lowercase timestamp-first run ids such as:

```text
2026-06-01t10-24-18z-abc
```

The generated id can be passed directly into later MCP calls including:

```text
journey.untilPhase
journey.step
browser.open
```

## Upgrade Notes

- Consumers do not need to pass explicit run ids as a workaround.
- Existing runs with uppercase `T` / `Z` artifact directories remain readable on disk; new runs use the lowercase form.
