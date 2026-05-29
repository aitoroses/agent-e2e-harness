import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createReloadingHarnessSource,
  runtimeSupportsInProcessReload,
} from "../src/dev-mcp/reloading-harness.js";

const coreImport = pathToFileURL(
  join(process.cwd(), "dist/core/index.js"),
).href;

function configSource(journeyId: string): string {
  return `import { defineJourney } from ${JSON.stringify(coreImport)};
export default {
  journeys: [
    defineJourney({
      id: ${JSON.stringify(journeyId)},
      title: "Journey",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [{ id: "p", title: "P", steps: [{ id: "s", title: "S", execute: async () => ({ status: "passed" }) }] }],
    }),
  ],
};
`;
}

async function listedJourneyIds(harness: { callTool: (name: string, args: Record<string, unknown>) => Promise<unknown> }): Promise<string[]> {
  const response = (await harness.callTool("listJourneys", {})) as { journeys?: Array<{ id: string }> };
  return (response.journeys ?? []).map((journey) => journey.id);
}

describe("reloading harness source", () => {
  it("reports whether the runtime can hot-reload modules in process", () => {
    // Bun ignores cache-busting import queries (keys modules by path), so it
    // cannot reload in process; Node honors them and can.
    expect(runtimeSupportsInProcessReload()).toBe(!("Bun" in globalThis));
  });

  it("serves journeys from the config and survives repeated reads with no change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    const configPath = join(dir, "agent-e2e.config.mjs");
    await writeFile(configPath, configSource("journey:v1"), "utf8");

    const source = createReloadingHarnessSource({ configPath, logger: false });
    const first = await source.currentHarness();
    expect(await listedJourneyIds(first)).toEqual(["journey:v1"]);

    // Same mtime -> same cached harness instance is reused.
    const again = await source.currentHarness();
    expect(again).toBe(first);
  });

  it("hot-reloads edited journeys in process on runtimes that support it (Node)", async () => {
    if (!runtimeSupportsInProcessReload()) return; // Bun: reload is restart-based, covered by dev --watch.

    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    const configPath = join(dir, "agent-e2e.config.mjs");
    await writeFile(configPath, configSource("journey:v1"), "utf8");

    const source = createReloadingHarnessSource({ configPath, logger: false });
    expect(await listedJourneyIds(await source.currentHarness())).toEqual(["journey:v1"]);

    // Edit the config; a later mtime must surface the new journey set.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(configPath, configSource("journey:v2"), "utf8");
    expect(await listedJourneyIds(await source.currentHarness())).toEqual(["journey:v2"]);
  });
});
