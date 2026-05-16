import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '../..');
const harnessPackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/harness/package.json'), 'utf8'),
) as {
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
};
const showcasePackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/showcase/package.json'), 'utf8'),
) as {
  scripts: Record<string, string>;
};

function entries(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : [];
}

function text(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
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

  it('uses the package CLI for Dev MCP instead of app-owned runnable scripts', () => {
    expect(entries(resolve(repoRoot, 'apps/showcase/scripts'))).toEqual([]);
    expect(showcasePackage.scripts['dev:mcp']).toContain('agent-e2e dev');
  });

  it('keeps consumer infrastructure providers out of the published harness package', () => {
    expect(Object.keys(harnessPackage.exports)).not.toContain('./testcontainers');
    expect(Object.keys(harnessPackage.peerDependencies)).not.toEqual(
      expect.arrayContaining(['@testcontainers/postgresql', 'pg']),
    );
    expect(existsSync(resolve(repoRoot, 'packages/harness/dist/testcontainers'))).toBe(false);
  });

  it('keeps showcase docs on the explicit Stack Instance and worker verify path', () => {
    const showcaseReadme = text('apps/showcase/README.md');
    const transcript = text('docs/showcase/mcporter-proof-transcript.md');

    for (const source of [showcaseReadme, transcript]) {
      expect(source).toContain('--tool stack.start --args \'{"stackId":"showcase-dev-stack"}\'');
      expect(source).toContain('--tool stack.list');
      expect(source).toContain('"stackId":"showcase-dev-stack"');
      expect(source).toContain('--tool run.begin');
      expect(source).toContain('--tool stack.logs');
      expect(source).toContain('--tool stack.explore.run');
      expect(source).toContain('npm run e2e:verify --workspace @agent-e2e/showcase -- --workers 2');
    }
  });
});
