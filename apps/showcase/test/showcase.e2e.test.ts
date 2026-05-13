import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { allocateTcpPort } from "@agent-e2e/harness/stack";
import { startAgentE2EDevMcp } from "@agent-e2e/harness/dev-mcp";
import {
  beginJourneyRun,
  runClosure,
  runJourneyStep,
} from "@agent-e2e/harness";
import {
  createShowcaseJourney,
  createShowcaseResourceRegistry,
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
    const resourceRegistry = createShowcaseResourceRegistry();
    const server = await startAgentE2EDevMcp({
      journeys: [journey],
      resourceRegistry,
      artifactRoot,
      port: 0,
      installSignalHandlers: false,
      logger: false,
      browserSessions: {
        open: async () => ({ browserSessionId: "showcase-browser" }),
        snapshot: async (browserSessionId) => ({ browserSessionId, refs: [] }),
        close: async (browserSessionId) => ({ status: "closed", browserSessionId }),
        list: () => [{ browserSessionId: "showcase-browser" }],
        execution: () => ({ browser, page }),
      },
    });
    const client = new Client({
      name: "agent-e2e-showcase-test-client",
      version: "0.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url)) as Parameters<Client["connect"]>[0],
    );

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
      expect.objectContaining({ kind: "note" }),
    ]);

    const mcpBegin = await callDevMcp(client, "run.begin", {
      journeyId: journey.id,
      browserSessionId: "showcase-browser",
      runId: "showcase-mcp",
    });
    expect(mcpBegin).toMatchObject({
      status: "ok",
      tool: "run.begin",
      runId: "showcase-mcp",
      artifact_dir: expect.stringContaining("showcase-proof-notes/showcase-mcp"),
      artifacts: expect.arrayContaining([
        expect.objectContaining({ name: "seed-manifest" }),
        expect.objectContaining({ name: "result" }),
      ]),
    });
    expect(existsSync(join(artifactRoot, "showcase-proof-notes", "showcase-mcp", "seed-manifest.json"))).toBe(true);
    const mcpStep = await callDevMcp(client, "journey.step", {
      runId: "showcase-mcp",
      phaseId: "phase:proof-notes",
      stepId: "step:create-proof-note",
      browserSessionId: "showcase-browser",
    });
    expect(mcpStep).toMatchObject({
      status: "ok",
      tool: "journey.step",
      result: {
        status: "passed",
        ownedResources: [expect.objectContaining({ kind: "note" })],
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
      callDevMcp(client, "artifact.read", { path: join(stepDir, "step-feedback.json") }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "artifact.read",
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
      callDevMcp(client, "artifact.read", { path: join(stepDir, "result.json") }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "artifact.read",
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
      callDevMcp(client, "cleanup.plan", { runId: "showcase-mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "cleanup.plan",
      plan: { planned: [expect.objectContaining({ kind: "note" })] },
      artifact: expect.objectContaining({ name: "cleanup-plan" }),
    });
    await expect(
      callDevMcp(client, "run.reseed", { runId: "showcase-mcp" }),
    ).resolves.toMatchObject({
      status: "ok",
      tool: "run.reseed",
      cleanup: {
        artifacts: {
          deleted: [
            expect.objectContaining({ adapterId: "resource-registry-adapter" }),
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
    await client.close();
    await server.close();
    await rm(tmpRoot, { recursive: true, force: true });
  }, 60_000);
});

async function callDevMcp(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const first = content[0];
  const text = isTextContent(first) ? first.text : "";
  return JSON.parse(text) as Record<string, unknown>;
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "text" in value &&
    value.type === "text" &&
    typeof value.text === "string"
  );
}
