import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const cliPath = resolve(process.cwd(), 'dist/cli/index.js');

async function runCli(args: string[]) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], { cwd: process.cwd() });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string };
    return { code: failed.code ?? 1, json: JSON.parse(failed.stdout ?? '{}') };
  }
}

describe('Reference CLI', () => {
  it('starts the reference MCP server descriptor', async () => {
    await expect(runCli(['mcp:start'])).resolves.toMatchObject({ code: 0, json: { status: 'ok', server: 'reference-mcp' } });
  });

  it('runs seed, demo journey, artifacts, cleanup plan, and teardown', async () => {
    await expect(runCli(['seed'])).resolves.toMatchObject({ code: 0, json: { status: 'ok', seedGate: { canRunSteps: true } } });
    await expect(runCli(['run'])).resolves.toMatchObject({ code: 0, json: { status: 'ok', results: [{ status: 'passed' }] } });
    await expect(runCli(['artifacts'])).resolves.toMatchObject({ code: 0, json: { status: 'ok' } });
    await expect(runCli(['cleanup-plan'])).resolves.toMatchObject({ code: 0, json: { status: 'ok', plan: { planned: [] } } });
    await expect(runCli(['teardown'])).resolves.toMatchObject({ code: 0, json: { status: 'ok', result: { artifacts: { deleted: [] } } } });
  });

  it('runs closure with non-zero exit on seed or proof failure', async () => {
    await expect(runCli(['closure'])).resolves.toMatchObject({ code: 0, json: { status: 'crystallized' } });
    await expect(runCli(['closure', '--fail-seed'])).resolves.toMatchObject({ code: 1, json: { failureReason: 'seed-gate-blocked' } });
    await expect(runCli(['closure', '--fail-proof'])).resolves.toMatchObject({ code: 1, json: { failureReason: 'step-failed' } });
  });
});
