import { describe, expect, it } from "vitest";
import {
  beginJourneyRun,
  createCleanupPlan,
  createOwnershipLedger,
  createResourceRegistry,
  defineJourney,
  defineResourceKind,
  recordOwnedResource,
  reseedJourneyRun,
  runJourneyStep,
  teardownOwnedResources,
  type HarnessTypes,
  type ResourceAdapter,
} from "@agent-e2e/harness/core";

type OwnershipHarness = HarnessTypes<
  { runId: string },
  Record<string, never>,
  Record<string, never>,
  { kind: "record"; id: string; scope?: string }
>;

const adapter: ResourceAdapter<OwnershipHarness> = {
  id: "record-adapter",
  supports: (resource) => resource.kind === "record",
  delete: async (resource) => {
    if (resource.id === "record:fail") throw new Error("delete failed");
    return {
      artifact: {
        id: `artifact:deleted:${resource.id}`,
        kind: "cleanup",
        uri: `artifact://cleanup/${resource.id}`,
      },
    };
  },
};

function makeOwnershipJourney() {
  return defineJourney<OwnershipHarness>({
    id: "journey:ownership",
    title: "Ownership journey",
    seed: () => ({
      environment: { created: [{ kind: "record", id: "record:seed" }] },
    }),
    profiles: [{ id: "profile:default", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:noop",
        title: "Noop",
        steps: [
          {
            id: "step:noop",
            title: "Noop",
            execute: async () => ({ status: "passed" }),
          },
        ],
      },
    ],
  });
}

