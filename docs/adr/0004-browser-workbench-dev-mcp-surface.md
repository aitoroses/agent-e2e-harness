# Browser Workbench Dev MCP surface

## Status

Accepted

## Context

ADR 0003 established the **Dev MCP Server** as an **Exploration Surface** and added provider-owned `stack.explore.*` tools for stack-specific runtime capabilities. That model fits stack exploration because databases, queues, caches, services, and product internals vary across consumers.

Browser exploration is different. The browser is the common runtime for this harness. Agents need a fast, discoverable workbench for visible state, user-like actions, waits, targeted reads, console/network signals, page-context JavaScript, and direct Playwright escape hatches while they are discovering a journey. Crystallized journeys already receive execution objects such as Playwright `page` and `browser` through **Harness Types**, so the browser workbench is not a journey extension registry.

The earlier ADR left `browser.explore.*` as a follow-up. During design we rejected copying the stack provider-owned shape for browser tools because it would make universal browser primitives less discoverable.

## Decision

Expose browser exploration as a fixed **Browser Workbench** under `browser.*`, not as `browser.explore.list` / `browser.explore.run`.

The first Browser Workbench vocabulary is:

```txt
browser.open
browser.sessions
browser.snapshot
browser.find
browser.act
browser.wait
browser.get
browser.eval
browser.playwright
browser.console
browser.network
browser.screenshot
browser.close
```

Every browser workbench tool and input field must have high-quality MCP schema descriptions. Agents should be able to choose and call these tools from `tools/list` without reading source code or README prose.

`browser.snapshot` remains the primary visible-state and ref workflow. It returns an agent-readable packet with URL, title, semantic structure, refs, visible errors, next actions, and a lightweight structured artifact. Snapshot refs use `@eN`.

`browser.find` resolves semantic locators into reusable targets without acting. It supports role, text, label, placeholder, test id, and CSS selector queries. Find refs use `@fN`. Snapshot refs and find refs share one per-session **Browser Ref Store** and can be used by `browser.act`, `browser.get`, `browser.wait`, and `browser.playwright`.

Semantic locator grammar belongs in `browser.find`. `browser.act`, `browser.get`, and `browser.wait` consume refs or selectors rather than duplicating role/text/label/test-id inputs inline.

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

`browser.act` does not capture screenshots automatically. Agents call `browser.screenshot` explicitly when they need visual evidence, and `browser.screenshot` returns the artifact location.

`browser.wait` waits for explicit conditions: ref, selector, text, URL pattern, load state, or page-context function. It does not expose fixed sleep in the first design. It returns elapsed duration and effective timeout.

`browser.get` is one targeted-read tool with a `kind` field for text, HTML, value, attribute, title, URL, and count reads.

`browser.console` and `browser.network` expose per-session signal buffers with cursor/since incremental reads. `browser.network` is read-only in this first design: requests, responses, failed requests, status codes, URLs, and similar observations. Network route/mock/abort/HAR is out of scope.

`browser.eval` runs an async function body in the page context. It accepts JSON `input` separately from `code`, returns JSON-serializable output, reports elapsed duration and effective timeout, and may mutate page state. Previous refs are stale after it runs.

`browser.playwright` is the explicit direct-Playwright escape hatch. It runs an async function body against the live MCP-owned browser session with access to:

```ts
{ page, browser, context, input, refs }
```

It accepts JSON `input` separately from `code`, returns JSON-serializable output, reports elapsed duration and effective timeout, and may mutate the live browser session. Previous refs are stale after it runs. It is agent-facing Dev MCP exploration only, not part of `agent-e2e verify` and not a journey-extension surface.

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

## Consequences

Agents get a browser-native exploration loop that mirrors how they actually debug web apps: snapshot, find, act, wait, inspect console/network, read targeted state, and fall back to direct Playwright when needed.

The public browser surface remains discoverable. Common primitives are first-class tools with schema descriptions instead of hidden Playwright snippets or a generic action registry.

The journey path stays clean. During exploration, agents can use `browser.eval` and `browser.playwright` to discover behavior. Once crystallized, journeys use normal repo code and the configured execution objects directly.

The artifact policy stays lightweight. `browser.snapshot` automatically artifacts its structured packet. `browser.screenshot` is explicit and artifact-producing. Other browser workbench calls return inline output by default.

The ref model remains simple. Snapshot refs and find refs share a session store, but any mutating action, eval, or Playwright escape-hatch call makes previous refs stale from the agent's point of view.

## Rejected alternatives

- **`browser.explore.list` / `browser.explore.run`.** Browser primitives are universal enough to deserve fixed tools. The provider-owned model fits stack-specific runtime capabilities better than browser actions.
- **Registered browser closures in config.** Journeys already receive `page` and `browser`; a second closure registry would duplicate journey code and blur the exploration/crystallization boundary.
- **Expression-only code for eval/playwright.** Agents often need multi-line exploratory code with variables, loops, and `try`/`catch`. Async function bodies with explicit `return` are more useful.
- **Declarative mini-Playwright language.** It would recreate Playwright poorly while still being less powerful than the real objects available inside the harness.
- **Automatic screenshots after every action.** This creates artifact noise. Visual capture is explicit through `browser.screenshot`.
- **Fixed sleep in `browser.wait`.** It encourages flaky exploration. Waits should express conditions.
- **Inline semantic locators in act/get/wait.** Duplicating locator grammar across tools makes the schema harder to learn. `browser.find` owns semantic lookup.
- **Network mutation in v1.** Routing, mocking, aborting, and HAR recording change product behavior or artifact weight and need a separate contract.
- **Tabs in v1.** Tabs change the browser session model from one active page to multi-page management. Exceptional multi-page exploration can use `browser.playwright` until a tab model is designed.

## Follow-up

- Design `browser.tabs` if real adoption journeys need first-class multi-page workflows.
- Decide whether upload/download deserves a first-class action contract.
- Decide whether network route/mock/HAR belongs in Browser Workbench and how it interacts with validation integrity.
- Consider annotated screenshots if visual-model workflows need a numbered map from screenshot labels to refs.
