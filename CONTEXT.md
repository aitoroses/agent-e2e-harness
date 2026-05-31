# Agent E2E Harness

A reusable toolkit for agent-built development: agents validate their own work through executable journeys, seeded repeatable environments, MCP-callable controls, browser/API evidence, artifact capture, and owned-resource teardown. The same proofs should remain consolidated as CI E2E tests. It is extensible enough to replace product-specific harnesses through stable extension points.

## Language

**Agent E2E Harness**:
A library-first toolkit with an optional reference MCP server and CLI for running agent workflow journeys.
_Avoid_: MCP harness, test helper, UI harness


**Agent-Built Development**:
A development workflow where agents implement changes and must produce deterministic proof that the change works.
_Avoid_: agent builder, MCP authoring, manual QA

**Product-Specific Harness**:
A harness embedded in one product codebase that the **Agent E2E Harness** should be able to replace through extension points.
_Avoid_: one-off harness, bespoke test code

**Executable Journey**:
A repeatable validation flow that an agent can execute during development and the project can later run unchanged as a CI E2E test.
_Avoid_: scenario, runbook, ad-hoc test

**Inspectable Journey Contract**:
The data-shaped part of an **Executable Journey** that agents and CI can list, validate, diff, and explain even when steps bind executable handlers.
_Avoid_: JSON journey, static spec, code-only journey

**Minimal Core Contract**:
The smallest predefined structure needed for agents, CI, artifacts, and teardown to coordinate safely; everything else should stay product-owned data.
_Avoid_: full domain schema, framework object model, predefined app structure

**Deterministic Proof**:
Evidence that a change works, produced from a seeded repeatable environment with enough artifacts to diagnose failures and rerun in CI.
_Avoid_: confidence check, smoke result, manual proof

**Seeded Environment**:
A repeatable world state prepared before a journey without pre-creating the product-visible behavior that the journey must prove.
_Avoid_: fixture dump, mock setup, test data

**Journey Profile**:
A required named variation of an **Executable Journey** that selects refs, credentials, runtime target, and profile-specific expectations while preserving the journey's intent and phase/step structure.
_Avoid_: config variant, fixture, environment

**Environment Seed**:
The setup/preflight that prepares a repeatable **Seeded Environment** for the selected **Journey Profile** without creating the product-visible behavior under proof; common journey seed and profile-specific seed may compose into one manifest.
_Avoid_: profile data, fixture dump, global bootstrap

**CI E2E Test**:
The consolidated form of an **Executable Journey** that runs in continuous integration without agent intervention.
_Avoid_: separate regression test, duplicate Playwright spec

**Crystallized Proof**:
A **Deterministic Proof** accepted only after the same **Executable Journey** passes from a clean **Seeded Environment** without agent intervention.
_Avoid_: MCP pass, manual validation, green run

**Closure Command**:
The non-interactive command that reruns an **Executable Journey** from clean seed to prove it can become a **CI E2E Test**.
_Avoid_: final check, test command, acceptance script

**Verify Command**:
The public CI command, `agent-e2e verify`, that loads `agent-e2e.config.ts` and verifies the configured journey suite without agent intervention.
_Avoid_: closure command, one-off journey script, hand-written Playwright wrapper

**Ownership Ledger**:
A run-scoped record of resources created by an **Executable Journey** that bounds what teardown may delete.
_Avoid_: cleanup list, resource cache, teardown state

**Resource Adapter**:
An extension that knows how to create, inspect, or delete one typed kind of product resource without expanding the **Ownership Ledger**.
_Avoid_: cleanup callback, plugin, driver

**Typed Resource Registry**:
A harness-level registry that binds owned resource kinds to typed creation inputs and destruction mechanics while owned resources remain minimal handles with kind, id, and optional label/metadata.
_Avoid_: stringly typed cleanup map, arbitrary metadata, untyped fixture helpers

**Reseed**:
A first-class harness operation that returns a selected **Journey Profile** to its seeded state by applying ownership-bounded cleanup for the current run context before running **Environment Seed** again.
_Avoid_: rerun seed, truncate everything, browser refresh

**Observed Domain Payload**:
A product-specific typed payload inside step feedback that records domain observations without changing the harness-owned feedback envelope.
_Avoid_: custom feedback, plugin data, arbitrary metadata

**Feedback Envelope**:
The harness-owned structure for expected state, observed state, timing, artifacts, diagnosis, and next guidance.
_Avoid_: result object, report, log payload

**Harness Types**:
A single product-provided type map that binds execution surface, profile data, observed domain payloads, and owned resources across the harness API.
_Avoid_: generic soup, type parameters, extension config

**Execution Surface**:
The adapter-provided runtime object set, such as Playwright `Page` and `Browser`, that journey handlers use directly.
_Avoid_: browser port, page-like abstraction, hidden driver

**Default Harness API**:
The package-root API specialized for the reference Playwright harness, while the core subpath remains generic.
_Avoid_: core API, generic API, Playwright-only core

**Harness Core**:
The embeddable library primitives for journeys, phases, steps, evidence, artifacts, browser sessions, and teardown.
_Avoid_: framework internals, server code

**Reference Harness Server**:
The optional out-of-the-box MCP server built on top of the **Harness Core**.
_Avoid_: the harness, core server

**Reference CLI**:
The optional command-line interface for starting the **Reference Harness Server** and running common validation flows.
_Avoid_: main product, runner script

**Reference Showcase App**:
A small but realistic consumer application in this repository that demonstrates the **Agent E2E Harness** product promise end-to-end: **Environment Seed**, MCP/dev iteration, **Deterministic Proof**, **Closure Command**, artifacts, and safe teardown, without depending on behavior outside this repository.
_Avoid_: smoke fixture, fake button demo, package test app, migration demo

**Managed Showcase Infrastructure**:
Ephemeral infrastructure brought up for the **Reference Showcase App** and torn down as part of the proof process, so the demo exercises real stack lifecycle instead of only browser or in-memory state.
_Avoid_: ambient local service, manual database, localStorage fixture

**Managed Execution Stack**:
The app/runtime infrastructure required for a dev-mode harness run, including databases, app processes, containers, queues, and local services, provisioned and torn down through harness-owned lifecycle hooks while concrete infrastructure remains product- or showcase-owned.
_Avoid_: hidden test setup, seed side effect, external prerequisite, manual stack

**Runtime Target**:
A declared place where an **Executable Journey** can run or collect evidence, including harness-managed local stacks and externally owned staging, production, preview, Docker Compose, Kubernetes, or other already-running runtimes.
_Avoid_: environment, deployment, production stack

**Attached Runtime Target**:
An externally owned **Runtime Target** that the harness connects to without owning infrastructure lifecycle.
_Avoid_: managed stack, deployment provider

**Attached Runtime Mode**:
The `agent-e2e attached --target <id>` MCP mode for inspecting and optionally running journeys against an **Attached Runtime Target**.
_Avoid_: dev mode, one-shot production check

**Runtime Tool Surface**:
The `runtime.*` MCP family: `runtime.list`, `runtime.status`, `runtime.logs`, `runtime.access.status`, `runtime.capability.list`, and `runtime.capability.run`.
_Avoid_: hiding attached runtimes under stack lifecycle tools

**Runtime Tool Risk**:
The declared side-effect class for Runtime Capabilities: `observation`, `runMutation`, or `runtimeMutation`.
_Avoid_: safe boolean, hidden side effects

