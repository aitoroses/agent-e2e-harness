# Browser Workbench Dev MCP surface

## Status

Accepted

## Context

ADR 0003 established the **Dev MCP Server** as an **Exploration Surface** and added provider-owned `stack.explore.*` tools for stack-specific runtime capabilities. That model fits stack exploration because databases, queues, caches, services, and product internals vary across consumers.

Browser exploration is different. The browser is the common runtime for this harness. Agents need a fast, discoverable workbench for visible state, user-like actions, waits, console/network signals, page-context JavaScript, and direct Playwright escape hatches while they are discovering a journey. Crystallized journeys already receive execution objects such as Playwright `page` and `browser` through **Harness Types**, so the browser workbench is not a journey extension registry.

The earlier ADR left `browser.explore.*` as a follow-up. During design we rejected copying the stack provider-owned shape for browser tools because it would make universal browser primitives less discoverable.

## Decision

Expose browser exploration as a fixed **Browser Workbench** under `browser.*`, not as `browser.explore.list` / `browser.explore.run`.

The Browser Workbench vocabulary is:

```txt
browser.open
browser.sessions
browser.inspect
browser.refs
browser.act
browser.wait
browser.eval
browser.playwright
browser.close
```

Every browser workbench tool and input field must have high-quality MCP schema descriptions. Agents should be able to choose and call these tools from `tools/list` without reading source code or README prose.

`browser.inspect` is the standard evidence path. It accepts `{ browserSessionId, target?, depth?, maxNodes? }`. The `target` field follows these rules: omitted means the current page; `"@<ref>"` addresses a specific UI forensics ref; anything else is treated as a selector or Playwright locator-compatible string. There is no separate `scope` parameter.

`browser.inspect` returns a compact, path-oriented index:

```ts
{
  status, url, title,
  target: { input, kind, resolved },
  artifacts: { inspect, inspectJson, screenshot },
  signals: { consoleErrors, networkFailures },
  refsOverlayEnabled
}
```

No inline UI tree, no long markdown, and no screenshot data are returned inline. Console and network facts are captured as inspect signals and artifacts — not via separate tools. Inspect writes artifacts to `runs/<runId>/inspections/<seq>/` containing `inspect.md`, `inspect.json`, and `screenshot.png`. `inspect.md` sections are: Where am I / Current visible state / What can I act on / Signals / Artifacts / UI tree (capped). `inspect.json` contains structured refs with bounding boxes and page facts.

`browser.refs({ enabled: true|false })` toggles a live overlay. When enabled, it paints boxes and labels for exactly the referencable nodes from the UI forensics tree — the same registry used by `browser.inspect` and `browser.act`. There are no separate `kinds` or filter taxonomy parameters. The overlay updates on DOM mutation, scroll, and resize; is `pointer-events:none`; never alters layout or intercepts clicks; and is removed completely on disable, browser-close, or session-teardown. When enabled, `browser.inspect` screenshots include the overlay. `browser.inspect` reports whether the overlay is enabled via `refsOverlayEnabled`.

The **Browser Ref Store** is a single per-session registry shared by `browser.inspect`, `browser.refs`, and `browser.act`. Refs use ids such as `@e1`, `@e2` and are best-effort stable within a session. They are matched by accessible role/name, stable attributes (`data-ui`, `data-testid`, `id`), and DOM-path fallback. A ref is retired when its element disappears; retired ref ids are never reused in the same session. `browser.act("@ref")` fails cleanly when a ref is retired or stale.

`browser.act` supports the common action set:

```txt
click
fill
press
hover
focus
check
uncheck
select
scroll
```

`browser.act` does not capture screenshots automatically. Agents call `browser.inspect` when they need visual evidence and a structured refs update.

`browser.wait` waits for explicit conditions: ref, selector, text, URL pattern, load state, or page-context function. It does not expose fixed sleep. It returns elapsed duration and effective timeout.

`browser.eval` runs an async function body in the page context. It accepts JSON `input` separately from `code`, returns JSON-serializable output, reports elapsed duration and effective timeout, and may mutate page state.

`browser.playwright` is the explicit direct-Playwright escape hatch. It runs an async function body against the live MCP-owned browser session with access to:

