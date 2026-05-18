import { describe, expect, it } from "vitest";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import {
  attachedRuntime,
  createRuntimeTargetRegistry,
  managedRuntime,
} from "@agent-e2e/harness/runtime";

type RuntimeHarness = HarnessTypes<
  { runId: string },
  Record<string, never>,
  Record<string, never>,
  { kind: "record"; id: string }
>;

function makeRuntimeJourney() {
  return defineJourney<RuntimeHarness>({
    id: "journey:runtime",
    title: "Runtime target journey",
    profiles: [
      {
        id: "profile:managed",
        data: {},
        isDefault: true,
        runtimeTargetId: "local-dev",
      },
      {
        id: "profile:attached",
        data: {},
        runtimeTargetId: "compose-attached",
        runtime: {
          allowRunLifecycle: true,
          allowRunMutationTools: ["notes.create-owned"],
        },
      },
    ],
    phases: [
      {
        id: "phase:runtime",
        title: "Runtime phase",
        steps: [
          {
            id: "step:runtime",
            title: "Runtime step",
            execute: async () => ({ status: "passed" }),
          },
        ],
      },
    ],
  });
}

describe("Runtime Target registry", () => {
  it("normalizes managed and attached Runtime Targets and resolves the selected Journey Profile target", () => {
    const registry = createRuntimeTargetRegistry({
      targets: [
        managedRuntime({
          id: "local-dev",
          label: "Local dev stack",
          description: "Harness-managed local stack.",
        }),
        attachedRuntime({
          id: "compose-attached",
          label: "Docker Compose",
          description: "Externally started Compose runtime.",
          status: async () => ({
            status: "ready",
            summary: "Compose runtime is reachable.",
            services: [],
            artifacts: [],
            warnings: [],
            errors: [],
          }),
        }),
      ],
    });
    const journey = makeRuntimeJourney();

    expect(registry.list()).toEqual([
      expect.objectContaining({
        id: "local-dev",
        kind: "managed",
        label: "Local dev stack",
        capabilities: expect.arrayContaining(["status"]),
      }),
      expect.objectContaining({
        id: "compose-attached",
        kind: "attached",
        label: "Docker Compose",
        lifecycleOwner: "external",
        capabilities: expect.arrayContaining(["status"]),
      }),
    ]);
    expect(registry.resolveProfileTarget(journey.getProfile("profile:attached"))).toMatchObject({
      id: "compose-attached",
      kind: "attached",
    });
    expect(registry.profileAllowsRunMutation(journey.getProfile("profile:attached"), "notes.create-owned")).toBe(true);
    expect(registry.profileAllowsRunMutation(journey.getProfile("profile:managed"), "notes.create-owned")).toBe(false);
  });

  it("rejects duplicate target ids and unknown profile Runtime Targets", () => {
    expect(() =>
      createRuntimeTargetRegistry({
        targets: [
          attachedRuntime({ id: "target:one", status: async () => ({ status: "ready", summary: "ready", services: [], artifacts: [], warnings: [], errors: [] }) }),
          managedRuntime({ id: "target:one" }),
        ],
      }),
    ).toThrow("Duplicate Runtime Target id");

    const registry = createRuntimeTargetRegistry({ targets: [managedRuntime({ id: "local-dev" })] });
    expect(() =>
      registry.resolveProfileTarget({
        id: "profile:missing",
        data: {},
        runtimeTargetId: "missing-target",
      }),
    ).toThrow("Unknown Runtime Target");
  });
});
