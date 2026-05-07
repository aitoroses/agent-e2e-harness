import { describe, expect, it } from 'vitest';
import { __agentE2EScaffold } from '@agent-e2e/harness';
import { __agentE2ECoreScaffold } from '@agent-e2e/harness/core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('public package exports', () => {
  it('loads the package-root scaffold through the package export map', () => {
    expect(__agentE2EScaffold).toMatchObject({
      packageName: '@agent-e2e/harness',
      surface: 'default-harness-api',
      status: 'scaffold-only'
    });
  });

  it('loads the generic core scaffold through the /core subpath export', () => {
    expect(__agentE2ECoreScaffold).toMatchObject({
      packageName: '@agent-e2e/harness',
      surface: 'harness-core',
      status: 'scaffold-only'
    });
  });
});

describe('examples placeholder', () => {
  it('exists without documenting internal core source imports', () => {
    const examplesReadme = resolve(process.cwd(), '../../examples/README.md');

    expect(existsSync(examplesReadme)).toBe(true);
    expect(readFileSync(examplesReadme, 'utf8')).not.toContain('packages/harness/src/core');
  });
});
