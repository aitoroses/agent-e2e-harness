import type { AnyHarnessTypes, ResourceAdapter } from "../core/index.js";
import {
  DEFAULT_AGENT_E2E_ARTIFACT_ROOT,
  type AgentE2EDevMcpConfig,
} from "../dev-mcp/index.js";
import {
  loadAgentE2EConfig,
  resolveAgentE2EConfigPath,
} from "../dev-mcp/config-loader.js";
import { runVerifySuite, type VerifyRunOptions } from "./runner.js";

export * from "./selection.js";
export * from "./reporting.js";
export * from "./runner.js";

export interface RunAgentE2EVerifyFromConfigOptions extends Partial<VerifyRunOptions> {
  cwd?: string;
  configPath?: string;
}

export async function runAgentE2EVerifyFromConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  options: RunAgentE2EVerifyFromConfigOptions = {},
) {
  const configResolutionOptions: { cwd?: string; configPath?: string } = {};
  if (options.cwd) configResolutionOptions.cwd = options.cwd;
  if (options.configPath) configResolutionOptions.configPath = options.configPath;
  const configPath = resolveAgentE2EConfigPath(configResolutionOptions);
  const config = await loadAgentE2EConfig<TTypes, TStackHandle>({
    configPath,
    cacheBust: true,
  });
  return await runVerifySuite<TTypes, TStackHandle>({
    journeys: config.journeys,
    resourceAdapters: resourceAdaptersFromConfig(config),
    ...(config.stackProvider ? { stackProvider: config.stackProvider } : {}),
    ...(config.verify ? { verify: config.verify } : {}),
    options: {
      ...options,
      configPath,
      artifactRoot: options.artifactRoot
        ?? config.artifactRoot
        ?? process.env.AGENT_E2E_ARTIFACT_ROOT
        ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT,
    },
  });
}

function resourceAdaptersFromConfig<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): readonly ResourceAdapter<TTypes>[] {
  const explicit = config.resourceAdapters ?? [];
  const registry = config.resourceRegistry
    ? [config.resourceRegistry.adapter as ResourceAdapter<TTypes>]
    : [];
  return [...explicit, ...registry];
}
