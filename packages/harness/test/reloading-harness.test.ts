import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createReloadingHarnessSource } from "../src/dev-mcp/reloading-harness.js";

const coreImport = pathToFileURL(join(process.cwd(), "dist/core/index.js")).href;

function journeySource(journeyTitle: string, phaseTitle: string): string {
  return `import { defineJourney } from ${JSON.stringify(coreImport)};
export default defineJourney({
  id: "journey:fixed",
  title: ${JSON.stringify(journeyTitle)},
  profiles: [{ id: "default", data: {}, isDefault: true }],
  phases: [{ id: "p", title: ${JSON.stringify(phaseTitle)}, steps: [{ id: "s", title: "S", execute: async () => ({ status: "passed" }) }] }],
});
`;
}

const CONFIG_SOURCE = `import journey from "./journey.ts";
export default { journeys: [journey] };
`;

async function listJourneys(harness: { callTool: (name: string, args: Record<string, unknown>) => Promise<unknown> }) {
  return (await harness.callTool("listJourneys", {})) as { journeys: Array<{ id: string; title: string }> };
}

async function inspectPhaseTitle(
  harness: { callTool: (name: string, args: Record<string, unknown>) => Promise<unknown> },
): Promise<string | undefined> {
  const response = (await harness.callTool("inspectJourney", { journeyId: "journey:fixed" })) as {
    contract?: { phases?: Array<{ title?: string }> };
  };
  return response.contract?.phases?.[0]?.title;
}

describe("reloading harness source (jiti in-process reload)", () => {
  it("serves journeys from a config that imports a separate journey file (watch mode)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    await writeFile(join(dir, "journey.ts"), journeySource("V1", "Phase V1"), "utf8");
    await writeFile(join(dir, "agent-e2e.config.ts"), CONFIG_SOURCE, "utf8");

    const source = createReloadingHarnessSource({ configPath: join(dir, "agent-e2e.config.ts") });
    try {
      expect((await listJourneys(await source.currentHarness())).journeys.map((j) => j.title)).toEqual(["V1"]);
      // Stable across repeated reads when nothing changed.
      expect((await listJourneys(await source.currentHarness())).journeys.map((j) => j.title)).toEqual(["V1"]);
    } finally {
      source.close();
    }
  });

  it("does not reload when default run artifacts are written under runs/", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    await writeFile(join(dir, "journey.ts"), journeySource("V1", "Phase V1"), "utf8");
    await writeFile(join(dir, "agent-e2e.config.ts"), CONFIG_SOURCE, "utf8");

    const source = createReloadingHarnessSource({ configPath: join(dir, "agent-e2e.config.ts") });
    try {
      const before = await source.currentHarness();
      await mkdir(join(dir, "runs", "2026-06-01t10-24-18z-abc"), { recursive: true });
      await writeFile(
        join(dir, "runs", "2026-06-01t10-24-18z-abc", "run-report.json"),
        JSON.stringify({ status: "running" }),
        "utf8",
      );
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(await source.currentHarness()).toBe(before);
    } finally {
      source.close();
    }
  });

  it("reflects an edited SEPARATE journey file in process, no restart (journey.list + journey.inspect)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    const journeyPath = join(dir, "journey.ts");
    const configPath = join(dir, "agent-e2e.config.ts");
    await writeFile(journeyPath, journeySource("V1", "Phase V1"), "utf8");
    await writeFile(configPath, CONFIG_SOURCE, "utf8");

    // watch:false exercises the deterministic per-read reload path so the test
    // does not depend on fs.watch event timing; the watcher path is proven live.
    const source = createReloadingHarnessSource({ configPath, watch: false });
    try {
      const before = await source.currentHarness();
      expect((await listJourneys(before)).journeys.map((j) => j.title)).toEqual(["V1"]);
      expect(await inspectPhaseTitle(before)).toBe("Phase V1");

      // Edit the journey file (not the config file) on disk.
      await writeFile(journeyPath, journeySource("V2", "Phase V2"), "utf8");

      const after = await source.currentHarness();
      expect((await listJourneys(after)).journeys.map((j) => j.title)).toEqual(["V2"]);
      expect(await inspectPhaseTitle(after)).toBe("Phase V2");
    } finally {
      source.close();
    }
  });
});
