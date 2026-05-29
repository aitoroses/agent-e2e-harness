import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { createRunArtifacts, safePathSegment, writeJsonArtifact } from "../artifacts/index.js";
import type { AnyHarnessTypes, ExecutableJourney, OwnedResource, ResourceAdapter, ResourceRegistry } from "../core/index.js";
import type { AgentE2EVerifyConfig } from "../verify/index.js";
import { createMcpHarnessServer, type McpHarnessServer } from "../mcp/index.js";
import type { McpToolResponse } from "../mcp/index.js";
import { normalizeToolResponse, type ToolStatus } from "../mcp/response.js";
import type {
  StackExecutionSurface,
  StackExploreToolDescriptor,
  StackLogsInput,
  StackLogStream,
  StackProvider,
  StackStatusPacket,
} from "../stack/index.js";
import {
  createRuntimeTargetRegistry,
  runRuntimeExploreTool,
  runtimeAccessStatus,
  runtimeExploreDescriptors,
  runtimeStatus,
  writeRuntimeLogsArtifact,
  type RuntimeLogsInput,
  type RuntimeTarget,
  type RuntimeTargetRegistry,
  type RuntimeToolRisk,
} from "../runtime/index.js";
import {
  DEFAULT_DEV_MCP_CONFIG_FILES,
  loadAgentE2EConfig,
  resolveAgentE2EConfigPath,
  type LoadAgentE2EConfigOptions,
} from "./config-loader.js";
import {
  browserWorkbenchInputSchema,
  browserWorkbenchSummary,
  DEV_MCP_BROWSER_WORKBENCH_TOOLS,
  implementedBrowserWorkbenchToolNames,
  type DevMcpBrowserWorkbenchController,
} from "./browser-workbench-tools.js";
import {
  createReloadingHarnessSource,
  runtimeSupportsInProcessReload,
  type ReloadingHarnessSourceOptions,
} from "./reloading-harness.js";

export {
  createReloadingHarnessSource,
  runtimeSupportsInProcessReload,
  type ReloadingHarnessSourceOptions,
};
import { StackInstanceManager, StackInstanceManagerError, stoppedStackStatus } from "./stack-instance-manager.js";

type RuntimeZod = typeof import("zod/v4").z;

export {
  DEFAULT_DEV_MCP_CONFIG_FILES,
  loadAgentE2EConfig,
  resolveAgentE2EConfigPath,
  type LoadAgentE2EConfigOptions,
};

export interface AgentE2EDevMcpApiContract {
  surface: "dev-mcp-http-server-contracts";
}

export type DevMcpToolGroup =
  | "stack"
  | "runtime"
  | "run"
  | "browser"
  | "journey"
  | "artifact"
  | "cleanup";

export interface DevMcpToolContract {
  name: DevMcpToolName;
  group: DevMcpToolGroup;
  summary: string;
}

export const DEV_MCP_TOOL_GRAMMAR = [
  "stack.start",
  "stack.list",
  "stack.status",
  "stack.logs",
  "stack.explore.list",
  "stack.explore.run",
  "stack.stop",
  "runtime.list",
  "runtime.status",
  "runtime.logs",
  "runtime.access.status",
  "runtime.explore.list",
  "runtime.explore.run",
  "journey.list",
  "journey.inspect",
  "run.begin",
  "run.reseed",
  "run.teardown",
  "cleanup.plan",
  "artifact.read",
  "journey.step",
  "journey.untilPhase",
  "journey.phase",
  ...DEV_MCP_BROWSER_WORKBENCH_TOOLS,
] as const;

export type DevMcpToolName = (typeof DEV_MCP_TOOL_GRAMMAR)[number];

export type DevMcpToolStatus = ToolStatus;

export const DEFAULT_DEV_MCP_HOST = "127.0.0.1";
export const DEFAULT_DEV_MCP_PORT = 3766;
export const DEFAULT_DEV_MCP_PATH = "/mcp";
export const DEFAULT_AGENT_E2E_DIR = ".agents-e2e";
export const DEFAULT_AGENT_E2E_ARTIFACT_ROOT = ".agents-e2e/artifacts";
export interface DevMcpToolResponse {
  status: DevMcpToolStatus;
  tool: DevMcpToolName | string;
  [key: string]: unknown;
}

export interface DevMcpBrowserSessionController extends DevMcpBrowserWorkbenchController {
  open: (input?: Record<string, unknown>) => Promise<unknown>;
  snapshot: (browserSessionId: string) => Promise<unknown>;
  close: (browserSessionId: string) => Promise<unknown>;
  closeAll?: () => Promise<unknown>;
  execution?: (browserSessionId: string) => unknown;
  list: () => unknown;
}

type DevMcpHarnessProvider = McpHarnessServer | (() => Promise<McpHarnessServer | undefined> | McpHarnessServer | undefined);

export interface DevMcpToolRouterOptions<TStackHandle = unknown> {
  journeys?: readonly ExecutableJourney<any>[];
  harness?: DevMcpHarnessProvider;
  browserSessions?: DevMcpBrowserSessionController;
  stackProvider?: StackProvider<TStackHandle>;
  runtimeTargets?: readonly RuntimeTarget[];
  runtimeTargetId?: string;
  artifactRoot?: string;
}

export interface DevMcpToolRouter {
  listTools: () => readonly DevMcpToolContract[];
  callTool: (
    name: DevMcpToolName | string,
    args?: Record<string, unknown>,
  ) => Promise<DevMcpToolResponse>;
  dispose: () => Promise<DevMcpDisposeResult>;
}

export interface DevMcpDisposeResult {
  stack?: StackStatusPacket | undefined;
  browsers?: unknown;
  errors: string[];
}

export interface DevMcpHttpServerOptions<
  TStackHandle = unknown,
> extends DevMcpToolRouterOptions<TStackHandle> {
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: readonly string[];
}

export interface DevMcpHttpServerHandle {
  host: string;
  port: number;
  path: string;
  url: string;
  close: () => Promise<void>;
}

export interface AgentE2EDevMcpConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
> {
  journeys: readonly ExecutableJourney<TTypes>[];
  resourceRegistry?: ResourceRegistry<OwnedResource<TTypes> & { kind: string; id: string }>;
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  stackProvider?: StackProvider<TStackHandle>;
  runtimeTargets?: readonly RuntimeTarget[];
  runtimeTargetId?: string;
  browserSessions?: DevMcpBrowserSessionController | false;
  harness?: DevMcpHarnessProvider;
  artifactRoot?: string;
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: readonly string[];
  verify?: AgentE2EVerifyConfig;
  installSignalHandlers?: boolean;
  logger?: Pick<Console, "log" | "error"> | false;
}

export interface AgentE2EDevMcpManifest {
  mcpUrl: string;
  artifactRoot: string;
  host: string;
  port: number;
  path: string;
  mode?: "dev" | "attached";
  runtime?: {
    targetId?: string;
    listTool: "runtime.list";
    statusTool: "runtime.status";
    logsTool: "runtime.logs";
    accessStatusTool: "runtime.access.status";
    exploreListTool: "runtime.explore.list";
    exploreRunTool: "runtime.explore.run";
  };
  stack?: {
    startTool: "stack.start";
    listTool: "stack.list";
    statusTool: "stack.status";
    logsTool: "stack.logs";
    stopTool: "stack.stop";
  };
}

