import { describe, expect, it } from "vitest";
import {
  defineJourney,
  type HarnessTypes,
  type ResourceAdapter,
} from "@agent-e2e/harness/core";
import { createMcpHarnessServer } from "@agent-e2e/harness/mcp";

type McpHarness = HarnessTypes<
  { runId: string },
  { label: string },
  { message: string },
  { kind: "record"; id: string }
>;

function makeMcpJourney() {
  return defineJourney<McpHarness>({
    id: "journey:mcp",
    title: "MCP journey",
    seed: ({ execution }) => ({
      environment: { created: [{ kind: "record", id: "record:seed" }] },
      artifacts: [
        {
          id: `artifact:seed:${execution?.runId ?? "none"}`,
          kind: "json",
          uri: "artifact://mcp/seed.json",
        },
      ],
    }),
    profiles: [{ id: "profile:mcp", data: { label: "MCP" }, isDefault: true }],
    phases: [
      {
        id: "phase:mcp",
        title: "MCP phase",
        steps: [
          {
            id: "step:mcp",
            title: "MCP step",
            execute: async ({ profile }) => ({
              status: "passed",
              observed: { message: profile.data.label },
              artifacts: [
                {
                  id: "artifact:mcp",
                  kind: "text",
                  uri: "artifact://mcp/message.txt",
                },
                {
                  id: "../secret",
                  kind: "text",
                  uri: "artifact://mcp/unsafe.txt",
                },
              ],
            }),
            proofs: [
              {
                id: "proof:mcp",
                title: "MCP proof",
                check: async ({ observed }) => observed.message === "MCP",
              },
            ],
          },
        ],
      },
    ],
  });
}

const adapter: ResourceAdapter<McpHarness> = {
  id: "record-adapter",
  supports: (resource) => resource.kind === "record",
  delete: async () => undefined,
};

describe("MCP Control Surface", () => {
  it("lists journeys/profiles and inspects contracts", async () => {
    const server = createMcpHarnessServer({ journeys: [makeMcpJourney()] });

    await expect(server.callTool("listJourneys", {})).resolves.toMatchObject({
      status: "ok",
      journeys: [{ id: "journey:mcp", profiles: [{ id: "profile:mcp" }] }],
    });
    await expect(
      server.callTool("inspectJourney", { journeyId: "journey:mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      contract: { id: "journey:mcp", phases: [{ id: "phase:mcp" }] },
    });
  });

  it("runs seed, begins a run, runs a step and a phase with structured guidance", async () => {
    const server = createMcpHarnessServer({ journeys: [makeMcpJourney()] });

    await expect(
      server.callTool("seedJourney", {
        journeyId: "journey:mcp",
        execution: { runId: "seed-explicit" },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      seedGate: {
        status: "ready",
        canRunSteps: true,
        manifest: { artifacts: [{ id: "artifact:seed:seed-explicit" }] },
      },
    });

    const begin = await server.callTool("beginRun", {
      journeyId: "journey:mcp",
      execution: { runId: "mcp-run" },
    });
    expect(begin).toMatchObject({ status: "ok", runId: "mcp-run" });

    const step = await server.callTool("runStep", {
      runId: "mcp-run",
      phaseId: "phase:mcp",
      stepId: "step:mcp",
    });
    expect(step).toMatchObject({ status: "ok", result: { status: "passed" } });
    expect(step.guidance).toEqual([
      { type: "continue", label: "Run complete", target: "run:complete" },
    ]);

    const phase = await server.callTool("runPhase", {
      runId: "mcp-run",
      phaseId: "phase:mcp",
    });
    expect(phase).toMatchObject({
      status: "ok",
      results: [{ status: "passed" }],
    });
  });

  it("safely reads only emitted artifacts", async () => {
    const server = createMcpHarnessServer({
      journeys: [makeMcpJourney()],
      artifactContents: { "artifact:mcp": "hello artifact" },
    });
    const begin = await server.callTool("beginRun", {
      journeyId: "journey:mcp",
      execution: { runId: "artifact-run" },
    });
    if (begin.status !== "ok") throw new Error("expected begin ok");
    await server.callTool("runStep", {
      runId: "artifact-run",
      phaseId: "phase:mcp",
      stepId: "step:mcp",
    });

    await expect(
      server.callTool("readArtifact", { artifactId: "artifact:mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      artifact: { id: "artifact:mcp" },
      content: "hello artifact",
    });
    await expect(
      server.callTool("readArtifact", { artifactId: "../secret" }),
    ).resolves.toMatchObject({
      status: "not-found",
      reason: "unsafe-artifact-id",
    });
  });

  it("exposes ledger-only cleanup plan and teardown tools", async () => {
    const server = createMcpHarnessServer({
      journeys: [makeMcpJourney()],
      resourceAdapters: [adapter],
    });
    const begin = await server.callTool("beginRun", {
      journeyId: "journey:mcp",
      execution: { runId: "cleanup-run" },
    });
    if (begin.status !== "ok") throw new Error("expected begin ok");

    await expect(
      server.callTool("cleanupPlan", { runId: "cleanup-run" }),
    ).resolves.toMatchObject({
      status: "ok",
      plan: { planned: [] },
    });
    await expect(
      server.callTool("teardown", {
        runId: "cleanup-run",
        requestedResources: [{ kind: "record", id: "record:unowned" }],
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { artifacts: { skipped: [{ reason: "not-owned" }] } },
    });
  });

  it("reseeds a run by cleaning only ledger-owned resources before creating the next run", async () => {
    const deleted: string[] = [];
    const deletingAdapter: ResourceAdapter<McpHarness> = {
      id: "record-delete",
      supports: (resource) => resource.kind === "record",
      delete: async (resource) => {
        deleted.push(resource.id);
      },
    };
    const server = createMcpHarnessServer({
      journeys: [makeMcpJourney()],
      resourceAdapters: [deletingAdapter],
    });
    const begin = await server.callTool("beginRun", {
      journeyId: "journey:mcp",
      execution: { runId: "reseed-run" },
    });
    if (begin.status !== "ok") throw new Error("expected begin ok");

    // Seed-created resources are baseline resources, so a reseed with no recorded
    // journey-owned resources has an empty cleanup plan.
    const reseed = await server.callTool("reseedRun", { runId: "reseed-run" });

    expect(reseed).toMatchObject({
      status: "ok",
      runId: "reseed-run",
      cleanup: {
        artifacts: { planned: [], deleted: [], skipped: [], failed: [] },
      },
      seedGate: {
        manifest: {
          environment: { created: [{ kind: "record", id: "record:seed" }] },
        },
      },
    });
    expect(deleted).toEqual([]);
  });
});