describe("Ownership Ledger and safe teardown", () => {
  it("does not treat seed-created baseline resources as run-owned by default", async () => {
    const begin = await beginJourneyRun(makeOwnershipJourney(), {
      execution: { runId: "run-owned" },
    });
    if (begin.status !== "running") throw new Error("expected running");

    expect(begin.seedGate.manifest.environment.created).toEqual([
      { kind: "record", id: "record:seed" },
    ]);
    expect(begin.run.ownershipLedger.resources).toEqual([]);

    recordOwnedResource(begin.run, { kind: "record", id: "record:step" });

    expect(begin.run.ownershipLedger.resources).toEqual([
      { kind: "record", id: "record:step" },
    ]);
  });

  it("cleanup plan lists only run-owned resources and skips unowned requests", () => {
    const ledger = createOwnershipLedger<OwnershipHarness>("run-plan", [
      { kind: "record", id: "record:owned" },
    ]);
    const plan = createCleanupPlan(ledger, {
      requestedResources: [
        { kind: "record", id: "record:owned" },
        { kind: "record", id: "record:unowned" },
      ],
    });

    expect(plan.planned).toEqual([{ kind: "record", id: "record:owned" }]);
    expect(plan.skipped).toEqual([
      {
        resource: { kind: "record", id: "record:unowned" },
        reason: "not-owned",
      },
    ]);
  });

  it("does not treat a different resource with the same kind and id as owned", () => {
    const ledger = createOwnershipLedger<OwnershipHarness>("run-collision", [
      { kind: "record", id: "record:same", scope: "owned-scope" },
    ]);
    const plan = createCleanupPlan(ledger, {
      requestedResources: [
        { kind: "record", id: "record:same", scope: "other-scope" },
      ],
    });

    expect(plan.planned).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        resource: { kind: "record", id: "record:same", scope: "other-scope" },
        reason: "not-owned",
      },
    ]);
  });

  it("no-ledger teardown deletes nothing and artifacts the empty plan", async () => {
    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>("run-empty"),
      [adapter],
    );

    expect(result.artifacts.planned).toEqual([]);
    expect(result.artifacts.deleted).toEqual([]);
    expect(result.artifacts.skipped).toEqual([]);
    expect(result.artifacts.failed).toEqual([]);
  });

  it("creates typed resources through the registry and deletes only recorded handles", async () => {
    const deleted: string[] = [];
    const registry = createResourceRegistry([
      defineResourceKind({
        kind: "record",
        create: async (input: { id: string; scope?: string }) => ({
          kind: "record",
          id: input.id,
          scope: input.scope,
        }),
        delete: async (resource: {
          kind: "record";
          id: string;
          scope?: string;
        }) => {
          deleted.push(resource.id);
        },
      }),
    ]);
    const created = await registry.create("record", {
      id: "record:created",
      scope: "journey",
    });

    expect(created).toEqual({
      kind: "record",
      id: "record:created",
      scope: "journey",
    });

    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>("run-registry", [created]),
      [registry.adapter as ResourceAdapter<OwnershipHarness>],
    );

    expect(result.artifacts.deleted).toMatchObject([
      {
        resource: { id: "record:created" },
        adapterId: "resource-registry-adapter",
      },
    ]);
    expect(deleted).toEqual(["record:created"]);
  });

  it("reseeds by deleting previous journey-owned ledger resources before running seed again", async () => {
    const deleted: string[] = [];
    const deletingAdapter: ResourceAdapter<OwnershipHarness> = {
      id: "record-delete",
      supports: (resource) => resource.kind === "record",
      delete: async (resource) => {
        deleted.push(resource.id);
      },
    };

    const result = await reseedJourneyRun(makeOwnershipJourney(), {
      execution: { runId: "reseed-execution" },
      runId: "run-reseed-next",
      previousLedger: createOwnershipLedger<OwnershipHarness>(
        "run-reseed-previous",
        [{ kind: "record", id: "record:journey-owned" }],
      ),
      resourceAdapters: [deletingAdapter],
    });

    expect(result.status).toBe("running");
    if (result.status !== "running") throw new Error("expected running reseed");
    expect(deleted).toEqual(["record:journey-owned"]);
    expect(result.cleanup.artifacts.deleted).toMatchObject([
      { resource: { id: "record:journey-owned" } },
    ]);
    expect(result.seedGate.manifest.environment.created).toEqual([
      { kind: "record", id: "record:seed" },
    ]);
    expect(result.run.ownershipLedger.resources).toEqual([]);
  });

  it("blocks reseed before seed when owned cleanup fails", async () => {
    const result = await reseedJourneyRun(makeOwnershipJourney(), {
      execution: { runId: "reseed-fail-execution" },
      runId: "run-reseed-fail",
      previousLedger: createOwnershipLedger<OwnershipHarness>(
        "run-reseed-fail-previous",
        [{ kind: "record", id: "record:fail" }],
      ),
      resourceAdapters: [adapter],
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "cleanup-failed",
      canRunSteps: false,
      cleanup: { artifacts: { failed: [{ error: "delete failed" }] } },
    });
    expect(result.seedGate).toBeUndefined();
  });

  it("deletes owned resources through Resource Adapters and records artifacts", async () => {
    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>("run-delete", [
        { kind: "record", id: "record:owned" },
      ]),
      [adapter],
    );

    expect(result.artifacts.planned).toEqual([
      { kind: "record", id: "record:owned" },
    ]);
    expect(result.artifacts.deleted).toEqual([
      {
        resource: { kind: "record", id: "record:owned" },
        adapterId: "record-adapter",
        artifact: {
          id: "artifact:deleted:record:owned",
          kind: "cleanup",
          uri: "artifact://cleanup/record:owned",
        },
      },
    ]);
  });

  it("refuses unowned deletion and records failed adapter deletion", async () => {
    const result = await teardownOwnedResources(
      createOwnershipLedger<OwnershipHarness>("run-fail", [
        { kind: "record", id: "record:fail" },
      ]),
      [adapter],
      {
        requestedResources: [
          { kind: "record", id: "record:fail" },
          { kind: "record", id: "record:unowned" },
        ],
      },
    );

    expect(result.artifacts.skipped).toEqual([
      {
        resource: { kind: "record", id: "record:unowned" },
        reason: "not-owned",
      },
    ]);
    expect(result.artifacts.failed).toEqual([
      {
        resource: { kind: "record", id: "record:fail" },
        adapterId: "record-adapter",
        error: "delete failed",
      },
    ]);
  });
});