**Verify Worker Stack**:
A **Managed Execution Stack** instance assigned to one verify worker so multiple selected runs can execute serially inside isolated runtime resources while the suite still parallelizes across workers.
_Avoid_: per-run stack, shared parallel stack, worker fixture

**Isolated Stack Resources**:
Runtime resources allocated for one **Verify Worker Stack**, such as ports, database paths, log paths, and service URLs, so parallel verify workers cannot collide.
_Avoid_: hardcoded ports, shared local paths, ambient resources

**StackStartContext**:
The harness-provided context passed to a **Stack Provider** when starting a dev stack or **Verify Worker Stack**, containing worker identity plus named allocation helpers for ports and artifact paths.
_Avoid_: stack options blob, provider config, run context

**Stack Instance**:
One started **Managed Execution Stack** with a stable stack id, handle, status, logs, exploration surface, and named allocations.
_Avoid_: active stack, global stack, hidden handle

**Run Stack Binding**:
The explicit relationship between a journey run and the **Stack Instance** it uses for journey execution, stack capability, logs, and evidence.
_Avoid_: implicit active stack, ambient stack, run-owned stack

**Named Stack Allocation**:
A port or artifact path allocated through **StackStartContext** with a stable provider-chosen name so verify reports can show which runtime resources belonged to each worker stack.
_Avoid_: anonymous free port, hidden temp file, provider metadata

**Stack Provider**:
An extension point that starts, inspects, and stops a **Managed Execution Stack** for a specific product or showcase, such as containers, app processes, databases, queues, or other local services.
_Avoid_: hardcoded Docker logic, test helper, deployment adapter

**Stack Runtime Tools**:
Native MCP tools for stack-level runtime facts that most agents need during validation. The core set should stay small: `stack.start`, `stack.list`, `stack.status`, `stack.logs`, `stack.stop`, and `stack.capability.*` for provider-declared capabilities and `stack.status` as the unified services/readiness/health packet for one stack instance.
_Avoid_: provider-specific debug endpoint, generic diagnostic API, hidden service metadata

**Exploration Surface**:
The Dev MCP tool surface agents use during development to discover a live system, test hypotheses, inspect browser and stack state, mutate controlled local state when useful, and crystallize that exploration into an **Executable Journey**.
_Avoid_: runner-only API, CI command, remote shell, static test script

**Stack Capability Surface**:
The stack-provider-owned part of the **Exploration Surface**, where agents can discover and run typed stack/app runtime capabilities without the harness hardcoding a specific stack technology.
_Avoid_: generic diagnostic API, hardcoded database tooling, product-specific core API

**Stack Capability**:
A discoverable, typed operation exposed by a **Stack Provider** through the **Stack Capability Surface**, such as database reads or writes, schema inspection, SQL execution, queue inspection or mutation, cache clearing, product-owned domain reads, or controlled product-owned writes.
_Avoid_: hidden troubleshooting command, undocumented script, ad-hoc handler

**Verify Observation Tool**:
A **Stack Capability** that is safe to use from journey execution and `agent-e2e verify` because it observes stack or application state without becoming the cause of the product behavior under validation.
_Avoid_: proof helper, test backdoor, hidden setup

**Exploration Tool Risk**:
The declared risk class for a **Stack Capability**, used by the harness to surface side effects to the agent and record evidence.
_Avoid_: implicit trust, best-effort warning, buried side effect


**Reference Stack Provider**:
The default **Stack Provider** implementation used by the **Reference Showcase App** to demonstrate harness-managed dev-mode infrastructure lifecycle. The first reference provider should use Testcontainers with PostgreSQL and schema initialization.
_Avoid_: production deployment provider, hidden testcontainer, app-specific script

**Showcase Infrastructure Provider**:
The product-owned provider code that implements **Stack Provider** lifecycle for the **Reference Showcase App**. The showcase may use Testcontainers/PostgreSQL, but that choice must not become a public harness export.
_Avoid_: core dependency, public harness adapter, hidden Docker setup

**Dev-Mode Stack**:
A **Managed Execution Stack** optimized for agent iteration against editable source code, typically combining disposable services such as Testcontainers databases with local development processes such as a Next.js dev server.
_Avoid_: production deployment, prebuilt-only app image, CI-only stack

**Proof Notes Showcase**:
The first **Reference Showcase App** product story: a tiny persisted notes application where seed creates baseline workspace/user state, the journey creates a proof note through the UI, proof verifies persistence, and reseed/teardown remove only owned proof-note resources.
_Avoid_: counter demo, localStorage button, arbitrary CRUD app

**Journey-Driven Showcase Development**:
The dogfooding practice of building the **Reference Showcase App** iteratively through its own harness journeys, so each app capability is introduced with the seed, stack, proof, artifact, and cleanup behavior that will later serve as CI E2E coverage.
_Avoid_: demo built first and tested later, after-the-fact Playwright spec, disconnected fixture

**Textual Journey Plan**:
A human-readable description of the journeys the showcase intends to support before implementation, used as the source for tracer-bullet development through the harness MCP control surface.
_Avoid_: hidden implementation note, bulk test matrix, after-the-fact docs

**Harness-Driven TDD**:
A tracer-bullet development loop where each showcase capability starts as a **Textual Journey Plan**, is exercised through the harness MCP tools via a standard MCP client, fails for the missing behavior, and is then implemented until the same journey passes and crystallizes.
_Avoid_: write all tests first, manual browser QA, implementation-first demo

**Dev MCP Server**:
An HTTP MCP server mode for agent development where the endpoint stays stable while app code and the journey registry can refresh during agent iteration through a standard MCP client.
_Avoid_: one-shot stdio runner, production server, static journey snapshot

**Bun-Backed Dev MCP Runtime**:
The required Dev MCP runtime shape where the package CLI runs on Bun and loads `agent-e2e.config.ts` directly, allowing a stable MCP endpoint to refresh journey definitions without a consumer-owned TypeScript entrypoint or compile/watch bridge.
_Avoid_: Node plus ad-hoc TS loader, app-owned Dev MCP script, precompiled dev-mcp runtime, endpoint restart

**Hot-Reloaded Journey Registry**:
The Dev MCP behavior where journey/resource config is reloaded behind a stable MCP endpoint when `agent-e2e.config.ts` changes. Reloading replaces the available journey registry for new runs; agents should start a new run after a registry change rather than continuing a stale active run.
_Avoid_: server restart, app hot reload, static journey registry

**MCP-Owned Browser Session**:
A Playwright browser/page lifecycle owned by the **Dev MCP Server**, with a persistent session id so agents can run journey steps, inspect snapshots, call forensics tools, and close the browser through MCP operations.
_Avoid_: caller-injected page, hidden test browser, one-shot browser fixture

**Visible Dev Browser**:
A headed browser launched by MCP dev-mode operations so agents and humans can see the product surface while journeys execute, inspect parked states, and correlate artifacts with visible UI.
_Avoid_: invisible default, CI-only headless browser, screenshot-only debugging

**Browser Snapshot**:
The primary dev-mode browser forensics tool exposed through MCP. It should summarize the current page as an agent-usable investigation packet: URL, title, semantic structure, interactive targets, stable refs, visible errors, relevant network/console signals, screenshots or crops when useful, artifacts, and next guidance.
_Avoid_: raw DOM dump, screenshot-only artifact, selector list, generic Playwright snapshot

