import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { execFile } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createMcpHarnessServer } from '@agent-e2e/harness/mcp';
import { beginJourneyRun, runClosure, runJourneyStep } from '@agent-e2e/harness';
import { createShowcaseJourney } from '../../../apps/showcase/src/journey.ts';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd(), '../..');
let port: number;
let baseUrl: string;
let nextProcess: ChildProcess;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  await execFileAsync('npm', ['run', 'build', '--workspace', '@agent-e2e/showcase'], { cwd: repoRoot });
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  nextProcess = spawn('npm', ['run', 'start', '--workspace', '@agent-e2e/showcase', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: repoRoot,
    stdio: 'ignore'
  });
  await waitForShowcase();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      nextProcess.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
});

describe('Next.js showcase app', () => {
  it('runs the showcase journey step-by-step through MCP/dev iteration and closure', async () => {
    const journey = createShowcaseJourney(baseUrl);
    const server = createMcpHarnessServer({ journeys: [journey] });

    await page.goto(baseUrl);
    await expect(page.getByRole('heading', { name: 'Deterministic proof, from seed to closure' }).textContent()).resolves.toBeTruthy();

    const begin = await beginJourneyRun(journey, { execution: { browser, page } });
    expect(begin.status).toBe('running');
    if (begin.status !== 'running') throw new Error('expected running');

    const step = await runJourneyStep(begin.run, { phaseId: 'phase:proof', stepId: 'step:capture-proof' });
    expect(step.status).toBe('passed');
    expect(step.feedback.observed).toEqual({ statusText: 'Proof captured' });

    const mcpBegin = await server.callTool('beginRun', { journeyId: journey.id, execution: { browser, page }, runId: 'showcase-mcp' });
    expect(mcpBegin).toMatchObject({ status: 'ok', runId: 'showcase-mcp' });
    const mcpStep = await server.callTool('runStep', { runId: 'showcase-mcp', phaseId: 'phase:proof', stepId: 'step:capture-proof' });
    expect(mcpStep).toMatchObject({ status: 'ok', result: { status: 'passed' } });

    const closure = await runClosure(journey, { execution: { browser, page }, runId: 'showcase-closure' });
    expect(closure.status).toBe('crystallized');
    expect(closure.crystallized).toBe(true);
    expect(closure.intervention).toBe('none');
    expect(closure.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'artifact:showcase-seed' }),
        expect.objectContaining({ id: 'artifact:showcase-status' })
      ])
    );
  }, 60_000);
});

async function waitForShowcase(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await delay(500);
  }
  throw new Error('Timed out waiting for showcase app');
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        const selectedPort = address.port;
        server.close(() => resolve(selectedPort));
      } else {
        server.close(() => reject(new Error('Could not allocate free port')));
      }
    });
  });
}
