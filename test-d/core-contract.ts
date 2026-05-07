import {
  defineJourney,
  type FeedbackEnvelope,
  type HarnessTypes,
  type ObservedDomainPayload,
  type StepHandlerContext
} from '@agent-e2e/harness/core';

type AppHarness = HarnessTypes<
  { executionId: string; pageObject: { name: string } },
  { accountId: string; plan: 'free' | 'pro' },
  { dashboardTitle: string; visibleCount: number },
  { kind: 'account'; id: string }
>;

const journey = defineJourney<AppHarness>({
  id: 'journey:dashboard',
  title: 'Dashboard journey',
  profiles: [{ id: 'profile:pro', data: { accountId: 'acct_1', plan: 'pro' }, isDefault: true }],
  phases: [
    {
      id: 'phase:dashboard',
      title: 'Dashboard phase',
      steps: [
        {
          id: 'step:title',
          title: 'Title step',
          execute: async (context: StepHandlerContext<AppHarness>): Promise<FeedbackEnvelope<AppHarness>> => ({
            status: 'passed',
            observed: {
              dashboardTitle: context.execution.pageObject.name,
              visibleCount: context.profile.data.plan === 'pro' ? 2 : 1
            }
          }),
          proofs: [
            {
              id: 'proof:title',
              title: 'Title proof',
              check: async ({ observed }) => observed.dashboardTitle.length > 0
            }
          ]
        }
      ]
    }
  ]
});

const defaultAccount: string = journey.defaultProfile.data.accountId;
const observed: ObservedDomainPayload<AppHarness> = { dashboardTitle: 'Dashboard', visibleCount: 2 };
const contract = journey.toInspectableContract();
const profileDataPlan: 'free' | 'pro' = contract.profiles[0].data.plan;

void defaultAccount;
void observed;
void profileDataPlan;
