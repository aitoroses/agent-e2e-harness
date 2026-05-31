// Generate an authentic sample run artifact for the docs, demonstrating the
// runs/<runId>/ layout: run-report.md/json, one ad-hoc inspection, and one
// journey step with step-report.json. Run with:
//   node scripts/generate-sample-run.mjs
import { rm, cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createPlaywrightMcpBrowserSessionManager } from "../packages/harness/dist/playwright-mcp/index.js";
import { createMcpHarnessServer } from "../packages/harness/dist/mcp/index.js";
import { defineJourney } from "../packages/harness/dist/core/index.js";

const RUN_ID = "2026-05-31T10-24-18Z-daemons-console-oc7";
const ARTIFACT_ROOT = resolve(process.cwd(), "runs");
const DOCS_DIR = resolve(process.cwd(), "docs/sample-run");

// A real-ish console app: topbar, sidebar, cards grid, form controls (incl.
// disabled), alert, scroll region, table, modal dialog, nested flex/grid, and a
// hidden offscreen node — so the sample artifact exercises OC-grade forensics.
const PAGE_URL = pathToFileURL(resolve(process.cwd(), "packages/harness/test/fixtures/console-app.html")).href;

async function main() {
  await rm(resolve(ARTIFACT_ROOT, RUN_ID), { recursive: true, force: true });

  // 1) Ad-hoc inspection through browser.inspect (overlay enabled so the
  //    screenshot shows the refs, and inspect.md/json show the OC-grade tree).
  const manager = createPlaywrightMcpBrowserSessionManager({ artifactRoot: ARTIFACT_ROOT });
  const open = await manager.open({ headed: false, targetUrl: PAGE_URL, runId: RUN_ID });
  await manager.refs({ browserSessionId: open.browserSessionId, enabled: true });
  const inspect = await manager.inspect({ browserSessionId: open.browserSessionId });
  console.log("inspect:", JSON.stringify(inspect, null, 2));
  await manager.close(open.browserSessionId);

  // 2) One journey step through the same run id, sharing the run directory.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(PAGE_URL);
  const journey = defineJourney({
    id: "journey:daemons-console",
    title: "Daemons console",
    profiles: [{ id: "default", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:review",
        title: "Review",
        steps: [
          {
            id: "step:open-console",
            title: "Open developer run console",
            execute: async () => ({ status: "passed", observed: { title: "Developer Run Console" } }),
          },
        ],
      },
    ],
  });
  const server = createMcpHarnessServer({ journeys: [journey], artifactRoot: ARTIFACT_ROOT });
  await server.callTool("beginRun", { journeyId: journey.id, execution: { runId: RUN_ID, page } });
  await server.callTool("runStep", { runId: RUN_ID, phaseId: "phase:review", stepId: "step:open-console" });
  await browser.close();

  // 3) Copy into docs/sample-run for committing.
  await rm(DOCS_DIR, { recursive: true, force: true });
  await mkdir(DOCS_DIR, { recursive: true });
  await cp(resolve(ARTIFACT_ROOT, RUN_ID), resolve(DOCS_DIR, RUN_ID), { recursive: true });
  const tree = await listTree(resolve(DOCS_DIR, RUN_ID));
  console.log("\nSample run tree:\n" + tree.join("\n"));
}

async function listTree(dir, prefix = "") {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    out.push(`${prefix}${entry.name}`);
    if (entry.isDirectory()) out.push(...(await listTree(resolve(dir, entry.name), `${prefix}${entry.name}/`)));
  }
  return out;
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