```ts
{ page, browser, context, input, refs }
```

It accepts JSON `input` separately from `code`, returns JSON-serializable output, reports elapsed duration and effective timeout, and may mutate the live browser session. It is agent-facing Dev MCP exploration only, not part of `agent-e2e verify` and not a journey-extension surface.

`browser.eval` and `browser.playwright` use the same timeout/output shape:

```ts
{
  status: "ok" | "failed";
  output?: unknown;
  error?: { code: string; message: string };
  durationMs: number;
  timeoutMs: number;
}
```

Both default to a 5s timeout and accept an override capped at 30s. Returned output must be JSON-serializable for MCP transport.

## Removed tools

The following tools were present in the earlier design and have been removed with no aliases or compatibility names:

- `browser.snapshot` — replaced by `browser.inspect`
- `browser.find` — locator lookup is subsumed by the `target` field of `browser.inspect` and `browser.act`
- `browser.get` — targeted reads are subsumed by `browser.inspect`
- `browser.screenshot` — screenshot capture is now automatic within `browser.inspect`
- `browser.console` — console signals are now captured as `browser.inspect` signals and artifacts
- `browser.network` — network signals are now captured as `browser.inspect` signals and artifacts
- `artifact.read` — agents read artifact file paths directly from the paths returned in tool responses

Callers that used these tools should migrate to the `browser.inspect` evidence loop: `browser.open` → `browser.inspect` → `browser.act` → `browser.wait` → `browser.inspect`.

## Consequences

Agents get a browser-native exploration loop that mirrors how they actually debug web apps: inspect, act, wait, and inspect again. Console and network signals are co-located with the visual snapshot and refs in a single inspect artifact rather than scattered across separate tool calls.

The public browser surface remains discoverable. Common primitives are first-class tools with schema descriptions instead of hidden Playwright snippets or a generic action registry.

The journey path stays clean. During exploration, agents can use `browser.eval` and `browser.playwright` to discover behavior. Once crystallized, journeys use normal repo code and the configured execution objects directly.

The artifact policy is consolidated. `browser.inspect` automatically writes its structured packet (inspect.md, inspect.json, screenshot.png) per invocation. Journey steps use the same inspect machinery — one evidence system.

The ref model is unified. A single per-session ref store is shared by inspect, refs-overlay, and act. Refs are stable within a session and retired cleanly on element removal.

## Rejected alternatives

- **`browser.explore.list` / `browser.explore.run`.** Browser primitives are universal enough to deserve fixed tools. The provider-owned model fits stack-specific runtime capabilities better than browser actions.
- **Registered browser closures in config.** Journeys already receive `page` and `browser`; a second closure registry would duplicate journey code and blur the exploration/crystallization boundary.
- **Expression-only code for eval/playwright.** Agents often need multi-line exploratory code with variables, loops, and `try`/`catch`. Async function bodies with explicit `return` are more useful.
- **Declarative mini-Playwright language.** It would recreate Playwright poorly while still being less powerful than the real objects available inside the harness.
- **Automatic screenshots after every action.** This creates artifact noise. Visual capture is explicit through `browser.inspect`.
- **Fixed sleep in `browser.wait`.** It encourages flaky exploration. Waits should express conditions.
- **Separate snapshot and find tools.** The original design split visible-state capture (`browser.snapshot`) from locator resolution (`browser.find`). Unifying them into `browser.inspect` with a `target` field reduces the number of round trips for the common case.
- **Separate console/network tools.** Polling separate signal buffers after each action adds latency and forces agents to correlate timestamps manually. Co-locating signals in the inspect artifact makes causality obvious.
- **Network mutation in v1.** Routing, mocking, aborting, and HAR recording change product behavior or artifact weight and need a separate contract.
- **Tabs in v1.** Tabs change the browser session model from one active page to multi-page management. Exceptional multi-page exploration can use `browser.playwright` until a tab model is designed.

## Follow-up

- Design `browser.tabs` if real adoption journeys need first-class multi-page workflows.
- Decide whether upload/download deserves a first-class action contract.
- Decide whether network route/mock/HAR belongs in Browser Workbench and how it interacts with validation integrity.
