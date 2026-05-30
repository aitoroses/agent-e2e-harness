import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
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

async function readJson(root: string, runId: string, file: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(root, "journey-contract", runId, file), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("interactive run artifact contract", () => {
  it("reports a whole-run verdict in result.json (running until all steps complete, then passed)", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    const begin = await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r1" } });
    expect(begin).toMatchObject({ status: "ok", runId: "r1" });

    // After begin (no steps yet) the run-level status is `running`, NOT the
    // last-step status, and the run is explicitly not crystallized.
    const afterBegin = await readJson(artifactRoot, "r1", "result.json");
    expect(afterBegin).toMatchObject({
      status: "running",
      crystallized: false,
      completion: { totalSteps: 2, completedSteps: 0, remainingSteps: 2 },
    });
    expect(afterBegin.completedAt).toBeUndefined();

    // After the first of two steps, the run is still `running` even though the
    // step passed — this is the bug the finding flagged (last-step status was
    // masquerading as the run verdict).
    await server.callTool("runStep", { runId: "r1", phaseId: "phase:one", stepId: "step:a" });
    const afterStepA = await readJson(artifactRoot, "r1", "result.json");
    expect(afterStepA).toMatchObject({
      status: "running",
      completion: { totalSteps: 2, completedSteps: 1, remainingSteps: 1 },
    });
    expect(afterStepA.completedAt).toBeUndefined();

    // Only once every step has completed does the run read `passed`, with a
    // completedAt stamp and a human summary.
    await server.callTool("runStep", { runId: "r1", phaseId: "phase:one", stepId: "step:b" });
    const finalized = await readJson(artifactRoot, "r1", "result.json");
    expect(finalized).toMatchObject({
      status: "passed",
      summary: "All 2 steps passed.",
      completion: { totalSteps: 2, completedSteps: 2, remainingSteps: 0 },
    });
    expect(typeof finalized.completedAt).toBe("string");
  });

  it("writes a run index that links headline proof, per-step artifacts, and a journey latest pointer", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r2" } });
    await server.callTool("runStep", { runId: "r2", phaseId: "phase:one", stepId: "step:a" });
    await server.callTool("runStep", { runId: "r2", phaseId: "phase:one", stepId: "step:b" });

    const runDir = join(artifactRoot, "journey-contract", "r2");
    expect(existsSync(join(runDir, "index.json"))).toBe(true);
    expect(existsSync(join(runDir, "index.md"))).toBe(true);

    const index = await readJson(artifactRoot, "r2", "index.json");
    expect(index).toMatchObject({
      runId: "r2",
      journeyId: "journey:contract",
      status: "passed",
    });
    // Headline proof is discoverable without knowing filenames.
    expect(index.headline).toMatchObject({
      result: "result.json",
      timeline: "timeline.json",
      metrics: "metrics.json",
      seed: "seed-manifest.json",
      ownedResources: "owned-resources.json",
    });
    // Both step directories are linked with their step artifacts.
    const steps = index.steps as Array<{ dir: string; artifacts: Record<string, string> }>;
    expect(steps.map((step) => step.dir).sort()).toEqual([
      "01-phase-phase-one/01-step-step-a",
      "01-phase-phase-one/02-step-step-b",
    ]);
    expect(steps[0]?.artifacts.result).toContain("result.json");

    // result.json self-points to the index so the status path links everything.
    const result = await readJson(artifactRoot, "r2", "result.json");
    expect(result).toMatchObject({ index: "index.json", humanIndex: "index.md" });

    // Human index links headline proof.
    const humanIndex = await readFile(join(runDir, "index.md"), "utf8");
    expect(humanIndex).toContain("# Run r2");
    expect(humanIndex).toContain("**Status:** passed");
    expect(humanIndex).toContain("[result](result.json)");

    // Journey-level latest pointer lets an operator open the newest run.
    const latestRaw = await readFile(join(artifactRoot, "journey-contract", "latest.json"), "utf8");
    const latest = JSON.parse(latestRaw) as Record<string, unknown>;
    expect(latest).toMatchObject({
      runId: "r2",
      status: "passed",
      runDir: "r2",
      index: "r2/index.md",
      result: "r2/result.json",
    });
  });

  it("finalizes the run when a whole phase is run at once (journey.phase path)", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });
    await server.callTool("beginRun", { journeyId: "journey:contract", execution: { runId: "r3" } });

    // Driving the whole phase used to write NO run artifacts; the run now
    // finalizes to `passed` with per-step artifacts and an index.
    const phase = await server.callTool("runPhase", { runId: "r3", phaseId: "phase:one" });
    expect(phase).toMatchObject({ status: "ok", results: [{ status: "passed" }, { status: "passed" }] });

    const result = await readJson(artifactRoot, "r3", "result.json");
    expect(result).toMatchObject({ status: "passed", completion: { completedSteps: 2, totalSteps: 2 } });
    expect(existsSync(join(artifactRoot, "journey-contract", "r3", "index.md"))).toBe(true);
    expect(existsSync(join(artifactRoot, "journey-contract", "r3", "01-phase-phase-one", "02-step-step-b", "result.json"))).toBe(true);
  });

  it("gives each unnamed interactive run its own directory instead of overwriting", async () => {
    const artifactRoot = await tempRoot();
    const server = createMcpHarnessServer({ journeys: [twoStepJourney()], artifactRoot });

    // No execution.runId: the harness mints a unique per-run id so two
    // consecutive runs of the same journey do not collide into one directory.
    const first = await server.callTool("beginRun", { journeyId: "journey:contract", execution: {} });
    const second = await server.callTool("beginRun", { journeyId: "journey:contract", execution: {} });
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(first.runId).not.toEqual(second.runId);

    const journeyDir = join(artifactRoot, "journey-contract");
    const entries = (await readdir(journeyDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(entries.length).toBe(2);
  });
});
