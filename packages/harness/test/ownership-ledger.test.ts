import { describe, expect, it } from 'vitest';
import {
  beginJourneyRun,
  createCleanupPlan,
  createOwnershipLedger,
  defineJourney,
  recordOwnedResource,
  teardownOwnedResources,
  type HarnessTypes,
  type ResourceAdapter
} from '@agent-e2e/harness/core';

type OwnershipHarness = HarnessTypes<
  { runId: string },
  Record<string, never>,
  Record<string, never>,
  { kind: 'record'; id: string; scope?: string }
>;

const adapter: ResourceAdapter<OwnershipHarness> = {
  id: 'record-adapter',
  supports: (resource) => resource.kind === 'record',
  delete: async (resource) => {
    if (resource.id === 'record:fail') throw new Error('delete failed');
    return { artifact: { id: `artifact:deleted:${resource.id}`, kind: 'cleanup', uri: `artifact://cleanup/${resource.id}` } };
  }
};

function makeOwnershipJourney() {
  return defineJourney<OwnershipHarness>({
    id: 'journey:ownership',
    title: 'Ownership journey',
    seed: () => ({ environment: { created: [{ kind: 'record', id: 'record:seed' }] } }),
    profiles: [{ id: 'profile:default', data: {}, isDefault: true }],
    phases: [
      {
        id: 'phase:noop',
        title: 'Noop',
        steps: [{ id: 'step:noop', title: 'Noop', execute: async () => ({ status: 'passed' }) }]
      }
    ]
  });
}

describe('Ownership Ledger and safe teardown', () => {
  it('starts a run ledger from seed-created resources and can record more owned resources', async () => {
    const begin = await beginJourneyRun(makeOwnershipJourney(), { execution: { runId: 'run-owned' } });
    if (begin.status !== 'running') throw new Error('expected running');

    recordOwnedResource(begin.run, { kind: 'record', id: 'record:step' });

    expect(begin.run.ownershipLedger.resources).toEqual([
      { kind: 'record', id: 'record:seed' },
      { kind: 'record', id: 'record:step' }
    ]);
  });

  it('cleanup plan lists only run-owned resources and skips unowned requests', () => {
    const ledger = createOwnershipLedger<OwnershipHarness>('run-plan', [{ kind: 'record', id: 'record:owned' }]);
    const plan = createCleanupPlan(ledger, {
      requestedResources: [
        { kind: 'record', id: 'record:owned' },
        { kind: 'record', id: 'record:unowned' }
      ]
    });

    expect(plan.planned).toEqual([{ kind: 'record', id: 'record:owned' }]);
    expect(plan.skipped).toEqual([{ resource: { kind: 'record', id: 'record:unowned' }, reason: 'not-owned' }]);
  });


  it('does not treat a different resource with the same kind and id as owned', () => {
    const ledger = createOwnershipLedger<OwnershipHarness>('run-collision', [
      { kind: 'record', id: 'record:same', scope: 'owned-scope' }
    ]);
    const plan = createCleanupPlan(ledger, {
      requestedResources: [{ kind: 'record', id: 'record:same', scope: 'other-scope' }]
    });

    expect(plan.planned).toEqual([]);
    expect(plan.skipped).toEqual([
      { resource: { kind: 'record', id: 'record:same', scope: 'other-scope' }, reason: 'not-owned' }
    ]);
  });

  it('no-ledger teardown deletes nothing and artifacts the empty plan', async () => {
    const result = await teardownOwnedResources(createOwnershipLedger<OwnershipHarness>('run-empty'), [adapter]);

    expect(result.artifacts.planned).toEqual([]);
    expect(result.artifacts.deleted).toEqual([]);
    expect(result.artifacts.skipped).toEqual([]);
    expect(result.artifacts.failed).toEqual([]);
  });

  it('deletes owned resources through Resource Adapters and records artifacts', async () => {
    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>('run-delete', [{ kind: 'record', id: 'record:owned' }]),
      [adapter]
    );

    expect(result.artifacts.planned).toEqual([{ kind: 'record', id: 'record:owned' }]);
    expect(result.artifacts.deleted).toEqual([
      {
        resource: { kind: 'record', id: 'record:owned' },
        adapterId: 'record-adapter',
        artifact: { id: 'artifact:deleted:record:owned', kind: 'cleanup', uri: 'artifact://cleanup/record:owned' }
      }
    ]);
  });

  it('refuses unowned deletion and records failed adapter deletion', async () => {
    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>('run-fail', [{ kind: 'record', id: 'record:fail' }]),
      [adapter],
      { requestedResources: [{ kind: 'record', id: 'record:fail' }, { kind: 'record', id: 'record:unowned' }] }
    );

    expect(result.artifacts.skipped).toEqual([{ resource: { kind: 'record', id: 'record:unowned' }, reason: 'not-owned' }]);
    expect(result.artifacts.failed).toEqual([
      { resource: { kind: 'record', id: 'record:fail' }, adapterId: 'record-adapter', error: 'delete failed' }
    ]);
  });
});