**Browser Workbench**:
The fixed **Dev MCP Tool Grammar** for universal browser exploration and interaction: snapshot-driven refs, user-like actions, waits, targeted reads, console and network inspection, page evaluation, screenshots, tabs, and browser session controls.
_Avoid_: provider-owned browser action registry, journey helper registry, generic `browser.explore.run`, hidden Playwright script, raw CDP shell

**Browser Playwright Escape Hatch**:
The explicit `browser.playwright` Dev MCP tool for agent-only live diagnostics that needs direct Playwright `page`, `browser`, and context access before the interaction is crystallized into journey code. It executes an async function body supplied by the agent against the live **MCP-Owned Browser Session** and returns that body's JSON-serializable output as the tool result. Execution is timeout-bounded by default, and responses report elapsed duration plus the effective timeout. It may mutate the live browser session; snapshot refs should be treated as stale afterward. JSON `input` is passed separately from code, and latest snapshot `refs` are provided as a lightweight bridge to Playwright selectors.
_Avoid_: primary browser workflow, verify helper, registered journey closure, hidden generic code runner

**Browser Page Evaluation**:
The `browser.eval` Dev MCP tool for running an async function body in the page context during live diagnostics, separate from `browser.get` for simple reads and `browser.playwright` for full Playwright access. It shares the `browser.playwright` timeout and JSON-serializable output response shape. It may mutate page state; snapshot refs should be treated as stale afterward. JSON `input` is passed separately from code.
_Avoid_: primary interaction grammar, Playwright closure, journey helper, unbounded script

**Browser Targeted Read**:
The `browser.get` Dev MCP tool for simple targeted reads from the active browser session, using a `kind` such as text, HTML, value, attribute, title, URL, or count instead of many separate read tools.
_Avoid_: second snapshot format, raw DOM dump, Playwright escape hatch, tool-per-property sprawl

**Browser Conditional Wait**:
The `browser.wait` Dev MCP tool for waiting on browser-visible conditions such as a ref, selector, text, URL pattern, load state, or page-context function, with timeout feedback and no unconditional sleep primitive.
_Avoid_: fixed delay, hidden retry loop, Playwright-only wait script, unbounded wait

**Browser Semantic Find**:
The `browser.find` Dev MCP tool for resolving semantic locator queries such as role, text, label, placeholder, test id, or CSS selector into agent-usable targets without requiring a prior snapshot. It returns reusable targets; actions stay in `browser.act`.
_Avoid_: replacing snapshot workflow, raw DOM search, product-specific selector helper, hidden Playwright locator string

**Browser Ref Store**:
The per-**MCP-Owned Browser Session** target store shared by snapshot refs and find refs. `browser.snapshot` emits `@eN` refs, `browser.find` emits `@fN` refs, and both can be used by browser workbench tools until browser state changes make them stale.
_Avoid_: incompatible ref namespaces, selector retyping, hidden stale target reuse

**Browser Signal Buffer**:
The per-**MCP-Owned Browser Session** console and network event buffer exposed through `browser.console` and `browser.network` with cursor-based incremental reads.
_Avoid_: stuffing detailed logs into snapshot, global log stream, hidden terminal-only signals, unbounded event dump

**Browser Action Set**:
The user-like actions supported directly by `browser.act` for common agent exploration: click, fill, press, hover, focus, check, uncheck, select, and scroll.
_Avoid_: rare interaction kitchen sink, file transfer policy, coordinate-level mouse API, hidden Playwright script

**Browser Screenshot Artifact**:
An explicit screenshot artifact captured by `browser.screenshot` from an **MCP-Owned Browser Session**, returning the artifact location for agent inspection and later reference.
_Avoid_: automatic screenshot after every action, hidden visual side effect, screenshot-only debugging

**Browser Workbench Output Policy**:
The browser workbench persistence rule: structured `browser.snapshot` packets are lightweight primary forensics and may be artifacted automatically; screenshots are explicit artifacts; targeted reads, waits, signal queries, eval, and Playwright escape-hatch calls return inline output unless a future tool explicitly asks to persist.
_Avoid_: artifact spam, hidden screenshots, losing snapshot history, treating every exploratory output as durable proof

**MCP Tool Discoverability**:
The contract that every agent-facing MCP tool and input field must carry clear descriptions so an agent can choose and call the tool correctly from `tools/list` without reading source code.
_Avoid_: schema-only discovery, terse placeholder descriptions, hidden argument semantics, README-dependent tool usage

**Run Forensics**:
The per-step evidence capture for a **Journey Run**: before/after/failure screenshots, scoped console/network signals, result artifacts, and step feedback.
_Avoid_: router-owned screenshot logic, unscoped browser logs, hidden debug side effects

**Dev MCP Tool Grammar**:
The default Playwright-backed MCP tool vocabulary for journey-driven development: orientation, stack/readiness, run lifecycle, MCP-owned browser sessions, browser forensics, journey execution, artifacts, and cleanup.
_Avoid_: ad-hoc tool pile, caller-injected Playwright objects, product-specific tool names

**Showcase Build Narrative**:
The documentation in the **Reference Showcase App** that explains how the app was built through **Harness-Driven TDD**, including the textual journeys, MCP calls, failing/passing proof loop, closure, and CI consolidation.
_Avoid_: usage-only README, marketing demo, unexplained example app

**Journey UX**:
The agent-facing and author-facing experience of understanding, selecting, running, debugging, reseeding, and crystallizing **Executable Journeys**, including textual journey plans, MCP tool shapes, guidance actions, artifacts, and proof timelines.
_Avoid_: raw test API, hidden runner internals, accidental CLI shape

**Showcase Skill**:
A reusable `SKILL.md` distilled from the **Showcase Build Narrative** and **Harness-Driven TDD** procedure, so future agents can build or extend apps by defining journeys, running them through MCP, and crystallizing the resulting UX into CI validation.
_Avoid_: one-off README instructions, generic TDD advice, undocumented agent ritual

**Skills Repo Initialization**:
The bootstrap step, using `npx skills`, that prepares a repository to host and use the **Showcase Skill** workflow before agents begin journey-first development.
_Avoid_: manual prompt copy-paste, undocumented local setup, repo-specific ritual

**MCP Control Surface**:
The Model Context Protocol interface that lets agents inspect, run, pause, debug, and tear down journeys.
_Avoid_: harness, transport layer

**Tool Response Contract**:
The shared status, guidance, error, and payload shape returned by harness tools before any transport-specific wrapping, used by both the **MCP Control Surface** and **Dev MCP Server**.
_Avoid_: per-adapter status enum, tool-specific response shape, unchecked response cast

## Relationships

