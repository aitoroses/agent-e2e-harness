import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { allocateTcpPort } from "@agent-e2e/harness/stack";
import {
  beginJourneyRun,
  runClosure,
  runJourneyStep,
} from "@agent-e2e/harness/core";
import { createShowcaseJourney } from "../src/journey.js";
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
      expect.objectContaining({
        id: "showcase-next-dev",
        kind: "web",
        status: "ready",
        url: baseUrl,
        endpoints: [expect.objectContaining({ id: "app", kind: "http", url: baseUrl })],
        checks: [expect.objectContaining({ id: "http.ready", status: "passed" })],
      }),
    ]),
    next: {
      actions: [
        expect.objectContaining({
          tool: "stack.logs",
          input: { serviceId: "showcase-next-dev", tail: 80, stream: "combined" },
        }),
      ],
    },
  });
  expect(stackProvider.logs).toBeDefined();
  await expect(Promise.resolve(stackProvider.logs!(stackHandle, { serviceId: "showcase-next-dev", tail: 20 }))).resolves.toMatchObject({
    status: "ok",
    serviceId: "showcase-next-dev",
    stream: "combined",
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
  it("crystallizes the showcase journey through the public core closure path", async () => {
    const journey = createShowcaseJourney(baseUrl);

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
  }, 60_000);
});
