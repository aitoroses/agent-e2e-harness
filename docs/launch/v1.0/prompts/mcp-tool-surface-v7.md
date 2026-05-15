# Prompt — mcp-tool-surface v7 (Browser Workbench + stable capability groups)

Target render candidate: `/tmp/mcp-tool-surface-v7.png`
Final target if approved: `docs/launch/v1.0/mcp-tool-surface.png`
Aspect ratio: 4:3
Style anchor: technical-infographic REFERENCE POSTER, low-volume isometric, paper-cream backdrop — visually compatible with the v1 launch image set

Intent:
Create an updated README illustration for Agent E2E Harness after the Browser Workbench expansion. The old poster was an exact 19-tool inventory. This v7 poster should teach the agent-facing mental model without becoming brittle: capability groups, not every individual tool as a row.

User-comprehension gate:
A coding agent or maintainer seeing this for 5 seconds should understand: "Agent E2E gives an agent map-like controls to start the app stack, reset seeded state, inspect journeys, drive a browser workbench, read artifacts, and clean up safely."

---

A technical-infographic REFERENCE POSTER in clean low-volume isometric style on a paper-cream off-white background (#FAF7F2). 4:3 aspect ratio. 45-degree isometric perspective with very shallow panel depth — panels read as thin reference trays, not deep boxes. Maximum text legibility is the design goal.

TITLE:
Top of frame, centered, bold uppercase technical sans-serif, near-black:
"AGENT CONTROLS"

SUBTITLE:
Directly underneath the title, thin horizontal rule, then smaller near-black sentence case:
"A map and toolbelt for coding agents: start the stack, reset state, inspect journeys, drive the browser, read evidence, clean up."

LAYOUT:
Six labeled isometric tray-panels in a 3 x 2 grid with generous gutters. Each panel header is uppercase near-black technical sans-serif. Within each panel, capability rows are stacked vertically. Each row is flat text, not a pill:
- LEFT side: monospace tool or tool family, near-black
- soft graphite em dash separator
- RIGHT side: short plain-English description, sentence case, lighter technical sans-serif

Thin 1px hairline rules separate rows. No per-row dots, badges, chips, or icons.

PANEL ORDER:

TOP ROW:

Panel 1 top-left — header "STACK" — four rows:
- `stack.start` — bring up the app, database, and services
- `stack.status` — read readiness, services, endpoints, and warnings
- `stack.logs` — inspect recent service logs
- `stack.explore.*` — run provider-owned stack inspection tools

Panel 2 top-center — header "RUN" — three rows:
- `run.begin` — start from seeded state
- `run.reseed` — reset only what this run created
- `run.teardown` — clean up run-owned resources

Panel 3 top-right — header "JOURNEY" — highlighted as the workflow core with one warm-orange (#E89B4F) bar directly under the header text and a slightly thicker 1.5px outline. Four rows:
- `journey.list` — show available journeys
- `journey.inspect` — read phases, steps, proofs, and profiles
- `journey.step` — execute one crystallized step
- `journey.phase` — run or fast-forward through a phase

BOTTOM ROW:

Panel 4 bottom-left — header "BROWSER WORKBENCH" — largest bottom panel, six rows:
- `browser.snapshot` — capture visible state and refs
- `browser.find` — resolve semantic targets
- `browser.act` — perform one UI mutation
- `browser.wait` / `browser.get` — wait for state and read targeted values
- `browser.console` / `browser.network` — inspect runtime signals
- `browser.eval` / `browser.playwright` — run bounded exploration code

Panel 5 bottom-center — header "ARTIFACT" — compact panel, two rows:
- `artifact.read` — open saved evidence from a run
- screenshots and packets — inspect what happened before

Panel 6 bottom-right — header "CLEANUP" — compact panel, two rows:
- `cleanup.plan` — preview what teardown would remove
- ownership ledger — delete only run-owned resources

NO connector arrows between panels. NO flow lines. The reader browses the grid freely.

LEGIBLE TEXT INVENTORY:
Only these text strings may appear:
- "AGENT CONTROLS"
- "A map and toolbelt for coding agents: start the stack, reset state, inspect journeys, drive the browser, read evidence, clean up."
- "STACK", "RUN", "JOURNEY", "BROWSER WORKBENCH", "ARTIFACT", "CLEANUP"
- All row left labels and row descriptions exactly as listed above

ACCURACY REQUIREMENTS:
- The image must contain exactly 21 capability rows total: STACK 4, RUN 3, JOURNEY 4, BROWSER WORKBENCH 6, ARTIFACT 2, CLEANUP 2.
- Tool labels must be spelled exactly, including dots, slashes, and asterisks:
  - `stack.start`, `stack.status`, `stack.logs`, `stack.explore.*`
  - `run.begin`, `run.reseed`, `run.teardown`
  - `journey.list`, `journey.inspect`, `journey.step`, `journey.phase`
  - `browser.snapshot`, `browser.find`, `browser.act`, `browser.wait` / `browser.get`, `browser.console` / `browser.network`, `browser.eval` / `browser.playwright`
  - `artifact.read`
  - `cleanup.plan`
  - "screenshots and packets", "ownership ledger"
- Descriptions must match the row descriptions word-for-word.
- Descriptions are sentence case and have no trailing period.

FORBIDDEN TEXT:
- "harness.probe", "journey.prompt", "journey.validate", "closure.run", "journey.run", "proof.timeline", "run.reset", "run.status", "run.explainFailure", "browser.apiCall", "browser.tabs"
- "/mcp" as a subpath callout
- "DEV MCP TOOL GRAMMAR"
- "v1.0", "v1.1", "29 tools", "19 tools", or any version/count restatement
- "AI", "TEST", watermarks, draft markers, lorem ipsum
- any tool name or description not in the legible text inventory

FORBIDDEN IMAGERY:
- humanoid robot, mascot, visor, glowing brain, neural-network spaghetti
- purple gradients, exposed circuitry, cyborg eye
- laptop or phone props, speech bubbles, cursor pointers
- magnifying glass, gear/cog cliché
- arrows between panels, flow lines, numbered ordering badges
- per-row dots, badges, or chip pills
- footer seal, footer stamp, QR code, logo mark

VISUAL SYNTAX:
Black 1px technical pen linework. Low-volume isometric trays with clean soft drop shadows beneath each panel. Color discipline:
- Warm orange (#E89B4F): one element only, the JOURNEY panel header underline bar.
- Cream, off-white, graphite, and near-black dominate everywhere else.
- No mint green. No cyan. No purple.

TYPOGRAPHY:
Title > subtitle > panel headers > tool labels > descriptions.
Tool labels use monospace. Descriptions use technical sans-serif, about 70% optical weight of tool labels. All text must remain legible at 800px wide on GitHub.

COMPOSITION PRIORITY:
Visitor's eye lands on "AGENT CONTROLS", reads the subtitle, maps the 3 x 2 group grid, then reads each panel as `tool.family — capability`. Engineering manual / product teardown aesthetic. Print-ready, 4K ultra-crisp. Generous gutters around every panel and frame edge.

---

(Renderer note: extract everything below the first `---` and above the next `---` as the prompt body.)
