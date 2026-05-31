# Runtime Targets and Attached Runtime Mode

## Status

Accepted

## Decision

Agent E2E Harness now models where a journey runs or collects evidence as a **Runtime Target**. Managed local stacks remain harness-owned lifecycle targets exposed through `stack.*`. Attached Runtime Targets are externally owned runtimes, such as staging, production, preview deployments, Kubernetes namespaces, or Docker Compose, and are exposed through `agent-e2e attached --target <id>`.

The shared Runtime Tool Surface is `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.capability.list`, and `runtime.capability.run`. Runtime Capabilities are product-owned, schema-declared, and risk-classed as `observation`, `runMutation`, or `runtimeMutation`.

Runtime Targets are declared in `agent-e2e.config.ts` through typed helpers such as `managedRuntime(...)` and `attachedRuntime(...)`; a second targets file is not required. Journey Profiles select their Runtime Target with profile metadata. In v1, `run.begin` resolves the Runtime Target through the selected Journey Profile and does not accept a free `targetId` override.

Access to external runtimes is modeled through **Access Contexts** and product-owned **Access Resolvers**. Resolvers may materialize browser storage state, cookies, API credentials, log access, tunnels, service accounts, or custom access internally, but agent-visible responses expose only status, summaries, descriptions, and guidance. Secret material must not be returned to agents.

`runtime.logs` is a core runtime operation. It requires `tail`, may accept `serviceId`, may accept best-effort `level`, avoids a free-form query language, returns parsed entries, and writes log evidence as artifacts. Runtime-specific log collection remains provider/product-owned.

Attached Runtime Mode does not own infrastructure lifecycle. It may run journeys, seed, reseed, and cleanup only through the selected Journey Profile and only for run-owned resources bounded by the Ownership Ledger. Cleanup means deleting resources the journey owns, not resetting, restarting, or tearing down the runtime.

The showcase dogfoods this with a Docker Compose Attached Runtime Target. Compose startup and shutdown are separate showcase commands; `agent-e2e attached --target showcase-compose` connects to the already-running Compose runtime, reads status/logs, exposes product-owned observation diagnostics, and runs the proof-notes journey profile with ownership-bounded seed and cleanup.

## Consequences

`stack.*` remains the Managed Execution Stack lifecycle surface. It is not replaced or deprecated by this ADR.

Core harness code must not add Kubernetes, Docker, SQL, cloud, or shell-specific namespaces; products declare those diagnostics behind Runtime Capabilities. Declared shell diagnostics may exist as product-owned tools, but v1 does not expose arbitrary raw shell access.

Observation Runtime Capabilities run by default. `runMutation` tools require selected Journey Profile opt-in. `runtimeMutation` tools are blocked by default.
