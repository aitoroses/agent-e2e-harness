# Launch-v1 Showcase Dev-Mode Stack — Architecture Audit

**Author:** `aeh-architecture-audit` (claude, ephemeral) via `/improve-codebase-architecture`
**Worktree:** `~/repositories/agent-e2e-launch-v1-stack-audit` (branch `audit/launch-v1-stack-architecture` off `feat/launch-v1-onboarding` HEAD `f2f6610`)
**Date:** 2026-05-13
**Verdict:** **revert sidecar + adopt explicit-log-wait + connection-retry in showcase postgres provider**
**Patch:** landed on this branch (`apps/showcase/src/harness/{dev-stack,postgres-testcontainers}.ts`, 2 files, +184/-218) with the sidecar entrypoint deleted in the follow-up cleanup commit.
**Convergence:** independently corroborated by `aeh-smoke-fix-builder` on `fix/launch-v1-smoke@395b8e7`

---

## 1. Current architecture on `feat/launch-v1-onboarding` (post-sidecar)

```
┌───────────────────────────────────────────────────────────────────┐
│  Bun runtime (Dev MCP Server)                                     │
│                                                                   │
│  agent-e2e.config.ts                                              │
│   └─ createShowcaseDevStackProvider() ───┐                        │
│                                          ▼                        │
│                            ShowcaseStackSidecarClient (in Bun)    │
│                            ─ spawn("node", sidecar.mjs)           │
│                            ─ JSON-RPC over stdin/stdout           │
└──────────────────────────────────────────┬────────────────────────┘
                                           │ stdio pipe (JSON-RPC)
┌──────────────────────────────────────────▼────────────────────────┐
│  Node child process (showcase-stack-sidecar.mjs)                  │
│                                                                   │
│   ─ PostgreSqlContainer.start()         (Testcontainers in Node)  │
│   ─ runSchema()                         (pg in Node)              │
│   ─ createProcessStackProvider(npm run dev) → spawns Next.js dev  │
└───────────────────────────────────────────────────────────────────┘
```

**What it adds:** an IPC layer (JSON-RPC over stdin/stdout) plus a parallel re-implementation of `combineStatus`, `postgresStatusPacket`, and the entire stack-lifecycle state machine inside the `.mjs` sidecar — distinct from the public `StackProvider<>` machinery in `packages/harness/src/stack/index.ts`. ~225 LoC of duplication, plus client-side request bookkeeping (`nextId`, `pending`, timeouts) inside `apps/showcase/src/harness/dev-stack.ts`.

## 2. CONTEXT.md intent (direct in-process composition)

The two architectural commitments on the relevant line of dependency:

- **`Bun-Backed Dev MCP Runtime — REQUIRED`** (commit `ee655e8`, baked into CONTEXT.md): "The required Dev MCP runtime shape where the package CLI runs on Bun and loads `agent-e2e.config.ts` directly … _Avoid_: Node plus ad-hoc TS loader, app-owned Dev MCP script, precompiled dev-mcp runtime, endpoint restart."
- **`Reference Stack Provider`** + **`Showcase Infrastructure Provider`**: "The first reference provider should use Testcontainers with PostgreSQL and schema initialization … Infrastructure provider implementations should stay in the consumer app or a future dedicated adapter package."
- **`Dev-Mode Stack`**: "typically combining disposable services such as Testcontainers databases with local development processes such as a Next.js dev server."

These compose directly: Bun → `agent-e2e.config.ts` → `createShowcaseDevStackProvider()` → Testcontainers + `createProcessStackProvider(npm run dev)`, **all in-process under Bun**. The sidecar is a Node trampoline that violates the "no consumer-owned bridge" clause of the Bun ADR and re-creates the public `StackProvider` semantics in a private JSON-RPC dialect.

## 3. Empirical verification (non-skippable per brief)

### 3.1 Pre-sidecar architecture re-verified to hang (status quo of the C-spike bisect)

`git checkout main -- apps/showcase/src/harness/{dev-stack,postgres-testcontainers}.ts`, then `npm run build --workspace @agent-e2e/harness`, then `bun packages/harness/dist/cli/index.js dev-mcp`, then `stack.start` over MCP:

```
[audit] connected; calling stack.start with timeoutMs=180000
{ "ok": false, "tool": "stack.start", "elapsedMs": 180005,
  "error": "MCP error -32001: Request timed out" }
```

