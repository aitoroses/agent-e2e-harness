import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlaywrightMcpBrowserSessionManager } from '@agent-e2e/harness/playwright-mcp';

const managers: Array<ReturnType<typeof createPlaywrightMcpBrowserSessionManager>> = [];

describe('Playwright MCP browser session manager', () => {
  afterEach(async () => {
    for (const manager of managers.splice(0)) {
      for (const session of manager.list()) await manager.close(session.browserSessionId);
    }
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
        path: expect.stringContaining('.agents-e2e/artifacts/journey-browser-proof/browser-run-2/forensics/browser-snapshot-'),
      }),
    ]);
    expect(existsSync(snapshot.artifacts[0]?.path ?? '')).toBe(true);
    expect(snapshot.artifacts[0]?.path).not.toContain('.scratch');
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('acts on fresh snapshot refs and captures the resulting state', async () => {
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
      artifact: expect.objectContaining({
        kind: 'screenshot',
        name: 'screenshot',
        path: expect.stringContaining('.agents-e2e/artifacts/journey-browser-act/browser-act-run/forensics/action-click-'),
      }),
    });
    expect(existsSync(action.artifact?.path ?? '')).toBe(true);
    expect(action.artifact?.path).not.toContain('.scratch');

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
        path: expect.stringContaining('.agents-e2e/artifacts/journey-screenshot/run-screenshot/forensics/outside.png'),
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
