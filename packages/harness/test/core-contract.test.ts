import { describe, expect, it } from 'vitest';
import {
  defineJourney,
  toInspectableContract,
  type ArtifactRef,
  type FeedbackEnvelope,
  type GuidanceAction,
  type HarnessTypes
} from '@agent-e2e/harness/core';

type ProductHarness = HarnessTypes<
  { executionId: string },
  { tenantId: string; locale: 'en' | 'es' },
  { greeting: string; count: number },
  { kind: 'tenant'; id: string }
>;

const screenshotArtifact: ArtifactRef = {
  id: 'artifact:screenshot',
  kind: 'screenshot',
  uri: 'artifact://run/screenshot.png',
  mediaType: 'image/png'
};

const inspectGreeting: GuidanceAction = {
  type: 'inspect',
  label: 'Inspect greeting',
  target: 'step:greeting'
};

function makeJourney() {
  return defineJourney<ProductHarness>({
    id: 'journey:greeting',
    title: 'Greeting journey',
    description: 'Proves the greeting copy can be inspected.',
    profiles: [
      { id: 'profile:english', label: 'English', data: { tenantId: 'acme', locale: 'en' } },
      { id: 'profile:spanish', label: 'Spanish', data: { tenantId: 'acme-es', locale: 'es' }, isDefault: true }
    ],
    phases: [
      {
        id: 'phase:copy',
        title: 'Copy proof',
        steps: [
          {
            id: 'step:greeting',
            title: 'Check greeting',
            execute: async ({ profile }) => ({
              status: 'passed',
              observed: { greeting: profile.data.locale === 'es' ? 'Hola' : 'Hello', count: 1 },
              artifacts: [screenshotArtifact],
              guidance: [inspectGreeting]
            }),
            artifacts: [screenshotArtifact],
            guidance: [inspectGreeting],
            proofs: [
              {
                id: 'proof:greeting-visible',
                title: 'Greeting visible',
                check: async ({ observed }) => observed.greeting.length > 0
              }
            ]
          }
        ]
      }
    ]
  });
}

describe('Minimal Core Contract', () => {
  it('requires every journey to define at least one Journey Profile', () => {
    expect(() =>
      defineJourney({
        id: 'journey:no-profiles',
        title: 'No profiles',
        profiles: [],
        phases: [
          {
            id: 'phase:noop',
            title: 'Noop phase',
            steps: [{ id: 'step:noop', title: 'Noop', execute: async () => ({ status: 'passed' }) }]
          }
        ]
      })
    ).toThrow(/at least one Journey Profile/);
  });

  it('uses the first profile as default when none is marked', () => {
    const journey = defineJourney({
      id: 'journey:first-default',
      title: 'First default',
      profiles: [
        { id: 'profile:first', data: {} },
        { id: 'profile:second', data: {} }
      ],
      phases: [
        {
          id: 'phase:noop',
          title: 'Noop phase',
          steps: [{ id: 'step:noop', title: 'Noop', execute: async () => ({ status: 'passed' }) }]
        }
      ]
    });

    expect(journey.defaultProfile.id).toBe('profile:first');
  });

  it('uses the profile explicitly marked as default', () => {
    expect(makeJourney().defaultProfile.id).toBe('profile:spanish');
  });

  it('rejects multiple default profiles', () => {
    expect(() =>
      defineJourney({
        id: 'journey:multiple-defaults',
        title: 'Multiple defaults',
        profiles: [
          { id: 'profile:first', data: {}, isDefault: true },
          { id: 'profile:second', data: {}, isDefault: true }
        ],
        phases: [
          {
            id: 'phase:noop',
            title: 'Noop phase',
            steps: [{ id: 'step:noop', title: 'Noop', execute: async () => ({ status: 'passed' }) }]
          }
        ]
      })
    ).toThrow(/at most one default Journey Profile/);
  });

  it('produces an inspectable contract without executable handler internals', () => {
    const journey = makeJourney();
    const contract = journey.toInspectableContract();

    expect(contract).toEqual(toInspectableContract(journey));
    expect(contract).toMatchObject({
      id: 'journey:greeting',
      title: 'Greeting journey',
      defaultProfileId: 'profile:spanish',
      profiles: [
        { id: 'profile:english', label: 'English', data: { tenantId: 'acme', locale: 'en' }, isDefault: false },
        { id: 'profile:spanish', label: 'Spanish', data: { tenantId: 'acme-es', locale: 'es' }, isDefault: true }
      ],
      phases: [
        {
          id: 'phase:copy',
          title: 'Copy proof',
          steps: [
            {
              id: 'step:greeting',
              title: 'Check greeting',
              artifacts: [screenshotArtifact],
              guidance: [inspectGreeting],
              proofs: [{ id: 'proof:greeting-visible', title: 'Greeting visible' }]
            }
          ]
        }
      ]
    });

    const serialized = JSON.stringify(contract);
    expect(serialized).not.toContain('execute');
    expect(serialized).not.toContain('check');
    expect(contract.phases[0]?.steps[0]).not.toHaveProperty('execute');
    expect(contract.phases[0]?.steps[0]?.proofs[0]).not.toHaveProperty('check');
  });

  it('keeps product observations as typed payloads inside Feedback Envelopes', async () => {
    const journey = makeJourney();
    const feedback: FeedbackEnvelope<ProductHarness> = await journey.phases[0].steps[0].execute({
      execution: { executionId: 'exec-1' },
      profile: journey.defaultProfile
    });

    expect(feedback.observed).toEqual({ greeting: 'Hola', count: 1 });
    expect(feedback.guidance).toEqual([inspectGreeting]);
  });
});
