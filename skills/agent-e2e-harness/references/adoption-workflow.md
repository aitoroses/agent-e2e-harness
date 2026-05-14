# Adoption Workflow

Use this reference before editing a consumer app.

## Inspect First

Find:

- package manager and lockfile: npm, pnpm, yarn, bun
- framework and dev command
- required services: database, queues, containers, mock servers, auth
- existing E2E, Playwright, MCP, or browser automation setup
- app routes/API endpoints needed for one real user-visible flow
- cleanup-safe resource ownership boundary for that flow

Pick one thin vertical flow. Write the intended proof in plain language:

```text
Flow:
Seed:
Action:
Expected proof:
Resources created:
Cleanup rule:
Profiles:
Tags:
```

## Install This Skill

Tell downstream agents how to install the adoption skill from this repository:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -y
```

For global installation:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --agent codex -g -y
```

For all supported agents:

```sh
npx skills add aitoroses/agent-e2e-harness --skill agent-e2e-harness --all
```

## Install Harness Dependencies

Default npm shape:

```sh
npm install -D @agent-e2e/harness playwright @modelcontextprotocol/sdk zod
```

Adapt to the app's package manager. Add service-specific dependencies only when the app needs them, for example database clients or Testcontainers.

The CLI expects Bun `>=1.3.0` for direct TypeScript config loading:

```sh
bun --version
```

## Package Scripts

Add scripts in the app package:

```json
{
  "scripts": {
    "postinstall": "playwright install chromium",
    "dev:mcp": "agent-e2e dev",
    "e2e:verify": "agent-e2e verify"
  }
}
```

Use project-specific script names if existing conventions require them, but keep the command values public and direct.

## Minimal File Pattern

Adapt names to the target app:

```text
<app>/
  agent-e2e.config.ts
  src/e2e-harness/
    journeys/<flow>.ts
    resources.ts
    stack.ts
```

Do not add a primary Playwright/Vitest wrapper for CI. `agent-e2e verify` is the default verification surface.

## Git Ignore

Ensure generated artifacts are ignored:

```gitignore
.agents-e2e/
```

Commit durable journey/config/source files. Do not commit transient run artifacts unless the user explicitly wants a proof transcript checked in.
