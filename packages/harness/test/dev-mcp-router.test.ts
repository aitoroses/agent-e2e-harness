import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod/v4";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import { createMcpHarnessServer } from "../src/mcp/index.js";
import {
  createProcessStackProvider,
  defineStackCapabilities,
  type StackExecutionSurface,
  type StackStartContext,
  type StackProvider,
} from "@agent-e2e/harness/stack";

type RouterHarness = HarnessTypes<
  { runId: string; marker?: string },
  Record<string, never>,
  { message: string },
  { kind: "record"; id: string }
>;

function makeRouterJourney() {
  return defineJourney<RouterHarness>({
    id: "journey:router",
    title: "Router journey",
    seed: () => ({
      environment: {
        created: [{ kind: "record", id: "record:seed-baseline" }],
      },
    }),
    profiles: [{ id: "profile:router", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:router",
        title: "Router phase",
        steps: [
          {
            id: "step:router",
            title: "Router step",
            execute: async ({ execution }) => ({
              status: "passed",
              observed: { message: execution.marker ?? "router" },
            }),
          },
        ],
      },
    ],
  });
}

type FailureHarness = HarnessTypes<
  { runId: string; page: { screenshot: (options: { path: string }) => Promise<void> } },
  Record<string, never>,
  { message: string },
  { kind: "record"; id: string }
>;

function makeFailingJourney() {
  return defineJourney<FailureHarness>({
    id: "journey:failing",
    title: "Failing journey",
    seed: () => ({ environment: { checked: [{ kind: "record", id: "record:ready" }] } }),
    profiles: [{ id: "profile:failing", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:failing",
        title: "Failing phase",
        steps: [
          {
            id: "step:failing",
            title: "Failing step",
            execute: async () => ({
              status: "failed",
              observed: { message: "failure observed" },
              errors: ["Intentional validation failure"],
            }),
          },
        ],
      },
    ],
  });
}

type StackBoundHarness = HarnessTypes<
  { runId: string; stack?: StackExecutionSurface },
  Record<string, never>,
  { message: string },
  { kind: "record"; id: string }
>;

function makeStackBoundJourney() {
  const stackMessage = (execution: StackBoundHarness["executionSurface"]) =>
    execution.stack?.services[0]?.url ?? "missing-stack";

  return defineJourney<StackBoundHarness>({
    id: "journey:stack-bound",
    title: "Stack-bound journey",
    seed: () => ({ environment: { checked: [{ kind: "record", id: "record:ready" }] } }),
    profiles: [{ id: "profile:stack-bound", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:one",
        title: "Phase one",
        steps: [
          {
            id: "step:one",
            title: "Step one",
            execute: async ({ execution }) => ({
              status: "passed",
              observed: { message: stackMessage(execution) },
            }),
          },
        ],
      },
      {
        id: "phase:two",
        title: "Phase two",
        steps: [
          {
            id: "step:two",
            title: "Step two",
            execute: async ({ execution }) => ({
              status: "passed",
              observed: { message: stackMessage(execution) },
            }),
          },
        ],
      },
    ],
  });
}

