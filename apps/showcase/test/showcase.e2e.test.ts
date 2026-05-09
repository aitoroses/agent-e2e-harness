import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMcpHarnessServer } from "@agent-e2e/harness/mcp";
import { allocateTcpPort } from "@agent-e2e/harness/stack";
import {
  beginJourneyRun,
  runClosure,
  runJourneyStep,
} from "@agent-e2e/harness";
import {
  createShowcaseJourney,
  createShowcaseResourceAdapter,
} from "../src/journey.js";
import { createShowcaseDevStackProvider } from "../src/harness/dev-stack.js";

let port: number;
let baseUrl: string;
let stackProvider: ReturnType<typeof createShowcaseDevStackProvider>;
let stackHandle: Awaited<ReturnType<ReturnType<typeof createShowcaseDevStackProvider>["start"]>>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  port = await allocateTcpPort();
  baseUrl = `http://127.0.0.1:${port}`;
  stackProvider = createShowcaseDevStackProvider({
    appHost: "127.0.0.1",
    appPort: port,
    appUrl: baseUrl,
  });
  stackHandle = await stackProvider.start();
  await expect(stackProvider.status(stackHandle)).resolves.toMatchObject({
    status: "ready",
    services: expect.arrayContaining([
      expect.objectContaining({ id: "postgres", status: "ready" }),
      expect.objectContaining({ id: "showcase-next-dev", status: "ready", url: baseUrl }),
    ]),
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
}, 180_000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  if (stackProvider && stackHandle) {
    await expect(stackProvider.stop(stackHandle)).resolves.toMatchObject({
      status: "stopped",
      services: expect.arrayContaining([
        expect.objectContaining({ id: "postgres", status: "stopped" }),
        expect.objectContaining({ id: "showcase-next-dev", status: "stopped" }),
      ]),
    });
  }
});

