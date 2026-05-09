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
  it("uses flat journey/run scoped directories with numbered phase and step segments", async () => {
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
      stepRelativePath(journey, "phase:artifact-layout", "step:record-artifact", "result.json"),
      { status: "passed" },
      { name: "result" },
    );

    expect(recorder.run.relDir).toContain("journey-artifact-layout/run-artifacts");
    expect(artifact.path).toContain("journey-artifact-layout/run-artifacts/01-phase-phase-artifact-layout/01-step-step-record-artifact/result.json");
    expect(artifact.path).not.toContain("ui-e2e");
    expect(artifact.path).not.toContain("/steps/");
    expect(existsSync(artifact.uri.replace("file://", ""))).toBe(true);
  });

  it("reads only artifacts under the configured root", async () => {
    const root = await tempRoot();
    const recorder = createRunArtifactRecorder({ artifactRoot: root, journeyId: "journey:read", runId: "run-read" });
    const artifact = await writeJsonArtifact(recorder.run, "result.json", { status: "ok" }, { name: "result" });

    await expect(readArtifact(root, artifact.path ?? "")).resolves.toMatchObject({
      status: "ok",
      content: { status: "ok" },
    });
    await expect(
      readArtifact(root, ".agents-e2e/artifacts/journey-read/run-read/result.json"),
    ).resolves.toMatchObject({
      status: "ok",
      content: { status: "ok" },
    });
    await expect(readArtifact(root, "../package.json")).resolves.toMatchObject({
      status: "blocked",
    });
  });
});
