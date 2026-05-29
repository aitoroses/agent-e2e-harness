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
  logger?: Pick<Console, "warn"> | false;
}

/**
 * True only on runtimes where re-importing a module with a cache-busting query
 * actually re-evaluates it. Node honors `import(url?query)`; Bun does NOT —
 * it keys local modules by path and ignores the query, so in-process journey
 * reload is impossible under Bun (the runtime the Dev MCP mandates for `.ts`
 * configs). Under Bun, real reload comes from a process restart — use
 * `agent-e2e dev --watch` (Bun `--watch` restarts on file change behind the
 * same MCP port, and the server disposes the managed stack on exit).
 */
export function runtimeSupportsInProcessReload(): boolean {
  return !("Bun" in globalThis);
}

export function createReloadingHarnessSource<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(options: ReloadingHarnessSourceOptions<TTypes, TStackHandle>) {
  let cachedHarness: McpHarnessServer | undefined;
  let cachedMtimeMs = -1;
  let warnedNoReload = false;
  const logger = options.logger === false ? undefined : options.logger ?? console;

  return {
    async currentHarness(): Promise<McpHarnessServer> {
      const currentMtimeMs = await configMtime(options.configPath);
      if (cachedHarness && currentMtimeMs === cachedMtimeMs)
        return cachedHarness;

      if (cachedHarness && !runtimeSupportsInProcessReload()) {
        // A change was detected, but Bun cannot hot-swap the module graph in
        // process. Be honest instead of silently serving stale journeys.
        if (!warnedNoReload) {
          warnedNoReload = true;
          logger?.warn(
            "[agent-e2e] Config change detected, but Bun cannot hot-reload the journey/config modules in process. " +
              "Restart the Dev MCP server to pick up edits, or run `agent-e2e dev --watch` so Bun restarts it automatically (the managed stack is disposed on exit).",
          );
        }
        cachedMtimeMs = currentMtimeMs;
        return cachedHarness;
      }

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
