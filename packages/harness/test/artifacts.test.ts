import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRunArtifactRecorder,
  readArtifact,
  stepRelativePath,
  writeJsonArtifact,
} from "@agent-e2e/harness/artifacts";
import { defineJourney } from "@agent-e2e/harness/core";

const tempDirs: string[] = [];

async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), "agent-e2e-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("run artifact layout", () => {
  it("nests journey/phase/step evidence inside the run directory under journeys/.../phases/.../steps/", async () => {
    const root = await tempRoot();
    const journey = defineJourney({
      id: "journey:artifact-layout",
      title: "Artifact layout",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [
        {
          id: "phase:artifact-layout",
          title: "Artifact layout",
          steps: [
            {
              id: "step:record-artifact",
              title: "Record artifact",
              execute: async () => ({ status: "passed" }),
            },
          ],
        },
      ],
    });
    const recorder = createRunArtifactRecorder({ artifactRoot: root, journeyId: journey.id, runId: "run-artifacts" }, journey);

    const artifact = await writeJsonArtifact(
      recorder.run,
      stepRelativePath(journey, "phase:artifact-layout", "step:record-artifact", "step-report.json"),
      { status: "passed" },
      { name: "step-report" },
    );

    // The run id is the only path prefix; the journey nests inside the run.
    expect(recorder.run.relDir).toContain("run-artifacts");
    expect(recorder.run.relDir).not.toContain("journey-artifact-layout");
    expect(artifact.path).toContain(
      "run-artifacts/journeys/journey-artifact-layout/phases/phase-artifact-layout/steps/step-record-artifact/step-report.json",
    );
    expect(artifact.path).not.toContain("01-phase-");
    expect(existsSync(artifact.uri.replace("file://", ""))).toBe(true);
  });

  it("reads only artifacts under the configured root", async () => {
    const root = await tempRoot();
    const recorder = createRunArtifactRecorder({ artifactRoot: root, journeyId: "journey:read", runId: "run-read" });
    const artifact = await writeJsonArtifact(recorder.run, "run-report.json", { status: "ok" }, { name: "run-report" });

    await expect(readArtifact(root, artifact.path ?? "")).resolves.toMatchObject({
      status: "ok",
      content: { status: "ok" },
    });
    // The default-root marker (`runs/`) resolves under the configured root.
    await expect(
      readArtifact(root, "runs/run-read/run-report.json"),
    ).resolves.toMatchObject({
      status: "ok",
      content: { status: "ok" },
    });
    await expect(readArtifact(root, "../package.json")).resolves.toMatchObject({
      status: "blocked",
    });
  });
});
