import { stat } from "node:fs/promises";
import type { AnyHarnessTypes, ResourceAdapter } from "../core/index.js";
import { createMcpHarnessServer, type McpHarnessServer } from "../mcp/index.js";
import { loadAgentE2EConfig } from "./config-loader.js";
import type { AgentE2EDevMcpConfig } from "./index.js";

export interface ReloadingHarnessSourceOptions<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
> {
  configPath: string;
  artifactRoot?: string;
}

export function createReloadingHarnessSource<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(options: ReloadingHarnessSourceOptions<TTypes, TStackHandle>) {
  let cachedHarness: McpHarnessServer | undefined;
  let cachedMtimeMs = -1;

  return {
    async currentHarness(): Promise<McpHarnessServer> {
      const currentMtimeMs = await configMtime(options.configPath);
      if (cachedHarness && currentMtimeMs === cachedMtimeMs)
        return cachedHarness;

      const config = await loadAgentE2EConfig<TTypes, TStackHandle>({
        configPath: options.configPath,
        cacheBust: true,
      });
      const harness = await resolveHarness(config.harness);
      const resourceAdapters = resourceAdaptersFromConfig(config);
      cachedHarness = harness ?? createMcpHarnessServer<TTypes>({
        journeys: config.journeys,
        ...(resourceAdapters.length > 0 ? { resourceAdapters } : {}),
        ...(options.artifactRoot ?? config.artifactRoot ? { artifactRoot: options.artifactRoot ?? config.artifactRoot } : {}),
      });
      cachedMtimeMs = currentMtimeMs;
      return cachedHarness;
    },
  };
}

function resourceAdaptersFromConfig<TTypes extends AnyHarnessTypes, TStackHandle>(
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): readonly ResourceAdapter<TTypes>[] {
  const explicit = config.resourceAdapters ?? [];
  const registry = config.resourceRegistry
    ? [config.resourceRegistry.adapter as ResourceAdapter<TTypes>]
    : [];
  return [...explicit, ...registry];
}

async function resolveHarness<TTypes extends AnyHarnessTypes, TStackHandle>(
  harness: AgentE2EDevMcpConfig<TTypes, TStackHandle>["harness"],
): Promise<McpHarnessServer | undefined> {
  return typeof harness === "function" ? await harness() : harness;
}

async function configMtime(path: string): Promise<number> {
  return (await stat(path)).mtimeMs;
}
