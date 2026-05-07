import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import {
  beginJourneyRun,
  definePlaywrightJourney,
  runJourneyStep,
  type ArtifactRef
} from '@agent-e2e/harness';

let browser: Browser;
let page: Page;

const domArtifact: ArtifactRef = {
  id: 'artifact:dom-snapshot',
  kind: 'html',
  uri: 'artifact://browser/dom.html',
  mediaType: 'text/html'
};

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await page?.close();
  await browser?.close();
});

describe('Playwright Default Harness API', () => {
  it('runs a tiny browser journey through seed, step, proof, and artifact flow', async () => {
    const journey = definePlaywrightJourney<
      { heading: string },
      { headingText: string },
      { kind: 'page'; id: string }
    >({
      id: 'journey:browser-heading',
      title: 'Browser heading journey',
      profiles: [{ id: 'profile:hello', data: { heading: 'Hello Agent' }, isDefault: true }],
      seed: async ({ execution, profile }) => {
        await execution.page.setContent(`<main><h1>${profile.data.heading}</h1><button>Continue</button></main>`);
        return {
          environment: { checked: [{ kind: 'page', id: 'about:blank' }] },
          artifacts: [domArtifact]
        };
      },
      phases: [
        {
          id: 'phase:browser',
          title: 'Browser phase',
          steps: [
            {
              id: 'step:heading',
              title: 'Read heading',
              execute: async ({ execution }) => {
                const headingText = await execution.page.getByRole('heading', { name: 'Hello Agent' }).textContent();
                await execution.page.locator('button').click();
                return {
                  status: 'passed',
                  observed: { headingText: headingText ?? '' },
                  artifacts: [domArtifact]
                };
              },
              artifacts: [domArtifact],
              proofs: [
                {
                  id: 'proof:heading',
                  title: 'Heading is visible',
                  check: async ({ execution, observed }) =>
                    (await execution.page.getByRole('heading', { name: observed.headingText }).isVisible())
                }
              ]
            }
          ]
        }
      ]
    });

    const begin = await beginJourneyRun(journey, { execution: { browser, page } });
    expect(begin.status).toBe('running');
    if (begin.status !== 'running') throw new Error('expected running');

    const result = await runJourneyStep(begin.run, { phaseId: 'phase:browser', stepId: 'step:heading' });

    expect(result.status).toBe('passed');
    expect(result.feedback.observed).toEqual({ headingText: 'Hello Agent' });
    expect(result.artifacts).toEqual([domArtifact]);
    expect(result.proofs).toEqual([{ id: 'proof:heading', title: 'Heading is visible', status: 'passed' }]);
  });
});
