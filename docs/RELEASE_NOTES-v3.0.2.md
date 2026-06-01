# @agent-e2e/harness v3.0.2

`@agent-e2e/harness` v3.0.2 fixes Dev MCP hot-reload after the v3 artifact layout change.

## Fix

The Dev MCP reloading harness now ignores the default `runs/` artifact directory.

Without this patch, a normal interactive flow could do:

```text
run.begin -> writes runs/<runId>/run-report.json
journey.untilPhase -> run not found
```

because the config-directory watcher interpreted the generated JSON artifact as
a source/config edit and rebuilt the in-memory harness between calls.

## Upgrade Notes

- Consumers can use unnamed `run.begin` again; the generated run id remains valid for later MCP calls.
- Artifact files under `runs/` no longer trigger Dev MCP config reloads.