- The **Agent E2E Harness** includes the **Harness Core**, **Reference Harness Server**, and **Reference CLI**.
- The **Reference Harness Server** exposes the **Harness Core** through an **MCP Control Surface**.
- The **Reference Harness Server** and **Dev MCP Server** share the **Tool Response Contract** so tool status semantics stay consistent across adapters.
- An **Executable Journey** produces **Deterministic Proof** during development and should consolidate into the same **CI E2E Test** instead of being rewritten.
- An **Executable Journey** exposes an **Inspectable Journey Contract** while allowing steps and proofs to bind executable handlers.
- The **Minimal Core Contract** should only predefine structure that agents, CI, artifact readers, or teardown safety need to coordinate.
- The harness owns the **Feedback Envelope**; products add typed **Observed Domain Payloads** inside it.
- A product integration supplies **Harness Types** once; journey, step, feedback, profile, ownership, and **Execution Surface** APIs derive their product-specific types from that map.
- The **Default Harness API** is Playwright-specialized for ergonomics; the core subpath remains generic and does not import Playwright.
- A **Deterministic Proof** becomes a **Crystallized Proof** only after its **Closure Command** passes from a clean **Seeded Environment** without agent intervention.
- Every **Executable Journey** has at least one **Journey Profile**; one may be marked as the default.
- A **Journey Profile** selects a variation for one run of an **Executable Journey**.
- An **Environment Seed** may receive the selected **Journey Profile** so setup can vary by profile, but seed remains an environment setup concept rather than profile data.
- Journey-level seed prepares common environment state; profile-level seed prepares variation-specific state; both compose into one seed manifest.
- Use a **Journey Profile** when the same proof is exercised across variants; create a separate **Executable Journey** when the ordered behavior, user goal, or required proof changes.
- A **Seeded Environment** makes an **Executable Journey** repeatable while preserving the behavior the journey needs to prove.
- The **Seed Gate** blocks journey execution when seed errors exist and surfaces seed warnings to the agent before execution continues.
- A **Structured Warning** does not fail by default, but must include agent-facing **Guidance Actions** such as continue, inspect artifact, or rerun seed.
- **Guidance Actions** are semantic first and executable second: they describe the next decision and may include a concrete tool or command invocation when available.
- MCP/dev mode supports explicit seed-only execution for inspection; CI/closure mode may run seed automatically and fail if the **Seed Gate** fails.
- Teardown may only plan deletion for resources in the run's **Ownership Ledger**.
- A **Resource Adapter** defines deletion mechanics for a resource kind but cannot widen ownership implicitly.
- **Reseed** cleans previously owned resources through registered **Resource Adapters** before applying **Environment Seed** again.
- Every owned resource kind that may appear in the **Ownership Ledger** needs a corresponding destruction mechanic, usually supplied by a **Resource Adapter**, so the harness can orchestrate safe cleanup without product-specific guessing.
- **Resource Adapters** may also define typed creation and inspection mechanics, but journeys and seed decide when resource creation is part of setup versus product behavior under proof.
- The **Typed Resource Registry** is registered at the harness level so all journeys share consistent typed creation semantics and ownership handles for reseed, teardown, and artifacts.
- Resource typing is intentionally lean: creation inputs are typed because they carry product semantics; destruction uses the owned resource kind and id; rich product observations belong in **Observed Domain Payloads**, not resource handles.
- Teams doing **Agent-Built Development** may embed the **Harness Core** without using the **Reference Harness Server** or **Reference CLI**.
- A **Product-Specific Harness** can be replaced when its product-specific behavior fits behind **Harness Core** extension points.
- The **Reference Showcase App** consumes the public harness API as a product would and exists to make the harness value legible through a realistic seeded application flow, not merely to smoke-test package exports.
- The **Reference Showcase App** should use **Managed Showcase Infrastructure** so seed, proof, closure, and teardown operate against a real stack lifecycle rather than a pre-existing local service.
- In dev mode, stack management is part of the **Agent E2E Harness** product experience: the harness coordinates a **Managed Execution Stack** through a **Stack Provider** extension point.
- A **Stack Provider** owns infrastructure lifecycle mechanics, while **Environment Seed** owns repeatable application state inside the ready stack.
- Dev MCP may manage multiple explicit **Stack Instances**.
- `stack.list` is the native recovery tool for agents to discover currently running **Stack Instances** before choosing one for status, logs, exploration, or cleanup.
- `stack.start` may accept a caller-chosen `stackId` or return a generated one, but every later tool that targets a **Stack Instance** must use an explicit `stackId`.
- Public `stack.stop` stops exactly one explicit **Stack Instance**; server disposal may stop all remaining stacks internally, but there is no public stop-all shortcut.
- Duplicate caller-chosen `stackId` values are rejected while a **Stack Instance** with that id is running.
- `stack.status`, `stack.logs`, `stack.capability.run`, and `stack.stop` reject missing `stackId` instead of selecting an implicit active stack.
- `stack.capability.list` remains provider-level and does not require a started **Stack Instance**.
- A **Stack Provider** receives a **StackStartContext** when Dev MCP starts a **Stack Instance** and when the current verify runner starts its suite-scoped stack.
- **StackStartContext** carries mode, `stackId`, worker identity in the current serial verify shape, suite id when available, and the stack artifact scope.
- **Named Stack Allocations** created through **StackStartContext** cover ports plus file/directory artifact paths and are recorded by the harness without provider-authored duplicate metadata.
- `StackStatusPacket` services remain the journey-facing runtime contract for URLs, readiness, and health; **Named Stack Allocations** are report/debug evidence and resource-allocation support rather than a replacement for stack status.
- Journey runs that use a stack bind to a specific **Stack Instance** through `stackId`; subsequent journey execution and stack evidence resolve through that binding instead of a temporary ambient fallback.
- When a **Stack Provider** is configured, `run.begin` requires `stackId`; when no **Stack Provider** is configured, `stackId` is invalid rather than ignored.
- `stack.logs` and `stack.capability.run` may accept optional `runId` only for artifact capture and must validate that the run's **Run Stack Binding** matches the target `stackId`.
- Planned for later worker-scoped verify slices: `verify.workers` controls the maximum number of active **Verify Worker Stacks** as well as the selected-run worker queue; each worker executes its assigned runs serially inside its stack.
- Planned for later worker-scoped verify slices: Verify starts **Verify Worker Stacks** lazily only for workers that receive selected runs; the maximum active worker stacks is `min(workers, selectedRuns.length)`.
- Planned for later worker-scoped verify slices: a **Verify Worker Stack** start failure stops scheduling new runs, lets already-active workers finish and clean up, and fails the suite without classifying the unstarted journeys as proof failures.
- Planned for later worker-scoped verify slices: Verify reports model **Stack Instances** in a first-class `stacks` section; journey run entries reference `stackId` when a **Run Stack Binding** exists instead of representing stack failures as synthetic runs.
- Planned for later worker-scoped verify slices: parallel safety is part of the **Stack Provider** contract exercised by the **Verify Command**, not a separate capability flag that consumers must declare.
- Planned for later worker-scoped verify slices: dynamic stack runtime resources such as allocated URLs and paths belong on the **Execution Surface** through `execution.stack`, not by mutating **Journey Profile** data.
- Direct stack runtime concerns should feel native through **Stack Runtime Tools** rather than being hidden behind generic action plumbing, but simple wins: `stack.status` should carry services, endpoints, readiness checks, and next actions instead of splitting separate `stack.services` or `stack.health` tools.
- The **Dev MCP Server** is an **Exploration Surface** first: agents use it to discover the live system and crystallize the discovered trajectory into an **Executable Journey**.
- A **Stack Provider** may expose **Stack Capabilitys** so agents can inspect or manipulate runtime and application state without the harness hardcoding a specific stack technology.
- The **Stack Capability Surface** should define the typed envelope, discovery shape, risk metadata, and artifact plumbing, while concrete tools remain stack-provider-declared and discoverable by the agent.
- **Stack Runtime Tools** should use stable provider service ids such as `next-dev` or `postgres`; unlike browser snapshots, stack services do not need ephemeral refs.
- Stack exploration calls may run live without a `runId`; passing `runId` means the harness should also capture the observation as a run artifact for time-travel and proof history.
- Stack exploration calls should not require repeated `journeyId`; artifact scope should resolve from `runId` when capture is requested.
- Dev agents may access the full stack-provider-declared **Stack Capability Surface** subject to risk policy, while journey execution and `agent-e2e verify` may receive only **Verify Observation Tools**.
- **Verify Observation Tools** preserve validation integrity by forcing the application path, not the verification helper, to be the cause of product-visible mutations.
- A **Managed Execution Stack** is torn down by stack lifecycle, while product resources created during a journey remain bounded by the **Ownership Ledger** and **Resource Adapters**.
- **Environment Seed** may prepare application state through product APIs, direct database access, admin clients, or other product-owned setup mechanisms; it is defined by purpose, not by transport.
- The **Managed Execution Stack** includes dev processes as well as infrastructure services, so a product may recommend Docker/Testcontainers for repeatable dev-mode runs without making every seed operation a container concern.
- For the **Reference Showcase App**, exercising product APIs during seed and resource cleanup is preferred because those calls are additional E2E proof surfaces, not merely setup plumbing.
- The **Reference Stack Provider** should default to Testcontainers because it gives the showcase real disposable infrastructure while remaining CI-friendly and local-agent friendly.
- The first **Reference Showcase App** stack should include PostgreSQL with schema initialization, so seed can operate on real persisted application state instead of browser-local state.
- Testcontainers is the recommended standard for the first **Reference Showcase App** because it demonstrates repeatable dev-mode infrastructure without requiring pre-existing local services.
- Infrastructure provider implementations should stay in the consumer app or a future dedicated adapter package; the main harness package should expose generic **Stack Provider** contracts, not the showcase's PostgreSQL/Testcontainers choice.
- The recommended showcase stack is a **Dev-Mode Stack**: agents should be able to iterate application code while the harness manages disposable backing services and local dev processes.
- The first **Reference Showcase App** should use the **Proof Notes Showcase** story because it is small, persistent, and clearly separates seeded baseline state from journey-created product-visible resources.
- The **Reference Showcase App** should be developed through **Journey-Driven Showcase Development** so the repo demonstrates agent-built development, not only the final harness API.
- **Journey-Driven Showcase Development** should use **Harness-Driven TDD**: define a **Textual Journey Plan**, run it through the harness MCP control surface with a standard MCP client, implement the missing app/harness behavior, then rerun until it becomes deterministic proof.
- During **Harness-Driven TDD**, the MCP control surface should run as a **Dev MCP Server** over HTTP with a **Bun-Backed Dev MCP Runtime** and **Hot-Reloaded Journey Registry** so agents can keep the MCP endpoint configured while journey definitions evolve.
- The **Dev MCP Server** should own Playwright through **MCP-Owned Browser Sessions**, not require callers to inject browser/page objects into tool calls.
- **Visible Dev Browser** is the default for dev-mode MCP operations; closure and CI may use headless browser execution.
- **Browser Snapshot** should be the default forensics entry point for visible browser state, combining semantic page structure, interactive refs, visual evidence, and debugging signals into one agent-readable packet.
- Browser exploration should use a fixed **Browser Workbench** grammar under `browser.*`, not a provider-owned `browser.explore.list` / `browser.explore.run` pattern. Browser primitives are universal enough to deserve direct tools, unlike stack-specific runtime capabilities.
- The **Browser Workbench** is agent-facing Dev MCP exploration, not a journey extension registry. Journey code already receives the configured execution objects such as Playwright `page` and `browser` through **Harness Types**.
- `browser.playwright` is the named escape hatch for agent-only Dev MCP exploration that needs direct Playwright access. It executes an async closure-like body against the live `page`, `browser`, and context, returns the body output as the tool result, and should be documented as a last-resort exploration tool, not the primary workflow and not part of `agent-e2e verify`.
- `browser.playwright` may mutate the live **MCP-Owned Browser Session**. After it runs, agents should assume previous `browser.snapshot` refs are stale and capture a fresh snapshot before ref-based actions.
- `browser.eval` and `browser.playwright` should accept JSON `input` separately from `code` so agents can pass data without string interpolation or quoting hazards.
- `browser.playwright` should receive latest snapshot `refs` alongside `page`, `browser`, context, and `input`, but should not grow a large internal helper SDK that duplicates MCP tools.
- `browser.eval` and `browser.playwright` should treat `code` as an async function body with explicit `return`, not as a single expression.
- `browser.get`, `browser.eval`, and `browser.playwright` are distinct browser read/escape layers: `browser.get` for simple targeted reads, `browser.eval` for page-context JavaScript, and `browser.playwright` for full Playwright access.
- `browser.eval` may mutate page state because page-context JavaScript cannot be reliably constrained to read-only behavior. After it runs, agents should assume previous `browser.snapshot` refs are stale and capture a fresh snapshot before ref-based actions.
- `browser.get` should be one targeted-read tool with a `kind` selector rather than separate tools per property, keeping the browser tool list compact while still covering common reads.
- `browser.wait` should wait for explicit browser-visible conditions with elapsed-duration and timeout feedback. It should not expose an unconditional sleep primitive in the first browser workbench design.
- `browser.find` should provide direct semantic locator resolution for role, text, label, placeholder, test id, and CSS selector queries. It complements, but does not replace, `browser.snapshot`; refs from snapshots remain the default visible-state workflow. It returns reusable targets and should not perform actions itself.
- `browser.snapshot` refs and `browser.find` refs should share one **Browser Ref Store** per browser session. Snapshot refs use `@eN`, find refs use `@fN`, and both are valid inputs for `browser.act`, `browser.get`, `browser.wait`, and `browser.playwright.refs`.
- Semantic locator grammar should live in `browser.find` only. `browser.act`, `browser.get`, and `browser.wait` should accept refs or selectors rather than duplicating role/text/label/test-id inputs inline.
- Browser console and network details should be exposed as separate `browser.console` and `browser.network` tools backed by per-session **Browser Signal Buffers**. `browser.snapshot` may summarize visible browser state, but it should not become a full console or network dump.
- `browser.act` should cover the common **Browser Action Set** directly and leave rare interactions such as drag, upload, download, raw mouse, or raw keyboard APIs to `browser.playwright` until they earn first-class contracts.
- `browser.act` should not capture screenshots automatically. Agents should call `browser.screenshot` explicitly when they need visual evidence, and `browser.screenshot` should return the artifact location.
- `browser.snapshot` should continue to write a lightweight structured artifact automatically because it is the primary browser forensics packet and ref source. Other browser workbench calls should return inline output unless they are explicitly artifact-producing tools such as `browser.screenshot`.
- Agent-facing MCP tools must be self-describing through `tools/list`: every browser workbench tool and every input field should have descriptions that explain when to use it, accepted values, defaults, and important side effects such as stale refs or mutation.
- `browser.tabs` should stay out of the first **Browser Workbench** slice because it changes the **MCP-Owned Browser Session** model from one active page to multi-page management. New-tab and multi-page flows can use `browser.playwright` until tabs earn a first-class follow-up.
- `browser.network` should be read-only in the first **Browser Workbench** slice. Network routing, mocking, aborting, and HAR recording are deferred because they change product behavior or artifact weight and need a separate contract.
- **Run Forensics** should be owned by a focused Module below the **MCP Control Surface**, keeping browser evidence capture local while the tool router stays orchestration-focused.
- The default **Dev MCP Tool Grammar** should use reusable harness vocabulary and avoid product-specific tool names.
- The **Reference Showcase App** README should include a **Showcase Build Narrative** so future agents and humans can understand how the app was built through journeys, not just how to run it.
- The **Reference Showcase App** should demonstrate three outcomes: a working app, deep inspectability for agents across the proof/build history, and CI-demonstrable verification.
- **Journey UX** should be designed before implementation because the showcase is meant to teach agents how to move from textual intent to MCP-driven proof, not merely expose low-level runner functions.
- The primary user of **Journey UX** is the coding agent in dev mode; human maintainers and CI are secondary users.
- The procedure captured in the **Showcase Build Narrative** should be distilled into a **Showcase Skill** so agents can reuse the same journey-first development method beyond this repo.
- The **Showcase Skill** should include **Skills Repo Initialization** so a new repository can be prepared with `npx skills` before applying the journey-first harness workflow.

