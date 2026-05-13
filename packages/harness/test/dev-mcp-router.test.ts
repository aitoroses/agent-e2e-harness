import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import { createMcpHarnessServer } from "../src/mcp/index.js";
import type { StackProvider } from "@agent-e2e/harness/stack";

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
