import { statSync, watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";
import type { AnyHarnessTypes, ResourceAdapter } from "../core/index.js";
import { createMcpHarnessServer, type McpHarnessServer } from "../mcp/index.js";
import { loadAgentE2EConfig } from "./config-loader.js";
import type { AgentE2EDevMcpConfig } from "./index.js";

const RELOAD_SOURCE_EXTENSIONS = [
  ".ts", ".mts", ".cts", ".tsx",
  ".js", ".mjs", ".cjs", ".jsx",
  ".json",
];
const RELOAD_IGNORED_SEGMENTS = new Set([
  "node_modules", "dist", ".git", ".agents-e2e", "runs", ".next", ".cache",
]);

export interface ReloadingHarnessSourceOptions<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
> {
  configPath: string;
  artifactRoot?: string;
  /** Watch the config directory for edits and reload on change. Default true. */
  watch?: boolean;
}

export interface ReloadingHarnessSource {
  currentHarness(): Promise<McpHarnessServer>;
  /** Stop the filesystem watcher. */
  close(): void;
}

/**
 * Serves the MCP harness from the consumer config and reloads it in process
 * when the config or any imported journey source changes — on Node, Bun, or
 * Deno. jiti (via `loadAgentE2EConfig({ cacheBust: true })`) re-evaluates the
 * whole module graph from disk, so an edited journey is reflected without a
 * server restart and without reconnecting the MCP client.
 *
 * A recursive watch on the config directory sets a dirty flag (covering journey
 * files that live outside the config file itself). If the platform does not
 * support recursive watching, the source falls back to reloading on every read,
 * which is still correct — just less efficient.
 */
export function createReloadingHarnessSource<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(options: ReloadingHarnessSourceOptions<TTypes, TStackHandle>): ReloadingHarnessSource {
  let cachedHarness: McpHarnessServer | undefined;
  let dirty = true;
  let cachedMtimeMs = -1;
  let watcher: FSWatcher | undefined;

  if (options.watch ?? true) {
    try {
      watcher = watch(
        dirname(options.configPath),
        { recursive: true },
        (_event, filename) => {
          if (!filename) {
            dirty = true;
            return;
          }
          const name = filename.toString();
          const segments = name.split(/[\\/]/);
          if (segments.some((segment) => RELOAD_IGNORED_SEGMENTS.has(segment))) return;
          if (!RELOAD_SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))) return;
          dirty = true;
        },
      );
      watcher.unref?.();
      watcher.on("error", () => {
        // Watcher died; force per-read reloads so edits are never missed.
        watcher?.close();
        watcher = undefined;
        dirty = true;
      });
    } catch {
      // Recursive watch unsupported on this platform; reload on every read.
      watcher = undefined;
    }
  }

  return {
    async currentHarness(): Promise<McpHarnessServer> {
      // Reuse the cache only when (a) a watcher is active, (b) no change has
      // been observed, and (c) the config file's own mtime is unchanged. The
      // mtime check makes edits to the config file itself reflect immediately
      // (no dependency on async watch-event delivery); the watcher covers edits
      // to separately-imported journey files. Without a watcher, always reload.
      const mtimeMs = configMtimeMs(options.configPath);
      if (cachedHarness && !dirty && watcher && mtimeMs === cachedMtimeMs) return cachedHarness;
      dirty = false;
      cachedMtimeMs = mtimeMs;

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
      return cachedHarness;
    },
    close(): void {
      watcher?.close();
      watcher = undefined;
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

function configMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}