describe("Dev MCP Tool Router", () => {
  it("lists no tools until capabilities are injected", async () => {
    const router = createDevMcpToolRouter();

    expect(router.listTools().map((tool) => tool.name)).toEqual([]);
    await expect(router.callTool("harness.probe")).resolves.toMatchObject({
      status: "not-found",
      tool: "harness.probe",
      subject: "tool",
    });
  });

  it("routes journey and reseed tools through the execution-neutral harness seam", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-"));
    const harness = createMcpHarnessServer({ journeys: [makeRouterJourney()], artifactRoot });
    const router = createDevMcpToolRouter({
      harness,
      browserSessions: {
        open: async () => ({ browserSessionId: "browser-1" }),
        snapshot: async (browserSessionId) => ({ browserSessionId, refs: [] }),
        close: async (browserSessionId) => ({ status: "closed", browserSessionId }),
        list: () => [],
        execution: (browserSessionId) => ({ runId: "router-run", marker: `execution:${browserSessionId}` }),
      },
    });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "journey.list",
        "journey.inspect",
        "run.begin",
        "run.reseed",
        "cleanup.plan",
      ]),
    );

    await expect(router.callTool("journey.list")).resolves.toMatchObject({
      status: "ok",
      tool: "journey.list",
      journeys: [{ id: "journey:router" }],
    });
    await expect(
      router.callTool("journey.inspect", { journeyId: "journey:router" }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "journey.inspect",
      contract: {
        id: "journey:router",
        title: "Router journey",
        profiles: [{ id: "profile:router" }],
        phases: [
          {
            id: "phase:router",
            steps: [{ id: "step:router" }],
          },
        ],
      },
    });

    const begin = await router.callTool("run.begin", {
      journeyId: "journey:router",
      execution: { runId: "router-run" },
    });
    expect(begin).toMatchObject({
      status: "ok",
      tool: "run.begin",
      runId: "router-run",
      artifactDir: expect.stringContaining("journey-router/router-run"),
      artifacts: expect.arrayContaining([
        expect.objectContaining({ name: "seed-manifest" }),
      ]),
    });
    const seedArtifact = (begin.artifacts as Array<{ path: string }>)[0];
    expect(existsSync(seedArtifact.path)).toBe(true);

    await expect(
      router.callTool("artifact.read", { path: seedArtifact.path }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        environment: {
          created: [{ kind: "record", id: "record:seed-baseline" }],
        },
      },
    });

    const step = await router.callTool("journey.step", {
      runId: "router-run",
      phaseId: "phase:router",
      stepId: "step:router",
      browserSessionId: "browser-1",
    });
    expect(step).toMatchObject({
      status: "ok",
      tool: "journey.step",
      artifactDir: expect.stringContaining("journey-router/router-run"),
      result: {
        status: "passed",
        observed: { message: "execution:browser-1" },
        artifacts: expect.arrayContaining([
          expect.objectContaining({ name: "console", kind: "console-log" }),
          expect.objectContaining({ name: "network", kind: "network-log" }),
          expect.objectContaining({ name: "result", kind: "json" }),
          expect.objectContaining({ name: "step-feedback", kind: "json" }),
        ]),
        stepFeedbackArtifact: expect.objectContaining({ name: "step-feedback" }),
      },
    });
    const stepArtifacts = (step.result as { artifacts: Array<{ path: string }> }).artifacts;
    expect(stepArtifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("01-phase-phase-router/01-step-step-router/result.json"),
        expect.stringContaining("01-phase-phase-router/01-step-step-router/step-feedback.json"),
      ]),
    );
    expect(stepArtifacts.every((artifact) => !artifact.path.includes("/ui-e2e/"))).toBe(true);
    expect(stepArtifacts.every((artifact) => !artifact.path.includes("/steps/"))).toBe(true);

    await expect(
      router.callTool("run.reseed", { runId: "router-run" }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "run.reseed",
      cleanup: { artifacts: { planned: [] } },
      seedGate: {
        manifest: {
          environment: {
            created: [{ kind: "record", id: "record:seed-baseline" }],
          },
        },
      },
    });
    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("journey.untilStep lands the managed state at a target step and is deterministic", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-until-step-"));
    const journey = defineJourney<RouterHarness>({
      id: "journey:frames",
      title: "Frames journey",
      seed: () => ({ environment: { created: [] } }),
      profiles: [{ id: "profile:frames", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:frames",
          title: "Frames phase",
          steps: [
            { id: "step:a", title: "Frame A", execute: async () => ({ status: "passed", observed: { message: "a" } }) },
            { id: "step:b", title: "Frame B", execute: async () => ({ status: "passed", observed: { message: "b" } }) },
            { id: "step:c", title: "Frame C", execute: async () => ({ status: "passed", observed: { message: "c" } }) },
          ],
        },
      ],
    });
    const harness = createMcpHarnessServer({ journeys: [journey], artifactRoot });
    const router = createDevMcpToolRouter({ harness });

    await router.callTool("run.begin", {
      journeyId: "journey:frames",
      execution: { runId: "frames-run" },
    });

    // Lands at step:b: runs the phase from its first step up to AND INCLUDING the
    // target step, and parks the managed state at that frame (results.at(-1)).
    const landed = await router.callTool("journey.untilStep", {
      runId: "frames-run",
      phaseId: "phase:frames",
      stepId: "step:b",
    });
    expect(landed).toMatchObject({
      status: "ok",
      tool: "journey.untilStep",
      results: [
        expect.objectContaining({ stepId: "step:a", status: "passed" }),
        expect.objectContaining({ stepId: "step:b", status: "passed", observed: { message: "b" } }),
      ],
    });
    const landedResults = landed.results as Array<{ stepId: string }>;
    expect(landedResults).toHaveLength(2);
    expect(landedResults.at(-1)?.stepId).toBe("step:b");
    // step:c is past the target frame and must not have run.
    expect(landedResults.some((result) => result.stepId === "step:c")).toBe(false);

    // Deterministic / idempotent: a second identical call lands at the same frame.
    const again = await router.callTool("journey.untilStep", {
      runId: "frames-run",
      phaseId: "phase:frames",
      stepId: "step:b",
    });
    expect((again.results as Array<{ stepId: string }>).map((result) => result.stepId)).toEqual([
      "step:a",
      "step:b",
    ]);

    // Unknown step → coherent not-found envelope (same shape as the other journey tools).
    await expect(
      router.callTool("journey.untilStep", {
        runId: "frames-run",
        phaseId: "phase:frames",
        stepId: "step:missing",
      }),
    ).resolves.toMatchObject({ status: "not-found", tool: "journey.untilStep", subject: "step" });

    // Unknown phase → coherent not-found envelope.
    await expect(
      router.callTool("journey.untilStep", {
        runId: "frames-run",
        phaseId: "phase:missing",
        stepId: "step:a",
      }),
    ).resolves.toMatchObject({ status: "not-found", tool: "journey.untilStep", subject: "phase" });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("normalizes unsupported harness response status at the Dev MCP seam", async () => {
    const router = createDevMcpToolRouter({
      harness: {
        callTool: async () => ({ status: "mystery" }) as never,
      },
    });

    await expect(router.callTool("journey.list")).resolves.toMatchObject({
      status: "error",
      tool: "journey.list",
      error: "Unsupported tool response status: mystery",
    });
  });

  it("returns first-class failure artifacts when a journey step fails", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-failure-"));
    const harness = createMcpHarnessServer({
      journeys: [makeFailingJourney()],
      artifactRoot,
    });
    const router = createDevMcpToolRouter({ harness });

    const execution = {
      runId: "failure-run",
      page: {
        screenshot: async ({ path }: { path: string }) => {
          await writeFile(path, "fake png bytes");
        },
      },
    };
    await expect(
      router.callTool("run.begin", {
        journeyId: "journey:failing",
        execution,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      runId: "failure-run",
    });

    const step = await router.callTool("journey.step", {
      runId: "failure-run",
      phaseId: "phase:failing",
      stepId: "step:failing",
    });

    expect(step).toMatchObject({
      status: "ok",
      result: {
        status: "failed",
        artifacts: expect.arrayContaining([
          expect.objectContaining({ name: "before", kind: "screenshot" }),
          expect.objectContaining({ name: "failure", kind: "screenshot" }),
          expect.objectContaining({ name: "step-feedback", kind: "json" }),
        ]),
        stepFeedbackArtifact: expect.objectContaining({ name: "step-feedback" }),
      },
    });
    const artifacts = (step.result as { artifacts: Array<{ name?: string; path: string }> }).artifacts;
    const failureArtifact = artifacts.find((artifact) => artifact.name === "failure");
    const feedbackArtifact = artifacts.find((artifact) => artifact.name === "step-feedback");
    expect(failureArtifact?.path).toContain("01-phase-phase-failing/01-step-step-failing/failure.png");
    expect(existsSync(failureArtifact?.path ?? "")).toBe(true);
    await expect(
      router.callTool("artifact.read", { path: failureArtifact?.path }),
    ).resolves.toMatchObject({
      status: "ok",
      encoding: "base64",
    });
    await expect(
      router.callTool("artifact.read", { path: feedbackArtifact?.path }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        status: "failed",
        artifacts: {
          primary: expect.arrayContaining([
            expect.objectContaining({ name: "failure" }),
            expect.objectContaining({ name: "result" }),
          ]),
        },
      },
    });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("starts multiple named Stack Instances and lists them through the Dev MCP router", async () => {
    const events: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "fake-stack",
      start: async () => {
        const id = `handle-${events.length + 1}`;
        events.push(`start:${id}`);
        return { id };
      },
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [
          { id: "next", status: "ready", url: "http://127.0.0.1:3000" },
        ],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: (handle) => {
        events.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: `stopped:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["stack.start", "stack.list", "stack.status", "stack.stop"]),
    );
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [],
    });
    await expect(router.callTool("stack.start", { stackId: "alpha" })).resolves.toMatchObject({
      status: "ok",
      stackId: "alpha",
      handle: { id: "handle-1" },
      stack: { status: "ready" },
    });
    await expect(router.callTool("stack.start", { stackId: "beta" })).resolves.toMatchObject({
      status: "ok",
      stackId: "beta",
      handle: { id: "handle-2" },
      stack: { status: "ready" },
    });
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [
        { stackId: "alpha", stack: { status: "ready", summary: "ready:handle-1" } },
        { stackId: "beta", stack: { status: "ready", summary: "ready:handle-2" } },
      ],
    });
    await expect(router.callTool("stack.status", { stackId: "beta" })).resolves.toMatchObject({
      status: "ok",
      stack: { status: "ready", summary: "ready:handle-2" },
    });
    await expect(router.callTool("stack.stop", { stackId: "alpha" })).resolves.toMatchObject({
      status: "ok",
      stack: { status: "stopped", summary: "stopped:handle-1" },
    });
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [
        { stackId: "beta", stack: { status: "ready", summary: "ready:handle-2" } },
      ],
    });
    expect(events).toEqual(["start:handle-1", "start:handle-2", "stop:handle-1"]);
  });

  it("passes a dev-mode StackStartContext to providers and returns recorded allocations", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-stack-"));
    const contexts: StackStartContext[] = [];
    const provider: StackProvider<{ portUrl: string; logPath: string }> = {
      id: "context-stack",
      start: async (ctx) => {
        contexts.push(ctx);
        const port = await ctx.allocatePort("app");
        const log = ctx.allocateArtifactPath("app log", { kind: "file", extension: "log" });
        return { portUrl: port.url, logPath: log.path };
      },
      status: (handle) => ({
        status: "ready",
        summary: "ready",
        services: [{ id: "app", status: "ready", url: handle.portUrl }],
        artifacts: [{ id: "app-log", kind: "log", uri: `file://${handle.logPath}` }],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider, artifactRoot });

    await expect(router.callTool("stack.start", { stackId: "dev-main" })).resolves.toMatchObject({
      status: "ok",
      stackId: "dev-main",
      stack: { services: [{ url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/) }] },
      allocations: [
        {
          kind: "port",
          name: "app",
          stackId: "dev-main",
          resource: {
            host: "127.0.0.1",
            url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
          },
        },
        {
          kind: "artifact-file",
          name: "app log",
          stackId: "dev-main",
          resource: {
            path: expect.stringContaining("/stacks/dev-main/app-log.log"),
            uri: expect.stringContaining("/stacks/dev-main/app-log.log"),
          },
        },
      ],
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      mode: "dev",
      stackId: "dev-main",
      workerCount: 1,
      artifactScope: { stackDir: join(artifactRoot, "stacks", "dev-main") },
    });
    expect(contexts[0]?.workerIndex).toBeUndefined();
    expect(contexts[0]?.suiteId).toBeUndefined();
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [
        {
          stackId: "dev-main",
          allocations: expect.arrayContaining([
            expect.objectContaining({ kind: "port", name: "app" }),
          ]),
        },
      ],
    });
    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("rejects stack-targeting tools without stackId instead of falling back to the first Stack Instance", async () => {
    const calls: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "explicit-stack-id-required",
      capabilities: defineStackCapabilities<{ id: string }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ count: z.number().int() }),
          run: ({ input, handle }) => {
            calls.push(`capability:${handle.id}`);
            return { count: input.limit };
          },
        },
      ]),
      start: async () => {
        calls.push("start");
        return { id: "generated-handle" };
      },
      status: (handle) => {
        calls.push(`status:${handle.id}`);
        return {
          status: "ready",
          summary: `ready:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
      logs: (handle, input) => {
        calls.push(`logs:${handle.id}`);
        return {
          status: "ok",
          summary: `logs:${handle.id}`,
          serviceId: input.serviceId,
          stream: input.stream ?? "combined",
          tail: input.tail,
          entries: [],
          truncated: false,
        };
      },
      stop: (handle) => {
        calls.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: `stopped:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "ok",
      stackId: "stack-1",
    });
    calls.length = 0;

    await expect(router.callTool("stack.status")).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(
      router.callTool("stack.logs", { serviceId: "next-dev", tail: 10 }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(
      router.callTool("stack.capability.run", { toolId: "notes.count", input: { limit: 1 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(router.callTool("stack.stop")).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(router.callTool("stack.capability.list")).resolves.toMatchObject({
      status: "ok",
      tools: [expect.objectContaining({ id: "notes.count" })],
    });
    expect(calls).toEqual([]);
  });

  it("rejects duplicate caller-provided Stack Instance ids before starting another handle", async () => {
    const calls: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "duplicate-stack-id",
      start: async () => {
        calls.push("start");
        return { id: `handle-${calls.length}` };
      },
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: (handle) => {
        calls.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: `stopped:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await expect(router.callTool("stack.start", { stackId: "alpha" })).resolves.toMatchObject({
      status: "ok",
      stackId: "alpha",
    });
    await expect(router.callTool("stack.start", { stackId: "alpha" })).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-already-running",
      message: expect.stringContaining("alpha"),
    });
    expect(calls).toEqual(["start"]);
  });

  it("rejects unknown explicit Stack Instance ids as stack-not-running preconditions", async () => {
    const provider: StackProvider<{ id: string }> = {
      id: "unknown-stack-id",
      capabilities: defineStackCapabilities<{ id: string }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ count: z.number().int() }),
          run: ({ input }) => ({ count: input.limit }),
        },
      ]),
      start: async () => ({ id: "handle-alpha" }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      logs: () => ({
        status: "ok",
        summary: "logs",
        serviceId: "next-dev",
        stream: "combined",
        tail: 10,
        entries: [],
        truncated: false,
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await router.callTool("stack.start", { stackId: "alpha" });
    await expect(router.callTool("stack.stop", { stackId: "missing" })).resolves.toMatchObject({
      status: "blocked",
      code: "stack-not-running",
    });
    await expect(
      router.callTool("stack.capability.run", { stackId: "missing", toolId: "notes.count", input: { limit: 1 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-not-running",
    });
  });

  it("requires run.begin to bind a valid Stack Instance when a stack provider exists", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-binding-"));
    const harness = createMcpHarnessServer({ journeys: [makeRouterJourney()], artifactRoot });
    const provider: StackProvider<{ id: string }> = {
      id: "binding-stack",
      start: async () => ({ id: "handle-alpha" }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };

    const router = createDevMcpToolRouter({ harness, stackProvider: provider });
    await expect(
      router.callTool("run.begin", {
        journeyId: "journey:router",
        runId: "missing-binding",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-stack-id-required",
      message: expect.stringContaining("stackId"),
    });
    await expect(
      router.callTool("run.begin", {
        journeyId: "journey:router",
        runId: "unknown-binding",
        stackId: "missing",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-not-running",
    });

    const noProviderRouter = createDevMcpToolRouter({ harness });
    await expect(
      noProviderRouter.callTool("run.begin", {
        journeyId: "journey:router",
        runId: "no-provider",
        stackId: "alpha",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-stack-provider-missing",
      message: expect.stringContaining("no stack provider"),
    });

    await router.callTool("stack.start", { stackId: "alpha" });
    const begin = await router.callTool("run.begin", {
      journeyId: "journey:router",
      runId: "bound-run",
      stackId: "alpha",
    });
    expect(begin).toMatchObject({
      status: "ok",
      runId: "bound-run",
      stackId: "alpha",
      stackBinding: { stackId: "alpha" },
    });
    const resultArtifact = (begin.artifacts as Array<{ name?: string; path: string }>).find(
      (artifact) => artifact.name === "result",
    );
    await expect(
      router.callTool("artifact.read", { path: resultArtifact?.path }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        runId: "bound-run",
        stackId: "alpha",
        stackBinding: { stackId: "alpha" },
      },
    });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("executes journey steps and phases through the run's bound Stack Instance", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-bound-execution-"));
    const harness = createMcpHarnessServer({ journeys: [makeStackBoundJourney()], artifactRoot });
    const stackUrls = new Map<string, string>();
    const provider: StackProvider<{ id: string; url: string }> = {
      id: "execution-binding-stack",
      start: async (ctx) => {
        const url = `http://127.0.0.1/${ctx.stackId}/initial`;
        stackUrls.set(ctx.stackId, url);
        return { id: ctx.stackId, url };
      },
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [{ id: "app", status: "ready", url: stackUrls.get(handle.id) ?? handle.url }],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: (handle) => ({
        status: "stopped",
        summary: `stopped:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ harness, stackProvider: provider });

    await router.callTool("stack.start", { stackId: "alpha" });
    await router.callTool("run.begin", {
      journeyId: "journey:stack-bound",
      runId: "bound-step-run",
      stackId: "alpha",
    });
    await router.callTool("stack.start", { stackId: "beta" });
    stackUrls.set("alpha", "http://127.0.0.1/alpha/step-current");
    stackUrls.set("beta", "http://127.0.0.1/beta/current");

    await expect(
      router.callTool("journey.step", {
        runId: "bound-step-run",
        phaseId: "phase:one",
        stepId: "step:one",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { observed: { message: "http://127.0.0.1/alpha/step-current" } },
    });
    await expect(router.callTool("stack.stop", { stackId: "beta" })).resolves.toMatchObject({
      status: "ok",
    });
    await router.callTool("run.begin", {
      journeyId: "journey:stack-bound",
      runId: "bound-phase-run",
      stackId: "alpha",
    });
    stackUrls.set("alpha", "http://127.0.0.1/alpha/phase-current");
    await expect(
      router.callTool("journey.phase", {
        runId: "bound-phase-run",
        phaseId: "phase:two",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      results: [
        expect.objectContaining({ observed: { message: "http://127.0.0.1/alpha/phase-current" } }),
      ],
    });

    await router.callTool("run.begin", {
      journeyId: "journey:stack-bound",
      runId: "bound-until-run",
      stackId: "alpha",
    });
    stackUrls.set("alpha", "http://127.0.0.1/alpha/until-current");
    await expect(
      router.callTool("journey.untilPhase", {
        runId: "bound-until-run",
        phaseId: "phase:one",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      results: [
        expect.objectContaining({ observed: { message: "http://127.0.0.1/alpha/until-current" } }),
      ],
    });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("uses runId on stack tools only to capture artifacts for matching Run Stack Bindings", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-stack-evidence-"));
    const harness = createMcpHarnessServer({ journeys: [makeRouterJourney()], artifactRoot });
    const provider: StackProvider<{ id: string }> = {
      id: "stack-evidence",
      capabilities: defineStackCapabilities<{ id: string }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ stackId: z.string(), count: z.number().int() }),
          run: ({ input, handle }) => ({ stackId: handle.id, count: input.limit }),
        },
      ]),
      start: async (ctx) => ({ id: ctx.stackId }),
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [{ id: "app", status: "ready", url: `http://127.0.0.1/${handle.id}` }],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      logs: (handle, input) => ({
        status: "ok",
        summary: `logs:${handle.id}`,
        serviceId: input.serviceId,
        stream: input.stream ?? "combined",
        tail: input.tail,
        entries: [{ stream: "stdout", message: `from:${handle.id}` }],
        truncated: false,
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ harness, stackProvider: provider, artifactRoot });

    await router.callTool("stack.start", { stackId: "alpha" });
    await router.callTool("stack.start", { stackId: "beta" });
    await router.callTool("run.begin", {
      journeyId: "journey:router",
      runId: "evidence-run",
      stackId: "alpha",
    });

    const betaLogs = await router.callTool("stack.logs", {
      stackId: "beta",
      serviceId: "app",
      tail: 5,
    });
    expect(betaLogs).toMatchObject({
      status: "ok",
      logs: { summary: "logs:beta" },
    });
    expect(betaLogs.artifact).toBeUndefined();

    await expect(
      router.callTool("stack.logs", {
        stackId: "beta",
        runId: "evidence-run",
        serviceId: "app",
        tail: 5,
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-stack-binding-mismatch",
    });
    await expect(
      router.callTool("stack.capability.run", {
        stackId: "beta",
        runId: "evidence-run",
        toolId: "notes.count",
        input: { limit: 2 },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-stack-binding-mismatch",
    });

    const logs = await router.callTool("stack.logs", {
      stackId: "alpha",
      runId: "evidence-run",
      serviceId: "app",
      tail: 5,
    });
    expect(logs).toMatchObject({
      status: "ok",
      logs: { summary: "logs:alpha" },
      artifact: expect.objectContaining({ name: "stack-logs", kind: "json" }),
    });
    await expect(
      router.callTool("artifact.read", { path: (logs.artifact as { path: string }).path }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        runId: "evidence-run",
        stackId: "alpha",
        tool: "stack.logs",
        logs: { summary: "logs:alpha" },
      },
    });

    const capability = await router.callTool("stack.capability.run", {
      stackId: "alpha",
      runId: "evidence-run",
      toolId: "notes.count",
      input: { limit: 3 },
    });
    expect(capability).toMatchObject({
      status: "ok",
      toolId: "notes.count",
      output: { stackId: "alpha", count: 3 },
      artifact: expect.objectContaining({ name: "stack-capability-notes.count", kind: "json" }),
    });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("preserves Run Stack Binding when reseed renames the run", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-router-reseed-binding-"));
    const harness = createMcpHarnessServer({ journeys: [makeStackBoundJourney()], artifactRoot });
    const stackUrls = new Map<string, string>();
    const provider: StackProvider<{ id: string }> = {
      id: "reseed-binding-stack",
      start: async (ctx) => {
        stackUrls.set(ctx.stackId, `http://127.0.0.1/${ctx.stackId}/initial`);
        return { id: ctx.stackId };
      },
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [{ id: "app", status: "ready", url: stackUrls.get(handle.id) ?? "" }],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      logs: (handle, input) => ({
        status: "ok",
        summary: `logs:${handle.id}`,
        serviceId: input.serviceId,
        stream: input.stream ?? "combined",
        tail: input.tail,
        entries: [{ stream: "stdout", message: `from:${handle.id}` }],
        truncated: false,
      }),
      stop: (handle) => ({
        status: "stopped",
        summary: `stopped:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ harness, stackProvider: provider, artifactRoot });

    await router.callTool("stack.start", { stackId: "alpha" });
    await router.callTool("stack.start", { stackId: "beta" });
    await router.callTool("run.begin", {
      journeyId: "journey:stack-bound",
      runId: "before-reseed",
      stackId: "alpha",
    });

    await expect(
      router.callTool("run.reseed", {
        runId: "before-reseed",
        newRunId: "after-reseed",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      runId: "after-reseed",
    });

    stackUrls.set("alpha", "http://127.0.0.1/alpha/after-reseed");
    stackUrls.set("beta", "http://127.0.0.1/beta/after-reseed");
    await expect(
      router.callTool("journey.step", {
        runId: "after-reseed",
        phaseId: "phase:one",
        stepId: "step:one",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { observed: { message: "http://127.0.0.1/alpha/after-reseed" } },
    });

    const logs = await router.callTool("stack.logs", {
      stackId: "alpha",
      runId: "after-reseed",
      serviceId: "app",
      tail: 5,
    });
    expect(logs).toMatchObject({
      status: "ok",
      logs: { summary: "logs:alpha" },
      artifact: expect.objectContaining({ name: "stack-logs", kind: "json" }),
    });
    await expect(
      router.callTool("artifact.read", { path: (logs.artifact as { path: string }).path }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        runId: "after-reseed",
        stackId: "alpha",
        tool: "stack.logs",
      },
    });

    await expect(
      router.callTool("stack.logs", {
        stackId: "beta",
        runId: "after-reseed",
        serviceId: "app",
        tail: 5,
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "run-stack-binding-mismatch",
    });

    await router.callTool("stack.stop", { stackId: "alpha" });
    await expect(
      router.callTool("journey.step", {
        runId: "after-reseed",
        phaseId: "phase:two",
        stepId: "step:two",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-not-running",
    });

    await rm(artifactRoot, { recursive: true, force: true });
  });

  it("returns unified stack state and live provider logs through stack tools", async () => {
    const provider: StackProvider<{ id: string }> = {
      id: "observable-stack",
      start: async () => ({ id: "stack-1" }),
      status: (handle) => ({
        status: "ready",
        summary: `ready:${handle.id}`,
        services: [
          {
            id: "next-dev",
            kind: "web",
            status: "ready",
            endpoints: [
              {
                id: "app",
                kind: "http",
                url: "http://127.0.0.1:3000",
                sensitive: false,
              },
            ],
            checks: [
              {
                id: "http.ready",
                status: "passed",
                summary: "GET /api/notes returned 200.",
              },
            ],
          },
        ],
        artifacts: [],
        warnings: [],
        errors: [],
        next: {
          actions: [
            {
              id: "read-logs",
              tool: "stack.logs",
              why: "Read recent app process logs.",
            },
          ],
        },
      }),
      logs: (handle, input) => ({
        status: "ok",
        summary: `read ${input.tail} lines from ${input.serviceId} on ${handle.id}`,
        serviceId: input.serviceId,
        stream: input.stream ?? "combined",
        tail: input.tail,
        entries: [
          { stream: "stdout", message: "ready - started server on 127.0.0.1:3000" },
          { stream: "stderr", message: "warning - route compiled with warnings" },
        ],
        truncated: false,
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["stack.start", "stack.status", "stack.stop", "stack.logs"]),
    );
    await expect(router.callTool("stack.start", { stackId: "observable" })).resolves.toMatchObject({
      status: "ok",
      stackId: "observable",
      stack: {
        status: "ready",
        services: [
          {
            id: "next-dev",
            kind: "web",
            endpoints: [{ id: "app", kind: "http" }],
            checks: [{ id: "http.ready", status: "passed" }],
          },
        ],
        next: {
          actions: [
            {
              tool: "stack.logs",
            },
          ],
        },
      },
    });
    await expect(
      router.callTool("stack.logs", { stackId: "observable", serviceId: "next-dev", tail: 80, stream: "combined" }),
    ).resolves.toMatchObject({
      status: "ok",
      logs: {
        status: "ok",
        serviceId: "next-dev",
        stream: "combined",
        tail: 80,
        entries: [
          { stream: "stdout", message: expect.stringContaining("started server") },
          { stream: "stderr", message: expect.stringContaining("warning") },
        ],
        truncated: false,
      },
    });
  });

  it("requires stack.logs tail and an active provider log implementation", async () => {
    const provider: StackProvider<{ id: string }> = {
      id: "no-logs-stack",
      start: async () => ({ id: "stack-1" }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await expect(
      router.callTool("stack.logs", { serviceId: "next-dev", tail: 10 }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });

    await router.callTool("stack.start", { stackId: "no-logs" });
    await expect(
      router.callTool("stack.logs", { stackId: "no-logs", serviceId: "next-dev" }),
    ).resolves.toMatchObject({
      status: "error",
      tool: "stack.logs",
      error: "Missing required positive integer argument: tail",
    });
    await expect(
      router.callTool("stack.logs", { stackId: "no-logs", serviceId: "next-dev", tail: 10 }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-logs-not-supported",
    });
  });

  it("lists provider-declared stack capabilities before the stack starts", async () => {
    const capabilities = defineStackCapabilities<{ id: string }>()([
      {
        id: "notes.list",
        title: "List proof notes",
        description: "Read proof notes from the application database.",
        availableIn: ["dev", "verify"],
        risk: "none",
        input: z.object({ limit: z.number().int().positive().optional() }),
        output: z.object({
          notes: z.array(z.object({ id: z.string(), body: z.string() })),
        }),
        run: ({ input, handle }) => ({
          notes: [{ id: handle.id, body: String(input.limit ?? 10) }],
        }),
      },
      {
        id: "postgres.query",
        title: "Run PostgreSQL query",
        description: "Run a SQL query against the local showcase database.",
        availableIn: ["dev"],
        risk: "local-mutation",
        input: z.object({ sql: z.string().min(1) }),
        output: z.object({ rows: z.array(z.unknown()), rowCount: z.number().nullable() }),
        run: () => ({ rows: [], rowCount: 0 }),
      },
    ]);
    const provider: StackProvider<{ id: string }> = {
      id: "explorable-stack",
      capabilities,
      start: async () => {
        throw new Error("stack.capability.list must not start the stack");
      },
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["stack.capability.list"]),
    );
    await expect(router.callTool("stack.capability.list")).resolves.toMatchObject({
      status: "ok",
      tool: "stack.capability.list",
      tools: [
        {
          id: "notes.list",
          availableIn: ["dev", "verify"],
          risk: "none",
          inputSchema: expect.objectContaining({ type: "object" }),
          outputSchema: expect.objectContaining({ type: "object" }),
        },
        {
          id: "postgres.query",
          availableIn: ["dev"],
          risk: "local-mutation",
          inputSchema: expect.objectContaining({ type: "object" }),
          outputSchema: expect.objectContaining({ type: "object" }),
        },
      ],
    });
    await expect(router.callTool("stack.capability.list")).resolves.toMatchObject({
      status: "ok",
      tool: "stack.capability.list",
      tools: [
        {
          id: "notes.list",
          availableIn: ["dev", "verify"],
          risk: "none",
          inputSchema: expect.objectContaining({ type: "object" }),
          outputSchema: expect.objectContaining({ type: "object" }),
        },
        {
          id: "postgres.query",
          availableIn: ["dev"],
          risk: "local-mutation",
          inputSchema: expect.objectContaining({ type: "object" }),
          outputSchema: expect.objectContaining({ type: "object" }),
        },
      ],
    });
  });

  it("rejects verify-visible stack capabilities with mutation risk", () => {
    expect(() =>
      defineStackCapabilities<{ id: string }>()([
        {
          id: "postgres.query",
          title: "Run PostgreSQL query",
          description: "Run a SQL query against the local database.",
          availableIn: ["dev", "verify"],
          risk: "local-mutation",
          input: z.object({ sql: z.string() }),
          output: z.object({ rows: z.array(z.unknown()) }),
          run: () => ({ rows: [] }),
        },
      ]),
    ).toThrow("cannot be available in verify unless risk is none");
  });

  it("runs provider-declared stack capabilities through Dev MCP validation", async () => {
    const provider: StackProvider<{ multiplier: number }> = {
      id: "capability-run-stack",
      capabilities: defineStackCapabilities<{ multiplier: number }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ count: z.number().int() }),
          run: ({ input, handle }) => ({ count: input.limit * handle.multiplier }),
        },
      ]),
      start: async () => ({ multiplier: 2 }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["stack.capability.run"]),
    );
    await expect(
      router.callTool("stack.capability.run", { toolId: "notes.count", input: { limit: 2 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      tool: "stack.capability.run",
      code: "stack-id-required",
    });
    await router.callTool("stack.start", { stackId: "capability" });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability", toolId: "notes.count", input: { limit: 3 } }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "stack.capability.run",
      toolId: "notes.count",
      output: { count: 6 },
    });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability", toolId: "notes.count", input: { limit: 3 } }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "stack.capability.run",
      toolId: "notes.count",
      output: { count: 6 },
    });
  });

  it("returns simple failed responses for stack capability run failures", async () => {
    const provider: StackProvider<{ id: string }> = {
      id: "capability-failures-stack",
      capabilities: defineStackCapabilities<{ id: string }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ count: z.number().int() }),
          run: ({ input }) => ({ count: input.limit }),
        },
        {
          id: "provider.throws",
          title: "Throw from provider",
          description: "Throw from a provider handler.",
          availableIn: ["dev"],
          risk: "local-mutation",
          input: z.object({}),
          output: z.object({ ok: z.boolean() }),
          run: () => {
            throw new Error("provider exploded");
          },
        },
        {
          id: "provider.bad-output",
          title: "Return bad output",
          description: "Return output that fails schema validation.",
          availableIn: ["dev"],
          risk: "none",
          input: z.object({}),
          output: z.object({ ok: z.boolean() }),
          run: () => ({ ok: "not boolean" }) as never,
        },
      ]),
      start: async () => ({ id: "stack-1" }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: () => ({
        status: "stopped",
        summary: "stopped",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await router.callTool("stack.start", { stackId: "capability-failures" });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability-failures", toolId: "missing.tool", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-capability-tool-not-found",
    });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability-failures", toolId: "notes.count", input: { limit: 0 } }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-capability-invalid-input",
    });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability-failures", toolId: "provider.throws", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-capability-handler-failed",
      message: "provider exploded",
    });
    await expect(
      router.callTool("stack.capability.run", { stackId: "capability-failures", toolId: "provider.bad-output", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-capability-invalid-output",
    });
  });

  it("cleans up a started stack when readiness/status fails", async () => {
    const events: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "failing-status-stack",
      start: async () => {
        events.push("start");
        return { id: "stack-1" };
      },
      status: () => {
        events.push("status");
        throw new Error("readiness timeout");
      },
      stop: async (handle) => {
        events.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: "stopped",
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    // maxAttempts: 1 isolates this cleanup test from the bounded-retry default.
    const router = createDevMcpToolRouter({ stackProvider: provider, stackStart: { maxAttempts: 1 } });

    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "failed",
      tool: "stack.start",
      code: "stack-start-failed",
      message: "readiness timeout",
    });
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [],
    });
    expect(events).toEqual(["start", "status", "stop:stack-1"]);
  });

  it("preserves the readiness failure when start cleanup stop also fails", async () => {
    const events: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "failing-status-and-stop-stack",
      start: async () => {
        events.push("start");
        return { id: "stack-1" };
      },
      status: () => {
        events.push("status");
        throw new Error("readiness timeout");
      },
      stop: async (handle) => {
        events.push(`stop:${handle.id}`);
        throw new Error("cleanup stop failed");
      },
    };
    const router = createDevMcpToolRouter({ stackProvider: provider, stackStart: { maxAttempts: 1 } });

    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "failed",
      tool: "stack.start",
      code: "stack-start-failed",
      message: expect.stringContaining("readiness timeout"),
    });
    expect(events).toEqual(["start", "status", "stop:stack-1"]);
  });

  it("retries a cold-start readiness failure and self-heals on a later attempt", async () => {
    const events: string[] = [];
    let attempts = 0;
    const provider: StackProvider<{ id: string }> = {
      id: "cold-start-stack",
      start: async () => {
        attempts += 1;
        events.push(`start:${attempts}`);
        return { id: `stack-${attempts}` };
      },
      // First readiness probe trips the cold-start deadline; the warm retry passes.
      status: (handle) => {
        events.push(`status:${handle.id}`);
        if (attempts < 2) throw new Error("readiness timeout (cold start)");
        return {
          status: "ready",
          summary: `ready:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
      stop: async (handle) => {
        events.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: `stopped:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    // backoffMs: 0 keeps the test fast; maxAttempts defaults to 2.
    const router = createDevMcpToolRouter({ stackProvider: provider, stackStart: { backoffMs: 0 } });

    await expect(router.callTool("stack.start", { stackId: "warm" })).resolves.toMatchObject({
      status: "ok",
      tool: "stack.start",
      stackId: "warm",
      stack: { status: "ready" },
    });
    expect(attempts).toBe(2);
    // The failed first attempt tore its own handle down before the retry.
    expect(events).toEqual([
      "start:1",
      "status:stack-1",
      "stop:stack-1",
      "start:2",
      "status:stack-2",
    ]);
  });

  it("returns a coherent failed envelope after exhausting bounded start retries", async () => {
    let attempts = 0;
    const provider: StackProvider<{ id: string }> = {
      id: "always-failing-stack",
      start: async () => {
        attempts += 1;
        return { id: `stack-${attempts}` };
      },
      status: () => {
        throw new Error("readiness timeout");
      },
      stop: async (handle) => ({
        status: "stopped",
        summary: `stopped:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({
      stackProvider: provider,
      stackStart: { maxAttempts: 3, backoffMs: 0 },
    });

    const result = await router.callTool("stack.start", { stackId: "doomed" });
    // Coherent envelope: a stable discriminator plus code+message, never the
    // generic {status:"error"} shape that omits them and trips clients reading
    // result.stack.
    expect(result).toMatchObject({
      status: "failed",
      tool: "stack.start",
      code: "stack-start-failed",
      message: expect.stringContaining("after 3 attempts"),
    });
    expect(result.message).toContain("readiness timeout");
    expect("stack" in result).toBe(false);
    expect(attempts).toBe(3);
  });

  it("attaches self-diagnosing per-service diagnostics (redacted) to a failed start", async () => {
    // A provider whose status reports a `failed` packet: postgres is ready but
    // vite never compiled. The diagnostics must pin the culprit and carry the
    // tail of ITS logs — with any secret in those logs redacted.
    const provider: StackProvider<{ id: string }> = {
      id: "diag-stack",
      start: async () => ({ id: "h" }),
      status: () => ({
        status: "failed",
        summary: "vite failed to compile",
        services: [
          { id: "postgres", status: "ready", url: "http://127.0.0.1:5432" },
          { id: "vite", status: "failed" },
        ],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      logs: (_handle, input) => ({
        status: "ok",
        summary: `logs:${input.serviceId}`,
        serviceId: input.serviceId,
        stream: "combined",
        tail: input.tail,
        entries:
          input.serviceId === "vite"
            ? [
                { message: "error: Cannot find module './canonicalRoutes'" },
                { message: "DATABASE_URL=postgres://admin:s3cr3t@db:5432/app" },
                { message: "auth issued token=abcSECRET123 for worker" },
              ]
            : [],
        truncated: false,
      }),
      stop: async (handle) => ({
        status: "stopped",
        summary: `stopped:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({
      stackProvider: provider,
      stackStart: { maxAttempts: 2, backoffMs: 0 },
    });

    const result = await router.callTool("stack.start", { stackId: "diag" });
    expect(result).toMatchObject({
      status: "failed",
      tool: "stack.start",
      code: "stack-start-failed",
    });

    const diagnostics = result.diagnostics as {
      attempts: number;
      services: Array<{ id: string; status: string; logsTail: string[] }>;
      note?: string;
    };
    expect(diagnostics.attempts).toBe(2);

    const postgres = diagnostics.services.find((service) => service.id === "postgres");
    const vite = diagnostics.services.find((service) => service.id === "vite");
    // The ready service carries no logs — only the culprit does.
    expect(postgres).toMatchObject({ status: "ready", logsTail: [] });
    expect(vite?.status).toBe("failed");
    expect(vite?.logsTail.length).toBeGreaterThan(0);

    // The data points straight at the cause (external compile failure, not an
    // internal init-ordering bug).
    const tail = (vite?.logsTail ?? []).join("\n");
    expect(tail).toContain("Cannot find module './canonicalRoutes'");

    // Redaction holds: no DSN credential or token leaks through the log tail.
    expect(tail).not.toContain("s3cr3t");
    expect(tail).not.toContain("abcSECRET123");
    expect(tail).toContain("[redacted]");
  });

  it("surfaces attempts > 1 on the ok envelope when a cold start self-heals", async () => {
    let attempts = 0;
    const provider: StackProvider<{ id: string }> = {
      id: "self-heal-stack",
      start: async () => {
        attempts += 1;
        return { id: `stack-${attempts}` };
      },
      status: (handle) => {
        if (attempts < 2) throw new Error("readiness timeout (cold start)");
        return {
          status: "ready",
          summary: `ready:${handle.id}`,
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
      stop: async (handle) => ({
        status: "stopped",
        summary: `stopped:${handle.id}`,
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
    };
    const router = createDevMcpToolRouter({ stackProvider: provider, stackStart: { backoffMs: 0 } });

    // attempts > 1 makes the bounded-retry self-heal visible instead of silent.
    await expect(router.callTool("stack.start", { stackId: "warm" })).resolves.toMatchObject({
      status: "ok",
      tool: "stack.start",
      attempts: 2,
    });
  });

  it("captures diagnostics for the flagship process provider that launches but never becomes ready", async () => {
    // The real createProcessStackProvider: start() is launch-only and readiness
    // is status()-driven. This process spawns fine (so a LIVE handle escapes)
    // but its readyUrl never passes, so status() stays `degraded` until the
    // manager's readiness window closes. This is the most common real failure
    // ("the service never came up") and the exact path #6's fake provider never
    // exercised. On main — where start() blocks on waitForReady and throws —
    // this yields diagnostics.services:[] + a "status unavailable" note; after
    // the fix the failing service's log tail is captured from the live handle.
    const logDir = await mkdtemp(join(tmpdir(), "agent-e2e-process-diag-"));
    const logPath = join(logDir, "control-plane.log");
    // The service's startup log already holds its crash reason (with a secret in
    // it). Pre-seeding the file keeps the test deterministic — what we prove is
    // that diagnostics READS the live service's real log via the capture path,
    // not how fast a spawned child flushes stderr under parallel-suite load.
    await writeFile(
      logPath,
      "control-plane FATAL: cannot bind, DATABASE_URL=postgres://admin:s3cr3t@db:5432/app\n",
      "utf8",
    );
    const provider = createProcessStackProvider({
      id: "control-plane",
      serviceId: "control-plane",
      // A real process that launches and stays alive — so a LIVE handle escapes
      // start() — but whose readiness endpoint never comes up.
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000);"],
      // An address nothing is listening on: readiness never passes.
      readyUrl: "http://127.0.0.1:1/ready",
      logPath,
    });

    const router = createDevMcpToolRouter({
      stackProvider: provider,
      // One attempt, a short readiness window: launch, poll status() ~degraded,
      // give up, diagnose from the live handle.
      stackStart: { maxAttempts: 1, readyTimeoutMs: 250, pollIntervalMs: 25 },
    });

    try {
      const result = await router.callTool("stack.start", { stackId: "cp" });
      expect(result).toMatchObject({
        status: "failed",
        tool: "stack.start",
        code: "stack-start-failed",
      });

      const diagnostics = result.diagnostics as {
        attempts: number;
        services: Array<{ id: string; status: string; logsTail: string[] }>;
        note?: string;
      };
      // Populated via the start()-returns-then-readiness-times-out path — NOT the
      // empty status-unavailable fallback.
      expect(diagnostics.attempts).toBe(1);
      expect(diagnostics.note).toBeUndefined();

      const service = diagnostics.services.find((entry) => entry.id === "control-plane");
      expect(service).toBeDefined();
      expect(service?.status).not.toBe("ready");
      expect(service?.logsTail.length).toBeGreaterThan(0);

      const tail = (service?.logsTail ?? []).join("\n");
      // The log HELD the reason; diagnostics now carries it.
      expect(tail).toContain("control-plane FATAL");
      // Redaction holds: the DSN credential never leaks through the log tail.
      expect(tail).not.toContain("s3cr3t");
      expect(tail).toContain("[redacted]");
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it("disposes all remaining Stack Instances and browser sessions", async () => {
    const events: string[] = [];
    let started = 0;
    const provider: StackProvider<{ id: string }> = {
      id: "fake-stack",
      start: async () => {
        started += 1;
        return { id: `stack-${started}` };
      },
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: async (handle) => {
        events.push(`stack:${handle.id}`);
        return {
          status: "stopped",
          summary: "stopped",
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    const router = createDevMcpToolRouter({
      stackProvider: provider,
      browserSessions: {
        open: async () => ({ browserSessionId: "browser-1" }),
        snapshot: async (browserSessionId) => ({ browserSessionId, refs: [] }),
        close: async (browserSessionId) => {
          events.push(`browser:${browserSessionId}`);
          return { status: "closed", browserSessionId };
        },
        list: () => [{ browserSessionId: "browser-1" }],
      },
    });

    await router.callTool("stack.start", { stackId: "disposable-a" });
    await router.callTool("stack.start", { stackId: "disposable-b" });
    await expect(router.dispose()).resolves.toMatchObject({
      stack: { status: "stopped" },
      errors: [],
    });
    expect(events).toEqual(["stack:stack-1", "stack:stack-2", "browser:browser-1"]);
    await expect(router.callTool("stack.list")).resolves.toMatchObject({
      status: "ok",
      stacks: [],
    });
  });

  it("uses an injected browser session controller for MCP-owned browser tools", async () => {
    const router = createDevMcpToolRouter({
      browserSessions: {
        open: async () => ({ browserSessionId: "browser-1" }),
        snapshot: async (browserSessionId) => ({
          browserSessionId,
          refs: [{ ref: "@e1", role: "button" }],
        }),
        find: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          targets: [{ ref: "@f1", role: input.value }],
        }),
        act: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          action: input.action,
        }),
        wait: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          matched: input.until,
        }),
        get: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          kind: input.kind,
          value: "value",
        }),
        evaluate: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          output: { ran: "eval" },
        }),
        playwright: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          output: { ran: "playwright" },
        }),
        console: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          entries: [],
          nextCursor: 0,
        }),
        network: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          entries: [],
          nextCursor: 0,
        }),
        screenshot: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          artifact: { kind: "png" },
        }),
        close: async (browserSessionId) => ({
          status: "closed",
          browserSessionId,
        }),
        list: () => [{ browserSessionId: "browser-1" }],
      },
    });

    expect(router.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "browser.open",
        "browser.snapshot",
        "browser.find",
        "browser.act",
        "browser.wait",
        "browser.get",
        "browser.eval",
        "browser.playwright",
        "browser.console",
        "browser.network",
        "browser.screenshot",
        "browser.close",
      ]),
    );
    await expect(router.callTool("browser.open")).resolves.toMatchObject({
      status: "ok",
      result: { browserSessionId: "browser-1" },
    });
    await expect(
      router.callTool("browser.snapshot", { browserSessionId: "browser-1" }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { refs: [{ ref: "@e1" }] },
    });
    await expect(router.callTool("browser.sessions")).resolves.toMatchObject({
      status: "ok",
      sessions: [{ browserSessionId: "browser-1" }],
    });
    await expect(
      router.callTool("browser.find", {
        browserSessionId: "browser-1",
        by: "role",
        value: "button",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { targets: [{ ref: "@f1" }] },
    });
    await expect(
      router.callTool("browser.act", {
        browserSessionId: "browser-1",
        ref: "@e1",
        action: "click",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { status: "ok", action: "click" },
    });
    await expect(
      router.callTool("browser.wait", {
        browserSessionId: "browser-1",
        until: { kind: "text", text: "ready" },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { matched: { kind: "text", text: "ready" } },
    });
    await expect(
      router.callTool("browser.get", {
        browserSessionId: "browser-1",
        kind: "text",
        ref: "@e1",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { value: "value" },
    });
    await expect(
      router.callTool("browser.eval", {
        browserSessionId: "browser-1",
        code: "return 1",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { output: { ran: "eval" } },
    });
    await expect(
      router.callTool("browser.playwright", {
        browserSessionId: "browser-1",
        code: "return 1",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { output: { ran: "playwright" } },
    });
    await expect(
      router.callTool("browser.console", { browserSessionId: "browser-1" }),
    ).resolves.toMatchObject({ status: "ok", result: { entries: [] } });
    await expect(
      router.callTool("browser.network", { browserSessionId: "browser-1" }),
    ).resolves.toMatchObject({ status: "ok", result: { entries: [] } });
    await expect(
      router.callTool("browser.screenshot", { browserSessionId: "browser-1" }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { artifact: { kind: "png" } },
    });
    await expect(
      router.callTool("browser.close", { browserSessionId: "browser-1" }),
    ).resolves.toMatchObject({
      status: "ok",
      result: { status: "closed" },
    });
  });
});
