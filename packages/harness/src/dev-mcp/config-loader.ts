import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti, type Jiti } from "jiti";
import type { AnyHarnessTypes } from "../core/index.js";
import type { AgentE2EDevMcpConfig } from "./index.js";

export const DEFAULT_DEV_MCP_CONFIG_FILES = [
  "agent-e2e.config.ts",
  "agent-e2e.config.mts",
  "agent-e2e.config.js",
  "agent-e2e.config.mjs",
  "agent-e2e.config.cjs",
] as const;

export interface LoadAgentE2EConfigOptions {
  cwd?: string;
  configPath?: string;
  cacheBust?: boolean;
}

// jiti loads consumer TypeScript (config + imported journeys) on any runtime —
// Node, Bun, or Deno — so the Dev MCP no longer requires Bun. A shared instance
// is reused for cached loads; cache-busting reloads get a fresh instance with
// the in-memory module cache disabled so the whole journey/config graph
// re-evaluates from disk (real in-process hot reload), while fsCache keeps
// transpilation fast.
let sharedJiti: Jiti | undefined;

function getJiti(cacheBust: boolean): Jiti {
  if (cacheBust) return createJiti(import.meta.url, { fsCache: true, moduleCache: false });
  return (sharedJiti ??= createJiti(import.meta.url, { fsCache: true, moduleCache: true }));
}

export async function loadAgentE2EConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  options: LoadAgentE2EConfigOptions = {},
): Promise<AgentE2EDevMcpConfig<TTypes, TStackHandle>> {
  const configPath = resolveAgentE2EConfigPath(options);
  const jiti = getJiti(options.cacheBust ?? false);
  const imported = await jiti.import<Record<string, unknown>>(configPath);
  const config = (imported.default ?? imported.config ?? imported) as AgentE2EDevMcpConfig<TTypes, TStackHandle>;
  if (!config || !Array.isArray(config.journeys))
    throw new Error(`Agent E2E config must export { journeys } from ${configPath}`);
  return config;
}

export function resolveAgentE2EConfigPath(options: LoadAgentE2EConfigOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath
    ? resolve(cwd, options.configPath)
    : DEFAULT_DEV_MCP_CONFIG_FILES
      .map((candidate) => resolve(cwd, candidate))
      .find((candidate) => existsSync(candidate));
  if (!configPath)
    throw new Error(
      `Could not find Agent E2E config. Expected one of: ${DEFAULT_DEV_MCP_CONFIG_FILES.join(", ")}`,
    );
  return configPath;
}
