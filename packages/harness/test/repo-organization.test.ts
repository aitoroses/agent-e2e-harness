import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '../..');
const harnessPackage = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/harness/package.json'), 'utf8'),
) as {
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
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

  it('ships the first-class Testcontainers PostgreSQL provider as an optional subpath export', () => {
    // The provider lives behind its own subpath so the package-root and core
    // surfaces stay provider-agnostic, and its infra packages stay optional.
    expect(Object.keys(harnessPackage.exports)).toContain('./testcontainers');
    expect(Object.keys(harnessPackage.peerDependencies)).toEqual(
      expect.arrayContaining(['@testcontainers/postgresql', 'pg', 'testcontainers']),
    );
    expect(harnessPackage.peerDependenciesMeta['@testcontainers/postgresql']).toEqual({ optional: true });
    expect(harnessPackage.peerDependenciesMeta['pg']).toEqual({ optional: true });
    expect(harnessPackage.peerDependenciesMeta['testcontainers']).toEqual({ optional: true });
    expect(existsSync(resolve(repoRoot, 'packages/harness/dist/testcontainers/index.js'))).toBe(true);
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

  it('keeps public docs on the Stack Instance provider and verify contract', () => {
    const rootReadme = text('README.md');
    const packageReadme = text('packages/harness/README.md');
    const grammar = text('docs/showcase/dev-mcp-grammar.md');

    for (const source of [rootReadme, packageReadme, grammar]) {
      expect(source).toContain('StackStatusPacket.services');
      expect(source).toContain('StackStartContext');
      expect(source).toContain('Named Stack Allocations');
      expect(source).toContain('Run Stack Binding');
      expect(source).not.toContain('starts the configured stack once');
      expect(source).not.toContain('starts the configured stack once for the suite');
    }

    expect(rootReadme).toContain('stack.start');
    expect(rootReadme).toContain('stack.list');
    expect(rootReadme).toContain('stackId');
    expect(rootReadme).toContain(
      'dynamic URLs, readiness, health checks, stable service ids, endpoints, warnings, errors, artifacts, and next actions',
    );
    expect(packageReadme).toContain('worker-scoped Stack Instances');
    expect(packageReadme).toContain('worker-0');
  });

  it('keeps the self-contained skill teaching multi-stack dev and worker-scoped verify evidence', () => {
    const skill = [
      text('skills/agent-e2e-harness/SKILL.md'),
      text('skills/agent-e2e-harness/references/dev-mcp-loop.md'),
      text('skills/agent-e2e-harness/references/validation-checklist.md'),
      text('skills/agent-e2e-harness/references/verify-ci.md'),
      text('skills/agent-e2e-harness/references/journey-patterns.md'),
    ].join('\n');

    expect(skill).toContain('Stack Instance');
    expect(skill).toContain('Run Stack Binding');
    expect(skill).toContain('StackStatusPacket.services');
    expect(skill).toContain('StackStartContext');
    expect(skill).toContain('Named Stack Allocations');
    expect(skill).toContain('multi-stack');
    expect(skill).toContain('optional second Stack Instance');
    expect(skill).toContain('worker-scoped verify');
    expect(skill).toContain('worker-0');
    expect(skill).not.toContain('starts the configured stack once');
    expect(skill).not.toContain('active app stack');
  });

  it('keeps public docs and skill self-contained for Runtime Targets and Attached Runtime Mode', () => {
    const docs = [
      text('README.md'),
      text('packages/harness/README.md'),
      text('apps/showcase/README.md'),
      text('CONTEXT.md'),
      text('AGENTS.md'),
      text('skills/agent-e2e-harness/SKILL.md'),
      text('skills/agent-e2e-harness/references/dev-mcp-loop.md'),
      text('skills/agent-e2e-harness/references/validation-checklist.md'),
    ].join('\n');

    expect(docs).toContain('Runtime Target');
    expect(docs).toContain('Attached Runtime Target');
    expect(docs).toContain('Attached Runtime Mode');
    expect(docs).toContain('agent-e2e attached --target <id>');
    expect(docs).toContain('managedRuntime');
    expect(docs).toContain('attachedRuntime');
    expect(docs).toContain('runtime.list');
    expect(docs).toContain('runtime.status');
    expect(docs).toContain('runtime.logs');
    expect(docs).toContain('runtime.access.status');
    expect(docs).toContain('runtime.explore.list');
    expect(docs).toContain('runtime.explore.run');
    expect(docs).toContain('observation');
    expect(docs).toContain('runMutation');
    expect(docs).toContain('runtimeMutation');
    expect(docs).toContain('does not own infrastructure lifecycle');
    expect(showcasePackage.scripts['attached:mcp']).toBe('agent-e2e attached --target showcase-compose');
    expect(showcasePackage.scripts['compose:up']).toContain('docker compose');
  });

  it('keeps the showcase Compose attached path Dockerfile-backed and honestly documented', () => {
    const compose = text('apps/showcase/compose.yaml');
    const dockerfile = text('apps/showcase/Dockerfile');
    const nextConfig = text('apps/showcase/next.config.mjs');
    const showcaseReadme = text('apps/showcase/README.md');
    const transcript = text('docs/showcase/mcporter-proof-transcript.md');

    expect(compose).toContain('build:');
    expect(compose).toContain('dockerfile: apps/showcase/Dockerfile');
    expect(compose).not.toContain('volumes:');
    expect(compose).not.toContain('npm install');
    expect(dockerfile).toContain('npm ci --ignore-scripts');
    expect(dockerfile).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
    expect(nextConfig).toContain('allowedDevOrigins');
    expect(nextConfig).toContain('127.0.0.1');
    expect(showcaseReadme).toContain('AGENT_E2E_SHOWCASE_ROOT');
    expect(showcaseReadme).toContain('attached shares the default MCP port');
    expect(showcaseReadme).toContain('Access Context status is reported without exposing secret material');
    expect(showcaseReadme).toContain('browser.open authentication wiring is not automatic in this v1 path');
    expect(transcript).toContain('Attached Runtime Mode Docker Compose proof');
    expect(transcript).toContain('runtime.status` returned `ready`');
    expect(transcript).toContain('run.teardown` deleted the same note');
    expect(transcript).toContain('runtime.access.status');
  });

  it('keeps public docs and the skill clear on the journey, trajectory, and proofs model', () => {
    const rootReadme = text('README.md');
    const skillDocs = [
      text('skills/agent-e2e-harness/SKILL.md'),
      text('skills/agent-e2e-harness/references/dev-mcp-loop.md'),
      text('skills/agent-e2e-harness/references/journey-patterns.md'),
      text('skills/agent-e2e-harness/references/validation-checklist.md'),
      text('skills/agent-e2e-harness/references/verify-ci.md'),
    ].join('\n');

    expect(rootReadme).toContain('contract-verification tool, not a record-and-replay tool');
    expect(rootReadme).toContain('Journey, Trajectory, Proofs');
    expect(rootReadme).toContain('Journey**: the reviewed, inspectable contract in code');
    expect(rootReadme).toContain('Trajectory**: the path an agent discovers');
    expect(rootReadme).toContain('Proofs**: deterministic evidence');
    expect(rootReadme).toContain('promoted into reviewed journey code');
    expect(rootReadme).toContain('Seed ownership belongs to the journey and its selected Journey Profile');
    expect(rootReadme).toContain('Avoid shared mutable seed state across journeys');
    expect(rootReadme).toContain('Stable CI proof is the priority');
    expect(rootReadme).toContain('supporting forensics');

    expect(skillDocs).toContain('record-and-replay transcript');
    expect(skillDocs).toContain('**Journey** is the reviewed code contract');
    expect(skillDocs).toContain('**Trajectory** is the path the agent discovers');
    expect(skillDocs).toContain('**Proofs** are deterministic artifacts');
    expect(skillDocs).toContain('Promote agent-discovered paths into reviewed Journey code');
    expect(skillDocs).toContain('shared mutable seed state across journeys is discouraged');
    expect(skillDocs).toContain('proof stability and structured failure artifacts over visual or trajectory diffs');
    expect(skillDocs).toContain('The call sequence is the development Trajectory');
    expect(skillDocs).toContain('confirmation that verify ran reviewed Journey code');
  });
});