export interface AgentE2EDevMcpServerHandle extends DevMcpHttpServerHandle {
  artifactRoot: string;
  manifest: AgentE2EDevMcpManifest;
}

export interface StartAgentE2EDevMcpFromConfigOptions {
  cwd?: string;
  configPath?: string;
  artifactRoot?: string;
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: readonly string[];
  installSignalHandlers?: boolean;
  logger?: Pick<Console, "log" | "error"> | false;
}

export interface StartAgentE2EAttachedFromConfigOptions extends StartAgentE2EDevMcpFromConfigOptions {
  targetId: string;
}

export const devMcpApiContract: AgentE2EDevMcpApiContract = {
  surface: "dev-mcp-http-server-contracts",
};

export function defineAgentE2EConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): AgentE2EDevMcpConfig<TTypes, TStackHandle> {
  return config;
}

export async function startAgentE2EDevMcpFromConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  options: StartAgentE2EDevMcpFromConfigOptions = {},
): Promise<AgentE2EDevMcpServerHandle> {
  const configPath = resolveAgentE2EConfigPath(options);
  const config = await loadAgentE2EConfig<TTypes, TStackHandle>({
    configPath,
    cacheBust: true,
  });
  const artifactRoot = options.artifactRoot ?? config.artifactRoot;
  const sourceOptions: ReloadingHarnessSourceOptions<TTypes, TStackHandle> = {
    configPath,
  };
  if (artifactRoot) sourceOptions.artifactRoot = artifactRoot;
  const source = createReloadingHarnessSource<TTypes, TStackHandle>(sourceOptions);
  return await startAgentE2EDevMcp<TTypes, TStackHandle>({
    ...config,
    harness: () => source.currentHarness(),
    ...(artifactRoot ? { artifactRoot } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.path ? { path: options.path } : {}),
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.installSignalHandlers !== undefined ? { installSignalHandlers: options.installSignalHandlers } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
}

export async function startAgentE2EAttachedFromConfig<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  options: StartAgentE2EAttachedFromConfigOptions,
): Promise<AgentE2EDevMcpServerHandle> {
  const configPath = resolveAgentE2EConfigPath(options);
  const config = await loadAgentE2EConfig<TTypes, TStackHandle>({
    configPath,
    cacheBust: true,
  });
  const registry = createRuntimeTargetRegistry({ targets: config.runtimeTargets ?? [] });
  const target = registry.require(options.targetId);
  if (target.kind !== "attached")
    throw new Error(`Attached Runtime Mode requires an attached Runtime Target: ${options.targetId}`);

  return await startAgentE2EDevMcp<TTypes, TStackHandle>({
    ...config,
    runtimeTargetId: options.targetId,
    ...(options.artifactRoot ? { artifactRoot: options.artifactRoot } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.path ? { path: options.path } : {}),
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.installSignalHandlers !== undefined ? { installSignalHandlers: options.installSignalHandlers } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
}

export async function startAgentE2EDevMcp<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(
  config?: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): Promise<AgentE2EDevMcpServerHandle> {
  const resolvedConfig = config ?? await loadAgentE2EConfig<TTypes, TStackHandle>();
  const artifactRoot = resolvedConfig.artifactRoot ?? process.env.AGENT_E2E_ARTIFACT_ROOT ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT;
  const host = resolvedConfig.host ?? process.env.AGENT_E2E_MCP_HOST ?? DEFAULT_DEV_MCP_HOST;
  const port = resolvedConfig.port ?? optionalPort(process.env.AGENT_E2E_MCP_PORT) ?? DEFAULT_DEV_MCP_PORT;
  const path = resolvedConfig.path ?? process.env.AGENT_E2E_MCP_PATH ?? DEFAULT_DEV_MCP_PATH;
  const resourceAdapters = resourceAdaptersFromConfig(resolvedConfig);
  const harness = resolvedConfig.harness ?? createMcpHarnessServer<TTypes>({
    journeys: resolvedConfig.journeys,
    ...(resourceAdapters.length > 0 ? { resourceAdapters } : {}),
    artifactRoot,
  });
  const browserSessions = resolvedConfig.browserSessions === false
    ? undefined
    : resolvedConfig.browserSessions ?? await createDefaultBrowserSessions(artifactRoot);

  const serverOptions: DevMcpHttpServerOptions<TStackHandle> = {
    journeys: resolvedConfig.journeys,
    harness,
    artifactRoot,
    host,
    port,
    path,
    allowedOrigins: resolvedConfig.allowedOrigins ?? localDevOrigins(host),
  };
  if (resolvedConfig.stackProvider) serverOptions.stackProvider = resolvedConfig.stackProvider;
  if (resolvedConfig.runtimeTargets) serverOptions.runtimeTargets = resolvedConfig.runtimeTargets;
  if (resolvedConfig.runtimeTargetId) serverOptions.runtimeTargetId = resolvedConfig.runtimeTargetId;
  if (browserSessions) serverOptions.browserSessions = browserSessions;
  const server = await startDevMcpStreamableHttpServer<TStackHandle>(serverOptions);
  const manifest: AgentE2EDevMcpManifest = {
    mcpUrl: server.url,
    artifactRoot,
    host: server.host,
    port: server.port,
    path: server.path,
    mode: resolvedConfig.runtimeTargetId ? "attached" : "dev",
    ...(resolvedConfig.runtimeTargets
      ? {
          runtime: {
            ...(resolvedConfig.runtimeTargetId ? { targetId: resolvedConfig.runtimeTargetId } : {}),
            listTool: "runtime.list",
            statusTool: "runtime.status",
            logsTool: "runtime.logs",
            accessStatusTool: "runtime.access.status",
            exploreListTool: "runtime.explore.list",
            exploreRunTool: "runtime.explore.run",
          },
        }
      : {}),
    ...(resolvedConfig.stackProvider
      ? {
          stack: {
            startTool: "stack.start",
            listTool: "stack.list",
            statusTool: "stack.status",
            logsTool: "stack.logs",
            stopTool: "stack.stop",
          },
        }
      : {}),
  };

  installDevMcpSignalHandlers(server, resolvedConfig);
  logDevMcpReady(server, artifactRoot, resolvedConfig);

  return {
    ...server,
    artifactRoot,
    manifest,
  };
}

async function createDefaultBrowserSessions(
  artifactRoot: string,
): Promise<DevMcpBrowserSessionController> {
  const { createPlaywrightMcpBrowserSessionManager } =
    (await import("../playwright-mcp/index.js")) as unknown as {
      createPlaywrightMcpBrowserSessionManager: (options: { artifactRoot?: string }) => DevMcpBrowserSessionController;
    };
  return createPlaywrightMcpBrowserSessionManager({ artifactRoot });
}

function installDevMcpSignalHandlers<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(
  server: DevMcpHttpServerHandle,
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): void {
  if (config.installSignalHandlers === false) return;
  const logger = config.logger === false ? undefined : config.logger ?? console;
  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      logger?.log(`\n${signal} received; stopping Agent E2E Dev MCP...`);
      try {
        await server.close();
        process.exit(0);
      } catch (error) {
        logger?.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    })();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function logDevMcpReady<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(
  server: DevMcpHttpServerHandle,
  artifactRoot: string,
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): void {
  if (config.logger === false) return;
  const logger = config.logger ?? console;
  logger.log(config.runtimeTargetId ? "Agent E2E Attached Runtime Mode ready" : "Agent E2E Dev MCP ready");
  logger.log(`  MCP:       ${server.url}`);
  logger.log(`  Codex:     codex mcp add agent-e2e --url ${server.url}`);
  logger.log(`  Claude:    claude mcp add --scope project --transport http agent-e2e ${server.url}`);
  if (config.runtimeTargetId)
    logger.log(`  Runtime:   attached target ${config.runtimeTargetId}; infrastructure lifecycle is externally owned`);
  logger.log(`  Stack:     ${config.stackProvider ? "call stack.start; use returned service URLs as browser targets" : "not configured"}`);
  logger.log("  Browser:   Playwright-owned MCP sessions enabled");
  logger.log(`  Tools:     ${config.runtimeTargets ? "runtime.*, " : ""}stack.*, run.*, journey.*, browser.*, artifact.*, cleanup.*`);
  logger.log(`  Artifacts: ${artifactRoot}`);
}

function localDevOrigins(host: string): readonly string[] {
  return [
    `http://${host}`,
    `http://${host}:0`,
    "http://localhost",
    "http://localhost:0",
  ];
}

function optionalPort(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535)
    throw new Error(`Invalid port: ${value}`);
  return parsed;
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

export function createDevMcpToolRouter<TStackHandle = unknown>(
  options: DevMcpToolRouterOptions<TStackHandle> = {},
): DevMcpToolRouter {
  const runtimeRegistry = options.runtimeTargets && options.runtimeTargets.length > 0
    ? createRuntimeTargetRegistry({ targets: options.runtimeTargets })
    : undefined;
  const stackInstances = options.stackProvider
    ? new StackInstanceManager(options.stackProvider, {
        artifactRoot: options.artifactRoot ?? DEFAULT_AGENT_E2E_ARTIFACT_ROOT,
      })
    : undefined;
  const runStackBindings = new Map<string, {
    stackId: string;
    journeyId: string;
    artifactRoot?: string | undefined;
  }>();
  const runRuntimeBindings = new Map<string, {
    targetId: string;
    kind: RuntimeTarget["kind"];
  }>();

  async function callTool(
    name: DevMcpToolName | string,
    args: Record<string, unknown> = {},
  ): Promise<DevMcpToolResponse> {
    try {
      switch (name) {
        case "journey.list":
          return fromHarness(name, await resolveHarness(options.harness), "listJourneys", args);
        case "journey.inspect":
          return fromHarness(name, await resolveHarness(options.harness), "inspectJourney", args);
        case "run.begin":
          return beginRunWithStackBinding(name, args);
        case "run.reseed":
          return reseedRunWithStackBinding(name, args);
        case "run.teardown":
          // Teardown is intentionally execution-less today: cleanup is driven by
          // the run Ownership Ledger and Resource Adapters, so it can still run
          // after the bound Stack Instance has stopped.
          return fromHarness(name, await resolveHarness(options.harness), "teardown", args);
        case "cleanup.plan":
          return fromHarness(name, await resolveHarness(options.harness), "cleanupPlan", args);
        case "artifact.read":
          return fromHarness(name, await resolveHarness(options.harness), "readArtifact", args);
        case "journey.step":
          return fromHarnessWithRunStackBinding(name, "runStep", args);
        case "journey.phase":
        case "journey.untilPhase":
          return fromHarnessWithRunStackBinding(name, "runPhase", args);
        case "stack.start": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          try {
            const started = await stackInstances!.start(optionalStackIdInput(args));
            return ok(name, {
              stackId: started.stackId,
              handle: serializableHandle(started.handle),
              stack: redactStackStatusPacket(started.stack),
              allocations: started.allocations,
            });
          } catch (error) {
            if (error instanceof StackInstanceManagerError)
              return blocked(name, error.code, error.message);
            throw error;
          }
        }
        case "stack.list": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          const listed = await stackInstances!.list();
          return ok(name, {
            stacks: listed.map((item) => ({ ...item, stack: redactStackStatusPacket(item.stack) })),
          });
        }
        case "stack.status": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          try {
            return ok(name, { stack: redactStackStatusPacket(await stackInstances!.status(optionalStackId(args))) });
          } catch (error) {
            if (error instanceof StackInstanceManagerError)
              return blocked(name, error.code, error.message);
            throw error;
          }
        }
        case "stack.logs": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          const stream = optionalStackLogStream(args);
          const input: StackLogsInput = {
            serviceId: stringArg(args, "serviceId"),
            tail: positiveIntegerArg(args, "tail"),
          };
          if (stream) input.stream = stream;
          try {
            const stackId = optionalStackId(args);
            if (stackId) {
              const incompatible = validateStackEvidenceBinding(name, args, stackId);
              if (incompatible) return incompatible;
            }
            const logs = await stackInstances!.logs(stackId, input);
            const artifact = stackId
              ? await captureStackEvidence(name, args, stackId, { logs })
              : undefined;
            return ok(name, { logs, ...(artifact ? { artifact } : {}) });
          } catch (error) {
            if (error instanceof StackInstanceManagerError)
              return blocked(name, error.code, error.message);
            throw error;
          }
        }
        case "stack.explore.list": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          return ok(name, {
            tools: await stackExploreDescriptors(options.stackProvider),
          });
        }
        case "stack.explore.run": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          const unexpectedKey = firstUnexpectedKey(args, ["stackId", "toolId", "input", "runId"]);
          if (unexpectedKey)
            return failed(name, "stack-explore-invalid-arguments", `stack.explore.run does not accept argument: ${unexpectedKey}`);
          const toolId = stringArg(args, "toolId");
          try {
            const stackId = optionalStackId(args);
            if (stackId) {
              const incompatible = validateStackEvidenceBinding(name, args, stackId);
              if (incompatible) return incompatible;
            }
            const result = await stackInstances!.exploreRun({
              toolId,
              input: args.input,
              ...(stackId ? { stackId } : {}),
            });
            const artifact = stackId
              ? await captureStackEvidence(name, args, stackId, {
                  toolId: result.toolId,
                  input: args.input,
                  output: result.output,
                })
              : undefined;
            return ok(name, { toolId: result.toolId, output: result.output, ...(artifact ? { artifact } : {}) });
          } catch (error) {
            if (error instanceof StackInstanceManagerError && error.code === "stack-id-required")
              return blocked(name, error.code, error.message);
            if (error instanceof StackInstanceManagerError && error.code === "stack-not-running")
              return blocked(name, error.code, error.message);
            if (error instanceof StackInstanceManagerError)
              return failed(name, error.code, error.message, { toolId });
            throw error;
          }
        }
        case "stack.stop": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          try {
            return ok(name, { stack: redactStackStatusPacket(await stackInstances!.stop(optionalStackId(args))) });
          } catch (error) {
            if (error instanceof StackInstanceManagerError)
              return blocked(name, error.code, error.message);
            throw error;
          }
        }
        case "runtime.list": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          return ok(name, { targets: runtimeRegistry.list() });
        }
        case "runtime.status": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          const target = resolveRuntimeTarget(runtimeRegistry, args, options.runtimeTargetId);
          return ok(name, { targetId: target.id, runtime: await runtimeStatus(target) });
        }
        case "runtime.access.status": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          const target = resolveRuntimeTarget(runtimeRegistry, args, options.runtimeTargetId);
          return ok(name, { targetId: target.id, access: await runtimeAccessStatus(target) });
        }
        case "runtime.logs": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          const target = resolveRuntimeTarget(runtimeRegistry, args, options.runtimeTargetId);
          const input: RuntimeLogsInput = {
            tail: positiveIntegerArg(args, "tail"),
          };
          const serviceId = optionalStringArg(args, "serviceId");
          const level = optionalStringArg(args, "level");
          if (serviceId) input.serviceId = serviceId;
          if (level) input.level = level;
          if (!target.logs)
            return blocked(name, "runtime-logs-unavailable", `Runtime Target ${target.id} does not expose runtime.logs.`);
          const logs = await target.logs(input);
          const artifact = await writeRuntimeLogsArtifact({
            targetId: target.id,
            logs,
            ...(options.artifactRoot ? { artifactRoot: options.artifactRoot } : {}),
          });
          return ok(name, { targetId: target.id, logs: { ...logs, artifacts: [...(logs.artifacts ?? []), artifact] }, artifact });
        }
        case "runtime.explore.list": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          const target = resolveRuntimeTarget(runtimeRegistry, args, options.runtimeTargetId);
          return ok(name, { targetId: target.id, tools: await runtimeExploreDescriptors(target) });
        }
        case "runtime.explore.run": {
          if (!runtimeRegistry)
            return missingDependency(name, "runtimeTargets");
          const unexpectedKey = firstUnexpectedKey(args, ["targetId", "toolId", "input", "journeyId", "profileId", "runId"]);
          if (unexpectedKey)
            return failed(name, "runtime-explore-invalid-arguments", `runtime.explore.run does not accept argument: ${unexpectedKey}`);
          const target = resolveRuntimeTarget(runtimeRegistry, args, options.runtimeTargetId);
          const toolId = stringArg(args, "toolId");
          const gate = runtimeExploreRiskGate(runtimeRegistry, target, toolId, args, options.journeys);
          if (gate) return gate;
          return ok(name, { targetId: target.id, toolId, output: await runRuntimeExploreTool(target, toolId, args.input) });
        }
        case "browser.open":
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          return ok(name, { result: await options.browserSessions.open(args) });
        case "browser.snapshot": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          const browserSessionId = stringArg(args, "browserSessionId");
          return ok(name, {
            result: await options.browserSessions.snapshot(browserSessionId),
          });
        }
        case "browser.find": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.find)
            return blocked(name, "browser-find-not-wired", "The browser session controller does not expose browser.find.");
          return ok(name, { result: await options.browserSessions.find(args) });
        }
        case "browser.close": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          const browserSessionId = stringArg(args, "browserSessionId");
          return ok(name, {
            result: await options.browserSessions.close(browserSessionId),
          });
        }
        case "browser.sessions":
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          return ok(name, { sessions: options.browserSessions.list() });
        case "browser.act": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.act)
            return blocked(
              name,
              "browser-act-not-wired",
              "The browser session controller does not expose browser actions.",
            );
          return ok(name, {
            result: await options.browserSessions.act(args),
          });
        }
        case "browser.wait": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.wait)
            return blocked(name, "browser-wait-not-wired", "The browser session controller does not expose conditional browser waits.");
          return ok(name, { result: await options.browserSessions.wait(args) });
        }
        case "browser.get": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.get)
            return blocked(name, "browser-get-not-wired", "The browser session controller does not expose targeted browser reads.");
          return ok(name, { result: await options.browserSessions.get(args) });
        }
        case "browser.eval": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.evaluate)
            return blocked(name, "browser-eval-not-wired", "The browser session controller does not expose page-context code execution.");
          return ok(name, { result: await options.browserSessions.evaluate(args) });
        }
        case "browser.playwright": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.playwright)
            return blocked(name, "browser-playwright-not-wired", "The browser session controller does not expose direct Playwright code execution.");
          return ok(name, { result: await options.browserSessions.playwright(args) });
        }
        case "browser.console": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.console)
            return blocked(name, "browser-console-not-wired", "The browser session controller does not expose browser console signal reads.");
          return ok(name, { result: await options.browserSessions.console(args) });
        }
        case "browser.network": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.network)
            return blocked(name, "browser-network-not-wired", "The browser session controller does not expose browser network signal reads.");
          return ok(name, { result: await options.browserSessions.network(args) });
        }
        case "browser.screenshot": {
          if (!options.browserSessions)
            return missingDependency(name, "browserSessions");
          if (!options.browserSessions.screenshot)
            return blocked(
              name,
              "browser-screenshot-not-wired",
              "The browser session controller does not expose screenshot capture.",
            );
          return ok(name, {
            result: await options.browserSessions.screenshot(args),
          });
        }
        default:
          return { status: "not-found", tool: name, subject: "tool" };
      }
    } catch (error) {
      return {
        status: "error",
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function beginRunWithStackBinding(
    name: DevMcpToolName,
    args: Record<string, unknown>,
  ): Promise<DevMcpToolResponse> {
    if (args.targetId !== undefined)
      return blocked(
        name,
        "run-target-override-unsupported",
        "run.begin resolves Runtime Target through the selected Journey Profile; targetId override is not supported in v1.",
      );

    const runtimeBinding = runtimeBindingForRun(args);
    if (!stackInstances) {
      if (args.stackId !== undefined)
        return blocked(
          name,
          "run-stack-provider-missing",
          "run.begin received stackId, but this project has no stack provider.",
        );
      return fromHarness(
        name,
        await resolveHarness(options.harness),
        "beginRun",
        withRuntimeRunArgs(
          withDevExecution(args, options.browserSessions, undefined),
          runtimeBinding?.target,
        ),
      );
    }

    const stackId = optionalStackId(args);
    if (runtimeBinding?.target.kind === "attached") {
      if (stackId)
        return blocked(
          name,
          "run-attached-stack-id-unsupported",
          "run.begin selected an attached Runtime Target through the Journey Profile and does not accept stackId.",
        );
      const response = await fromHarness(
        name,
        await resolveHarness(options.harness),
        "beginRun",
        withRuntimeRunArgs(
          withDevExecution(args, options.browserSessions, undefined),
          runtimeBinding.target,
        ),
      );
      if (response.status === "ok" && typeof response.runId === "string") {
        runRuntimeBindings.set(response.runId, {
          targetId: runtimeBinding.target.id,
          kind: runtimeBinding.target.kind,
        });
        return {
          ...response,
          runtimeTargetId: runtimeBinding.target.id,
          runtimeBinding: {
            targetId: runtimeBinding.target.id,
            kind: runtimeBinding.target.kind,
          },
        };
      }
      return response;
    }
    if (!stackId)
      return blocked(
        name,
        "run-stack-id-required",
        "run.begin requires stackId when the project has a stack provider.",
      );

    let stack: StackExecutionSurface;
    try {
      stack = await stackInstances.execution(stackId, name);
    } catch (error) {
      if (error instanceof StackInstanceManagerError)
        return blocked(name, error.code, error.message);
      throw error;
    }

    const response = await fromHarness(
      name,
      await resolveHarness(options.harness),
      "beginRun",
      withRuntimeRunArgs(
        withDevExecution(args, options.browserSessions, stack),
        runtimeBinding?.target,
      ),
    );
    if (response.status === "ok" && typeof response.runId === "string") {
      runStackBindings.set(response.runId, {
        stackId,
        journeyId: stringArg(args, "journeyId"),
        artifactRoot: optionalStringArg(args, "artifactRoot") ?? options.artifactRoot,
      });
      if (runtimeBinding?.target) {
        runRuntimeBindings.set(response.runId, {
          targetId: runtimeBinding.target.id,
          kind: runtimeBinding.target.kind,
        });
      }
      return {
        ...response,
        stackId,
        stackBinding: { stackId },
        ...(runtimeBinding?.target
          ? {
              runtimeTargetId: runtimeBinding.target.id,
              runtimeBinding: { targetId: runtimeBinding.target.id, kind: runtimeBinding.target.kind },
            }
          : {}),
      };
    }
    return response;
  }

  async function withRunStackBinding(
    name: DevMcpToolName,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const runId = stringArg(args, "runId");
    const runtimeBinding = runRuntimeBindings.get(runId);
    if (!stackInstances)
      return withRuntimeRunArgs(
        withDevExecution(args, options.browserSessions, undefined),
        runtimeBinding ? runtimeRegistry?.get(runtimeBinding.targetId) : undefined,
      );
    const binding = runStackBindings.get(runId);
    if (!binding && runtimeBinding?.kind === "attached")
      return withRuntimeRunArgs(
        withDevExecution(args, options.browserSessions, undefined),
        runtimeRegistry?.get(runtimeBinding.targetId),
      );
    if (!binding) {
      throw new StackInstanceManagerError(
        "run-stack-binding-missing",
        `${name} requires a Run Stack Binding for runId: ${runId}`,
      );
    }
    const stack = await stackInstances.execution(binding.stackId, name);
    return withRuntimeRunArgs(
      withDevExecution(args, options.browserSessions, stack),
      runtimeBinding ? runtimeRegistry?.get(runtimeBinding.targetId) : undefined,
    );
  }

  function validateStackEvidenceBinding(
    name: DevMcpToolName,
    args: Record<string, unknown>,
    stackId: string,
  ): DevMcpToolResponse | undefined {
    const runId = optionalStringArg(args, "runId");
    if (!runId) return undefined;
    const binding = runStackBindings.get(runId);
    if (!binding)
      return blocked(
        name,
        "run-stack-binding-missing",
        `${name} cannot capture artifacts for unknown or unbound runId: ${runId}`,
      );
    if (binding.stackId !== stackId)
      return blocked(
        name,
        "run-stack-binding-mismatch",
        `${name} targets stackId ${stackId}, but runId ${runId} is bound to stackId ${binding.stackId}.`,
      );
    return undefined;
  }

  async function captureStackEvidence(
    name: DevMcpToolName,
    args: Record<string, unknown>,
    stackId: string,
    evidence: Record<string, unknown>,
  ) {
    const runId = optionalStringArg(args, "runId");
    if (!runId) return undefined;
    const binding = runStackBindings.get(runId);
    if (!binding) return undefined;
    const run = createRunArtifacts({
      artifactRoot: binding.artifactRoot,
      journeyId: binding.journeyId,
      runId,
    });
    const artifactName = name === "stack.logs"
      ? "stack-logs"
      : `stack-explore-${safePathSegment(optionalStringArg(args, "toolId") ?? "run")}`;
    return await writeJsonArtifact(
      run,
      `stack-evidence/${artifactName}.json`,
      {
        runId,
        stackId,
        tool: name,
        ...evidence,
      },
      {
        name: artifactName,
        description: `Stack evidence captured by ${name} for run ${runId}.`,
      },
    );
  }

  async function fromHarnessWithRunStackBinding(
    name: DevMcpToolName,
    legacyName: string,
    args: Record<string, unknown>,
  ): Promise<DevMcpToolResponse> {
    try {
      return fromHarness(
        name,
        await resolveHarness(options.harness),
        legacyName,
        await withRunStackBinding(name, args),
      );
    } catch (error) {
      if (error instanceof StackInstanceManagerError)
        return blocked(name, error.code, error.message);
      throw error;
    }
  }

  async function reseedRunWithStackBinding(
    name: DevMcpToolName,
    args: Record<string, unknown>,
  ): Promise<DevMcpToolResponse> {
    const previousBinding = typeof args.runId === "string"
      ? runStackBindings.get(args.runId)
      : undefined;
    const previousRuntimeBinding = typeof args.runId === "string"
      ? runRuntimeBindings.get(args.runId)
      : undefined;
    const response = await fromHarnessWithRunStackBinding(name, "reseedRun", args);
    if (response.status === "ok" && previousBinding && typeof response.runId === "string") {
      runStackBindings.set(response.runId, previousBinding);
    }
    if (response.status === "ok" && previousRuntimeBinding && typeof response.runId === "string") {
      runRuntimeBindings.set(response.runId, previousRuntimeBinding);
    }
    return response;
  }

  function runtimeBindingForRun(args: Record<string, unknown>): { target: RuntimeTarget } | undefined {
    if (!runtimeRegistry || !options.journeys) return undefined;
    const journeyId = stringArg(args, "journeyId");
    const journey = options.journeys.find((candidate) => candidate.id === journeyId);
    if (!journey) return undefined;
    const profile = journey.getProfile(optionalStringArg(args, "profileId"));
    const target = runtimeRegistry.resolveProfileTarget(profile);
    return target ? { target } : undefined;
  }

  async function dispose(): Promise<DevMcpDisposeResult> {
    const errors: string[] = [];
    let stack: StackStatusPacket | undefined;
    let browsers: unknown;

    try {
      const disposed = await stackInstances?.dispose();
      stack = disposed?.stack ?? stoppedStackStatus();
      if (disposed?.errors.length) errors.push(...disposed.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    try {
      browsers = await closeBrowserSessions(options.browserSessions);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { stack, browsers, errors };
  }

  return { listTools: () => listTools(options), callTool, dispose };
}

function optionalStackIdInput(args: Record<string, unknown>): { stackId?: string } {
  const stackId = optionalStackId(args);
  return stackId ? { stackId } : {};
}

function optionalStackId(args: Record<string, unknown>): string | undefined {
  if (args.stackId === undefined) return undefined;
  if (typeof args.stackId !== "string" || args.stackId.length === 0)
    throw new Error("Invalid stackId: expected non-empty string");
  return args.stackId;
}

function resolveRuntimeTarget(
  registry: RuntimeTargetRegistry,
  args: Record<string, unknown>,
  selectedTargetId: string | undefined,
): RuntimeTarget {
  const targetId = optionalStringArg(args, "targetId")
    ?? selectedTargetId
    ?? singleRuntimeTargetId(registry);
  if (!targetId)
    throw new Error("Missing required string argument: targetId");
  return registry.require(targetId);
}

function singleRuntimeTargetId(registry: RuntimeTargetRegistry): string | undefined {
  const targets = registry.list();
  return targets.length === 1 ? targets[0]?.id : undefined;
}

function runtimeExploreRiskGate(
  registry: RuntimeTargetRegistry,
  target: RuntimeTarget,
  toolId: string,
  args: Record<string, unknown>,
  journeys: readonly ExecutableJourney<any>[] | undefined,
): DevMcpToolResponse | undefined {
  const tool = (target.explore ?? []).find((candidate) => candidate.id === toolId);
  if (!tool)
    return failed("runtime.explore.run", "runtime-explore-tool-not-found", `Unknown Runtime Exploration Tool: ${toolId}`, { targetId: target.id, toolId });
  if (tool.risk === "observation") return undefined;
  if (tool.risk === "runtimeMutation")
    return blocked(
      "runtime.explore.run",
      "runtime-mutation-blocked",
      `Runtime Exploration Tool ${toolId} has runtimeMutation risk and is blocked by default.`,
    );
  if (!profileAllowsRuntimeRisk(registry, tool.risk, toolId, args, journeys))
    return blocked(
      "runtime.explore.run",
      "run-mutation-requires-profile-opt-in",
      `Runtime Exploration Tool ${toolId} has runMutation risk and requires selected Journey Profile opt-in.`,
    );
  return undefined;
}

function profileAllowsRuntimeRisk(
  registry: RuntimeTargetRegistry,
  risk: RuntimeToolRisk,
  toolId: string,
  args: Record<string, unknown>,
  journeys: readonly ExecutableJourney<any>[] | undefined,
): boolean {
  if (risk !== "runMutation") return false;
  const journeyId = optionalStringArg(args, "journeyId");
  const profileId = optionalStringArg(args, "profileId");
  if (!journeyId || !profileId || !journeys) return false;
  const journey = journeys.find((candidate) => candidate.id === journeyId);
  const profile = journey?.getProfile(profileId);
  return profile ? registry.profileAllowsRunMutation(profile, toolId) : false;
}

async function closeBrowserSessions(
  browserSessions: DevMcpBrowserSessionController | undefined,
): Promise<unknown> {
  if (!browserSessions) return undefined;
  if (browserSessions.closeAll) return await browserSessions.closeAll();

  const sessions = browserSessions.list();
  if (!Array.isArray(sessions)) return undefined;

  const results = [];
  for (const session of sessions) {
    if (isRecord(session) && typeof session.browserSessionId === "string") {
      results.push(await browserSessions.close(session.browserSessionId));
    }
  }
  return results;
}

function listTools(
  options: DevMcpToolRouterOptions = {},
): readonly DevMcpToolContract[] {
  return implementedToolNames(options).map((name) => ({
    name,
    group: name.split(".")[0] as DevMcpToolGroup,
    summary: summaryFor(name),
  }));
}

function implementedToolNames(
  options: DevMcpToolRouterOptions,
): readonly DevMcpToolName[] {
  const tools: DevMcpToolName[] = [];

  if (options.stackProvider)
    tools.push("stack.start", "stack.list", "stack.status", "stack.logs", "stack.explore.list", "stack.explore.run", "stack.stop");

  if (options.runtimeTargets && options.runtimeTargets.length > 0)
    tools.push(
      "runtime.list",
      "runtime.status",
      "runtime.logs",
      "runtime.access.status",
      "runtime.explore.list",
      "runtime.explore.run",
    );

  if (options.harness)
    tools.push(
      "journey.list",
      "journey.inspect",
      "run.begin",
      "run.reseed",
      "run.teardown",
      "cleanup.plan",
      "artifact.read",
      "journey.step",
      "journey.phase",
      "journey.untilPhase",
    );

  if (options.browserSessions) {
    tools.push(...implementedBrowserWorkbenchToolNames(options.browserSessions));
  }

  return tools;
}

function isBrowserWorkbenchToolName(
  name: DevMcpToolName,
): name is (typeof DEV_MCP_BROWSER_WORKBENCH_TOOLS)[number] {
  return (DEV_MCP_BROWSER_WORKBENCH_TOOLS as readonly string[]).includes(name);
}

function summaryFor(name: DevMcpToolName): string {
  if (isBrowserWorkbenchToolName(name)) return browserWorkbenchSummary(name);
  const summaries: Record<DevMcpToolName, string> = {
    "journey.list": "List available journeys and profiles.",
    "journey.inspect": "Read the full Inspectable Journey Contract for a journey.",
    "stack.start": "Start the managed development stack.",
    "stack.list": "List running managed stack instances.",
    "stack.status": "Read managed stack readiness.",
    "stack.logs": "Read live managed stack service logs.",
    "stack.explore.list": "List provider-declared stack exploration tools.",
    "stack.explore.run": "Run one provider-declared stack exploration tool.",
    "stack.stop": "Stop the managed development stack.",
    "runtime.list": "List configured Runtime Targets.",
    "runtime.status": "Read Runtime Target readiness and service status.",
    "runtime.logs": "Read bounded Runtime Target logs with artifacted evidence.",
    "runtime.access.status": "Read secret-safe Runtime Target access status.",
    "runtime.explore.list": "List product-declared Runtime Exploration Tools.",
    "runtime.explore.run": "Run one product-declared Runtime Exploration Tool with risk gates.",
    "run.begin": "Begin a journey run.",
    "run.reseed":
      "Delete journey-owned resources and run environment seed again.",
    "run.teardown": "Delete journey-owned resources for a run.",
    "browser.open": browserWorkbenchSummary("browser.open"),
    "browser.sessions": browserWorkbenchSummary("browser.sessions"),
    "browser.snapshot": browserWorkbenchSummary("browser.snapshot"),
    "browser.find": browserWorkbenchSummary("browser.find"),
    "browser.act": browserWorkbenchSummary("browser.act"),
    "browser.wait": browserWorkbenchSummary("browser.wait"),
    "browser.get": browserWorkbenchSummary("browser.get"),
    "browser.eval": browserWorkbenchSummary("browser.eval"),
    "browser.playwright": browserWorkbenchSummary("browser.playwright"),
    "browser.console": browserWorkbenchSummary("browser.console"),
    "browser.network": browserWorkbenchSummary("browser.network"),
    "browser.screenshot": browserWorkbenchSummary("browser.screenshot"),
    "browser.close": browserWorkbenchSummary("browser.close"),
    "journey.step": "Run one journey step.",
    "journey.untilPhase": "Run journey steps until a phase boundary.",
    "journey.phase": "Run a journey phase.",
    "artifact.read": "Read a safe emitted artifact.",
    "cleanup.plan": "Preview journey-owned cleanup.",
  };
  return summaries[name];
}

function inputSchemaForTool(
  name: DevMcpToolName,
  z: RuntimeZod,
): Record<string, unknown> {
  if (isBrowserWorkbenchToolName(name))
    return browserWorkbenchInputSchema(name, z);

  const stringId = () => z.string().min(1);
  const optionalArray = () => z.array(z.unknown()).optional();

  switch (name) {
    case "stack.start":
      return {
        stackId: stringId().optional(),
      };
    case "stack.list":
    case "stack.explore.list":
    case "journey.list":
      return {};
    case "stack.status":
    case "stack.stop":
      return {
        stackId: stringId().describe("Stack Instance id returned by stack.start or stack.list."),
      };
    case "stack.explore.run":
      return {
        stackId: stringId().describe("Stack Instance id returned by stack.start or stack.list."),
        runId: stringId().optional().describe("Optional run id used only to attach compatible stack evidence artifacts."),
        toolId: stringId().describe("Provider-declared tool id returned by stack.explore.list."),
        input: z.unknown().describe("Input parsed by the selected provider-declared tool schema."),
      };
    case "stack.logs":
      return {
        stackId: stringId().describe("Stack Instance id returned by stack.start or stack.list."),
        runId: stringId().optional().describe("Optional run id used only to attach compatible stack log artifacts."),
        serviceId: stringId().describe("Service id returned by stack.status or stack.start."),
        tail: z.number().int().positive().describe("Number of recent log lines to return."),
        stream: z.enum(["stdout", "stderr", "combined"]).optional(),
      };
    case "runtime.list":
      return {};
    case "runtime.status":
    case "runtime.access.status":
    case "runtime.explore.list":
      return {
        targetId: stringId().optional().describe("Runtime Target id returned by runtime.list. Optional only when the server selected one target."),
      };
    case "runtime.logs":
      return {
        targetId: stringId().optional().describe("Runtime Target id returned by runtime.list. Optional only when the server selected one target."),
        serviceId: stringId().optional().describe("Optional service id returned by runtime.status."),
        tail: z.number().int().positive().describe("Number of recent log entries to return."),
        level: stringId().optional().describe("Optional best-effort provider-specific log level filter."),
      };
    case "runtime.explore.run":
      return {
        targetId: stringId().optional().describe("Runtime Target id returned by runtime.list. Optional only when the server selected one target."),
        toolId: stringId().describe("Runtime Exploration Tool id returned by runtime.explore.list."),
        input: z.unknown().describe("Input parsed by the selected product-declared tool schema."),
        journeyId: stringId().optional().describe("Journey id used with profileId for runMutation opt-in checks."),
        profileId: stringId().optional().describe("Journey Profile id used for runMutation opt-in checks."),
        runId: stringId().optional().describe("Optional run id for future artifact correlation."),
      };
    case "journey.inspect":
      return {
        journeyId: stringId().describe("Journey id returned by journey.list."),
      };
    case "run.begin":
      return {
        journeyId: stringId().describe("Journey id returned by journey.list."),
        profileId: stringId().optional(),
        runId: stringId().optional(),
        stackId: stringId().optional().describe("Required Stack Instance id when this project has a stack provider."),
        browserSessionId: stringId().optional(),
        artifactRoot: stringId().optional(),
      };
    case "run.reseed":
      return {
        runId: stringId(),
        newRunId: stringId().optional(),
        requestedResources: optionalArray(),
      };
    case "run.teardown":
      return {
        runId: stringId(),
        requestedResources: optionalArray(),
      };
    case "cleanup.plan":
      return {
        runId: stringId(),
      };
    case "artifact.read":
      return {
        artifactId: stringId().optional(),
        path: stringId().optional(),
      };
    case "journey.step":
      return {
        runId: stringId(),
        phaseId: stringId(),
        stepId: stringId(),
        browserSessionId: stringId().optional(),
      };
    case "journey.phase":
    case "journey.untilPhase":
      return {
        runId: stringId(),
        phaseId: stringId(),
      };
  }
}

async function stackExploreDescriptors<TStackHandle>(
  stackProvider: StackProvider<TStackHandle>,
): Promise<readonly StackExploreToolDescriptor[]> {
  const tools = stackProvider.explore ?? [];
  const { z } = await import("zod/v4");
  return tools.map((tool) => ({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    availableIn: tool.availableIn,
    risk: tool.risk,
    inputSchema: z.toJSONSchema(tool.input),
    outputSchema: z.toJSONSchema(tool.output),
  }));
}

async function fromHarness(
  tool: DevMcpToolName,
  harness: McpHarnessServer | undefined,
  legacyName: string,
  args: Record<string, unknown>,
): Promise<DevMcpToolResponse> {
  if (!harness) return missingDependency(tool, "harness");
  const response = await harness.callTool(legacyName, args);
  const normalized = normalizeHarnessResponse(response);
  return { ...normalized, tool };
}

async function resolveHarness(
  harness: DevMcpToolRouterOptions["harness"],
): Promise<McpHarnessServer | undefined> {
  return typeof harness === "function" ? await harness() : harness;
}

function withDevExecution(
  args: Record<string, unknown>,
  browserSessions: DevMcpBrowserSessionController | undefined,
  stack: StackExecutionSurface | undefined,
): Record<string, unknown> {
  if (args.execution !== undefined)
    return stack ? { ...args, execution: withStackStatus(args.execution, stack) } : args;
  const browserExecution = typeof args.browserSessionId === "string"
    ? browserSessions?.execution?.(args.browserSessionId)
    : undefined;
  const execution = stack ? withStackStatus(browserExecution, stack) : browserExecution;
  return execution === undefined ? args : { ...args, execution };
}

function withRuntimeRunArgs(
  args: Record<string, unknown>,
  target: RuntimeTarget | undefined,
): Record<string, unknown> {
  if (!target) return args;
  const runtimeBinding = { targetId: target.id, kind: target.kind };
  return {
    ...args,
    runtimeTargetId: target.id,
    runtimeBinding,
    execution: withRuntimeTarget(args.execution, target),
  };
}

function withRuntimeTarget(execution: unknown, target: RuntimeTarget): unknown {
  const runtime = { targetId: target.id, kind: target.kind, target };
  if (execution === undefined) return { runtime };
  if (!isRecord(execution)) return execution;
  if ("runtime" in execution) return execution;
  return { ...execution, runtime };
}

function withStackStatus(execution: unknown, stack: StackExecutionSurface): unknown {
  if (execution === undefined) return { stack };
  if (!isRecord(execution)) return execution;
  if ("stack" in execution) return execution;
  return { ...execution, stack };
}

function normalizeHarnessResponse(response: McpToolResponse): {
  status: DevMcpToolStatus;
  [key: string]: unknown;
} {
  return normalizeToolResponse(response);
}

function ok(
  tool: DevMcpToolName,
  fields: Record<string, unknown>,
): DevMcpToolResponse {
  return { status: "ok", tool, ...fields };
}

function blocked(
  tool: DevMcpToolName,
  code: string,
  message: string,
): DevMcpToolResponse {
  return {
    status: "blocked",
    tool,
    code,
    message,
  };
}

function failed(
  tool: DevMcpToolName,
  code: string,
  message: string,
  fields: Record<string, unknown> = {},
): DevMcpToolResponse {
  return {
    status: "failed",
    tool,
    code,
    message,
    ...fields,
  };
}

function missingDependency(
  tool: DevMcpToolName,
  dependency: string,
): DevMcpToolResponse {
  return blocked(
    tool,
    "dev-mcp-dependency-missing",
    `Dev MCP router requires ${dependency} to serve ${tool}.`,
  );
}

export const REDACTED_VALUE = "[redacted]";

const SECRET_KEY_PATTERN =
  /(pass(word|phrase|wd)?|secret|token|credential|api[-_]?key|access[-_]?key|private[-_]?key|connection[-_]?(string|uri|url)|\bdsn\b)/i;

const DROP_HANDLE_FIELD = Symbol("drop-handle-field");

/**
 * Project a provider handle into a transcript-safe summary before it crosses
 * the MCP tool boundary. Only top-level scalar fields (and arrays of scalars)
 * survive; nested provider objects — docker modems, sockets, the full
 * Testcontainers `inspectResult` with env, mounts, and overlay paths — are
 * dropped wholesale, and any field whose key looks like a secret (passwords,
 * tokens, DSNs, connection strings) is redacted. This stops `stack.start` from
 * echoing the entire handle (tens of KB, potential secret leak) into the tool
 * transcript while keeping the declared-safe `stack` status packet as the
 * primary, structured view of the running stack.
 */
function serializableHandle(handle: unknown): unknown {
  if (!isRecord(handle)) return handle;
  const projection: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(handle)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      projection[key] = REDACTED_VALUE;
      continue;
    }
    const scalar = scalarHandleField(value);
    if (scalar !== DROP_HANDLE_FIELD) projection[key] = scalar;
  }
  return projection;
}

function scalarHandleField(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value))
    return value.filter(
      (item) =>
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );
  // Drop nested objects, functions, and other provider internals entirely.
  return DROP_HANDLE_FIELD;
}