## Example dialogue

> **Dev:** "Are we building an MCP server or a testing library?"
> **Domain expert:** "Both, but the **Harness Core** is the product boundary. The **Reference Harness Server** is a reusable default implementation on top, and consumer apps should plug their specifics into extension points and **Journey Profiles** rather than fork the harness."

## Flagged ambiguities

- "MCP harness" was used to mean both the reusable product and its MCP interface — resolved: use **Agent E2E Harness** for the product and **MCP Control Surface** for the interface.
- "Anybody building with agents" was sharpened to **Agent-Built Development** — the primary domain is not people who build agents, but teams using agents to build software and requiring deterministic proof that can graduate into CI E2E tests.

- "Journey" hierarchy initially omitted profiles — resolved: **Journey Profile** is first-class because the same **Executable Journey** must run across different seeded substrates without changing its intent.
- **Journey Profiles** were made required rather than optional — resolved: repeatability and CI reuse require environment assumptions to be explicit from the first journey definition.
- **Journey Profile** was sharpened from environment-only to journey variation: profiles select runtime targets, credentials, refs, seed dependencies, and profile-aware step/proof branches while preserving the same journey intent.
- Profile-vs-journey boundary resolved: alternative substrates for the same proof are **Journey Profiles**; materially different user goals or recovery flows are separate **Executable Journeys**.
- Crystallization contract resolved: MCP step/phase passes are development evidence; final proof requires the declared **Closure Command** to pass non-interactively from clean seed.
- Teardown boundary resolved: use a mandatory run-scoped **Ownership Ledger** plus **Resource Adapters** for deletion mechanics; never delete by profile prefix or arbitrary cleanup scope alone.
- Journey data model resolved as hybrid: keep the **Inspectable Journey Contract** data-shaped for agents/CI, while allowing step and proof handlers to remain executable TypeScript.
- Step feedback generic boundary resolved: product-specific observed state belongs in a typed **Observed Domain Payload** inside the harness-owned **Feedback Envelope**.
- Generic model resolved: use one **Harness Types** map instead of many independent generic parameters, so product integrations bind refs, profiles, observed payloads, and owned resources coherently.
- Modeling principle resolved: avoid predefined structure unless it supports agent/CI coordination, artifact interpretation, type-safe product payloads, or teardown safety. Product-specific semantics should remain product-owned.
- Seed boundary revised: seed may be profile-aware, but the canonical concept is **Environment Seed** because it prepares the repeatable environment; the **Journey Profile** is input to setup, not the setup itself.
- Seed API placement resolved: support both journey-level common seed and profile-level variation seed, composed into one **Seed Manifest** for the selected profile.
- Seed error policy resolved: **Environment Seed** is a gate, not passive setup. Seed errors fail/block the journey before steps run; seed warnings are surfaced in MCP so the agent can decide whether to continue.
- Seed execution mode resolved: support both explicit seed/reseed tools for MCP inspection and automatic seed inside non-interactive journey/closure runs.
- Warning policy resolved: warnings are non-blocking by default but always structured, artifacted when useful, and paired with agent-facing next guidance rather than hidden logs or human prompts.
- Guidance model resolved: `next` uses semantic **Guidance Actions** with optional executable tool/command bindings, avoiding both free-text-only guidance and MCP-only coupling.
- Execution surface typing resolved: do not force a tiny browser port into core. Carry page/browser through **Harness Types** so journeys can use full Playwright objects by default while core remains generic.
- Package default resolved: `@agent-e2e/harness` should default to the Playwright-specialized **Default Harness API**, while `@agent-e2e/harness/core` exposes generic factories/types.
- Reseed cleanup resolved: reseed is first-class and should clean ownership-ledger resources via resource-kind destruction mechanics before reapplying **Environment Seed**.
- Resource typing resolved: product resources should use a lean **Typed Resource Registry**. Type creation inputs and resource kinds; keep owned resources as minimal `kind`/`id` handles with optional label/metadata; keep rich observations in **Observed Domain Payloads**.
- Showcase purpose resolved: the repository needs a **Reference Showcase App**, not just a technical smoke showcase. It should demonstrate seed, MCP iteration, deterministic proof, closure, artifacts, and teardown through a small realistic app while keeping showcase semantics local to this repo.
- Showcase infrastructure direction resolved: the showcase should bring infrastructure up and tear it down as part of the process, instead of relying on localStorage or an ambient manually managed database.
- Stack management boundary resolved: dev-mode stack management belongs to the **Agent E2E Harness** as an extension point. The harness coordinates stack lifecycle, but concrete infrastructure is supplied by product/showcase **Stack Providers** rather than hardcoded into core.
- Reference stack direction resolved: the showcase should use a Testcontainers-backed PostgreSQL stack with schema initialization as the default demonstration of managed infrastructure.
- Showcase provider standard resolved: Testcontainers should remain in the showcase as the recommended dev-mode infrastructure approach for the demo.
- Provider packaging resolved: keep PostgreSQL/Testcontainers showcase-local; the public harness package exposes generic stack contracts and should not export demo infrastructure providers.
- Dev-mode stack resolved: the showcase should favor editable-source dev mode for agent iteration, not a production-only prebuilt app image flow.
- Showcase product story resolved: use **Proof Notes Showcase** with baseline workspace/user seed, UI-created proof note, persisted proof, owned-resource cleanup, and closure.
- Showcase seed/cleanup transport resolved: prefer product API calls for seed and owned-resource cleanup in the showcase, because API exercise is itself useful system proof. Direct SQL remains appropriate for schema initialization and low-level stack provisioning.
- Showcase development method resolved: build the showcase app through its own journeys iteratively, so the demo is created by the same deterministic proof workflow it teaches.
- Showcase TDD method resolved: use **Harness-Driven TDD**. Journeys are first written as text, then exercised through the harness MCP surface via a standard MCP client; each failing journey drives the next vertical implementation slice until it passes and can later crystallize.
- Dev MCP mode resolved: development should use an HTTP **Dev MCP Server**, not only one-shot stdio, so journey definitions and app code can hot-reload during agent iteration.
- MCP browser ownership resolved: dev-mode MCP operations should create and manage Playwright browser/page sessions themselves, headed by default for visibility, with headless reserved for closure/CI paths.
- Browser forensics resolved: `browser.snapshot` should be the primary MCP browser forensics tool, not a narrow DOM or screenshot helper.
- Browser workbench grammar resolved: browser tooling should expand through fixed universal `browser.*` tools rather than copying the provider-declared `stack.capability.list` / `stack.capability.run` model.
- Browser workbench audience resolved: browser workbench tools serve the agent's live MCP exploration loop, while crystallized journeys continue to use direct execution objects such as Playwright `page` and `browser`.
- Browser escape hatch shape resolved: `browser.playwright` executes an async closure-like body with direct live Playwright access rather than a declarative mini-language or page-only evaluation.
- Browser escape hatch output resolved: `browser.playwright` returns the closure output as the tool result and does not create automatic evidence artifacts by default.
- Browser escape hatch serialization resolved: `browser.playwright` may use arbitrary Playwright objects inside the closure, but the returned output must be JSON-serializable for MCP transport.
- Browser escape hatch timeout resolved: `browser.playwright` defaults to a 5s timeout and accepts an override capped at 30s so exploratory Playwright code cannot hang the Dev MCP server indefinitely. The tool response reports elapsed duration and effective timeout so agents can distinguish fast failures from timeout-bound failures.
- Browser escape hatch mutation resolved: `browser.playwright` can mutate the live browser session during exploration, and any previous snapshot refs must be considered stale afterward.
- Browser eval boundary resolved: keep `browser.eval` as a separate page-context JavaScript tool even though `browser.playwright` exists, because agents need a lighter escape hatch for `window`, DOM, localStorage, and app globals.
- Browser eval/playwright symmetry resolved: `browser.eval` and `browser.playwright` share timeout defaults, timeout caps, elapsed-duration reporting, and JSON-serializable output requirements; only the execution context differs.
- Browser eval/playwright input resolved: both tools accept JSON `input` separately from `code`, and expose that input to the executed code.
- Browser playwright refs resolved: `browser.playwright` receives selected snapshot/find refs as selector or locator metadata so agents can bridge from `@eN`/`@fN` exploration to direct Playwright calls without a larger helper SDK.
- Browser code shape resolved: `browser.eval` and `browser.playwright` execute async function bodies with explicit `return`, allowing multi-line exploratory code instead of expression-only snippets.
- Browser eval mutation resolved: `browser.eval` can mutate page state during exploration, so previous snapshot refs must be considered stale afterward.
- Browser targeted read resolved: `browser.get` uses a `kind` field for text, HTML, value, attribute, title, URL, and count reads instead of expanding the MCP vocabulary with one tool per property.
- Browser wait resolved: `browser.wait` uses an `until` condition for ref, selector, text, URL pattern, load state, or page-context function, shares the browser timeout feedback shape, and intentionally omits fixed sleep in v1.
- Browser semantic find resolved: include `browser.find` in v1 for role, text, label, placeholder, test id, and CSS selector queries, returning reusable targets rather than performing actions, while keeping `browser.snapshot` as the primary visible-state and ref workflow.
- Browser ref store resolved: snapshot refs use `@eN`, find refs use `@fN`, and both share one browser session ref store accepted by the browser workbench tools.
- Browser locator ownership resolved: `browser.find` owns semantic locator resolution; `browser.act`, `browser.get`, and `browser.wait` consume refs or selectors and do not repeat the semantic locator grammar.
- Browser signal buffers resolved: expose console and network events through `browser.console` and `browser.network` with cursor/since incremental reads per browser session rather than embedding detailed signal history in every snapshot.
- Browser action set resolved: `browser.act` supports click, fill, press, hover, focus, check, uncheck, select, and scroll in the browser workbench v1; rarer interactions stay behind `browser.playwright`.
- Browser screenshot capture resolved: `browser.act` does not auto-capture screenshots; `browser.screenshot` is explicit and returns the screenshot artifact location.
- Browser workbench output policy resolved: `browser.snapshot` auto-artifacts its structured packet, `browser.screenshot` is explicit and artifact-producing, and other browser workbench tools return inline output by default.
- MCP discoverability resolved: browser workbench implementation must include high-quality tool and input descriptions in the MCP schemas, not rely on README prose or source inspection for correct agent usage.
- Browser tabs deferred: avoid `browser.tabs` in the first Browser Workbench slice because it changes browser session shape; use `browser.playwright` for exceptional multi-page exploration until a tab model is designed.
- Browser network mutation deferred: `browser.network` v1 observes network events only; route/mock/abort/HAR capabilities stay out of scope until mutation and artifact semantics are designed.
- Dev MCP tool direction resolved: use a Playwright-backed MCP tool grammar shaped around stack, run, browser, journey, artifact, cleanup, and proof operations.
- Showcase documentation outcome resolved: the showcase README should tell how the showcase was built through the harness, producing a working app, agent-inspectable proof history, and CI-demonstrable verification.
- Journey UX priority resolved: design the journey authoring and agent execution experience upfront before building the richer showcase, so the app demonstrates an intentional proof workflow rather than accidental tool plumbing.
- Journey UX user priority resolved: optimize first for the coding agent in dev mode, with human review and CI execution served by the same artifacts and closure evidence.
- Skill extraction direction resolved: document the showcase construction procedure from conception through CI crystallization so it can become a reusable `SKILL.md`.
- Skill bootstrap resolved: the future `SKILL.md` should include repo initialization through `npx skills`, so the workflow can start from a clean repository rather than assuming local manual setup.
- Artifact layout resolved: primary proof/debug output belongs under `.agents-e2e/artifacts/<journey>/<run>/`, with numbered `01-phase-.../01-step-.../` folders. Do not keep product-specific nesting from earlier harnesses, generic `steps/` nesting, or `.scratch` as a primary proof path.
- Failure evidence resolved: failed journey steps must return first-class artifacts too, especially `failure.png`, `result.json`, `console.json`, `network.json`, and `step-feedback.json`, so agents can debug from MCP without hidden terminal state.
- Skill packaging resolved: the consumer workflow skill lives in `skills/agent-e2e-harness/SKILL.md` after `npx skills init`; local installed copies under `.codex/` or `.agents/` are not versioned.
- Proof transcript resolved: meaningful dogfood MCP runs should be summarized in `docs/showcase/mcporter-proof-transcript.md` so validation survives beyond terminal scrollback while generated `.agents-e2e/` artifacts remain ignored.
- Showcase organization resolved: the showcase must model best-practice consumer-app layout, with app routes in `apps/showcase/app`, reusable product/harness integration code in `apps/showcase/src`, and app E2E tests in `apps/showcase/test` rather than inside `packages/harness/test`.
- Public type fixture organization resolved: type-level public API fixtures live under `packages/harness/test-d`, close to the package they validate, instead of a repo-root `test-d` directory.
- Showcase drift prevention resolved: shared showcase ids, proof body, baseline resources, schema SQL, URL helpers, and resource-adapter behavior live in `apps/showcase/src/proof-notes-contract.ts` so the typed Playwright journey, MCP journey, app routes, and stack provider do not duplicate those constants.
- Showcase script boundary resolved: the showcase has no app-owned Dev MCP script; reusable showcase-specific stack and Dev MCP journey composition live under `apps/showcase/src/harness/` so scripts do not become a parallel app architecture.
- Public CLI command pair resolved: `agent-e2e dev` starts the agent-facing development server, and `agent-e2e verify` runs CI verification from `agent-e2e.config.ts`. `dev-mcp` and `agent-e2e-harness` may remain compatibility aliases, but they are not the intended public surface.
- Verify default selection resolved: `agent-e2e verify` runs every configured journey once with that journey's default profile. Profile expansion is explicit through selector flags such as `--profile` or `--all-profiles`.
- Verify stack lifecycle resolved: `agent-e2e verify` starts the configured stack once for the selected suite and stops it once after the suite finishes. Journey isolation inside that shared stack is provided by seed, owned-resource cleanup, run ids, and artifact scoping rather than by rebooting app infrastructure per journey.
- Verify parallelism resolved: `agent-e2e verify` runs selected journey/profile pairs serially by default and supports explicit worker-pool parallelism through `--workers <n>`. The runner should be structured as a selected-run queue from the start so parallelism does not become a later architectural bolt-on.
- Verify browser isolation resolved: verify owns one Playwright browser for the process and creates a fresh browser context/page per selected journey/profile run. Each run closes its context after completion and receives an isolated run id plus artifact scope.
- Verify failure/reporting resolved: verify completes all scheduled runs by default, then exits non-zero if any selected run failed. `--fail-fast` may stop scheduling new runs after the first failure, but cleanup, browser close, stack stop, and unified reporting still run. Verify produces one suite-level report that summarizes all selected journey/profile results and links to per-run artifacts.
- Verify report format resolved: verify writes both a human Markdown report and a machine JSON report by default. The report captures suite timing, config path, stack summary, selected journey/profile runs, workers, per-run seed/step/cleanup status, artifact links, warnings/errors, and exit-code reason.
- Verify suite artifact layout resolved: verify writes one suite artifact directory under `.agents-e2e/artifacts/_suites/<suite-id>/`, containing `report.md`, `report.json`, and per-run artifacts under `runs/`. CI can upload that one suite directory as the verification artifact.
- Verify artifact scoping resolved: dev-mode MCP keeps the flat iterative layout `.agents-e2e/artifacts/<journey>/<run>/`, while `agent-e2e verify` writes selected run artifacts under `.agents-e2e/artifacts/_suites/<suite-id>/runs/<journey>/<profile>/<run>/` so a CI verify run is self-contained.
- Verify id contract resolved: verify uses CI-aware suite ids when available, such as `verify-github-<run-id>-<attempt>`, and a UTC timestamp plus short suffix locally. Per-run ids are readable, slugged from journey id, profile id, and selection index so artifact paths remain stable within the suite.
- Verify selection model resolved: exact selectors, glob selectors, tags, excludes, profiles, all-profile expansion, and named verify suites are all part of the verify product surface. Tags and named suites belong in `agent-e2e.config.ts`; CLI selectors compose with or override the configured selection for local and CI use.
- Verify journey tags resolved: tags live on journeys, not profiles. Tags classify the journey's purpose or risk class; suites select profile variants explicitly when needed.
- Verify suite config shape resolved: named verify suites are configured as an array of suite objects with `id`, optional `title`, selector fields such as `journeys`, `tags`, `exclude`, `profiles`, and optional `allProfiles`.
- Verify defaults resolved: `agent-e2e.config.ts` may declare verify defaults such as workers, reporter, warnings-as-errors, fail-fast, cleanup mode, and suites. CLI flags override config defaults for local or CI-specific runs.
- Verify option precedence resolved: verify settings resolve as CLI flags first, then `agent-e2e.config.ts` verify defaults, then CI/environment auto-detection, then built-in defaults.
- Verify delivery plan resolved: README cleanup, domain/design docs, and implementation should stay on the same branch and PR, separated into reviewable commits rather than split across branches.
- Verify selector composition resolved: `--suite <id>` selects the base set; additional CLI selectors such as `--journey`, `--tag`, `--profile`, and `--all-profiles` narrow that base set; `--exclude` subtracts from the result. Without `--suite`, the base set is all configured journeys with their default profiles.
- Verify profile selection resolved: a requested profile must exist on every selected journey. Missing requested profiles are selection errors before execution, never silent skips or fallback to default.
- Verify cleanup mode resolved: verify cleans each run's Ownership Ledger after result capture by default, even when the journey fails. Future explicit modes may allow suite-end cleanup or no cleanup for local debugging, but those modes must be visible in reports.
- Verify cleanup failure resolved: if journey proof passes but owned-resource cleanup fails, the run receives a distinct failing status such as `cleanup_failed`; the suite exits non-zero while preserving that product behavior passed and teardown failed.
- Verify cleanup isolation resolved: cleanup failure stops scheduling new runs by default because shared stack isolation is no longer trustworthy. Already-running workers finish and attempt cleanup; verify still closes browser resources, stops the stack, writes the unified report, and exits non-zero.
- Verify seed/stack failure resolved: per-journey seed failure produces a distinct `seed_blocked` run result and verify continues scheduling other selected runs by default. Stack startup or stack health failure stops the suite before journey execution because no selected run can be trusted.
- Verify warnings resolved: seed and step warnings are visible, counted, and linked to guidance/artifacts in the unified report but do not fail verify by default. Strict mode such as `--warnings-as-errors` may convert warnings into failing results.
- Verify terminal output resolved: default CLI output shows a concise progress list for selected runs plus a final suite summary and report path. `--quiet`, `--verbose`, or reporter options may tune output, but full diagnostic detail belongs in artifacts and unified reports.
- Verify reporter surface resolved: verify supports built-in reporter modes such as list, quiet, json, and github, while always writing Markdown and JSON suite report files. Custom reporter plugins are out of scope for the first design.
- Verify GitHub annotations resolved: when `GITHUB_ACTIONS=true` and no reporter is explicitly set, verify emits concise GitHub Actions annotations in addition to the default list output. Explicit reporter flags override auto-detection, and suite report files remain canonical.
- Dev command behavior resolved: `agent-e2e dev` starts the same Streamable HTTP Dev MCP Server as the existing dev-mcp path, but presents user-facing startup output with the stable MCP URL, Codex and Claude setup commands, and the available harness tool groups. It is not a dashboard or TUI in the first design.
- CLI compatibility resolved: because launch adoption has not settled yet, the next public docs and implementation should move directly to the clean `agent-e2e` binary and `dev` / `verify` commands instead of preserving `agent-e2e-harness` or `dev-mcp` as user-facing aliases.
- Dev MCP ergonomics resolved: consumers should use `agent-e2e.config.ts` plus `agent-e2e dev` so journeys, resource adapters, browser sessions, artifacts, and signal handling are convention-based rather than README wiring.
- Dev MCP port policy resolved: the Dev MCP endpoint uses a stable default URL, `http://127.0.0.1:3766/mcp`; `AGENT_E2E_MCP_PORT` overrides it. App URLs are stack-owned data returned by `stack.start` / `stack.status`, not manifest configuration.
- Dev MCP runtime resolved: Bun is the required runtime for Dev MCP entrypoints so TypeScript config can be executed and reloaded directly without a Node compile/watch bridge.
- Tool response contract resolved: MCP and Dev MCP adapters share one **Tool Response Contract** so `ok`, `blocked`, `not-found`, `error`, guidance, and error payload semantics do not drift between modules.
