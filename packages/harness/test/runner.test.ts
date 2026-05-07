import { describe, expect, it } from 'vitest';
import {
  beginJourneyRun,
  defineJourney,
  runJourneyStep,
  type ArtifactRef,
  type HarnessTypes
} from '@agent-e2e/harness/core';

type RunnerHarness = HarnessTypes<
  { runId: string },
  { shouldSeedFail?: boolean; shouldProofFail?: boolean },
  { message: string },
  { kind: 'record'; id: string }
>;

const artifact: ArtifactRef = {
  id: 'artifact:step-json',
  kind: 'json',
  uri: 'artifact://run/step.json',
  mediaType: 'application/json'
};

function makeRunnerJourney(profileData: RunnerHarness['profileData'] = {}) {
  return defineJourney<RunnerHarness>({
    id: 'journey:runner',
    title: 'Runner journey',
    seed: ({ profile }) =>
      profile.data.shouldSeedFail
        ? { errors: [{ code: 'seed.failed', message: 'Seed failed' }] }
        : { environment: { checked: [{ kind: 'record', id: 'record:checked' }] } },
    profiles: [{ id: 'profile:default', data: profileData, isDefault: true }],
    phases: [
      {
        id: 'phase:main',
        title: 'Main phase',
        steps: [
          {
            id: 'step:message',
            title: 'Message step',
            execute: async () => ({
              status: 'passed',
              observed: { message: 'hello' },
              artifacts: [artifact],
              warnings: ['step warning']
            }),
            proofs: [
              {
                id: 'proof:message',
                title: 'Message proof',
                check: async ({ profile, observed }) => !profile.data.shouldProofFail && observed.message === 'hello'
              }
            ]
          }
        ]
      }
    ]
  });
}

describe('Minimal core runner', () => {
  it('blocks run start when the Seed Gate fails', async () => {
    const begin = await beginJourneyRun(makeRunnerJourney({ shouldSeedFail: true }), {
      execution: { runId: 'run-blocked' }
    });

    expect(begin.status).toBe('blocked');
    expect(begin.seedGate.canRunSteps).toBe(false);
    expect(begin.seedGate.manifest.errors).toEqual([{ code: 'seed.failed', message: 'Seed failed' }]);
  });

  it('executes one fake typed step after seed passes and emits stable JSON feedback', async () => {
    const begin = await beginJourneyRun(makeRunnerJourney(), { execution: { runId: 'run-pass' } });
    expect(begin.status).toBe('running');
    if (begin.status !== 'running') throw new Error('expected running');

    const result = await runJourneyStep(begin.run, { phaseId: 'phase:main', stepId: 'step:message' });

    expect(result.status).toBe('passed');
    expect(result.feedback.observed).toEqual({ message: 'hello' });
    expect(result.artifacts).toEqual([artifact]);
    expect(result.warnings).toEqual(['step warning']);
    expect(result.errors).toEqual([]);
    expect(result.proofs).toEqual([{ id: 'proof:message', title: 'Message proof', status: 'passed' }]);
    expect(result.guidance).toContainEqual({ type: 'continue', label: 'Run complete', target: 'run:complete' });
    expect(result.progress.completedStepIds).toEqual(['step:message']);
    expect(result.durationMs).toEqual(expect.any(Number));
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ status: 'passed', stepId: 'step:message' });
  });

  it('reflects proof failure in step status and returns inspect/fix guidance', async () => {
    const begin = await beginJourneyRun(makeRunnerJourney({ shouldProofFail: true }), {
      execution: { runId: 'run-fail' }
    });
    if (begin.status !== 'running') throw new Error('expected running');

    const result = await runJourneyStep(begin.run, { phaseId: 'phase:main', stepId: 'step:message' });

    expect(result.status).toBe('failed');
    expect(result.proofs).toEqual([{ id: 'proof:message', title: 'Message proof', status: 'failed' }]);
    expect(result.progress.failedStepIds).toEqual(['step:message']);
    expect(result.guidance).toEqual([
      { type: 'inspect', label: 'Inspect failed step', target: 'step:message' },
      { type: 'fix', label: 'Fix failed proof', target: 'proof:message' }
    ]);
  });
});
