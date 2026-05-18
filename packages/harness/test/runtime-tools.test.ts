import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import {
  attachedRuntime,
  defineRuntimeExploreTool,
  managedRuntime,
} from "@agent-e2e/harness/runtime";
import type { StackProvider } from "@agent-e2e/harness/stack";

type RuntimeToolHarness = HarnessTypes<
  { runId: string },
  Record<string, never>,
  Record<string, never>,
  { kind: "record"; id: string }
>;

function makeJourney() {
  return defineJourney<RuntimeToolHarness>({
    id: "journey:runtime-tools",
    title: "Runtime tools journey",
    profiles: [
      { id: "managed", data: {}, isDefault: true, runtimeTargetId: "local-dev" },
      { id: "attached", data: {}, runtimeTargetId: "compose" },
    ],
    phases: [
      {
        id: "phase",
        title: "Phase",
        steps: [{ id: "step", title: "Step", execute: async () => ({ status: "passed" }) }],
      },
    ],
  });
}

function stackProvider(): StackProvider<{ id: string }> {
  return {
    id: "local-stack",
    start: async () => ({ id: "stack-1" }),
    status: () => ({
      status: "ready",
      summary: "stack ready",
      services: [],
      artifacts: [],
      warnings: [],
      errors: [],
    }),
    stop: () => ({
      status: "stopped",
      summary: "stack stopped",
      services: [],
      artifacts: [],
      warnings: [],
      errors: [],
    }),
  };
}

describe("Runtime Tool Surface", () => {
  it("lists and reads status for configured Runtime Targets without hiding stack lifecycle tools", async () => {
    const router = createDevMcpToolRouter({
      journeys: [makeJourney()],
      stackProvider: stackProvider(),
      runtimeTargets: [
        managedRuntime({ id: "local-dev", label: "Local dev stack" }),
        attachedRuntime({
          id: "compose",
          label: "Docker Compose",
          description: "Externally started Compose runtime.",
          status: async () => ({
            status: "ready",
            summary: "Compose is reachable.",
            services: [{ id: "showcase-web", status: "ready", url: "http://127.0.0.1:3100" }],
            artifacts: [],
            warnings: [],
            errors: [],
          }),
        }),
      ],
    });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["runtime.list", "runtime.status", "stack.start", "stack.status", "stack.stop"]),
    );
    await expect(router.callTool("runtime.list")).resolves.toMatchObject({
      status: "ok",
      tool: "runtime.list",
      targets: [
        expect.objectContaining({ id: "local-dev", kind: "managed" }),
        expect.objectContaining({ id: "compose", kind: "attached", lifecycleOwner: "external" }),
      ],
    });
    await expect(router.callTool("runtime.status", { targetId: "compose" })).resolves.toMatchObject({
      status: "ok",
      tool: "runtime.status",
      targetId: "compose",
      runtime: {
        status: "ready",
        services: [{ id: "showcase-web", url: "http://127.0.0.1:3100" }],
      },
    });
  });

  it("does not expose runtime tools when no Runtime Targets are configured", () => {
    const router = createDevMcpToolRouter();
    expect(router.listTools().map((tool) => tool.name)).not.toContain("runtime.list");
  });

  it("describes runtime exploration tools with product-owned schemas", async () => {
    const router = createDevMcpToolRouter({
      runtimeTargets: [
        attachedRuntime({
          id: "compose",
          explore: [
            defineRuntimeExploreTool({
              id: "compose.ps",
              title: "List Compose services",
              description: "Observe externally started Compose services.",
              risk: "observation",
              input: z.object({}),
              output: z.object({ services: z.array(z.string()) }),
              run: async () => ({ services: ["web"] }),
            }),
          ],
        }),
      ],
    });

    await expect(router.callTool("runtime.explore.list", { targetId: "compose" })).resolves.toMatchObject({
      status: "ok",
      tools: [expect.objectContaining({ id: "compose.ps", risk: "observation" })],
    });
  });
});
