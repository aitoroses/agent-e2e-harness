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
  defineStackExploreTools,
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

  it("rejects stack-targeting tools without stackId instead of falling back to the first Stack Instance", async () => {
    const calls: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "explicit-stack-id-required",
      explore: defineStackExploreTools<{ id: string }>()([
        {
          id: "notes.count",
          title: "Count notes",
          description: "Count notes visible to a limit.",
          availableIn: ["dev", "verify"],
          risk: "none",
          input: z.object({ limit: z.number().int().positive() }),
          output: z.object({ count: z.number().int() }),
          run: ({ input, handle }) => {
            calls.push(`explore:${handle.id}`);
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
      router.callTool("stack.explore.run", { toolId: "notes.count", input: { limit: 1 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(router.callTool("stack.stop")).resolves.toMatchObject({
      status: "blocked",
      code: "stack-id-required",
    });
    await expect(router.callTool("stack.explore.list")).resolves.toMatchObject({
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
      explore: defineStackExploreTools<{ id: string }>()([
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
      router.callTool("stack.explore.run", { stackId: "missing", toolId: "notes.count", input: { limit: 1 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      code: "stack-not-running",
    });
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

  it("lists provider-declared stack exploration tools before the stack starts", async () => {
    const explore = defineStackExploreTools<{ id: string }>()([
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
      explore,
      start: async () => {
        throw new Error("stack.explore.list must not start the stack");
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
      expect.arrayContaining(["stack.explore.list"]),
    );
    await expect(router.callTool("stack.explore.list")).resolves.toMatchObject({
      status: "ok",
      tool: "stack.explore.list",
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

  it("rejects verify-visible stack exploration tools with mutation risk", () => {
    expect(() =>
      defineStackExploreTools<{ id: string }>()([
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

  it("runs provider-declared stack exploration tools through Dev MCP validation", async () => {
    const provider: StackProvider<{ multiplier: number }> = {
      id: "explore-run-stack",
      explore: defineStackExploreTools<{ multiplier: number }>()([
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
      expect.arrayContaining(["stack.explore.run"]),
    );
    await expect(
      router.callTool("stack.explore.run", { toolId: "notes.count", input: { limit: 2 } }),
    ).resolves.toMatchObject({
      status: "blocked",
      tool: "stack.explore.run",
      code: "stack-id-required",
    });

    await router.callTool("stack.start", { stackId: "explore" });
    await expect(
      router.callTool("stack.explore.run", { stackId: "explore", toolId: "notes.count", input: { limit: 3 } }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "stack.explore.run",
      toolId: "notes.count",
      output: { count: 6 },
    });
  });

  it("returns simple failed responses for stack exploration run failures", async () => {
    const provider: StackProvider<{ id: string }> = {
      id: "explore-failures-stack",
      explore: defineStackExploreTools<{ id: string }>()([
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

    await router.callTool("stack.start", { stackId: "explore-failures" });
    await expect(
      router.callTool("stack.explore.run", { stackId: "explore-failures", toolId: "missing.tool", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-tool-not-found",
    });
    await expect(
      router.callTool("stack.explore.run", { stackId: "explore-failures", toolId: "notes.count", input: { limit: 0 } }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-invalid-input",
    });
    await expect(
      router.callTool("stack.explore.run", { stackId: "explore-failures", toolId: "provider.throws", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-handler-failed",
      message: "provider exploded",
    });
    await expect(
      router.callTool("stack.explore.run", { stackId: "explore-failures", toolId: "provider.bad-output", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-invalid-output",
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
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "error",
      tool: "stack.start",
      error: "readiness timeout",
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
    const router = createDevMcpToolRouter({ stackProvider: provider });

    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "error",
      tool: "stack.start",
      error: expect.stringContaining("readiness timeout"),
    });
    expect(events).toEqual(["start", "status", "stop:stack-1"]);
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
