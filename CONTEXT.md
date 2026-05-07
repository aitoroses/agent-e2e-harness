# Agent E2E Harness

A reusable toolkit for agent-built development: agents validate their own work through executable journeys, seeded repeatable environments, MCP-callable controls, browser/API evidence, artifact capture, and owned-resource teardown. The same proofs should remain consolidated as CI E2E tests. It is extensible enough to replace product-specific harnesses such as the Terrarium Runtime UI E2E harness.

## Language

**Agent E2E Harness**:
A library-first toolkit with an optional reference MCP server and CLI for running agent workflow journeys.
_Avoid_: MCP harness, test helper, UI harness


**Agent-Built Development**:
A development workflow where agents implement changes and must produce deterministic proof that the change works.
_Avoid_: agent builder, MCP authoring, manual QA

**Product-Specific Harness**:
A harness embedded in one product codebase that the **Agent E2E Harness** should be able to replace through extension points.
_Avoid_: legacy harness, bespoke test code

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

**Ownership Ledger**:
A run-scoped record of resources created by an **Executable Journey** that bounds what teardown may delete.
_Avoid_: cleanup list, resource cache, teardown state

**Resource Adapter**:
An extension that knows how to create, inspect, or delete one kind of product resource without expanding the **Ownership Ledger**.
_Avoid_: cleanup callback, plugin, driver

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

**MCP Control Surface**:
The Model Context Protocol interface that lets agents inspect, run, pause, debug, and tear down journeys.
_Avoid_: harness, transport layer

## Relationships

- The **Agent E2E Harness** includes the **Harness Core**, **Reference Harness Server**, and **Reference CLI**.
- The **Reference Harness Server** exposes the **Harness Core** through an **MCP Control Surface**.
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
- Teams doing **Agent-Built Development** may embed the **Harness Core** without using the **Reference Harness Server** or **Reference CLI**.
- A **Product-Specific Harness** can be replaced when its product-specific behavior fits behind **Harness Core** extension points.

## Example dialogue

> **Dev:** "Are we building an MCP server or a testing library?"
> **Domain expert:** "Both, but the **Harness Core** is the product boundary. The **Reference Harness Server** is a reusable default implementation on top, and products like Terrarium Runtime should plug their specifics into extension points and **Journey Profiles** rather than fork the harness."

## Flagged ambiguities

- "MCP harness" was used to mean both the reusable product and its MCP interface — resolved: use **Agent E2E Harness** for the product and **MCP Control Surface** for the interface.
- "Anybody building with agents" was sharpened to **Agent-Built Development** — the primary domain is not people who build agents, but teams using agents to build software and requiring deterministic proof that can graduate into CI E2E tests.

- "Journey" hierarchy initially omitted profiles — resolved: **Journey Profile** is first-class because the same **Executable Journey** must run across different seeded substrates without changing its intent.
- **Journey Profiles** were made required rather than optional — resolved: repeatability and CI reuse require environment assumptions to be explicit from the first journey definition.
- **Journey Profile** was sharpened from environment-only to journey variation after inspecting runtime-v2: OC1 profiles select Codex/Claude substrates, credential strategies, refs, copy matchers, seed dependencies, and profile-aware step/proof branches while preserving the same journey intent.
- Profile-vs-journey boundary resolved: Codex local vs Claude local for first-session proof are **Journey Profiles**; first-session proof vs blocked-launch recovery are separate **Executable Journeys**.
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
