import { describe, expect, it } from "vitest";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import { createMcpHarnessServer } from "../src/mcp/index.js";
import { attachedRuntime } from "@agent-e2e/harness/runtime";
import type { StackProvider } from "@agent-e2e/harness/stack";

type AttachedRunHarness = HarnessTypes<
  { runId: string; runtime?: { targetId: string } },
  Record<string, never>,
  { targetId?: string },
  { kind: "record"; id: string }
>;

function makeAttachedRunJourney() {
  return defineJourney<AttachedRunHarness>({
    id: "journey:attached-run",
    title: "Attached run journey",
    profiles: [
      {
        id: "attached",
        data: {},
        isDefault: true,
        runtimeTargetId: "compose",
        runtime: { allowRunLifecycle: true },
      },
    ],
    seed: ({ profile }) => ({
      environment: {
        checked: [{ kind: "record", id: `seed:${profile.id}` }],
      },
    }),
    phases: [
      {
        id: "phase",
        title: "Phase",
        steps: [
          {
            id: "step",
            title: "Step",
            execute: async ({ execution }) => ({
              status: "passed",
              observed: { targetId: execution.runtime?.targetId },
            }),
          },
        ],
      },
    ],
  });
}

function managedStackProvider(): StackProvider<{ id: string }> {
  return {
    id: "managed-stack",
    start: async () => ({ id: "stack" }),
    status: () => ({ status: "ready", summary: "ready", services: [], artifacts: [], warnings: [], errors: [] }),
    stop: () => ({ status: "stopped", summary: "stopped", services: [], artifacts: [], warnings: [], errors: [] }),
  };
}

describe("profile-selected Runtime Target runs", () => {
  it("rejects free targetId overrides and binds run.begin to the selected Journey Profile Runtime Target", async () => {
    const journey = makeAttachedRunJourney();
    const router = createDevMcpToolRouter({
      journeys: [journey],
      harness: createMcpHarnessServer({ journeys: [journey] }),
      stackProvider: managedStackProvider(),
      runtimeTargets: [
        attachedRuntime({
          id: "compose",
          status: async () => ({ status: "ready", summary: "ready", services: [], artifacts: [], warnings: [], errors: [] }),
        }),
      ],
    });

    await expect(
      router.callTool("run.begin", {
        journeyId: "journey:attached-run",
        profileId: "attached",
        targetId: "other",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-target-override-unsupported",
    });

    const begin = await router.callTool("run.begin", {
      journeyId: "journey:attached-run",
      profileId: "attached",
      runId: "attached-run",
    });
    expect(begin).toMatchObject({
      status: "ok",
      runId: "attached-run",
      runtimeTargetId: "compose",
      runtimeBinding: { targetId: "compose", kind: "attached" },
    });
    await expect(
      router.callTool("journey.step", {
        runId: "attached-run",
        phaseId: "phase",
        stepId: "step",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: {
        status: "passed",
        observed: { targetId: "compose" },
      },
    });
  });
});
