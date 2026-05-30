import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

const managers: Array<ReturnType<typeof createPlaywrightMcpBrowserSessionManager>> = [];
const servers: Server[] = [];

describe('Playwright MCP browser session manager', () => {
  afterEach(async () => {
    for (const manager of managers.splice(0)) {
      for (const session of manager.list()) await manager.close(session.browserSessionId);
    }
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
  });

  it('opens an MCP-owned browser session and snapshots interactive refs into run artifacts', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'agent-e2e-browser-'));
    const artifactRoot = join(tmpRoot, '.agents-e2e', 'artifacts');
    const manager = createPlaywrightMcpBrowserSessionManager({ artifactRoot });
    managers.push(manager);

    const open = await manager.open({
      headed: false,
      journeyId: 'journey:browser-proof',
      runId: 'browser-run',
    });
    expect(open).toMatchObject({ status: 'open', browserMode: { headed: false, headless: true, consumer: 'mcp' } });
    expect(open.artifactDir).toContain('journey-browser-proof/browser-run');

    const session = manager.list()[0];
    expect(session?.browserSessionId).toBe(open.browserSessionId);

    const pageHtml = encodeURIComponent(`<!doctype html>
      <html>
        <head><title>Example Browser</title></head>
        <body>
          <h1>Example Browser</h1>
          <button>Create record</button>
          <p role="alert">Seed warning is visible</p>
        </body>
      </html>`);
    await manager.close(open.browserSessionId);

    const reopened = await manager.open({
      headed: false,
      targetUrl: `data:text/html,${pageHtml}`,
      journeyId: 'journey:browser-proof',
      runId: 'browser-run-2',
    });
    const snapshot = await manager.snapshot(reopened.browserSessionId);

    expect(snapshot).toMatchObject({
      status: 'ok',
      title: 'Example Browser',
      refs: expect.arrayContaining([
        expect.objectContaining({ ref: '@e1', role: 'heading', name: 'Example Browser' }),
        expect.objectContaining({ role: 'button', name: 'Create record' })
      ]),
      errors: [{ code: 'visible-error-1', message: 'Seed warning is visible' }]
    });
    expect(snapshot.artifacts).toEqual([
      expect.objectContaining({
        kind: 'browser-snapshot',
        name: 'browser-snapshot',
        // Sequence-tagged forensics name (capture order + action), not timestamp noise.
        path: expect.stringMatching(/forensics\/0001-browser-snapshot\.json$/),
      }),
    ]);
    expect(snapshot.artifacts[0]?.path).toContain('.agents-e2e/artifacts/journey-browser-proof/browser-run-2/forensics/');
    expect(existsSync(snapshot.artifacts[0]?.path ?? '')).toBe(true);
    expect(snapshot.artifacts[0]?.path).not.toContain('.scratch');
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('acts on fresh snapshot refs without creating implicit screenshot artifacts', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'agent-e2e-browser-act-'));
    const artifactRoot = join(tmpRoot, '.agents-e2e', 'artifacts');
    const manager = createPlaywrightMcpBrowserSessionManager({ artifactRoot });
    managers.push(manager);

    const pageHtml = encodeURIComponent(`<!doctype html>
      <html>
        <head><title>Browser Act</title></head>
        <body>
          <h1>Browser Act</h1>
          <button onclick="document.querySelector('[data-testid]').textContent = 'created through act'">Create record</button>
          <p data-testid="record:test">empty</p>
        </body>
      </html>`);
    const open = await manager.open({
      headed: false,
      targetUrl: `data:text/html,${pageHtml}`,
      journeyId: 'journey:browser-act',
      runId: 'browser-act-run',
    });
    const before = await manager.snapshot(open.browserSessionId);
    const button = before.refs.find((ref) => ref.role === 'button' && ref.name === 'Create record');

    expect(button?.ref).toBeTruthy();
    const action = await manager.act({
        browserSessionId: open.browserSessionId,
        ref: button?.ref,
        action: 'click',
      });
    expect(action).toMatchObject({
      status: 'ok',
      action: 'click',
      target: { role: 'button', name: 'Create record' },
    });
    expect(action).not.toHaveProperty('artifact');

    const after = await manager.snapshot(open.browserSessionId);
    expect(after.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'p',
          name: 'created through act',
          selector: expect.stringContaining('record'),
        }),
      ]),
    );
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('finds semantic targets, performs common actions, and reads targeted state', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);

    const pageHtml = encodeURIComponent(`<!doctype html>
      <html>
        <head><title>Workbench Form</title></head>
        <body>
          <label>Title <input aria-label="Title" value="" /></label>
          <label><input type="checkbox" aria-label="Publish" /> Publish</label>
          <select aria-label="Priority">
            <option value="low">Low</option>
            <option value="high">High</option>
          </select>
          <button onclick="document.querySelector('[data-testid=status]').textContent = 'saved'">Save</button>
          <p data-testid="status">draft</p>
        </body>
      </html>`);
    const open = await manager.open({
      headed: false,
      targetUrl: `data:text/html,${pageHtml}`,
    });

    const title = await manager.find({
      browserSessionId: open.browserSessionId,
      by: 'label',
      value: 'Title',
    });
    expect(title).toMatchObject({
      status: 'ok',
      targets: [expect.objectContaining({ ref: '@f1', name: 'Title' })],
    });

    await expect(
      manager.act({
        browserSessionId: open.browserSessionId,
        ref: title.targets[0]?.ref,
        action: 'fill',
        text: 'Release note',
      }),
    ).resolves.toMatchObject({ status: 'ok', action: 'fill' });
    await expect(
      manager.get({
        browserSessionId: open.browserSessionId,
        ref: title.targets[0]?.ref,
        kind: 'value',
      }),
    ).resolves.toMatchObject({ status: 'ok', value: 'Release note' });

    const publish = await manager.find({
      browserSessionId: open.browserSessionId,
      by: 'label',
      value: 'Publish',
    });
    await expect(
      manager.act({
        browserSessionId: open.browserSessionId,
        ref: publish.targets[0]?.ref,
        action: 'check',
      }),
    ).resolves.toMatchObject({ status: 'ok', action: 'check' });

    const priority = await manager.find({
      browserSessionId: open.browserSessionId,
      by: 'label',
      value: 'Priority',
    });
    await expect(
      manager.act({
        browserSessionId: open.browserSessionId,
        ref: priority.targets[0]?.ref,
        action: 'select',
        values: ['high'],
      }),
    ).resolves.toMatchObject({ status: 'ok', action: 'select' });

    const save = await manager.find({
      browserSessionId: open.browserSessionId,
      by: 'role',
      value: 'button',
      name: 'Save',
    });
    await manager.act({
      browserSessionId: open.browserSessionId,
      ref: save.targets[0]?.ref,
      action: 'click',
    });
    await expect(
      manager.get({
        browserSessionId: open.browserSessionId,
        selector: '[data-testid="status"]',
        kind: 'text',
      }),
    ).resolves.toMatchObject({ status: 'ok', value: 'saved' });
  });

  it('waits on explicit browser conditions and reports elapsed timeout feedback', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);

    const pageHtml = encodeURIComponent(`<!doctype html>
      <html>
        <head><title>Wait Page</title></head>
        <body>
          <p id="status">pending</p>
          <script>setTimeout(() => { document.querySelector('#status').textContent = 'ready'; }, 25)</script>
        </body>
      </html>`);
    const open = await manager.open({
      headed: false,
      targetUrl: `data:text/html,${pageHtml}`,
    });

    await expect(
      manager.wait({
        browserSessionId: open.browserSessionId,
        until: { kind: 'text', text: 'ready' },
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      matched: { kind: 'text', text: 'ready' },
      timeoutMs: 1_000,
    });

    const timeout = await manager.wait({
      browserSessionId: open.browserSessionId,
      until: { kind: 'selector', selector: '[data-testid="never"]' },
      timeoutMs: 50,
    });
    expect(timeout).toMatchObject({
      status: 'failed',
      error: { code: 'browser-wait-timeout' },
      timeoutMs: 50,
    });
    expect(timeout.durationMs).toBeGreaterThanOrEqual(40);
  });

  it('records console and network signal buffers with incremental cursors', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/api/ping') {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html>
        <html>
          <head><title>Signals</title></head>
          <body>
            <script>
              console.warn('agent-e2e warning');
              fetch('/api/ping');
            </script>
          </body>
        </html>`);
    });
    servers.push(server);
    const origin = await listen(server);
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);
    const open = await manager.open({ headed: false, targetUrl: origin });
    await manager.wait({
      browserSessionId: open.browserSessionId,
      until: { kind: 'function', code: "return performance.getEntriesByName('/api/ping').length > 0" },
      timeoutMs: 2_000,
    });

    const consoleSignals = await manager.console({
      browserSessionId: open.browserSessionId,
      level: 'warning',
    });
    expect(consoleSignals).toMatchObject({
      status: 'ok',
      entries: [expect.objectContaining({ level: 'warning', text: 'agent-e2e warning' })],
    });
    await expect(
      manager.console({
        browserSessionId: open.browserSessionId,
        since: consoleSignals.nextCursor,
      }),
    ).resolves.toMatchObject({ status: 'ok', entries: [] });

    const networkSignals = await manager.network({
      browserSessionId: open.browserSessionId,
      urlIncludes: '/api/ping',
    });
    expect(networkSignals.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'response', url: expect.stringContaining('/api/ping'), statusCode: 204 }),
      ]),
    );
  });

  it('runs page-context and Playwright-context code with serializable output and timeout feedback', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    managers.push(manager);

    const open = await manager.open({
      headed: false,
      targetUrl: 'data:text/html,<title>Code Runner</title><button>Run</button>',
    });
    await expect(
      manager.evaluate({
        browserSessionId: open.browserSessionId,
        code: "document.body.dataset.agent = input.label; return { title: document.title, label: input.label };",
        input: { label: 'e2e' },
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      output: { title: 'Code Runner', label: 'e2e' },
    });

    const find = await manager.find({
      browserSessionId: open.browserSessionId,
      by: 'role',
      value: 'button',
      name: 'Run',
    });
    await expect(
      manager.playwright({
        browserSessionId: open.browserSessionId,
        code: "const ref = refs[0]; await page.getByRole(ref.locator.role, { name: ref.locator.name }).click(); return { url: page.url(), ref: ref.ref };",
        refs: [find.targets[0]?.ref ?? ''],
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      output: { ref: '@f1' },
    });

    const timeout = await manager.evaluate({
      browserSessionId: open.browserSessionId,
      code: "await new Promise((resolve) => setTimeout(resolve, 50)); return 'late';",
      timeoutMs: 5,
    });
    expect(timeout).toMatchObject({
      status: 'failed',
      timeoutMs: 5,
      error: { code: 'browser-code-timeout' },
    });
    expect(timeout.durationMs).toBeGreaterThanOrEqual(4);
  });

  it('keeps requested screenshot paths inside the run forensics directory', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'agent-e2e-browser-path-'));
    const artifactRoot = join(tmpRoot, '.agents-e2e', 'artifacts');
    const manager = createPlaywrightMcpBrowserSessionManager({ artifactRoot });
    managers.push(manager);

    const open = await manager.open({
      headed: false,
      targetUrl: 'data:text/html,<h1>Contained screenshot</h1>',
      journeyId: 'journey:screenshot',
      runId: 'run:screenshot',
    });
    const screenshot = await manager.screenshot({
      browserSessionId: open.browserSessionId,
      path: '../../outside.png',
    });

    expect(screenshot).toMatchObject({
      status: 'ok',
      artifact: expect.objectContaining({
        // Custom path is kept as a sanitized label and prefixed with the capture
        // sequence + action; traversal cannot escape the forensics directory.
        path: expect.stringMatching(
          /\.agents-e2e\/artifacts\/journey-screenshot\/run-screenshot\/forensics\/0001-browser-screenshot-outside\.png$/,
        ),
      }),
    });
    expect(screenshot.artifact?.path).not.toContain('../../outside.png');
    expect(existsSync(screenshot.artifact?.path ?? '')).toBe(true);
    expect(existsSync(join(tmpRoot, 'outside.png'))).toBe(false);
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('reports missing sessions as actionable snapshot failures', async () => {
    const manager = createPlaywrightMcpBrowserSessionManager();
    const snapshot = await manager.snapshot('missing-browser');

    expect(snapshot).toMatchObject({
      status: 'failed',
      errors: [{ code: 'browser-session-not-found' }],
      next: { actions: [{ tool: 'browser.open' }] }
    });
  });
});

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected TCP server address.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
