import { definePlaywrightJourney, type PlaywrightHarnessTypes, type PlaywrightStepHandlerContext } from '@agent-e2e/harness';

type BrowserHarness = PlaywrightHarnessTypes<
  { label: string },
  { buttonText: string },
  { kind: 'page'; id: string }
>;

const journey = definePlaywrightJourney<{ label: string }, { buttonText: string }, { kind: 'page'; id: string }>({
  id: 'journey:type-browser',
  title: 'Type browser journey',
  profiles: [{ id: 'profile:type', data: { label: 'Click me' }, isDefault: true }],
  phases: [
    {
      id: 'phase:type',
      title: 'Type phase',
      steps: [
        {
          id: 'step:type',
          title: 'Type step',
          execute: async (context: PlaywrightStepHandlerContext<BrowserHarness>) => {
            const text = await context.execution.page.getByRole('button', { name: context.profile.data.label }).textContent();
            const browserVersion: string = context.execution.browser.version();
            return { status: 'passed', observed: { buttonText: text ?? browserVersion } };
          }
        }
      ]
    }
  ]
});

const profileLabel: string = journey.defaultProfile.data.label;
void profileLabel;