/**
 * Redact secret-bearing endpoints from a stack status packet before it is
 * returned in a tool response or written to an artifact. Endpoints declared
 * `sensitive: true` (e.g. a PostgreSQL DSN) have their URL masked, and any
 * service URL that matches a sensitive endpoint URL is masked too. In-process
 * journey handlers receive the unredacted execution surface separately, so this
 * only affects what the agent and artifacts see.
 */
function redactStackStatusPacket(packet: StackStatusPacket): StackStatusPacket {
  const sensitiveUrls = new Set<string>();
  const services = packet.services.map((service) => {
    const next = { ...service };
    if (service.endpoints) {
      next.endpoints = service.endpoints.map((endpoint) => {
        if (endpoint.sensitive && typeof endpoint.url === "string") {
          sensitiveUrls.add(endpoint.url);
          return { ...endpoint, url: REDACTED_VALUE };
        }
        return endpoint;
      });
    }
    if (typeof next.url === "string" && sensitiveUrls.has(next.url)) next.url = REDACTED_VALUE;
    return next;
  });
  return { ...packet, services };
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing required string argument: ${name}`);
  return value;
}

function optionalStringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstUnexpectedKey(
  args: Record<string, unknown>,
  allowedKeys: readonly string[],
): string | undefined {
  return Object.keys(args).find((key) => !allowedKeys.includes(key));
}

function positiveIntegerArg(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new Error(`Missing required positive integer argument: ${name}`);
  return value;
}

function optionalStackLogStream(args: Record<string, unknown>): StackLogStream | undefined {
  const value = args.stream;
  if (value === undefined) return undefined;
  if (value === "stdout" || value === "stderr" || value === "combined")
    return value;
  throw new Error("Invalid stack log stream: expected stdout, stderr, or combined");
}

export async function startDevMcpStreamableHttpServer<TStackHandle = unknown>(
  options: DevMcpHttpServerOptions<TStackHandle> = {},
): Promise<DevMcpHttpServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const path = options.path ?? "/mcp";
  const allowedOrigins = options.allowedOrigins ?? [
    `http://${host}`,
    `http://${host}:${options.port ?? 0}`,
  ];
  const router = createDevMcpToolRouter(options);
  const nodeServer = createServer(async (request, response) => {
    try {
      if (!validLocalRequest(request, host, allowedOrigins)) {
        writeJson(response, 403, { error: "forbidden-local-dev-origin" });
        return;
      }

      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? host}`,
      );
      if (requestUrl.pathname !== path) {
        writeJson(response, 404, { error: "not-found" });
        return;
      }

      if (request.method !== "POST") {
        writeJson(response, 405, {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        });
        return;
      }

      const parsedBody = await readJsonBody(request);
      const { McpServer } =
        (await import("@modelcontextprotocol/sdk/server/mcp.js")) as unknown as {
          McpServer: new (...args: unknown[]) => RuntimeMcpServer;
        };
      const { StreamableHTTPServerTransport } =
        (await import("@modelcontextprotocol/sdk/server/streamableHttp.js")) as unknown as {
          StreamableHTTPServerTransport: new (
            ...args: unknown[]
          ) => RuntimeMcpTransport;
        };
      const { z } = await import("zod/v4");
      const mcpServer = new McpServer({
        name: "agent-e2e-dev-mcp",
        version: "0.0.0",
      });
      let responseClosed = false;
      response.once("close", () => {
        responseClosed = true;
      });

      for (const tool of router.listTools()) {
        mcpServer.registerTool(
          tool.name,
          {
            description: tool.summary,
            inputSchema: inputSchemaForTool(tool.name, z),
          },
          async (args: unknown) => {
            const result = await router.callTool(
              tool.name,
              isRecord(args) ? args : {},
            );
            if (tool.name === "stack.start" && result.status === "ok" && responseClosed) {
              const stackId = typeof result.stackId === "string" ? result.stackId : undefined;
              if (stackId) await router.callTool("stack.stop", { stackId });
            }
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
              structuredContent: result,
            };
          },
        );
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
      response.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });
    } catch (error) {
      if (!response.headersSent) {
        writeJson(response, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
          id: null,
        });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    nodeServer.once("error", reject);
    nodeServer.listen(options.port ?? 0, host, () => {
      nodeServer.off("error", reject);
      resolve();
    });
  });

  const address = nodeServer.address() as AddressInfo;
  const port = address.port;
  return {
    host,
    port,
    path,
    url: `http://${host}:${port}${path}`,
    close: async () => {
      const disposal = await router.dispose();
      await new Promise<void>((resolve, reject) => {
        nodeServer.close((error: Error | undefined) =>
          error ? reject(error) : resolve(),
        );
      });
      if (disposal.errors.length > 0)
        throw new Error(`Dev MCP cleanup failed: ${disposal.errors.join("; ")}`);
    },
  };
}

interface RuntimeMcpServer {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    callback: (args: unknown) => Promise<unknown>,
  ) => void;
  connect: (transport: RuntimeMcpTransport) => Promise<void>;
  close: () => Promise<void>;
}

interface RuntimeMcpTransport {
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    parsedBody?: unknown,
  ) => Promise<void>;
  close: () => Promise<void>;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 0 ? JSON.parse(text) : undefined;
}

function validLocalRequest(
  request: IncomingMessage,
  host: string,
  allowedOrigins: readonly string[],
): boolean {
  const requestHost = request.headers.host?.split(":")[0];
  if (requestHost !== host && requestHost !== "localhost") return false;

  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    return (
      (originUrl.hostname === host || originUrl.hostname === "localhost") &&
      allowedOrigins.some((candidate) => originMatches(candidate, originUrl))
    );
  } catch {
    return false;
  }
}

function originMatches(candidate: string, originUrl: URL): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const dynamicPort = candidateUrl.port === "0" || candidateUrl.port === "";
    return (
      candidateUrl.protocol === originUrl.protocol &&
      candidateUrl.hostname === originUrl.hostname &&
      (dynamicPort || candidateUrl.port === originUrl.port)
    );
  } catch {
    return false;
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
