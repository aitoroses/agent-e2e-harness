import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

// Must match FORENSICS_OVERLAY_CONTAINER_ID in src/forensics/browser-script.ts.
const OVERLAY_ID = 'agent-e2e-refs-overlay';

const managers: Array<ReturnType<typeof createPlaywrightMcpBrowserSessionManager>> = [];

function dataUrl(html: string): string {
  return `data:text/html,${encodeURIComponent(html)}`;
}

describe('Playwright MCP browser session manager', () => {
  afterEach(async () => {
    for (const manager of managers.splice(0)) {
      for (const session of manager.list()) await manager.close(session.browserSessionId);
    }
  });

  it('inspect returns a compact path-oriented index and writes inspection artifacts', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'agent-e2e-inspect-'));
    const artifactRoot = join(tmpRoot, '.agents-e2e', 'artifacts');
    const manager = createPlaywrightMcpBrowserSessionManager({ artifactRoot });
    managers.push(manager);

    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><html><head><title>Inspect Me</title></head><body>
        <h1>Inspect Me</h1>
        <button data-ui="create">Create record</button>
        <p role="alert">Seed warning is visible</p>
      </body></html>`),
      journeyId: 'journey:inspect',
      runId: 'inspect-run',
    });

    const result = await manager.inspect({ browserSessionId: open.browserSessionId });

    // Compact, path-oriented: no inline tree or markdown dump in the return.
    expect(result).toMatchObject({
      status: 'ok',
      title: 'Inspect Me',
      target: { input: null, kind: 'page', resolved: true },
      refsOverlayEnabled: false,
      signals: { consoleErrors: 0, networkFailures: 0 },
    });
    expect(result).not.toHaveProperty('refs');
    expect(result.artifacts.inspect).toMatch(/inspections\/0001\/inspect\.md$/);
    expect(result.artifacts.inspectJson).toMatch(/inspections\/0001\/inspect\.json$/);
    expect(result.artifacts.screenshot).toMatch(/inspections\/0001\/screenshot\.png$/);
    expect(existsSync(result.artifacts.inspect!)).toBe(true);
    expect(existsSync(result.artifacts.screenshot!)).toBe(true);

    // inspect.json carries structured interactive refs with bounding boxes.
    const json = JSON.parse(readFileSync(result.artifacts.inspectJson!, 'utf8'));
    expect(json.interactive.length).toBeGreaterThan(0);
    const button = json.interactive.find((node: { name?: string }) => node.name === 'Create record');
    expect(button).toMatchObject({ ref: expect.stringMatching(/^@e\d+$/), role: 'button' });
    expect(button.rect).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) });
    expect(json.facts.alerts).toContain('Seed warning is visible');
    // OC-grade: page summary + document facts + a hierarchical tree with layout facts.
    expect(json.summary).toMatchObject({ interactive: expect.any(Number) });
    expect(json.document).toMatchObject({ width: expect.any(Number), height: expect.any(Number), devicePixelRatio: expect.any(Number) });
    expect(Array.isArray(json.tree)).toBe(true);
    expect(json.tree.length).toBeGreaterThan(0);
    const treeNode = json.tree[0];
    expect(treeNode).toMatchObject({ tag: expect.any(String), rect: expect.any(Object), visible: expect.any(Boolean), layout: expect.objectContaining({ display: expect.any(String) }) });
    // A referencable tree node carries the same ref the overlay/act use.
    const refIds = new Set(json.interactive.map((n: { ref: string }) => n.ref));
    expect(json.tree.some((n: { ref?: string }) => n.ref && refIds.has(n.ref))).toBe(true);

    // inspect.md follows the compact Terrarium OC dom-ui-forensics format.
    const md = readFileSync(result.artifacts.inspect!, 'utf8');
    expect(md).toContain('# UI Snapshot');
    expect(md).toContain('## Headings');
    expect(md).toContain('## By role');
    expect(md).toContain('## Interactive (DOM order)');
    expect(md).toContain('## Tree');
    expect(md).toContain('## Selectors');
    expect(md).toContain('## Snippet');
    // No verbose sections / inline tables, and no inline selectors in tree lines.
    expect(md).not.toContain('## Where am I');
    expect(md).not.toContain('| ref | role | name |');
    expect(md).toContain('⊞ ');

    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('produces an OC-grade forensics tree for a complex page (scroll/grid/disabled/hidden/table/dialog)', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const fixtureUrl = new URL('./fixtures/console-app.html', import.meta.url).href;
    const open = await manager.open({ headed: false, targetUrl: fixtureUrl });

    const result = await manager.inspect({ browserSessionId: open.browserSessionId });
    const json = JSON.parse(readFileSync(result.artifacts.inspectJson!, 'utf8'));

    // Page summary reflects the real structure.
    expect(json.summary.interactive).toBeGreaterThanOrEqual(10);
    expect(json.summary.tables).toBe(1);
    expect(json.summary.dialogs).toBeGreaterThanOrEqual(1);
    const landmarkRoles = json.summary.landmarks.map((l: { role: string }) => l.role);
    expect(landmarkRoles).toEqual(expect.arrayContaining(['banner', 'navigation', 'main', 'form']));

    const tree = json.tree as Array<Record<string, unknown>>;
    // Layout facts: a grid container (metrics) and a flex container (topbar).
    expect(tree.some((n) => (n.layout as { display?: string })?.display === 'grid')).toBe(true);
    expect(tree.some((n) => (n.layout as { display?: string })?.display?.includes('flex'))).toBe(true);
    // Scroll facts: the log-scroll region reports a scrollable overflow.
    expect(tree.some((n) => (n.scroll as { scrollable?: boolean })?.scrollable === true)).toBe(true);
    // Disabled control is flagged.
    expect(tree.some((n) => n.disabled === true)).toBe(true);
    // Hidden/offscreen node is included and marked (not silently dropped).
    expect(tree.some((n) => typeof n.hidden === 'string')).toBe(true);
    // Structural depth: nested nodes exist (not a flat list).
    expect(tree.some((n) => (n.depth as number) >= 2)).toBe(true);
    // Referencable tree nodes carry geometry + a ref the overlay/act share.
    const refIds = new Set((json.interactive as Array<{ ref: string }>).map((n) => n.ref));
    const refNode = tree.find((n) => typeof n.ref === 'string' && refIds.has(n.ref as string));
    expect(refNode).toBeTruthy();
    expect(refNode!.rect).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });

    // The disabled control resolves and acting on it fails cleanly (not silently).
    const disabledRef = (json.interactive as Array<{ ref: string; name?: string }>).find((n) => n.name === 'Bulk delete');
    expect(disabledRef).toBeTruthy();

    // The markdown tree exposes the same facts in OC compact shorthand.
    const md = readFileSync(result.artifacts.inspect!, 'utf8');
    expect(md).toMatch(/scroll-y\(\d+\/\d+\)/);
    expect(md).toContain('grid');
    expect(md).toContain('disabled');
    expect(md).toMatch(/hidden:/);
    // Selectors live in their own block, never inlined on tree lines.
    expect(md).toContain('## Selectors');
    expect(md.split('## Selectors')[0]).not.toContain('[data-ui=');
  });

  it('acts on a ref from inspect and resolves through the shared registry', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><title>Act</title>
        <button data-ui="create" onclick="document.querySelector('[data-testid=out]').textContent='created'">Create</button>
        <p data-testid="out">empty</p>`),
    });

    const inspected = await manager.inspect({ browserSessionId: open.browserSessionId });
    const json = JSON.parse(readFileSync(inspected.artifacts.inspectJson!, 'utf8'));
    const createRef = json.interactive.find((n: { name?: string }) => n.name === 'Create').ref;

    const action = await manager.act({ browserSessionId: open.browserSessionId, ref: createRef, action: 'click' });
    expect(action).toMatchObject({ status: 'ok', action: 'click', target: { ref: createRef, role: 'button' } });

    const out = await manager.evaluate({ browserSessionId: open.browserSessionId, code: "return document.querySelector('[data-testid=out]').textContent;" });
    expect(out.output).toBe('created');
  });

  it('fails cleanly when acting on a stale or retired ref and does not reuse retired ref ids', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><title>Refs</title><div id="host"><button data-ui="first">First</button></div>`),
    });

    const first = await manager.inspect({ browserSessionId: open.browserSessionId });
    const firstJson = JSON.parse(readFileSync(first.artifacts.inspectJson!, 'utf8'));
    const firstRef = firstJson.interactive.find((n: { name?: string }) => n.name === 'First').ref;

    // Remove the element, then act before re-inspect: ref is stale, not live.
    await manager.evaluate({ browserSessionId: open.browserSessionId, code: "document.getElementById('host').innerHTML=''; return true;" });
    const staleAct = await manager.act({ browserSessionId: open.browserSessionId, ref: firstRef, action: 'click' });
    expect(staleAct.status).toBe('failed');
    expect(staleAct.error?.code).toMatch(/browser-ref-(stale|retired)/);

    // Add a different element and re-inspect: the new node must NOT reuse the retired id.
    await manager.evaluate({ browserSessionId: open.browserSessionId, code: "document.getElementById('host').innerHTML='<button data-ui=\"second\">Second</button>'; return true;" });
    const second = await manager.inspect({ browserSessionId: open.browserSessionId });
    const secondJson = JSON.parse(readFileSync(second.artifacts.inspectJson!, 'utf8'));
    const secondRef = secondJson.interactive.find((n: { name?: string }) => n.name === 'Second').ref;
    expect(secondRef).not.toBe(firstRef);

    const retiredAct = await manager.act({ browserSessionId: open.browserSessionId, ref: firstRef, action: 'click' });
    expect(retiredAct.status).toBe('failed');
    expect(retiredAct.error?.code).toBe('browser-ref-retired');
  });

  it('toggles the refs overlay without altering layout or intercepting clicks, and captures it in inspect screenshots', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><title>Overlay</title>
        <button data-ui="counter" onclick="window.__clicks=(window.__clicks||0)+1">Click me</button>`),
    });

    const overlayState = (label: string) => manager.evaluate({
      browserSessionId: open.browserSessionId,
      code: `const o=document.getElementById('${OVERLAY_ID}'); return { present: !!o, pointer: o?getComputedStyle(o).pointerEvents:null, boxes: o?o.children.length:0, ctx: '${label}' };`,
    });

    // Baseline scroll height with no overlay (layout must not shift when enabled).
    const baseHeight = (await manager.evaluate({ browserSessionId: open.browserSessionId, code: 'return document.body.scrollHeight;' })).output;

    const enabled = await manager.refs({ browserSessionId: open.browserSessionId, enabled: true });
    expect(enabled).toMatchObject({ status: 'ok', enabled: true });
    const on = await overlayState('on');
    expect(on.output).toMatchObject({ present: true, pointer: 'none' });
    expect((on.output as { boxes: number }).boxes).toBeGreaterThan(0);
    const heightWithOverlay = (await manager.evaluate({ browserSessionId: open.browserSessionId, code: 'return document.body.scrollHeight;' })).output;
    expect(heightWithOverlay).toBe(baseHeight);

    // Overlay is pointer-events:none, so a real click still reaches the button.
    const counterRef = JSON.parse(readFileSync((await manager.inspect({ browserSessionId: open.browserSessionId })).artifacts.inspectJson!, 'utf8'))
      .interactive.find((n: { name?: string }) => n.name === 'Click me').ref;
    await manager.act({ browserSessionId: open.browserSessionId, ref: counterRef, action: 'click' });
    const clicks = await manager.evaluate({ browserSessionId: open.browserSessionId, code: 'return window.__clicks || 0;' });
    expect(clicks.output).toBe(1);

    // Inspect screenshot reports overlay enabled.
    const inspectedWhileOn = await manager.inspect({ browserSessionId: open.browserSessionId });
    expect(inspectedWhileOn.refsOverlayEnabled).toBe(true);

    const disabled = await manager.refs({ browserSessionId: open.browserSessionId, enabled: false });
    expect(disabled).toMatchObject({ status: 'ok', enabled: false });
    const off = await overlayState('off');
    expect(off.output).toMatchObject({ present: false });
  });

  it('updates the overlay when the DOM changes', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><title>Mutate</title><div id="host"><button data-ui="a">A</button></div>`),
    });
    await manager.refs({ browserSessionId: open.browserSessionId, enabled: true });
    const boxesBefore = (await manager.evaluate({ browserSessionId: open.browserSessionId, code: `return document.getElementById('${OVERLAY_ID}').children.length;` })).output as number;

    await manager.evaluate({ browserSessionId: open.browserSessionId, code: "document.getElementById('host').insertAdjacentHTML('beforeend','<button data-ui=b>B</button><button data-ui=c>C</button>'); return true;" });
    // Give the overlay's rAF-debounced repaint a moment to run.
    await manager.wait({ browserSessionId: open.browserSessionId, until: { kind: 'function', code: `return document.getElementById('${OVERLAY_ID}').children.length > ${boxesBefore};` }, timeoutMs: 2_000 });

    const boxesAfter = (await manager.evaluate({ browserSessionId: open.browserSessionId, code: `return document.getElementById('${OVERLAY_ID}').children.length;` })).output as number;
    expect(boxesAfter).toBeGreaterThan(boxesBefore);
  });

  it('waits on explicit browser conditions and reports elapsed timeout feedback', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({
      headed: false,
      targetUrl: dataUrl(`<!doctype html><title>Wait</title><p id="status">pending</p>
        <script>setTimeout(()=>{document.querySelector('#status').textContent='ready'},25)</script>`),
    });

    await expect(
      manager.wait({ browserSessionId: open.browserSessionId, until: { kind: 'text', text: 'ready' }, timeoutMs: 1_000 }),
    ).resolves.toMatchObject({ status: 'ok', matched: { kind: 'text', text: 'ready' } });

    const timeout = await manager.wait({ browserSessionId: open.browserSessionId, until: { kind: 'selector', selector: '[data-testid="never"]' }, timeoutMs: 50 });
    expect(timeout).toMatchObject({ status: 'failed', error: { code: 'browser-wait-timeout' } });
    expect(timeout.durationMs).toBeGreaterThanOrEqual(40);
  });

  it('runs page-context and Playwright-context code with serializable output', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({ headed: false, targetUrl: dataUrl('<title>Code</title><button data-ui="run">Run</button>') });

    await expect(
      manager.evaluate({ browserSessionId: open.browserSessionId, code: "return { title: document.title, label: input.label };", input: { label: 'e2e' } }),
    ).resolves.toMatchObject({ status: 'ok', output: { title: 'Code', label: 'e2e' } });

    const inspected = await manager.inspect({ browserSessionId: open.browserSessionId });
    const runRef = JSON.parse(readFileSync(inspected.artifacts.inspectJson!, 'utf8')).interactive.find((n: { name?: string }) => n.name === 'Run').ref;
    await expect(
      manager.playwright({
        browserSessionId: open.browserSessionId,
        code: "const r = refs.find(x => x.ref === input.ref); await page.locator(r.selector).click(); return { ref: r.ref, url: page.url() };",
        input: { ref: runRef },
        refs: [runRef],
      }),
    ).resolves.toMatchObject({ status: 'ok', output: { ref: runRef } });
  });

  it('reports missing sessions as actionable inspect failures', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const inspect = await manager.inspect({ browserSessionId: 'missing-browser' });
    expect(inspect).toMatchObject({ status: 'not-found', error: { code: 'browser-session-not-found' } });
  });
});
