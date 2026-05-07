import { definePlaywrightJourney, type PlaywrightExecutableJourney } from '@agent-e2e/harness';

export interface ShowcaseProfileData {
  baseUrl: string;
}

export interface ShowcaseObserved {
  statusText: string;
}

export interface ShowcaseOwnedResource {
  kind: 'browser-state';
  id: string;
}

export function createShowcaseJourney(baseUrl: string): PlaywrightExecutableJourney<
  ShowcaseProfileData,
  ShowcaseObserved,
  ShowcaseOwnedResource
> {
  return definePlaywrightJourney<ShowcaseProfileData, ShowcaseObserved, ShowcaseOwnedResource>({
    id: 'showcase:deterministic-proof',
    title: 'Showcase deterministic proof journey',
    profiles: [{ id: 'profile:default', data: { baseUrl }, isDefault: true }],
    seed: async ({ execution, profile }) => {
      if (!execution) throw new Error('Showcase seed requires Playwright execution');
      await execution.page.goto(profile.data.baseUrl);
      await execution.page.evaluate(() => window.localStorage.clear());
      await execution.page.reload();
      return {
        environment: { checked: [{ kind: 'browser-state', id: 'local-storage-cleared' }] },
        artifacts: [{ id: 'artifact:showcase-seed', kind: 'url', uri: profile.data.baseUrl }]
      };
    },
    phases: [
      {
        id: 'phase:proof',
        title: 'Proof phase',
        steps: [
          {
            id: 'step:capture-proof',
            title: 'Capture proof status',
            execute: async ({ execution }) => {
              await execution.page.getByRole('button', { name: 'Prove deterministic UI' }).click();
              const statusText = (await execution.page.getByLabel('Proof status').textContent()) ?? '';
              return {
                status: 'passed',
                observed: { statusText },
                artifacts: [{ id: 'artifact:showcase-status', kind: 'text', uri: 'artifact://showcase/status.txt' }]
              };
            },
            proofs: [
              {
                id: 'proof:status-captured',
                title: 'Status was captured',
                check: async ({ observed }) => observed.statusText === 'Proof captured'
              }
            ]
          }
        ]
      }
    ]
  });
}
