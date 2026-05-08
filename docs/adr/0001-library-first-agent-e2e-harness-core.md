# Library-first Agent E2E Harness core

We will build `agent-e2e-harness` as a library-first toolkit with an optional reference MCP server and CLI. The core exposes a hybrid **Inspectable Journey Contract**: journey/profile/phase/step structure is data-shaped enough for agents, CI, and artifacts to inspect, while steps and proofs may bind executable TypeScript handlers.

The public model stays intentionally small. Every **Executable Journey** has at least one **Journey Profile** for variations of the same proof. **Environment Seed** prepares repeatable setup for the selected profile, can compose journey-level and profile-level setup, and must produce a **Seed Manifest**. Seed is a gate: errors block journey execution, warnings are structured and surfaced to the agent with guidance actions.

A proof is not crystallized by MCP step success alone. A **Crystallized Proof** requires the same journey to pass through its non-interactive **Closure Command** from clean seed, so development-time agent evidence can consolidate into CI E2E coverage. Teardown is bounded by a run-scoped **Ownership Ledger**; resource adapters may provide deletion mechanics but cannot widen ownership implicitly.

We reject a broad predefined product schema. The **Minimal Core Contract** predefines only what agents, CI, artifact readers, and teardown safety need. Product-specific observations and profile data remain typed product-owned payloads inside the harness-owned envelopes.

The initial package may ship as one npm package with subpath boundaries. The package-root **Default Harness API** is Playwright-specialized because the reference harness executes browser journeys and should be ergonomic for browser-first proof workflows. The `/core` subpath remains generic and must not import Playwright. Instead of a tiny browser port, the selected execution surface (for example Playwright `Page` and `Browser`) flows through **Harness Types**, so journey handlers can use the full adapter objects while core orchestration remains adapter-agnostic.
