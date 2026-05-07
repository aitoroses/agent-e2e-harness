import { describe, expect, it } from 'vitest';
import { defineJourney, runClosure, type ArtifactRef, type HarnessTypes } from '@agent-e2e/harness/core';

type ClosureHarness = HarnessTypes<
  { runId: string },
  { seedFail?: boolean; proofFail?: boolean; warn?: boolean },
  { value: string },
  { kind: 'record'; id: string }
>;

const artifact: ArtifactRef = { id: 'artifact:closure', kind: 'json', uri: 'artifact://closure/result.json' };

function makeClosureJourney(profile: ClosureHarness['profileData'] = {}) {
  return defineJourney<ClosureHarness>({
    id: 'journey:closure',
    title: 'Closure journey',
    seed: ({ profile }) =>
      profile.data.seedFail
        ? { errors: [{ code: 'seed.failed', message: 'Seed failed' }] }
        : {
            warnings: profile.data.warn
              ? [{ code: 'seed.warning', message: 'Seed warning', guidance: [{ type: 'inspect', label: 'Inspect warning' }] }]
              : [],
            artifacts: [artifact]
          },
    profiles: [{ id: 'profile:closure', data: profile, isDefault: true }],
    phases: [
      {
        id: 'phase:closure',
        title: 'Closure phase',
        steps: [
          {
            id: 'step:closure',
            title: 'Closure step',
            execute: async () => ({ status: 'passed', observed: { value: 'ok' }, artifacts: [artifact] }),
            proofs: [
              {
                id: 'proof:closure',
                title: 'Closure proof',
                check: async ({ profile }) => !profile.data.proofFail
              }
            ]
          }
        ]
      }
    ]
  });
}

describe('Closure runs', () => {
  it('crystallizes a successful journey without agent intervention', async () => {
    const result = await runClosure(makeClosureJourney(), { execution: { runId: 'closure-pass' } });

    expect(result.status).toBe('crystallized');
    expect(result.crystallized).toBe(true);
    expect(result.intervention).toBe('none');
    expect(result.steps).toHaveLength(1);
    expect(result.artifacts).toContainEqual(artifact);
    expect(result.evidence.seed.status).toBe('passed');
  });

  it('fails closure early on Seed Gate errors', async () => {
    const result = await runClosure(makeClosureJourney({ seedFail: true }), { execution: { runId: 'closure-seed-fail' } });

    expect(result.status).toBe('failed');
    expect(result.crystallized).toBe(false);
    expect(result.failureReason).toBe('seed-gate-blocked');
    expect(result.steps).toEqual([]);
  });

  it('fails closure on step/proof failure', async () => {
    const result = await runClosure(makeClosureJourney({ proofFail: true }), { execution: { runId: 'closure-proof-fail' } });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('step-failed');
    expect(result.steps[0]?.status).toBe('failed');
  });

  it('records warnings without failing by default', async () => {
    const result = await runClosure(makeClosureJourney({ warn: true }), { execution: { runId: 'closure-warning' } });

    expect(result.status).toBe('crystallized');
    expect(result.warnings).toEqual([{ code: 'seed.warning', message: 'Seed warning', guidance: [{ type: 'inspect', label: 'Inspect warning' }] }]);
  });
});