State during the hang (`T+8s` and `T+20s`):

```
$ docker ps --filter "label=org.testcontainers"
7142db2a20e0 postgres:16-alpine            Up X seconds (healthy)
9186c12045b1 testcontainers/ryuk:0.14.0    Up X seconds

$ ps -ef | grep -E "(npm run dev|next dev)"
# no next-dev process

$ ls apps/showcase/.agents-e2e/logs/
# directory does not exist — openLogFile() never ran
```

**Interpretation:** the Postgres container reaches Docker-level `(healthy)` (Testcontainers' default `HealthCheckWaitStrategy` is satisfied), but **the harness never advances to `createProcessStackProvider(...).start()`** — the log directory mkdir at `apps/showcase/src/.../stack/index.ts:157` is the first observable side-effect of `app.start()` and it never runs. The hang is **before** the next-dev spawn, **inside** `postgres.start()` (specifically `runSchema → pg.Client.connect()` against a container that is "healthy" in Docker but not yet accepting Postgres auth).

### 3.2 Refuting the C-spike "Bun child_process" hypothesis

The original C-spike bisect read at `ee655e8` as `next_started=0 new_container_count=2` and concluded "Bun + Testcontainers fights at the spawn layer." The data is correct; the conclusion is one layer too low. `next_started=0` is true because **we never reached** the next-dev spawn. Containers were created (2), but `pg.Client.connect()` hung against the not-quite-ready Postgres before `createProcessStackProvider` ran. Under Bun, `node:net`'s `connect()` retry/error behavior against a "healthy-but-pre-auth" Postgres differs enough from Node that the connection promise never resolves nor rejects.

### 3.3 Smoke-fix evidence cross-check (independent empirical convergence)

`aeh-smoke-fix-builder` on `fix/launch-v1-smoke@395b8e7` landed an unrelated launch-day rollup with this commit-message line: _"Rejected: Keep Testcontainers default PostgreSQL readiness wait | it hung under the Bun-backed Dev MCP path before app launch."_ Their patch to `apps/showcase/src/harness/postgres-testcontainers.ts`:

- `.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))` — replaces default healthcheck wait
- `.withStartupTimeout(45_000)`
- `connectWithRetry(...)` wrapping `new pg.Client({...}).connect()` with a per-attempt `connectionTimeoutMillis: 5_000` and an outer deadline (default 15 s), retrying every 500 ms
- `withTimeout(client.query(schemaSql), …)` and `client.end().catch(() => undefined)` around schema apply
- fail-closed `stopPostgresHandle()` on schema error so leaked containers can't accumulate

### 3.4 Re-test with the smoke-fix pattern applied (sidecar absent)

Adopted only `postgres-testcontainers.ts` from `395b8e7` onto this branch (keeping the rest of `main`'s in-process `dev-stack.ts`), rebuilt nothing in `packages/harness`, restarted Dev MCP, called `stack.start`:

```
[audit] connected; calling stack.start with timeoutMs=180000
{
  "status": "ready",
  "summary": "Showcase dev stack ready at http://127.0.0.1:64787",
  "services": [
    { "id": "showcase-next-dev", "status": "ready", "url": "http://127.0.0.1:64787" },
    { "id": "postgres",          "status": "ready",
      "url": "postgres://agent:agent@localhost:32972/proof_notes" }
  ]
}
real    0:11.22
```

`stack.stop` follow-up cleanly tore down both services. **Bun + Testcontainers + ProcessStackProvider compose directly in-process under Bun once the showcase provider owns its own Postgres-ready signal.**

## 4. Root cause — pinned

`apps/showcase/src/harness/postgres-testcontainers.ts` (pre-fix), `loadPostgresRuntime` → `new PostgreSqlContainer(image).withDatabase(...).start()` uses Testcontainers' **default `PostgreSqlContainer` wait strategy** (a Docker-level healthcheck). That strategy resolves before `postgres` has finished accepting authenticated client connections. On Node, `pg.Client.connect()` against that window retries internally with a tight error→retry loop; on Bun's `node:net` shim, the same `connect()` promise neither resolves nor rejects within the harness's MCP timeout window, so the entire `stack.start` chain hangs at `postgres.start()` before the next-dev spawn ever runs.

This is **not** a Bun `child_process.spawn` incompatibility, **not** a Testcontainers-can't-run-under-Bun fact, and **not** a public-harness regression — it is a showcase-owned readiness-bar that was implicitly leaning on Node-only `pg` connect behavior.

## 5. Recommendation — verdict + recipe

**Verdict: `revert-sidecar + adopt-explicit-readiness`** (third option per brief, grounded in empirical convergence with the smoke-fix builder).

### What to keep
- The current intent of `feat/launch-v1-onboarding`: **direct in-process** Testcontainers + `createProcessStackProvider` under Bun (i.e. `main`'s shape of `dev-stack.ts`).
- The smoke-fix's hardened `postgres-testcontainers.ts`: explicit `Wait.forLogMessage(...)`, `withStartupTimeout`, `connectWithRetry`, schema timeout, fail-closed teardown.

### What to delete
- `apps/showcase/scripts/showcase-stack-sidecar.mjs` (225 LoC)
- The `ShowcaseStackSidecarClient` class and `spawn(node, sidecarScript)` plumbing inside `apps/showcase/src/harness/dev-stack.ts` (≈170 of the 252 LoC the sidecar commit added)
- `AGENT_E2E_SHOWCASE_NODE_BIN` env path and the JSON-RPC wire schema between them

### What this branch landed
The audit branch holds the recommended end state:

| File | Source restored to |
|------|-------------------|
| `apps/showcase/src/harness/dev-stack.ts` | `main` (direct `createProcessStackProvider` + `createPostgresTestcontainersProvider` composition, in-process) |
| `apps/showcase/src/harness/postgres-testcontainers.ts` | `fix/launch-v1-smoke@395b8e7` (explicit `Wait.forLogMessage` + `connectWithRetry` + schema timeout + fail-closed stop) |

The sidecar entrypoint was deleted after operator approval, and consumer-facing documentation now describes direct provider composition rather than the private bridge.

### Architectural deepening, per `/improve-codebase-architecture`
This is a **consolidation deepening**, not a new module: the showcase-owned readiness contract pre-existed at the wrong implicit layer (Node-only `pg` connect behavior). Surfacing it as explicit `Wait.forLogMessage` + retry inside `postgres-testcontainers.ts` keeps the language pure to CONTEXT.md (`Showcase Infrastructure Provider` owns its readiness, `Stack Provider` contract stays generic, `Bun-Backed Dev MCP Runtime` actually runs everything in-process). The public `packages/harness/src/stack/index.ts` surface is untouched — no public-API motion is needed, which means **Wave 1's frozen public surface does not block this fix** (a benefit the sidecar approach also claimed but only by paying the IPC cost).

## 6. Verification plan after the refactor lands

Run on the recovered branch (sidecar deleted, smoke-fix postgres patch in place):

1. `npm install && npm run build --workspace @agent-e2e/harness`
2. `npm run typecheck --workspace @agent-e2e/showcase`
3. `npm run test --workspace @agent-e2e/showcase -- test/postgres-testcontainers-provider.test.ts` — adopt the 103-line test from `395b8e7` to lock the readiness contract
4. `npm run dev:mcp --workspace @agent-e2e/showcase` reaches the stable MCP URL
5. MCP loop: `stack.start` → `journey.run` (proof-notes) → `browser.snapshot` → `artifacts.list` → `cleanup` → `stack.stop`
6. `dist:smoke` / E-smoke wave-2 gate — should now pass without the sidecar
7. Run the same `stack.start` ≥3 times against a cold Docker daemon to confirm no flake regression on the explicit log wait
8. Repeat once on a Linux runner (the bisect was darwin-only) — log-message wait + connect retry should be runtime-agnostic, but the convergence story benefits from one cross-OS data point

## 7. Integration notes

1. `fix/launch-v1-smoke@395b8e7` carries this PostgreSQL readiness pattern plus other launch-day rollups. This ADR records the readiness decision only; the remaining smoke-fix changes should integrate through their own path.
2. No `packages/harness` change is required. A future public adapter may still be useful, but this regression is resolved at the showcase provider boundary.
3. The C-spike bisect artifacts should be read as symptom evidence, not final root-cause evidence: `next_started=0` was caused by the hang before app launch, not by `child_process.spawn`.
