# Prompt — hero-agent-journey v7 (applies v6 critic's three strong sharpenings A/B/C; differentiator 1)

Target render: `docs/launch/v1.0/hero-agent-journey.png`
Aspect ratio: 16:9
Style anchor: technical-infographic, low-volume isometric, paper-cream backdrop — consistent with the rest of the launch set

What changed from v5 → v6 → v7:
- v5 → v6 (Aitor's differentiator-based redirect): central concept shifted from "same step, same result every time" (which now belongs to proof-loop v6 as time-travel) to **agent-centric tool design** — coding agent navigates with map-knowledge + toolbelt vs the chaotic alternative (context-burning, scrollback rediscovery). New strap names the differentiator directly.
- v6 → v7 (applies critic's three strong sharpenings on prompt-side hardening of load-bearing visuals):
  - **Sharpening A:** added a CRITICAL ACCURACY block for the 9 P-coordinates and the 4 toolbelt chip names — these are now the load-bearing accuracy claim of the "explicit coordinates" differentiator, so drift = silent failure. Block analogous to mcp-tool-surface's 19-chip discipline.
  - **Sharpening B:** toolbelt chips PINNED vertical (top-to-bottom stack), not horizontal — at hero render size, horizontal 4-chip strip would compress each chip to ~6–8px wide and become unreadable.
  - **Sharpening C:** closed-loop hook geometry tightened to "270° partial spiral that ends as an open hook tip near where it started, visibly NOT reaching a new destination" with explicit anti-cliche guards (not refresh icon, not infinity, not recycling, not return arrow, not bidirectional swap).

User-comprehension gate: a Reddit r/ClaudeCode reader who never saw this project should, in 5 seconds, read "this thing is built FOR agents — the agent has a map and a toolbelt instead of guessing through terminal scrollback." That's the unique claim no generic E2E framework can make.

---

A wide hero illustration in clean low-volume isometric technical-infographic style on a paper-cream off-white background (#FAF7F2). 45-degree isometric perspective. 16:9.

THE CENTRAL CONCEPT — **a coding agent navigates a journey with map-awareness and a toolbelt, not by guessing through scrollback**:
The frame contrasts two ways an agent could approach an E2E run. The dominant foreground composition shows the agent calmly parked at a known coordinate on a structured journey-map, with a small toolbelt visible — this is "built FOR agents." A faint vignette in the upper-left background ghosts the alternative: a tangle of terminal scrollback, a stack of unlabeled screenshots, a confused looping arrow — the "context-burning" foil. The viewer's eye lands on the clean map first; the ghost serves as the contrast that makes "agent-centric tool design" legible.

THE JOURNEY-MAP — explicit-coordinates layout (the foreground composition):
A horizontal journey-map occupies the lower-two-thirds of the frame, rendered like a clean transit-map / wayfinding diagram. The map shows three raised isometric phase platforms connected by a single solid black-ink path, same vocabulary as the rest of the launch set. Each platform carries 3 step-tiles labeled with EXPLICIT MAP COORDINATES:

- Platform 1 (left, completed): solid, inked-in, soft mint-green underside glow. Three step-tiles on top, each labeled in small uppercase monospace, near-black, on the face of the tile: 'P1.S1', 'P1.S2', 'P1.S3'. Each tile carries a small mint-green check mark in its corner.
- Platform 2 (center, active): crisp and clean, full opacity. Three step-tiles labeled 'P2.S1', 'P2.S2', 'P2.S3'. The middle tile ('P2.S2') is the ACTIVE step: surrounded by a thin cyan halo, slightly larger than its neighbors, with the coordinate label set in bold. The cursor agent (described below) hovers above this tile.
- Platform 3 (right, future): blueprint/wireframe outline only, light cyan construction lines, no solid fill. Three outlined tiles labeled 'P3.S1', 'P3.S2', 'P3.S3' in faint cyan monospace. Platform opacity tapers 60% → 20% toward the right frame edge.

These six-character coordinates ('P1.S1', etc.) are the "map-knowledge" signal — they read as labeled stations on a transit map, the kind of explicit coordinate a navigation tool would expose.

THE AGENT — terminal-prompt cursor, same shape as proof-loop v6 (visual rhyme across the set):
A flat ink-drawn `>` terminal-prompt cursor in solid graphite, 1.5px stroke weight, hovering just above the active step 'P2.S2'. The cursor's leading-edge apex carries a flat triangular warm-orange (#E89B4F) accent — ~10% of the cursor's width — NOT a motion trail, NOT a streak, NOT a flare, NOT a glow. The cursor is oriented down-right, apex pointing toward the active step. NO eyes, NO face, NO body, NO hands, NO halo around the cursor.

THE TOOLBELT — what makes this "agent-centric" load-bearing (sharpening B applied: vertical stacking pinned):
Floating just to the LEFT of and slightly ABOVE the terminal-prompt cursor, a small "tool palette" tile rendered as a thin-outlined low-volume isometric reference card. The tile is TALLER than wide (vertical orientation) — roughly 25% the width of one phase platform and tall enough to hold four stacked rows with breathing room. The four monospace tool-name chips are stacked VERTICALLY top-to-bottom inside the tile, each chip rendered as flat text (no pills, no buttons), near-black on cream, in this exact order:

1. `journey.step`
2. `browser.snapshot`
3. `browser.act`
4. `artifact.read`

Do NOT lay these chips out horizontally as a row — at hero render size each chip would compress to ~6–8px wide and become unreadable. Vertical stack with one chip per row, left-aligned inside the tile, with a thin 1px hairline rule between rows for scanning ease.

A thin warm-orange (#E89B4F) hairline connects the toolbelt tile to the cursor — a short, clean, single line, NOT an arrow. The hairline reads "the agent calls these from this coordinate." Visually it suggests the agent and the toolbelt are coupled. The toolbelt is the agent's "hands."

The four tools chosen are a deliberate subset of the 19 in mcp-tool-surface — readers who scan both illustrations will recognize the cross-reference. Tool name spellings MUST match exactly: every name has exactly one dot, lowercase before the dot, lowercase after.

THE CONTEXT-BURNING FOIL — faint upper-left ghost vignette (the contrast that lands the differentiator):
Occupying roughly the upper-left quarter of the frame, rendered at 18–22% opacity (clearly subordinate to the main scene), a tangled ghost cluster of "what context-burning looks like":

- A loose horizontal block of stylized terminal SCROLLBACK — five or six lines of horizontal hairline rectangles at varying lengths, no spelled-out text, no letters, no numerals — pure abstract scrollback shapes.
- A small stack of THREE overlapping rectangle silhouettes representing scattered screenshots — no contents, no labels, no spelled-out filenames, just outlined rectangles at slight angles to each other.
- A SINGLE small thin graphite curve drawn as a partial spiral going-nowhere hook (sharpening C). Geometry: starts at one point inside the scrollback ghost area, spirals back on itself ONCE for approximately 270 DEGREES of arc (three-quarters of a full circle, like a partial spiral), and ENDS as a small open hook tip near where it started — visibly NOT reaching any new destination, visibly NOT closing into a complete circle, visibly NOT carrying a second arrowhead. It reads as "started here, ended back near here without progress." This single shape is the only curved-back-on-itself form in the entire image and carries the "going in circles, getting nowhere" semantic. It is NOT a refresh icon, NOT an infinity symbol (∞), NOT a recycling symbol (♻ / ↻), NOT a return arrow with a destination, NOT a circular feedback loop with two arrowheads, NOT a clockwise rotation glyph, NOT a closed circle.

All three elements are inside the 18–22% opacity zone — the ghost is visible but unambiguously the recessive side of the contrast. NO text inside the ghost — no terminal-prompt characters, no filenames, no error words. The shapes alone carry "this is the chaotic alternative."

THE BASELINE — strap line at the bottom of the frame:
A thin horizontal baseline rule sits below the journey-map. Three larger tick marks under each platform with 'PHASE 1', 'PHASE 2', 'PHASE 3' in small uppercase technical sans-serif, near-black. Centered well below, a single larger uppercase technical sans-serif strap line: 'BUILT FOR AGENTS · COORDINATES, NOT CONTEXT REDISCOVERY'.

LEGIBLE TEXT INVENTORY — the ONLY text strings that may appear anywhere in the image, exactly as written:
- 'P1.S1', 'P1.S2', 'P1.S3' (Phase 1 step-tile coordinates, monospace)
- 'P2.S1', 'P2.S2', 'P2.S3' (Phase 2 step-tile coordinates, monospace; 'P2.S2' in bold as the active step)
- 'P3.S1', 'P3.S2', 'P3.S3' (Phase 3 step-tile coordinates, faint cyan monospace)
- `journey.step`, `browser.snapshot`, `browser.act`, `artifact.read` (the four toolbelt chips, monospace)
- 'PHASE 1', 'PHASE 2', 'PHASE 3' (baseline ticks, uppercase sans-serif)
- 'BUILT FOR AGENTS · COORDINATES, NOT CONTEXT REDISCOVERY' (baseline strap line)

CRITICAL ACCURACY — exactly NINE step coordinates appear on the journey-map, distributed three per platform, in this exact order left-to-right (sharpening A):
- Phase 1 platform tiles: 'P1.S1', 'P1.S2', 'P1.S3' (each with a mint-green check)
- Phase 2 platform tiles: 'P2.S1', 'P2.S2', 'P2.S3' (the middle one 'P2.S2' is the active step, label set in bold, cyan halo around the tile)
- Phase 3 platform tiles: 'P3.S1', 'P3.S2', 'P3.S3' (faint cyan monospace, blueprint outline only)

Every coordinate has exactly ONE dot. Format is `P<digit>.S<digit>` for every label — uppercase P, uppercase S, digit 1-3 only, single dot separator. The nine coordinates are unique (no duplicates, no swaps). Re-verify spelling, count, and left-to-right order on every regen. Reject any regen that drifts a coordinate (e.g. 'P2.S2' rendered as 'P2.S3'), swaps two tiles, repeats a coordinate, drops the period, or substitutes punctuation. This is the load-bearing accuracy claim of the "explicit coordinates" half of the differentiator — drift = silent failure.

The FOUR toolbelt chip names also load-bearing accuracy: render as exactly `journey.step`, `browser.snapshot`, `browser.act`, `artifact.read`. Every name has exactly one dot, lowercase before and after. No pluralization drift (`journey.steps` / `browser.snapshots` / `artifact.reads` all forbidden). No additional tool names — exactly four chips, in the stated order.

FORBIDDEN TEXT — must not appear anywhere in the image, even as ghost text, partially obscured, vertical, or angled:
- ANY tool names not in the four-name toolbelt list (no `stack.start`, no `run.begin`, etc.)
- ANY misspelling or pluralization drift (e.g. `journey.steps`, `browser.snapshots`, `artifact.reads`) — every toolbelt name renders exactly as listed
- 'DETERMINISTIC PROOF', 'step-feedback.json', any spelled-out filename
- 'CODING AGENT · REPLAYS ANY JOURNEY STEP IN A FRESH ENVIRONMENT · SAME RESULT EVERY TIME' (v5 strap is retired)
- 'JUMP TO ANY STEP', 'SAME RESULT EVERY TIME', 'TIME-TRAVEL', 'TIME TRAVELING'
- 'EXECUTABLE JOURNEY' (the strap replaces it)
- 'MCP', 'CI', 'CRYSTALLIZED', 'Proof Packet', 'PACKET', 'PROOF'
- 'AI', 'TEST', 'Agent' (lowercase), 'Robot', 'AGENT' (anywhere except inside the exact strap line above)
- terminal-text characters in the scrollback ghost — no '$', no '>', no '#', no 'Error:', no 'INFO', no spelled-out lines
- spelled-out filenames in the screenshot ghost — no 'before.png', no 'after.png', etc.
- timestamp numerals, version numbers, watermarks, draft markers, lorem ipsum
- text on or near the terminal-prompt cursor glyph
- text on or near the orange hairline connecting cursor to toolbelt

FORBIDDEN IMAGERY — must not appear:
- ANY human hand, finger, arm, cuff, pen, pencil, stylus, brush
- humanoid robot, mascot, character, avatar
- visor, eye, face, brain, neural-network spaghetti
- exposed circuitry, cyborg parts, glowing aura around the agent cursor
- purple gradients, soft AI-illustration aura, lens flare
- laptop, phone, tablet, monitor, screen-prop (this is a map illustration, not a workstation illustration)
- speech bubbles, thought bubbles
- transport playback glyphs of any kind: `◀◀`, `▶▶`, `||`, fast-forward / rewind / play / pause icons
- magnifying glass, gear/cog, lightbulb
- ANY rectangular evidence-card panel or stacked-artifact tower in the FOREGROUND (the ghost vignette is the only place rectangle silhouettes appear, and they are recessive at 18–22% opacity)
- check seals OTHER than the small ones on Phase 1's three completed step-tiles
- circular/looping arrows in the foreground (the single closed-loop hook is permitted ONLY inside the ghost vignette at 18–22% opacity)
- motion-trail / comet-trail / streak / kinetic-blur effects on the cursor
- duplicated cursors (only ONE terminal-prompt cursor in the entire frame)
- the v5 echo-stack of three pixel-identical tiles above the active step — that motif is RETIRED from this image and now lives in proof-loop v6
- the ghost vignette being so bright it competes with the foreground (it must be unambiguously recessive)

Visual syntax: black 1px technical pen linework. Low-volume isometric volumes with clean soft drop shadows. Color discipline at ~10–15% accent density:
- Mint green (#7FB99E): the three completed step-tile check marks on Phase 1; the soft underside glow of Phase 1. Reserved for "completed / passed."
- Cyan (#5CC6E0): the active-step halo on 'P2.S2'; the faint cyan monospace coordinate labels on Phase 3; Phase 3 blueprint construction lines. Reserved for "in-progress / future / not-yet-real."
- Warm orange (#E89B4F): the single triangular accent on the apex of the terminal-prompt cursor; the single hairline connecting the cursor to the toolbelt tile. Reserved STRICTLY for "the agent / agent's action." This is the launch-set locked semantic, consistent with mcp-tool-surface and proof-loop.
- Graphite / near-black: all linework, the toolbelt tile outline, all body text including the four monospace tool-name chips inside the toolbelt.
- The upper-left ghost vignette renders all of its elements (scrollback hairlines, screenshot rectangles, the single closed-loop hook) at 18–22% opacity in graphite — no accent colors inside the ghost.

Cream, off-white, graphite, near-black dominate everywhere else. No glowing aura, no soft gradients, no purple, no neon.

Typography hierarchy: strap line > phase labels > step coordinates ('P2.S2' etc.) and toolbelt tool-name chips. Monospace face for the coordinates AND the toolbelt chips (visual rhyme: both are agent-readable map labels). Technical sans-serif for the strap and the phase labels. All text must be legible when the image is rendered 800–1000px wide on GitHub. The coordinates and the toolbelt chips need particular legibility — that's the load-bearing accuracy claim.

Composition priority: visitor's eye first lands on the journey-map in the lower-two-thirds (the dominant clean composition), reads the cursor parked at 'P2.S2' connected to its toolbelt, and registers "the agent has labeled coordinates AND a small set of tools right where it stands." The eye then climbs to the strap line ('BUILT FOR AGENTS · COORDINATES, NOT CONTEXT REDISCOVERY') for confirmation, and finally notices the upper-left ghost vignette as the contrast — "and the alternative is THAT mess." The differentiator lands through the contrast.

Mood: wayfinding precision. Engineering-manual / transit-map aesthetic. Print-ready, 4K ultra-crisp. Generous negative space around the journey-map and around the strap line; the ghost vignette occupies its quarter without spilling into the foreground.

---

(Renderer note: extract everything below the first `---` and above the next `---` as the prompt body.)
