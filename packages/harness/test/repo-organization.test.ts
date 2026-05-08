import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '../..');

function entries(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : [];
}

describe('repository organization contract', () => {
  it('keeps public type fixtures colocated with the harness package, not at repo root', () => {
    expect(existsSync(resolve(repoRoot, 'test-d'))).toBe(false);
    expect(entries(resolve(repoRoot, 'packages/harness/test-d'))).toEqual(
      expect.arrayContaining([
        'adapter-subpaths.ts',
        'core-contract.ts',
        'core-mcp-isolation.ts',
        'playwright-default.ts',
        'public-imports.ts'
      ])
    );
  });

  it('keeps showcase app, source, and tests in conventional Next.js boundaries', () => {
    expect(existsSync(resolve(repoRoot, 'apps/showcase/app/page.tsx'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'apps/showcase/src/journey.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'apps/showcase/src/harness/dev-stack.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'apps/showcase/test/showcase.e2e.test.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'packages/harness/test/showcase.test.ts'))).toBe(false);
  });

  it('uses showcase scripts only as runnable entrypoints, with reusable code under src', () => {
    expect(entries(resolve(repoRoot, 'apps/showcase/scripts'))).toEqual(['dev-mcp.ts']);
  });
});