describe("Next.js showcase app", () => {
  it("runs the showcase journey step-by-step through MCP/dev iteration and closure", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-showcase-"));
    const artifactRoot = join(tmpRoot, ".agents-e2e", "artifacts");
    const journey = createShowcaseJourney(baseUrl);
    const resourceAdapter = createShowcaseResourceAdapter(baseUrl);
    const server = createMcpHarnessServer({
      journeys: [journey],
      resourceAdapters: [resourceAdapter],
      artifactRoot,
    });

    await page.goto(baseUrl);
    await expect(
      page
        .getByRole("heading", {
          name: "Proof Notes, from seeded state to deterministic proof.",
        })
        .textContent(),
    ).resolves.toBeTruthy();

    const begin = await beginJourneyRun(journey, {
      execution: { browser, page },
    });
    expect(begin.status).toBe("running");
    if (begin.status !== "running") throw new Error("expected running");

    const step = await runJourneyStep(begin.run, {
      phaseId: "phase:proof-notes",
      stepId: "step:create-proof-note",
    });
    expect(step.status).toBe("passed");
    expect(step.feedback.observed).toMatchObject({
      persistedAfterReload: true,
      baselineWorkspaceId: "workspace:seed",
      baselineUserId: "user:seed",
    });
    expect(begin.run.ownershipLedger.resources).toEqual([
      expect.objectContaining({ kind: "proof-note" }),
    ]);

    const mcpBegin = await server.callTool("beginRun", {
      journeyId: journey.id,
      execution: { browser, page },
      runId: "showcase-mcp",
    });
    expect(mcpBegin).toMatchObject({
      status: "ok",
      runId: "showcase-mcp",
      artifact_dir: expect.stringContaining("showcase-proof-notes/showcase-mcp"),
      artifacts: expect.arrayContaining([
        expect.objectContaining({ name: "seed-manifest" }),
        expect.objectContaining({ name: "result" }),
      ]),
    });
    expect(existsSync(join(artifactRoot, "showcase-proof-notes", "showcase-mcp", "seed-manifest.json"))).toBe(true);
    const mcpStep = await server.callTool("runStep", {
      runId: "showcase-mcp",
      phaseId: "phase:proof-notes",
      stepId: "step:create-proof-note",
    });
    expect(mcpStep).toMatchObject({
      status: "ok",
      result: {
        status: "passed",
        ownedResources: [expect.objectContaining({ kind: "proof-note" })],
        artifacts: expect.arrayContaining([
          expect.objectContaining({ name: "before", kind: "screenshot" }),
          expect.objectContaining({ name: "after", kind: "screenshot" }),
          expect.objectContaining({ name: "console", kind: "console-log" }),
          expect.objectContaining({ name: "network", kind: "network-log" }),
          expect.objectContaining({ name: "result", kind: "json" }),
          expect.objectContaining({ name: "step-feedback", kind: "json" }),
        ]),
        step_feedback_artifact: expect.objectContaining({ name: "step-feedback" }),
      },
    });
    const runDir = join(artifactRoot, "showcase-proof-notes", "showcase-mcp");
    const stepDir = join(runDir, "01-phase-phase-proof-notes", "01-step-step-create-proof-note");
    for (const artifactPath of [
      join(runDir, "result.json"),
      join(runDir, "timeline.json"),
      join(runDir, "metrics.json"),
      join(runDir, "owned-resources.json"),
      join(stepDir, "before.png"),
      join(stepDir, "after.png"),
      join(stepDir, "console.json"),
      join(stepDir, "network.json"),
      join(stepDir, "result.json"),
      join(stepDir, "step-feedback.json"),
    ]) {
      expect(existsSync(artifactPath), artifactPath).toBe(true);
      expect(artifactPath).not.toContain("/ui-e2e/");
      expect(artifactPath).not.toContain("/steps/");
      expect(artifactPath).not.toContain(".scratch");
    }
    await expect(
      server.callTool("readArtifact", { path: join(stepDir, "step-feedback.json") }),
    ).resolves.toMatchObject({
      status: "ok",
      artifact: { kind: "json" },
      content: {
        status: "passed",
        artifacts: {
          primary: expect.arrayContaining([
            expect.objectContaining({ name: "after" }),
            expect.objectContaining({ name: "result" }),
          ]),
        },
      },
    });
    await expect(
      server.callTool("readArtifact", { path: join(stepDir, "result.json") }),
    ).resolves.toMatchObject({
      status: "ok",
      content: {
        status: "passed",
        artifacts: expect.arrayContaining([
          expect.objectContaining({ name: "before" }),
          expect.objectContaining({ name: "after" }),
          expect.objectContaining({ name: "step-feedback" }),
        ]),
      },
    });
    await expect(
      server.callTool("cleanupPlan", { runId: "showcase-mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      plan: { planned: [expect.objectContaining({ kind: "proof-note" })] },
      artifact: expect.objectContaining({ name: "cleanup-plan" }),
    });
    await expect(
      server.callTool("reseedRun", { runId: "showcase-mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      cleanup: {
        artifacts: {
          deleted: [
            expect.objectContaining({ adapterId: "showcase-proof-note-api" }),
          ],
        },
      },
      seedGate: {
        manifest: {
          environment: {
            checked: expect.arrayContaining([
              expect.objectContaining({
                id: "baseline:workspace:workspace:seed",
              }),
            ]),
          },
        },
      },
    });

    const closure = await runClosure(journey, {
      execution: { browser, page },
      runId: "showcase-closure",
    });
    expect(closure.status).toBe("crystallized");
    expect(closure.crystallized).toBe(true);
    expect(closure.intervention).toBe("none");
    expect(closure.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "artifact:showcase-seed" }),
        expect.objectContaining({ id: "artifact:showcase-proof-note" }),
      ]),
    );
    await rm(tmpRoot, { recursive: true, force: true });
  }, 60_000);
});
