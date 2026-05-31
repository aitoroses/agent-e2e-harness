import { describe, expect, it } from 'vitest';
import { DEV_MCP_TOOL_GRAMMAR } from '@agent-e2e/harness/dev-mcp';
import { PLAYWRIGHT_MCP_DEFAULT_BROWSER_MODE, type BrowserInspectResult } from '@agent-e2e/harness/playwright-mcp';

const requiredTools = [
  'stack.start',
  'stack.list',
  'stack.status',
  'stack.logs',
  'stack.capability.list',
  'stack.capability.run',
  'stack.stop',
  'runtime.list',
  'runtime.status',
  'runtime.logs',
  'runtime.access.status',
  'runtime.capability.list',
  'runtime.capability.run',
  'journey.list',
  'journey.inspect',
  'run.begin',
  'run.reseed',
  'run.teardown',
  'cleanup.plan',
  'journey.step',
  'journey.untilStep',
  'journey.untilPhase',
  'journey.phase',
  'browser.open',
  'browser.sessions',
  'browser.inspect',
  'browser.refs',
  'browser.act',
  'browser.wait',
  'browser.eval',
  'browser.playwright',
  'browser.close'
] as const;

describe('Dev MCP Tool Grammar contracts', () => {
  it('freezes the implemented reusable Dev MCP tool vocabulary', () => {
    expect(DEV_MCP_TOOL_GRAMMAR).toEqual(requiredTools);
  });

  it('does not reserve deferred tool names in the public grammar', () => {
    expect(DEV_MCP_TOOL_GRAMMAR).not.toEqual(
      expect.arrayContaining([
        'run.reset',
        'run.status',
        'run.explainFailure',
        'browser.apiCall',
        'browser.tabs',
        'journey.run',
        'closure.run',
        'proof.timeline'
      ])
    );
  });

  it('defaults dev-mode Playwright browser sessions to visible/headed', () => {
    expect(PLAYWRIGHT_MCP_DEFAULT_BROWSER_MODE).toEqual({
      headed: true,
      headless: false,
      slowMoMs: 0,
      consumer: 'mcp'
    });
  });

  it('treats browser.inspect output as a compact, path-oriented index', () => {
    // The inspect return is an index: status, page facts, target resolution,
    // artifact paths, and signal counters. Detailed state lives in artifacts,
    // never inline — so there is no `refs` tree or markdown dump on the result.
    const result: BrowserInspectResult = {
      status: 'ok',
      browserSessionId: 'browser-visible-dev',
      url: 'http://127.0.0.1:5173/daemons',
      title: 'Developer Run Console',
      target: { input: '@e1', kind: 'ref', resolved: true },
      artifacts: {
        inspect: 'runs/abc/inspections/0001/inspect.md',
        inspectJson: 'runs/abc/inspections/0001/inspect.json',
        screenshot: 'runs/abc/inspections/0001/screenshot.png',
      },
      signals: { consoleErrors: 0, networkFailures: 0 },
      refsOverlayEnabled: false,
    };

    expect(result).not.toHaveProperty('refs');
    expect(result.target).toMatchObject({ kind: 'ref', resolved: true });
    expect(result.artifacts.inspectJson).toMatch(/inspect\.json$/);
  });
});
