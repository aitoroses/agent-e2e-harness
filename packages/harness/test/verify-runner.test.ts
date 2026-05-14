import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { runVerifySuite, type VerifyBrowser } from "@agent-e2e/harness/verify";

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
});
