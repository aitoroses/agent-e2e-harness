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

  it("controls stack lifecycle through an injected provider without importing Testcontainers", async () => {
    const events: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "fake-stack",
      start: async () => {
        events.push("start");
        return { id: "stack-1" };
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
      expect.arrayContaining(["stack.start", "stack.status", "stack.stop"]),
    );
    await expect(router.callTool("stack.status")).resolves.toMatchObject({
      status: "ok",
      stack: { status: "stopped" },
    });
    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "ok",
      handle: { id: "stack-1" },
      stack: { status: "ready" },
    });
    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "blocked",
      code: "stack-already-running",
    });
    await expect(router.callTool("stack.start")).resolves.not.toHaveProperty("next");
    await expect(router.callTool("stack.stop")).resolves.toMatchObject({
      status: "ok",
      stack: { status: "stopped", summary: "stopped:stack-1" },
    });
    expect(events).toEqual(["start", "stop:stack-1"]);
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
    await expect(router.callTool("stack.start")).resolves.toMatchObject({
      status: "ok",
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
      router.callTool("stack.logs", { serviceId: "next-dev", tail: 80, stream: "combined" }),
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
      code: "stack-not-running",
    });

    await router.callTool("stack.start");
    await expect(
      router.callTool("stack.logs", { serviceId: "next-dev" }),
    ).resolves.toMatchObject({
      status: "error",
      tool: "stack.logs",
      error: "Missing required positive integer argument: tail",
    });
    await expect(
      router.callTool("stack.logs", { serviceId: "next-dev", tail: 10 }),
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
      status: "failed",
      tool: "stack.explore.run",
      code: "stack-not-running",
    });

    await router.callTool("stack.start");
    await expect(
      router.callTool("stack.explore.run", { toolId: "notes.count", input: { limit: 3 } }),
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

    await router.callTool("stack.start");
    await expect(
      router.callTool("stack.explore.run", { toolId: "missing.tool", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-tool-not-found",
    });
    await expect(
      router.callTool("stack.explore.run", { toolId: "notes.count", input: { limit: 0 } }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-invalid-input",
    });
    await expect(
      router.callTool("stack.explore.run", { toolId: "provider.throws", input: {} }),
    ).resolves.toMatchObject({
      status: "failed",
      code: "stack-explore-handler-failed",
      message: "provider exploded",
    });
    await expect(
      router.callTool("stack.explore.run", { toolId: "provider.bad-output", input: {} }),
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
    await expect(router.callTool("stack.status")).resolves.toMatchObject({
      status: "ok",
      stack: { status: "stopped" },
    });
    expect(events).toEqual(["start", "status", "stop:stack-1"]);
  });

  it("disposes active stack and browser sessions", async () => {
    const events: string[] = [];
    const provider: StackProvider<{ id: string }> = {
      id: "fake-stack",
      start: async () => ({ id: "stack-1" }),
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

    await router.callTool("stack.start");
    await expect(router.dispose()).resolves.toMatchObject({
      stack: { status: "stopped" },
      errors: [],
    });
    expect(events).toEqual(["stack:stack-1", "browser:browser-1"]);
    await expect(router.callTool("stack.status")).resolves.toMatchObject({
      status: "ok",
      stack: { status: "stopped" },
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
        act: async (input) => ({
          status: "ok",
          browserSessionId: input.browserSessionId,
          action: input.action,
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
        "browser.act",
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
