import { describe, expect, it } from 'vitest';
import { DEV_MCP_TOOL_GRAMMAR } from '@agent-e2e/harness/dev-mcp';
import { PLAYWRIGHT_MCP_DEFAULT_BROWSER_MODE, type BrowserSnapshotPacket } from '@agent-e2e/harness/playwright-mcp';

const requiredTools = [
  'stack.start',
  'stack.list',
  'stack.status',
  'stack.logs',
  'stack.capability.list',
  'stack.capability.run',
  'stack.explore.list',
  'stack.explore.run',
  'stack.stop',
  'runtime.list',
  'runtime.status',
  'runtime.logs',
  'runtime.access.status',
  'runtime.capability.list',
  'runtime.capability.run',
  'runtime.explore.list',
  'runtime.explore.run',
  'journey.list',
  'journey.inspect',
  'run.begin',
  'run.reseed',
  'run.teardown',
  'cleanup.plan',
  'artifact.read',
  'journey.step',
  'journey.untilStep',
  'journey.untilPhase',
  'journey.phase',
  'browser.open',
  'browser.sessions',
  'browser.snapshot',
  'browser.find',
  'browser.act',
  'browser.wait',
  'browser.get',
  'browser.eval',
  'browser.playwright',
  'browser.console',
  'browser.network',
  'browser.screenshot',
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

  it('treats browser.snapshot as the primary forensics packet shape', () => {
    const packet: BrowserSnapshotPacket = {
      status: 'ok',
      browserSessionId: 'browser-visible-dev',
      url: 'http://127.0.0.1:3000',
      title: 'Example App',
      summary: 'Example App is ready for the next action.',
      refs: [{ ref: '@e1', role: 'button', name: 'Create record', selector: 'button' }],
      artifacts: [{ id: 'artifact:snapshot', kind: 'json', uri: 'artifact://snapshot.json' }],
      warnings: [],
      errors: [],
      next: { actions: [{ id: 'create-record', tool: 'browser.act', why: 'Exercise the next visible UI affordance.' }] }
    };

    expect(packet.refs[0]).toEqual({ ref: '@e1', role: 'button', name: 'Create record', selector: 'button' });
    expect(packet.next.actions[0]).toMatchObject({ tool: 'browser.act' });
  });
});
