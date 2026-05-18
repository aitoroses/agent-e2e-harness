# Runtime Targets and Attached Runtime Mode

## Status

Accepted

## Decision

Agent E2E Harness now models where a journey runs or collects evidence as a **Runtime Target**. Managed local stacks remain harness-owned lifecycle targets exposed through `stack.*`. Attached Runtime Targets are externally owned runtimes, such as staging, production, preview deployments, Kubernetes namespaces, or Docker Compose, and are exposed through `agent-e2e attached --target <id>`.

The shared Runtime Tool Surface is `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.explore.list`, and `runtime.explore.run`. Runtime Exploration Tools are product-owned, schema-declared, and risk-classed as `observation`, `runMutation`, or `runtimeMutation`.

Attached Runtime Mode does not own infrastructure lifecycle. It may run journeys, seed, reseed, and cleanup only through the selected Journey Profile and only for run-owned resources bounded by the Ownership Ledger.

## Consequences

`run.begin` resolves the Runtime Target from the selected Journey Profile. It does not accept a free `targetId` override in v1. Core harness code must not add Kubernetes, Docker, SQL, cloud, or shell-specific namespaces; products declare those diagnostics behind runtime exploration tools.
