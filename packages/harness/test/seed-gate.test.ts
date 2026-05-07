import { describe, expect, it } from 'vitest';
import {
  defineJourney,
  runEnvironmentSeed,
  type ArtifactRef,
  type GuidanceAction,
  type HarnessTypes,
  type SeedContribution,
  type StructuredWarning
} from '@agent-e2e/harness/core';

type SeedHarness = HarnessTypes<
  { runId: string },
  { tenantId: string; variant: 'clean' | 'warn' | 'fail' },
  { seeded: boolean },
  { kind: 'tenant' | 'record'; id: string }
>;

const inspectGuidance: GuidanceAction = {
  type: 'inspect',
  label: 'Inspect seed diagnostics',
  target: 'artifact:seed-log'
};

const seedArtifact: ArtifactRef = {
  id: 'artifact:seed-log',
  kind: 'log',
  uri: 'artifact://seed/log.txt',
  mediaType: 'text/plain'
};

const warning: StructuredWarning = {
  code: 'seed.slow-cache',
  message: 'Cache was warm but stale enough to inspect.',
  guidance: [inspectGuidance]
};

function seedContributionFor(variant: 'clean' | 'warn' | 'fail'): SeedContribution<SeedHarness> {
  if (variant === 'fail') {
    return {
      environment: {
        checked: [{ kind: 'tenant', id: 'tenant:fail' }],
        forbidden: [{ kind: 'record', id: 'record:missing' }]
      },
      artifacts: [seedArtifact],
      errors: [{ code: 'seed.missing-record', message: 'Required record is missing.' }]
    };
  }

  if (variant === 'warn') {
    return {
      environment: {
        checked: [{ kind: 'tenant', id: 'tenant:warn' }]
      },
      artifacts: [seedArtifact],
      warnings: [warning]
    };
  }

  return {
    environment: {
      checked: [{ kind: 'tenant', id: 'tenant:clean' }],
      created: [{ kind: 'record', id: 'record:created' }]
    },
    artifacts: [seedArtifact]
  };
}

function makeSeedJourney() {
  return defineJourney<SeedHarness>({
    id: 'journey:seeded',
    title: 'Seeded journey',
    profiles: [
      {
        id: 'profile:clean',
        data: { tenantId: 'tenant:clean', variant: 'clean' },
        isDefault: true,
        seed: ({ profile }) => seedContributionFor(profile.data.variant)
      },
      {
        id: 'profile:warn',
        data: { tenantId: 'tenant:warn', variant: 'warn' },
        seed: ({ profile }) => seedContributionFor(profile.data.variant)
      },
      {
        id: 'profile:fail',
        data: { tenantId: 'tenant:fail', variant: 'fail' },
        seed: ({ profile }) => seedContributionFor(profile.data.variant)
      }
    ],
    seed: async () => ({
      environment: {
        checked: [{ kind: 'tenant', id: 'common:checked' }],
        created: [{ kind: 'record', id: 'common:created' }]
      }
    }),
    phases: [
      {
        id: 'phase:noop',
        title: 'Noop phase',
        steps: [{ id: 'step:noop', title: 'Noop', execute: async () => ({ status: 'passed' }) }]
      }
    ]
  });
}

describe('Environment Seed and Seed Gate', () => {
  it('returns a ready gate and passed Seed Manifest for passing seed', async () => {
    const result = await runEnvironmentSeed(makeSeedJourney());

    expect(result.status).toBe('ready');
    expect(result.canRunSteps).toBe(true);
    expect(result.manifest.status).toBe('passed');
    expect(result.manifest.profile).toEqual({ id: 'profile:clean' });
    expect(result.manifest.environment.created).toEqual([
      { kind: 'record', id: 'common:created' },
      { kind: 'record', id: 'record:created' }
    ]);
  });

  it('keeps warning-only seed non-blocking and carries guidance actions', async () => {
    const result = await runEnvironmentSeed(makeSeedJourney(), { profileId: 'profile:warn' });

    expect(result.status).toBe('ready');
    expect(result.canRunSteps).toBe(true);
    expect(result.manifest.status).toBe('warning');
    expect(result.manifest.warnings).toEqual([warning]);
    expect(result.guidance).toEqual([inspectGuidance]);
  });

  it('blocks execution before steps can run when seed has errors', async () => {
    const result = await runEnvironmentSeed(makeSeedJourney(), { profileId: 'profile:fail' });

    expect(result.status).toBe('blocked');
    expect(result.canRunSteps).toBe(false);
    expect(result.manifest.status).toBe('failed');
    expect(result.manifest.errors).toEqual([{ code: 'seed.missing-record', message: 'Required record is missing.' }]);
  });

  it('composes journey-level and profile-level seed for the selected profile', async () => {
    const result = await runEnvironmentSeed(makeSeedJourney(), { profileId: 'profile:warn' });

    expect(result.manifest.profile).toEqual({ id: 'profile:warn' });
    expect(result.manifest.environment.checked).toEqual([
      { kind: 'tenant', id: 'common:checked' },
      { kind: 'tenant', id: 'tenant:warn' }
    ]);
  });

  it('keeps diagnostic artifacts separate from environment state', async () => {
    const result = await runEnvironmentSeed(makeSeedJourney(), { profileId: 'profile:fail' });

    expect(result.manifest.artifacts).toEqual([seedArtifact]);
    expect(result.manifest.environment.forbidden).toEqual([{ kind: 'record', id: 'record:missing' }]);
  });
});
