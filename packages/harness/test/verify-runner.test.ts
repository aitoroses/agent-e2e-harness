import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod/v4";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { runVerifySuite, type VerifyBrowser } from "@agent-e2e/harness/verify";
import {
  defineStackExploreTools,
  type StackExecutionSurface,
  type StackStartContext,
} from "@agent-e2e/harness/stack";

type VerifyHarness = HarnessTypes<
  {
    browser: VerifyBrowser;
    context: unknown;
    page: { screenshot: (options: { path: string }) => Promise<void> };
  },
  Record<string, never>,
  { ok: true },
  { kind: "record"; id: string }
>;

type StackVerifyHarness = HarnessTypes<
  {
    browser: VerifyBrowser;
    context: unknown;
    page: { screenshot: (options: { path: string }) => Promise<void> };
    stack: StackExecutionSurface;
  },
  Record<string, never>,
  { ok: true; stackSummary: string },
  { kind: "record"; id: string }
>;

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), "agent-e2e-verify-"));
  tempDirs.push(dir);
  return dir;
}

function fakeBrowser(): VerifyBrowser {
  return {
    newContext: async () => ({
      newPage: async () => ({
        screenshot: async ({ path }: { path: string }) => {
          await writeFile(path, "png");
        },
      }),
      close: async () => undefined,
    }),
    close: async () => undefined,
  };
}

function makeStackJourney(id: string, onRun?: (summary: string) => Promise<void> | void) {
  return defineJourney<StackVerifyHarness>({
    id,
    title: id,
    profiles: [{ id: "default", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:main",
        title: "Main",
        steps: [
          {
            id: "step:main",
            title: "Main",
            execute: async ({ execution }) => {
              await onRun?.(execution.stack.summary);
              return {
                status: "passed",
                observed: { ok: true, stackSummary: execution.stack.summary },
              };
            },
          },
        ],
      },
    ],
  });
}

