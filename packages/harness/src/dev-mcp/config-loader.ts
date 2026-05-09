import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

export async function loadAgentE2EConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  options: LoadAgentE2EConfigOptions = {},
): Promise<AgentE2EDevMcpConfig<TTypes, TStackHandle>> {
  const configPath = resolveAgentE2EConfigPath(options);
  assertSupportedConfigRuntime(configPath);

  const href = pathToFileURL(configPath).href;
  const imported = await import(options.cacheBust ? `${href}?mtime=${Date.now()}` : href);
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

function assertSupportedConfigRuntime(configPath: string): void {
  const extension = extname(configPath);
  if (![".ts", ".mts", ".cts"].includes(extension)) return;
  if ("Bun" in globalThis) return;
  throw new Error(
    `TypeScript Agent E2E config files require Bun as the Dev MCP runtime. Run the Dev MCP entrypoint with Bun: ${configPath}`,
  );
}
