# Prompt — proof-loop v6 (differentiator 2: time-travel debugging via artifacts)

Target render: `docs/launch/v1.0/proof-loop.png`
Aspect ratio: 16:9
Style anchor: technical-infographic, low-volume isometric, paper-cream backdrop — consistent with the rest of the launch set

What changed from v5 (Aitor's differentiator-based redirect, full restart):
- v5's "WRITE THE TEST ONCE · RUN IT IN CI" framing is RETIRED — generic E2E claim, not a differentiator. Drop the Playwright laptop scene, drop the GitHub Actions card, drop the "runs in CI" arrow.
- v6 anchors on **time-travel debugging via artifacts.** The agent can replay any past step, inspect the captured state at that step (before/after/failure screenshots, console log, network log, step result), and decide what to do next. Concrete, recognizable to anyone who has wished test failures had time-machine debugging.
- The hero v6 echo-stack-of-three-identical-tiles is GONE in proof-loop too. The time-travel concept here is different — not "same result every time" but "every past state is preserved and reachable."

User-comprehension gate: a Reddit r/ClaudeCode reader who never saw this project should, in 5 seconds, read "the agent can scrub back to ANY past step of a test run and inspect what happened — every state preserved as artifacts." That is the unique claim agent-e2e-harness ships.

The "scrubber-UI cliché" trap (a horizontal media-bar with a thumb slider) is explicitly forbidden. Use a journey-timeline metaphor with explicit step-stations + a back-jump arc + an artifact viewer instead — that's recognizable as developer-tooling, not video-player chrome.

---

A wide explanatory illustration in clean low-volume isometric technical-infographic style on a paper-cream off-white background (#FAF7F2). 16:9 aspect ratio. 45-degree isometric perspective.

THE CENTRAL CONCEPT — **a coding agent jumps back to a prior journey step and inspects the captured artifacts of that step**:
The frame shows ONE horizontal Executable Journey across the full width (lower-middle band), with discrete step-stations along it. The agent (terminal-prompt `>` cursor) is currently parked at a LATE step, but has reached BACK along the journey to a PRIOR step to inspect what happened. That "reach back" is rendered as a single explicit graphite arc arrow from the late step to the prior step. Where the arc lands, an artifact-viewer panel is opened showing the captured state of that step.

THE JOURNEY TIMELINE — six discrete step-stations across the frame:
A single solid black-ink horizontal path runs left-to-right across the lower-middle band. SIX step-station tiles are spaced evenly along the path, each rendered as a low-volume isometric square tile with a clean inked outline. Stations are labeled in small uppercase monospace under each tile, near-black: 'P1.S1', 'P1.S2', 'P1.S3', 'P2.S1', 'P2.S2', 'P2.S3' (visual rhyme with hero v6's coordinate labels — six characters each, dot-separated).

Station state encoding:
- Stations 'P1.S1', 'P1.S2', 'P1.S3', 'P2.S1' (the first four, left to right): completed and stamped with a small mint-green (#7FB99E) check mark in the upper-right corner. Solid inked-in fill.
- Station 'P2.S2' (the fifth, the one the agent has REACHED BACK to inspect): rendered as the FOCUS — a slightly larger tile with a thin cyan halo around it, no check (because the agent is examining it, not closing it). This is the "you are inspecting this step" station.
- Station 'P2.S3' (the sixth and rightmost, the current position the agent jumped back FROM): rendered crisp and clean with the terminal-prompt cursor parked just above it (cursor described below). This station has NO check yet because it's the current step.

The path between stations is unbroken graphite ink; the stations themselves are the spatial anchors.

THE AGENT — terminal-prompt cursor, same shape as hero v6 (visual rhyme across the set):
A single flat ink-drawn `>` terminal-prompt cursor in solid graphite, 1.5px stroke weight, hovering just above station 'P2.S3' at the right end of the timeline. The cursor's leading-edge apex carries a flat triangular warm-orange (#E89B4F) accent — ~10% of the cursor's width — NOT a motion trail, NOT a streak, NOT a flare, NOT a glow. The cursor's apex points down-left (NOT down-right) — toward the back-jump arc described below, telegraphing "this agent just reached back." NO eyes, NO face, NO body, NO hands.

THE BACK-JUMP ARC — the one explicit backward arrow in the launch set:
A single graphite (near-black) arc arrow rises FROM the cursor's apex at station 'P2.S3', curves up and over the timeline, and lands DOWN at station 'P2.S2'. Geometry: the arc is roughly the width spanning one station gap, peaks at about 1.2× the height of a station tile above the timeline, and resolves into a clean triangular arrowhead pointing down at 'P2.S2'. The arrow is 2px solid graphite, 1px shadow underneath for depth, NO other color. A short label sits above the peak of the arc on a horizontal label band in small uppercase technical sans-serif near-black: 'JUMP BACK'. Two words only, no other text near the arc.

THE ARTIFACT VIEWER — where the time-travel claim lives:
Beside station 'P2.S2' (the inspected step), to the LEFT of the station and slightly above the timeline, a rectangular artifact-viewer panel stands canted to the isometric grid. The panel reads as a developer tool, not a media viewer. Dimensions: roughly the width of two station tiles, height of about 2.5× a station tile. Inside the panel, top-to-bottom:

- Header band, bold uppercase technical sans-serif, near-black, left-aligned: 'STEP P2.S2 · ARTIFACTS'.
- Below the header, FIVE artifact rows. Each row is a flat horizontal entry (not a pill), with a small graphite icon-square on the left, then the monospace filename, near-black, lowercase:
  1. ▢  `before.png`
  2. ▢  `after.png`
  3. ▢  `failure.png`
  4. ▢  `console.json`
  5. ▢  `network.json`

The five filenames are the load-bearing accuracy claim of this image — these are real artifacts agent-e2e-harness captures per step, and they're the recognizable concrete handle for "time-travel debugging via artifacts." Render each filename EXACTLY as listed (lowercase, single dot, exact extension).

The first three rows ('before.png', 'after.png', 'failure.png') are visual snapshots — their icon-square may be filled with a faint cyan tint to suggest "image preview." The last two ('console.json', 'network.json') are log files — their icon-square is graphite-outlined only.

A SINGLE warm-orange (#E89B4F) hairline runs from station 'P2.S2' up to the artifact viewer panel's lower-left corner — the same orange semantic used on the cursor apex in hero v6, locking "the agent's action / inspection." Single line, NOT an arrow.

THE STRAP — names the differentiator directly:
Below the entire scene, a thin horizontal baseline rule. Centered well below the timeline, with generous spacing, a single larger uppercase technical sans-serif strap line: 'TIME-TRAVEL DEBUGGING · JUMP BACK TO ANY STEP · INSPECT EVERY ARTIFACT'.

NO additional title strip at the top of the frame. The strap line at the bottom carries the message. The composition is intentionally not split into two zones (no "dev vs CI" framing) — it is ONE journey timeline + ONE agent + ONE back-jump + ONE artifact viewer.

LEGIBLE TEXT INVENTORY — the ONLY text strings that may appear anywhere in the image, exactly as written:
- 'P1.S1', 'P1.S2', 'P1.S3', 'P2.S1', 'P2.S2', 'P2.S3' (six station coordinates under the timeline, monospace, lowercase-after-the-dot)
- 'JUMP BACK' (label above the back-jump arc, uppercase sans-serif)
- 'STEP P2.S2 · ARTIFACTS' (artifact viewer header, uppercase sans-serif with a middle-dot separator)
- `before.png`, `after.png`, `failure.png`, `console.json`, `network.json` (five artifact filenames inside the viewer, monospace, lowercase)
- 'TIME-TRAVEL DEBUGGING · JUMP BACK TO ANY STEP · INSPECT EVERY ARTIFACT' (baseline strap, uppercase sans-serif, middle-dot separators)

FORBIDDEN TEXT — must not appear anywhere in the image, even as ghost text, partially obscured, vertical, or angled:
- 'WRITE THE TEST ONCE', 'WRITE THE TEST ONCE · RUN IT IN CI', 'WRITING THE TEST', 'RUNNING IN CI', 'RUNS IN CI', 'CI · E2E TESTS', 'PASS', 'PASSED' — every v5-era text string is retired
- 'PLAYWRIGHT', 'GITHUB ACTIONS' (no framework / runner wordmark callouts in v6)
- 'CRYSTALLIZED PROOF', 'crystallized', 'CRYSTAL'
- 'DETERMINISTIC PROOF', 'Proof Packet', 'PACKET'
- 'becomes', 'CLOSURE COMMAND', 'CLOSURE'
- 'feedback', 'loop', 'cycle'
- 'DEV MCP', 'CI CLOSURE', 'DEV MODE', 'CI MODE', 'ONE EXECUTABLE JOURNEY · TWO EXECUTION MODES · ONE CI E2E TEST'
- ANY filename inside the artifact viewer other than the five listed (no `result.json`, no `step-feedback.json`, no `before.jpg`, no `screenshot.png`, etc.)
- ANY misspelling of the five filenames — every name renders exactly: 'before.png', 'after.png', 'failure.png', 'console.json', 'network.json'
- ANY spelled-out test code in or around the artifact viewer
- ANY timing string, duration, numeric value, run-id, or version number inside the viewer
- 'jest', 'mocha', 'vitest', 'cypress', 'selenium'
- 'AI', 'Agent', 'Robot'
- watermarks, draft markers, lorem ipsum
- 'PHASE 1', 'PHASE 2', 'PHASE 3' (the station coordinates carry the phase semantics; no separate phase strap)
- text on or near the terminal-prompt cursor glyph
- text on or near the orange hairline connecting station to viewer

FORBIDDEN IMAGERY — must not appear:
- ANY workstation / laptop / monitor / phone / tablet (this is a journey + artifact illustration, not a desk scene)
- humanoid robot, mascot, character, avatar, visor, eye, face, hand, finger
- ANY GitHub octocat / Actions logo / shield / badge
- ANY Playwright theatre-mask / brand mark
- ANY framework or runner wordmark of any kind
- vertical stele, gate, pillar, kiosk, ATM, vending machine, fingerprint reader, server rack
- circular crystallized-proof seal stamp
- ANY scrubber-UI cliché: horizontal media playback bar, slider track with a thumb knob, video player chrome, timeline-with-playhead-handle, audio waveform, transport playback glyphs (`◀◀`, `▶▶`, `||`, fast-forward / rewind / play / pause icons)
- ANY dual-direction arrow, double-headed arrow, looping arrow, return-to-start arrow other than the single 'JUMP BACK' arc described above (the back-jump arc is the ONE backward arrow in the entire launch set and it is unique to this image)
- glowing brain, neural-network spaghetti, purple gradients, exposed circuitry, cyborg eye
- magnifying glass, gear/cog, lightbulb
- speech bubbles, thought bubbles, cursor-pointer arrows (the terminal-prompt `>` glyph is the ONE exception)
- duplicated cursors (only ONE terminal-prompt cursor in the entire frame)
- motion-trail / comet-trail / streak / kinetic-blur effects on the cursor or on the back-jump arc
- the v5 hero echo-stack of three pixel-identical tiles
- the v5 laptop+Playwright+CI-card composition in any form

Visual syntax: black 1px technical pen linework. Low-volume isometric volumes with clean soft drop shadows. Color discipline at ~10–15% accent density:
- Mint green (#7FB99E): the four small check marks on the four completed stations ('P1.S1', 'P1.S2', 'P1.S3', 'P2.S1'). Reserved STRICTLY for "completed / passed."
- Cyan (#5CC6E0): the thin halo around the inspected station 'P2.S2'; a very faint cyan tint inside the icon-squares of the three image-artifact rows (`before.png`, `after.png`, `failure.png`) to suggest "image preview." Reserved for "in-progress / inspected / image-content."
- Warm orange (#E89B4F): the single triangular tip on the apex of the terminal-prompt cursor; the single hairline connecting station 'P2.S2' to the artifact viewer panel. Reserved STRICTLY for "the agent / agent's action." Consistent with hero v6 and mcp-tool-surface v6 — locked launch-set semantic.
- Graphite / near-black: the JUMP BACK arc arrow, all linework, all body text, the artifact-viewer panel outline, the four icon-squares of the log-file rows.

Cream, off-white, graphite, near-black dominate everywhere else. No glowing aura, no purple, no neon.

Typography hierarchy: strap line > station coordinates and artifact-viewer header > 'JUMP BACK' arc label > monospace filenames inside the viewer. Monospace face for station coordinates AND artifact filenames (visual rhyme: both are agent-readable map labels). Technical sans-serif for the strap and the viewer header and the arc label. All text must be legible when the image is rendered 800–1000px wide on GitHub. The five filenames are the load-bearing accuracy claim of this image.

Composition priority: visitor's eye first lands on the journey timeline + the back-jump arc rising above station 'P2.S3' and descending onto 'P2.S2' — the arc IS the time-travel motion, immediately decoded. The eye then reads the artifact viewer beside 'P2.S2' and registers the five filenames as "every state preserved." The strap line at the bottom names the differentiator: 'TIME-TRAVEL DEBUGGING · JUMP BACK TO ANY STEP · INSPECT EVERY ARTIFACT'. The agent's terminal-prompt cursor at 'P2.S3' is the actor who took the action.

Mood: chronograph precision meets technical reference panel. Engineering-manual / time-machine-debug-console aesthetic. Print-ready, 4K ultra-crisp. Generous negative space above the timeline (the back-jump arc lives there) and below the strap.

---

(Renderer note: extract everything below the first `---` and above the next `---` as the prompt body.)