describe("verify runner", () => {
  it("runs selected journeys through one suite and writes unified reports", async () => {
    const artifactRoot = await tempRoot();
    const deleted: string[] = [];
    const journey = defineJourney<VerifyHarness>({
      id: "notes:create",
      title: "Create note",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:create",
          title: "Create",
          steps: [
            {
              id: "step:create",
              title: "Create",
              execute: async ({ execution }) => {
                await execution.page.screenshot({ path: join(artifactRoot, "manual.png") });
                return {
                  status: "passed",
                  observed: { ok: true },
                  ownedResources: [{ kind: "record", id: "record:1" }],
                };
              },
            },
          ],
        },
      ],
    });

    const report = await runVerifySuite<VerifyHarness>({
      journeys: [journey],
      resourceAdapters: [
        {
          id: "record-adapter",
          supports: (resource) => resource.kind === "record",
          delete: async (resource) => {
            deleted.push(resource.id);
          },
        },
      ],
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        env: {},
        now: () => new Date("2026-05-14T12:00:00.000Z"),
        randomSuffix: () => "unit",
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
      },
    });

    expect(report.status).toBe("passed");
    expect(report.suiteId).toBe("verify-2026-05-14t12-00-00-000z-unit");
    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]).toMatchObject({
      journeyId: "notes:create",
      profileId: "default",
      status: "passed",
      cleanupStatus: "passed",
    });
    expect(deleted).toEqual(["record:1"]);
    expect(report.artifactDir).toContain("_suites/verify-2026-05-14t12-00-00-000z-unit");
    expect(report.runs[0]?.artifactDir).toContain("_suites/verify-2026-05-14t12-00-00-000z-unit/runs/notes-create/default");
    expect(existsSync(join(report.artifactDir, "report.json"))).toBe(true);
    expect(await readFile(join(report.artifactDir, "report.md"), "utf8")).toContain("# Agent E2E Verify Report");
  });

  it("reports seed failures while continuing unrelated journeys", async () => {
    const artifactRoot = await tempRoot();
    const blocked = defineJourney<VerifyHarness>({
      id: "notes:blocked",
      title: "Blocked",
      seed: () => ({ errors: [{ code: "seed.failed", message: "Seed failed" }] }),
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:blocked",
          title: "Blocked",
          steps: [{ id: "step:blocked", title: "Blocked", execute: async () => ({ status: "passed" }) }],
        },
      ],
    });
    const passing = defineJourney<VerifyHarness>({
      id: "notes:passing",
      title: "Passing",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:passing",
          title: "Passing",
          steps: [{ id: "step:passing", title: "Passing", execute: async () => ({ status: "passed" }) }],
        },
      ],
    });

    const report = await runVerifySuite<VerifyHarness>({
      journeys: [blocked, passing],
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
      },
    });

    expect(report.status).toBe("failed");
    expect(report.runs.map((run) => `${run.journeyId}:${run.status}`)).toEqual([
      "notes:blocked:seed_blocked",
      "notes:passing:passed",
    ]);
  });

  it("stops scheduling after per-run cleanup failure", async () => {
    const artifactRoot = await tempRoot();
    const makeJourney = (id: string) => defineJourney<VerifyHarness>({
      id,
      title: id,
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:main",
          title: "Main",
          steps: [
            {
              id: "step:main",
              title: "Main",
              execute: async () => ({
                status: "passed",
                ownedResources: [{ kind: "record", id: `${id}:record` }],
              }),
            },
          ],
        },
      ],
    });

    const report = await runVerifySuite<VerifyHarness>({
      journeys: [makeJourney("notes:first"), makeJourney("notes:second")],
      resourceAdapters: [
        {
          id: "failing-adapter",
          supports: () => true,
          delete: async () => {
            throw new Error("cleanup failed");
          },
        },
      ],
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        workers: 1,
      },
    });

    expect(report.status).toBe("failed");
    expect(report.runs.map((run) => `${run.journeyId}:${run.status}`)).toEqual([
      "notes:first:cleanup_failed",
    ]);
  });

  it("stops before journeys when stack health is not ready", async () => {
    const artifactRoot = await tempRoot();
    let browserCreated = false;
    let stopped = false;

    const report = await runVerifySuite<VerifyHarness, { id: string }>({
      journeys: [
        defineJourney<VerifyHarness>({
          id: "notes:create",
          title: "Create",
          profiles: [{ id: "default", data: {}, isDefault: true }],
          phases: [
            {
              id: "phase:create",
              title: "Create",
              steps: [{ id: "step:create", title: "Create", execute: async () => ({ status: "passed" }) }],
            },
          ],
        }),
      ],
      stackProvider: {
        id: "failing-stack",
        start: async () => ({ id: "stack" }),
        status: async () => ({
          status: "failed",
          summary: "database did not start",
          services: [],
          artifacts: [],
          warnings: [],
          errors: [{ code: "stack.failed", message: "database did not start" }],
        }),
        stop: async () => {
          stopped = true;
          return {
            status: "stopped",
            summary: "stopped",
            services: [],
            artifacts: [],
            warnings: [],
            errors: [],
          };
        },
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => {
          browserCreated = true;
          return fakeBrowser();
        },
        reporter: "quiet",
      },
    });

    expect(report.status).toBe("failed");
    expect(report.runs).toEqual([]);
    expect(report.errors).toContain("database did not start");
    expect(browserCreated).toBe(false);
    expect(stopped).toBe(true);
  });

  it("does not start worker stacks before verify selection succeeds", async () => {
    const artifactRoot = await tempRoot();
    let started = false;

    await expect(runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: [makeStackJourney("notes:selected")],
      stackProvider: {
        id: "selection-stack",
        start: async (ctx) => {
          started = true;
          return { id: ctx.stackId };
        },
        status: (handle) => ({
          status: "ready",
          summary: `ready:${handle.id}`,
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        journey: ["notes:missing"],
      },
    })).rejects.toThrow("Verify selection matched no journeys.");
    expect(started).toBe(false);
  });

  it("runs serial verify through one lazy worker stack", async () => {
    const artifactRoot = await tempRoot();
    const events: string[] = [];
    const makeJourney = (id: string) => defineJourney<StackVerifyHarness>({
      id,
      title: id,
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:main",
          title: "Main",
          steps: [
            {
              id: "step:main",
              title: "Main",
              execute: async ({ execution }) => {
                events.push(`run:${id}:${execution.stack.summary}`);
                return {
                  status: "passed",
                  observed: { ok: true, stackSummary: execution.stack.summary },
                };
              },
            },
          ],
        },
      ],
    });

    const contexts: StackStartContext[] = [];
    const report = await runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: [makeJourney("notes:first"), makeJourney("notes:second")],
      stackProvider: {
        id: "serial-worker-stack",
        start: async (ctx) => {
          events.push(`start:${ctx.stackId}`);
          contexts.push(ctx);
          return { id: ctx.stackId };
        },
        status: (handle) => ({
          status: "ready",
          summary: `ready:${handle.id}`,
          services: [{ id: "app", status: "ready", url: `http://127.0.0.1/${handle.id}` }],
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        workers: 1,
      },
    });

    expect(report.status).toBe("passed");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      mode: "verify",
      stackId: "worker-0",
      workerIndex: 0,
      workerCount: 1,
    });
    expect(events).toEqual([
      "start:worker-0",
      "run:notes:first:ready:worker-0",
      "run:notes:second:ready:worker-0",
      "stop:worker-0",
    ]);
  });

  it("starts worker stacks lazily only for workers that receive selected runs", async () => {
    const artifactRoot = await tempRoot();
    const contexts: StackStartContext[] = [];

    const report = await runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: [
        makeStackJourney("notes:first"),
        makeStackJourney("notes:second"),
      ],
      stackProvider: {
        id: "lazy-worker-stack",
        start: async (ctx) => {
          contexts.push(ctx);
          return { id: ctx.stackId };
        },
        status: (handle) => ({
          status: "ready",
          summary: `ready:${handle.id}`,
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        workers: 4,
      },
    });

    expect(report.status).toBe("passed");
    expect(contexts.map((ctx) => ctx.stackId)).toEqual(["worker-0", "worker-1"]);
    expect(contexts.map((ctx) => ctx.workerIndex)).toEqual([0, 1]);
    expect(contexts.map((ctx) => ctx.workerCount)).toEqual([4, 4]);
  });

  it("runs each worker's assigned runs serially inside that worker stack", async () => {
    const artifactRoot = await tempRoot();
    const activeStacks = new Set<string>();
    const runStacks: string[] = [];

    const report = await runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: Array.from({ length: 6 }, (_, index) =>
        makeStackJourney(`notes:${index + 1}`, async (summary) => {
          const stackId = summary.replace("ready:", "");
          if (activeStacks.has(stackId)) throw new Error(`overlapped run in ${stackId}`);
          activeStacks.add(stackId);
          await new Promise((resolve) => setTimeout(resolve, 10));
          activeStacks.delete(stackId);
          runStacks.push(stackId);
        })
      ),
      stackProvider: {
        id: "serial-per-worker-stack",
        start: async (ctx) => ({ id: ctx.stackId }),
        status: (handle) => ({
          status: "ready",
          summary: `ready:${handle.id}`,
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        workers: 2,
      },
    });

    expect(report.status).toBe("passed");
    expect(new Set(runStacks)).toEqual(new Set(["worker-0", "worker-1"]));
    expect(report.runs).toHaveLength(6);
  });

  it("stops scheduling new runs after a worker stack start failure while active workers clean up", async () => {
    const artifactRoot = await tempRoot();
    const events: string[] = [];

    const report = await runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: [
        makeStackJourney("notes:first", (summary) => {
          events.push(`run:first:${summary}`);
        }),
        makeStackJourney("notes:failed-start"),
        makeStackJourney("notes:unstarted"),
      ],
      stackProvider: {
        id: "start-failure-stack",
        start: async (ctx) => {
          events.push(`start:${ctx.stackId}`);
          if (ctx.workerIndex === 1) throw new Error("worker-1 stack did not start");
          return { id: ctx.stackId };
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
        workers: 2,
      },
    });

    expect(report.status).toBe("failed");
    expect(report.exitCode).toBe(1);
    expect(report.errors).toContain("worker-1 stack did not start");
    expect(report.runs.map((run) => `${run.journeyId}:${run.status}`)).toEqual([
      "notes:first:passed",
    ]);
    expect(events).toEqual([
      "start:worker-0",
      "start:worker-1",
      "run:first:ready:worker-0",
      "stop:worker-0",
    ]);
  });

  it("keeps browser contexts isolated per run inside a worker stack", async () => {
    const artifactRoot = await tempRoot();
    const contextIds: number[] = [];
    let nextContextId = 0;
    const browser: VerifyBrowser = {
      newContext: async () => {
        const id = ++nextContextId;
        return {
          newPage: async () => ({
            screenshot: async ({ path }: { path: string }) => {
              await writeFile(path, "png");
            },
          }),
          close: async () => undefined,
          id,
        } as unknown as Awaited<ReturnType<VerifyBrowser["newContext"]>>;
      },
      close: async () => undefined,
    };

    const report = await runVerifySuite<StackVerifyHarness, { id: string }>({
      journeys: [
        makeStackJourney("notes:first", () => {
          contextIds.push(nextContextId);
        }),
        makeStackJourney("notes:second", () => {
          contextIds.push(nextContextId);
        }),
      ],
      stackProvider: {
        id: "context-isolation-stack",
        start: async (ctx) => ({ id: ctx.stackId }),
        status: (handle) => ({
          status: "ready",
          summary: `ready:${handle.id}`,
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => browser,
        reporter: "quiet",
        workers: 1,
      },
    });

    expect(report.status).toBe("passed");
    expect(contextIds).toEqual([1, 2]);
  });

  it("passes a verify-mode StackStartContext to the suite stack and records allocations", async () => {
    const artifactRoot = await tempRoot();
    const contexts: StackStartContext[] = [];
    const journey = defineJourney<VerifyHarness>({
      id: "notes:stack-context",
      title: "Stack context",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:context",
          title: "Context",
          steps: [{ id: "step:context", title: "Context", execute: async () => ({ status: "passed" }) }],
        },
      ],
    });

    const report = await runVerifySuite<VerifyHarness, { appUrl: string; logPath: string }>({
      journeys: [journey],
      stackProvider: {
        id: "verify-context-stack",
        start: async (ctx) => {
          contexts.push(ctx);
          const app = await ctx.allocatePort("app");
          const log = ctx.allocateArtifactPath("app log", { kind: "file", extension: "log" });
          return { appUrl: app.url, logPath: log.path };
        },
        status: (handle) => ({
          status: "ready",
          summary: "ready",
          services: [{ id: "app", status: "ready", url: handle.appUrl }],
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        env: {},
        now: () => new Date("2026-05-14T12:00:00.000Z"),
        randomSuffix: () => "unit",
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
      },
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      mode: "verify",
      stackId: "worker-0",
      workerIndex: 0,
      workerCount: 1,
      suiteId: "verify-2026-05-14t12-00-00-000z-unit",
      artifactScope: {
        stackDir: join(artifactRoot, "_suites", "verify-2026-05-14t12-00-00-000z-unit", "stacks", "worker-0"),
      },
    });
    expect(report.stack).toMatchObject({
      status: "ready",
      allocations: [
        {
          kind: "port",
          name: "app",
          stackId: "worker-0",
          workerIndex: 0,
          resource: { url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/) },
        },
        {
          kind: "artifact-file",
          name: "app log",
          stackId: "worker-0",
          workerIndex: 0,
          resource: {
            path: expect.stringContaining("/_suites/verify-2026-05-14t12-00-00-000z-unit/stacks/worker-0/app-log.log"),
          },
        },
      ],
    });
    expect(report.status).toBe("passed");
  });

  it("injects verify-safe stack exploration into journey execution", async () => {
    const artifactRoot = await tempRoot();
    const events: string[] = [];
    const explore = defineStackExploreTools<{ multiplier: number }>()([
      {
        id: "notes.count",
        title: "Count notes",
        description: "Read note count from the active stack.",
        availableIn: ["dev", "verify"],
        risk: "none",
        input: z.object({ limit: z.number().int().positive() }),
        output: z.object({ count: z.number().int() }),
        run: ({ input, handle }) => {
          events.push(`safe:${input.limit}`);
          return { count: input.limit * handle.multiplier };
        },
      },
      {
        id: "postgres.query",
        title: "Run PostgreSQL query",
        description: "Run local SQL against the active stack.",
        availableIn: ["dev"],
        risk: "local-mutation",
        input: z.object({ sql: z.string() }),
        output: z.object({ rows: z.array(z.unknown()) }),
        run: () => {
          events.push("dev-only");
          return { rows: [] };
        },
      },
    ]);
    type VerifyExploreHarness = HarnessTypes<
      {
        browser: VerifyBrowser;
        context: unknown;
        page: { screenshot: (options: { path: string }) => Promise<void> };
        stack: StackExecutionSurface<typeof explore>;
      },
      Record<string, never>,
      { ok: true; count: number; devOnlyHidden: true },
      { kind: "record"; id: string }
    >;
    const journey = defineJourney<VerifyExploreHarness>({
      id: "notes:verify-explore",
      title: "Verify explore",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:observe",
          title: "Observe",
          steps: [
            {
              id: "step:observe",
              title: "Observe",
              execute: async ({ execution }) => {
                const output = await execution.stack.explore.run("notes.count", { limit: 3 });
                let devOnlyHidden = false;
                try {
                  await execution.stack.explore.run("postgres.query", { sql: "select 1" });
                } catch {
                  devOnlyHidden = true;
                }
                return {
                  status: "passed",
                  observed: { ok: true, count: output.count, devOnlyHidden },
                };
              },
            },
          ],
        },
      ],
    });

    const report = await runVerifySuite<VerifyExploreHarness, { multiplier: number }>({
      journeys: [journey],
      stackProvider: {
        id: "verify-explore-stack",
        explore,
        start: async () => ({ multiplier: 4 }),
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
      },
      options: {
        configPath: "/repo/agent-e2e.config.ts",
        artifactRoot,
        createBrowser: async () => fakeBrowser(),
        reporter: "quiet",
      },
    });

    expect(report.status).toBe("passed");
    expect(report.runs[0]).toMatchObject({ status: "passed" });
    expect(events).toEqual(["safe:3"]);
  });
});
