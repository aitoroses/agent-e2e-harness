import { mkdtemp, readFile, readlink, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import { createMcpHarnessServer } from "../src/mcp/index.js";

type ContractHarness = HarnessTypes<
  { runId: string },
  { label: string },
  { message: string },
  { kind: "record"; id: string }
>;

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), "agent-e2e-run-contract-"));
  tempDirs.push(dir);
  return dir;
}

function twoStepJourney() {
  return defineJourney<ContractHarness>({
    id: "journey:contract",
    title: "Contract journey",
    profiles: [{ id: "default", data: { label: "Contract" }, isDefault: true }],
    phases: [
      {
        id: "phase:one",
        title: "Phase one",
        steps: [
          { id: "step:a", title: "Step A", execute: async () => ({ status: "passed", observed: { message: "a" } }) },
          { id: "step:b", title: "Step B", execute: async () => ({ status: "passed", observed: { message: "b" } }) },
        ],
      },
    ],
  });
}

// All run artifacts live under `runs/<runId>/` — the run id is the only path
// prefix; journey/phase/step evidence nests inside the run.
async function readReport(root: string, runId: string, file = "run-report.json"): Promise<Record<string, unknown>> {
  const raw = await readFile(join(root, runId, file), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const STEP_A_DIR = "journeys/journey-contract/phases/phase-one/steps/step-a";
const STEP_B_DIR = "journeys/journey-contract/phases/phase-one/steps/step-b";

describe("interactive run artifact contract", () => {
  it("reports a whole-run verdict in run-report.json (running until all steps complete, then passed)", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    const begin = await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r1" } });
    expect(begin).toMatchObject({ status: "ok", runId: "r1" });

    const afterBegin = await readReport(artifactRoot, "r1");
    expect(afterBegin).toMatchObject({
      status: "running",
      crystallized: false,
      completion: { totalSteps: 2, completedSteps: 0, remainingSteps: 2 },
    });
    expect(afterBegin.completedAt).toBeUndefined();

    await server.callTool("runStep", { runId: "r1", phaseId: "phase:one", stepId: "step:a" });
    const afterStepA = await readReport(artifactRoot, "r1");
    expect(afterStepA).toMatchObject({
      status: "running",
      completion: { totalSteps: 2, completedSteps: 1, remainingSteps: 1 },
    });
    expect(afterStepA.completedAt).toBeUndefined();

    await server.callTool("runStep", { runId: "r1", phaseId: "phase:one", stepId: "step:b" });
    const finalized = await readReport(artifactRoot, "r1");
    expect(finalized).toMatchObject({
      status: "passed",
      summary: "All 2 steps passed.",
      completion: { totalSteps: 2, completedSteps: 2, remainingSteps: 0 },
    });
    expect(typeof finalized.completedAt).toBe("string");
  });

  it("writes a run report that links headline proof, per-step reports, and refreshes the latest symlink", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r2" } });
    await server.callTool("runStep", { runId: "r2", phaseId: "phase:one", stepId: "step:a" });
    await server.callTool("runStep", { runId: "r2", phaseId: "phase:one", stepId: "step:b" });

    const runDir = join(artifactRoot, "r2");
    expect(existsSync(join(runDir, "run-report.json"))).toBe(true);
    expect(existsSync(join(runDir, "run-report.md"))).toBe(true);
    // No legacy result.json / index.json in the new contract.
    expect(existsSync(join(runDir, "result.json"))).toBe(false);
    expect(existsSync(join(runDir, "index.json"))).toBe(false);

    const report = await readReport(artifactRoot, "r2");
    expect(report).toMatchObject({ runId: "r2", journeyId: "journey:contract", status: "passed" });
    expect(report.headline).toMatchObject({
      timeline: "timeline.json",
      metrics: "metrics.json",
      seed: "seed-manifest.json",
      ownedResources: "owned-resources.json",
    });

    const steps = report.steps as Array<{ dir: string; artifacts: Record<string, string> }>;
    expect(steps.map((step) => step.dir).sort()).toEqual([STEP_A_DIR, STEP_B_DIR]);
    expect(steps[0]?.artifacts["step-report"]).toContain("step-report.json");

    // run-report self-points so the status path links everything.
    expect(report).toMatchObject({ report: "run-report.json", humanReport: "run-report.md" });

    const humanReport = await readFile(join(runDir, "run-report.md"), "utf8");
    expect(humanReport).toContain("# Run r2");
    expect(humanReport).toContain("**Status:** passed");

    // `latest` is a convenience symlink to the newest run id.
    expect(await readlink(join(artifactRoot, "latest"))).toBe("r2");
    expect(existsSync(join(artifactRoot, "latest", "run-report.json"))).toBe(true);
  });

  it("finalizes the run when a whole phase is run at once (journey.phase path)", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r3" } });

    const phase = await server.callTool("runPhase", { runId: "r3", phaseId: "phase:one" });
    expect(phase).toMatchObject({ status: "ok", results: [{ status: "passed" }, { status: "passed" }] });

    const report = await readReport(artifactRoot, "r3");
    expect(report).toMatchObject({ status: "passed", completion: { completedSteps: 2, totalSteps: 2 } });
    expect(existsSync(join(artifactRoot, "r3", "run-report.md"))).toBe(true);
    expect(existsSync(join(artifactRoot, "r3", STEP_B_DIR, "step-report.json"))).toBe(true);
  });

  it("gives each unnamed interactive run its own directory instead of overwriting", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });

    const first = await server.callTool("beginRun", { journeyId: "journey:contract", execution: {} });
    const second = await server.callTool("beginRun", { journeyId: "journey:contract", execution: {} });
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(first.runId).not.toEqual(second.runId);

    // Each run is its own directory directly under the artifact root; `latest`
    // is a symlink (not a directory), so it is not counted.
    const entries = (await readdir(artifactRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(entries.sort()).toEqual([String(first.runId), String(second.runId)].sort());
  });
});
