import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AnyHarnessTypes, ExecutableJourney, ResourceAdapter } from "../core/index.js";
import { createMcpHarnessServer, type McpHarnessServer } from "../mcp/index.js";
import type { McpToolResponse } from "../mcp/index.js";
import type { StackProvider, StackStatusPacket } from "../stack/index.js";

export interface AgentE2EDevMcpApiContract {
  surface: "dev-mcp-http-server-contracts";
}

export type DevMcpToolGroup =
  | "harness"
  | "stack"
  | "run"
  | "browser"
  | "journey"
  | "artifact"
  | "cleanup"
  | "closure"
  | "proof";

export interface DevMcpToolContract {
  name: string;
  group: DevMcpToolGroup;
  summary: string;
}

export const DEV_MCP_TOOL_GRAMMAR = [
  "harness.probe",
  "stack.start",
  "stack.status",
  "stack.stop",
  "journey.prompt",
  "journey.list",
  "journey.validate",
  "run.begin",
  "run.reseed",
  "run.teardown",
  "cleanup.plan",
  "artifact.read",
  "journey.step",
  "journey.untilPhase",
  "journey.phase",
  "browser.open",
  "browser.sessions",
  "browser.snapshot",
  "browser.act",
  "browser.screenshot",
  "browser.close",
] as const;

export const FUTURE_DEV_MCP_TOOLS = [
  "run.reset",
  "run.status",
  "run.explainFailure",
  "browser.wait",
  "browser.apiCall",
  "journey.run",
  "closure.run",
  "proof.timeline",
] as const;

export type DevMcpToolName = (typeof DEV_MCP_TOOL_GRAMMAR)[number] | (typeof FUTURE_DEV_MCP_TOOLS)[number];

export type DevMcpToolStatus = "ok" | "not-found" | "blocked" | "error";

export const DEFAULT_DEV_MCP_HOST = "127.0.0.1";
export const DEFAULT_DEV_MCP_PORT = 3766;
export const DEFAULT_DEV_MCP_PATH = "/mcp";
export const DEFAULT_AGENT_E2E_DIR = ".agents-e2e";
export const DEFAULT_AGENT_E2E_ARTIFACT_ROOT = ".agents-e2e/artifacts";
export const DEFAULT_DEV_MCP_MANIFEST_PATH = ".agents-e2e/dev-mcp.json";
export const DEFAULT_DEV_MCP_CONFIG_FILES = [
  "agent-e2e.config.ts",
  "agent-e2e.config.mts",
  "agent-e2e.config.js",
  "agent-e2e.config.mjs",
  "agent-e2e.config.cjs",
] as const;

export interface DevMcpToolResponse {
  status: DevMcpToolStatus;
  tool: DevMcpToolName | string;
  [key: string]: unknown;
}

export interface DevMcpBrowserSessionController {
  open: (input?: Record<string, unknown>) => Promise<unknown>;
  snapshot: (browserSessionId: string) => Promise<unknown>;
  act?: (input: Record<string, unknown>) => Promise<unknown>;
  close: (browserSessionId: string) => Promise<unknown>;
  closeAll?: () => Promise<unknown>;
  screenshot?: (input: Record<string, unknown>) => Promise<unknown>;
  execution?: (browserSessionId: string) => unknown;
  list: () => unknown;
}

type DevMcpHarnessProvider = McpHarnessServer | (() => Promise<McpHarnessServer | undefined> | McpHarnessServer | undefined);

export interface DevMcpToolRouterOptions<TStackHandle = unknown> {
  harness?: DevMcpHarnessProvider;
  browserSessions?: DevMcpBrowserSessionController;
  stackProvider?: StackProvider<TStackHandle>;
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
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  stackProvider?: StackProvider<TStackHandle>;
  browserSessions?: DevMcpBrowserSessionController | false;
  harness?: DevMcpHarnessProvider;
  artifactRoot?: string;
  manifestPath?: string;
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: readonly string[];
  installSignalHandlers?: boolean;
  logger?: Pick<Console, "log" | "error"> | false;
}

export interface AgentE2EDevMcpManifest {
  mcpUrl: string;
  artifactRoot: string;
  host: string;
  port: number;
  path: string;
  stack?: {
    startTool: "stack.start";
    statusTool: "stack.status";
    stopTool: "stack.stop";
  };
}

export interface AgentE2EDevMcpServerHandle extends DevMcpHttpServerHandle {
  artifactRoot: string;
  manifestPath: string;
  manifest: AgentE2EDevMcpManifest;
}

export interface LoadAgentE2EConfigOptions {
  cwd?: string;
  configPath?: string;
  cacheBust?: boolean;
}

export interface StartAgentE2EDevMcpFromConfigOptions {
  cwd?: string;
  configPath?: string;
  reload?: boolean;
  artifactRoot?: string;
  manifestPath?: string;
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: readonly string[];
  installSignalHandlers?: boolean;
  logger?: Pick<Console, "log" | "error"> | false;
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
    reload: options.reload ?? true,
  };
  if (artifactRoot) sourceOptions.artifactRoot = artifactRoot;
  const source = createReloadingHarnessSource<TTypes, TStackHandle>(sourceOptions);
  return await startAgentE2EDevMcp<TTypes, TStackHandle>({
    ...config,
    harness: () => source.currentHarness(),
    ...(artifactRoot ? { artifactRoot } : {}),
    ...(options.manifestPath ? { manifestPath: options.manifestPath } : {}),
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
  const manifestPath = resolvedConfig.manifestPath ?? process.env.AGENT_E2E_DEV_MCP_MANIFEST ?? DEFAULT_DEV_MCP_MANIFEST_PATH;
  const host = resolvedConfig.host ?? process.env.AGENT_E2E_MCP_HOST ?? DEFAULT_DEV_MCP_HOST;
  const port = resolvedConfig.port ?? optionalPort(process.env.AGENT_E2E_MCP_PORT) ?? DEFAULT_DEV_MCP_PORT;
  const path = resolvedConfig.path ?? process.env.AGENT_E2E_MCP_PATH ?? DEFAULT_DEV_MCP_PATH;
  const harness = resolvedConfig.harness ?? createMcpHarnessServer<TTypes>({
    journeys: resolvedConfig.journeys,
    ...(resolvedConfig.resourceAdapters ? { resourceAdapters: resolvedConfig.resourceAdapters } : {}),
    artifactRoot,
  });
  const browserSessions = resolvedConfig.browserSessions === false
    ? undefined
    : resolvedConfig.browserSessions ?? await createDefaultBrowserSessions(artifactRoot);

  const serverOptions: DevMcpHttpServerOptions<TStackHandle> = {
    harness,
    host,
    port,
    path,
    allowedOrigins: resolvedConfig.allowedOrigins ?? localDevOrigins(host),
  };
  if (resolvedConfig.stackProvider) serverOptions.stackProvider = resolvedConfig.stackProvider;
  if (browserSessions) serverOptions.browserSessions = browserSessions;
  const server = await startDevMcpStreamableHttpServer<TStackHandle>(serverOptions);
  const manifest: AgentE2EDevMcpManifest = {
    mcpUrl: server.url,
    artifactRoot,
    host: server.host,
    port: server.port,
    path: server.path,
    ...(resolvedConfig.stackProvider
      ? { stack: { startTool: "stack.start", statusTool: "stack.status", stopTool: "stack.stop" } }
      : {}),
  };

  await writeDevMcpManifest(manifestPath, manifest);
  installDevMcpSignalHandlers(server, resolvedConfig);
  logDevMcpReady(server, manifestPath, artifactRoot, resolvedConfig);

  return {
    ...server,
    artifactRoot,
    manifestPath,
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

interface ReloadingHarnessSourceOptions<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
> {
  configPath: string;
  artifactRoot?: string;
  reload: boolean;
}

function createReloadingHarnessSource<
  TTypes extends AnyHarnessTypes,
  TStackHandle,
>(options: ReloadingHarnessSourceOptions<TTypes, TStackHandle>) {
  let cachedHarness: McpHarnessServer | undefined;
  let cachedMtimeMs = -1;

  return {
    async currentHarness(): Promise<McpHarnessServer> {
      const currentMtimeMs = options.reload ? await configMtime(options.configPath) : cachedMtimeMs;
      if (cachedHarness && (!options.reload || currentMtimeMs === cachedMtimeMs))
        return cachedHarness;

      const config = await loadAgentE2EConfig<TTypes, TStackHandle>({
        configPath: options.configPath,
        cacheBust: true,
      });
      const harness = await resolveHarness(config.harness);
      cachedHarness = harness ?? createMcpHarnessServer<TTypes>({
        journeys: config.journeys,
        ...(config.resourceAdapters ? { resourceAdapters: config.resourceAdapters } : {}),
        ...(options.artifactRoot ?? config.artifactRoot ? { artifactRoot: options.artifactRoot ?? config.artifactRoot } : {}),
      });
      cachedMtimeMs = currentMtimeMs;
      return cachedHarness;
    },
  };
}

async function configMtime(path: string): Promise<number> {
  return (await stat(path)).mtimeMs;
}

function assertSupportedConfigRuntime(configPath: string): void {
  const extension = extname(configPath);
  if (![".ts", ".mts", ".cts"].includes(extension)) return;
  if ("Bun" in globalThis) return;
  throw new Error(
    `TypeScript Agent E2E config files require Bun as the Dev MCP runtime. Run the Dev MCP entrypoint with Bun: ${configPath}`,
  );
}

async function writeDevMcpManifest(
  path: string,
  manifest: AgentE2EDevMcpManifest,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
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
  manifestPath: string,
  artifactRoot: string,
  config: AgentE2EDevMcpConfig<TTypes, TStackHandle>,
): void {
  if (config.logger === false) return;
  const logger = config.logger ?? console;
  logger.log("Agent E2E Dev MCP ready");
  logger.log(`  MCP:       ${server.url}`);
  logger.log(`  Stack:     ${config.stackProvider ? "call stack.start; use returned service URLs as browser targets" : "not configured"}`);
  logger.log("  Browser:   Playwright-owned MCP sessions enabled");
  logger.log(`  Artifacts: ${artifactRoot}`);
  logger.log(`  Manifest:  ${manifestPath}`);
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

export function createDevMcpToolRouter<TStackHandle = unknown>(
  options: DevMcpToolRouterOptions<TStackHandle> = {},
): DevMcpToolRouter {
  let stackHandle: TStackHandle | undefined;
  let stoppingStack = false;

  async function callTool(
    name: DevMcpToolName | string,
    args: Record<string, unknown> = {},
  ): Promise<DevMcpToolResponse> {
    try {
      switch (name) {
        case "harness.probe":
          return ok(name, {
            surface: devMcpApiContract.surface,
            tools: listTools(),
            ready: true,
          });
        case "journey.list":
          return fromHarness(name, await resolveHarness(options.harness), "listJourneys", args);
        case "journey.validate":
        case "journey.prompt":
          return ok(name, {
            accepted: true,
            next: { actions: [{ id: "list-journeys", tool: "journey.list" }] },
          });
        case "run.begin":
          return fromHarness(
            name,
            await resolveHarness(options.harness),
            "beginRun",
            withDevExecution(args, options.browserSessions, await currentStackStatus()),
          );
        case "run.reseed":
          return fromHarness(name, await resolveHarness(options.harness), "reseedRun", args);
        case "run.teardown":
          return fromHarness(name, await resolveHarness(options.harness), "teardown", args);
        case "cleanup.plan":
          return fromHarness(name, await resolveHarness(options.harness), "cleanupPlan", args);
        case "artifact.read":
          return fromHarness(name, await resolveHarness(options.harness), "readArtifact", args);
        case "journey.step":
          return fromHarness(
            name,
            await resolveHarness(options.harness),
            "runStep",
            withDevExecution(args, options.browserSessions, await currentStackStatus()),
          );
        case "journey.phase":
        case "journey.untilPhase":
          return fromHarness(name, await resolveHarness(options.harness), "runPhase", args);
        case "journey.run":
          return blocked(
            name,
            "journey-run-requires-orchestrator",
            "Run journey via run.begin plus journey.phase until the Dev MCP orchestrator is installed.",
          );
        case "closure.run":
          return blocked(
            name,
            "closure-run-requires-orchestrator",
            "Closure will be wired after managed stack and headless browser contracts are installed.",
          );
        case "stack.start": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          if (stackHandle !== undefined)
            return blocked(
              name,
              "stack-already-running",
              "A managed stack is already active. Call stack.stop before starting another stack.",
            );
          stackHandle = await options.stackProvider.start();
          const status = await options.stackProvider.status(stackHandle);
          return ok(name, {
            handle: serializableHandle(stackHandle),
            stack: status,
          });
        }
        case "stack.status": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          if (stackHandle === undefined)
            return ok(name, { stack: stoppedStackStatus() });
          return ok(name, {
            stack: await options.stackProvider.status(stackHandle),
          });
        }
        case "stack.stop": {
          if (!options.stackProvider)
            return missingDependency(name, "stackProvider");
          if (stackHandle === undefined)
            return ok(name, { stack: stoppedStackStatus() });
          const stopped = await stopActiveStack();
          return ok(name, { stack: stopped });
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
        case "run.reset":
        case "run.status":
        case "run.explainFailure":
        case "proof.timeline":
          return blocked(
            name,
            "run-or-proof-tool-not-wired",
            `${name} is reserved for the future Dev MCP grammar and is not implemented yet.`,
          );
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

  async function stopActiveStack(): Promise<StackStatusPacket> {
    if (!options.stackProvider || stackHandle === undefined)
      return stoppedStackStatus();
    if (stoppingStack)
      return {
        status: "degraded",
        summary: "Managed stack stop is already in progress.",
        services: [],
        artifacts: [],
        warnings: [{ code: "stack-stop-in-progress", message: "Managed stack stop is already in progress." }],
        errors: [],
      };

    stoppingStack = true;
    const handle = stackHandle;
    stackHandle = undefined;
    try {
      return await options.stackProvider.stop(handle);
    } finally {
      stoppingStack = false;
    }
  }

  async function currentStackStatus(): Promise<StackStatusPacket | undefined> {
    if (!options.stackProvider || stackHandle === undefined) return undefined;
    return await options.stackProvider.status(stackHandle);
  }

  async function dispose(): Promise<DevMcpDisposeResult> {
    const errors: string[] = [];
    let stack: StackStatusPacket | undefined;
    let browsers: unknown;

    try {
      stack = await stopActiveStack();
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
  const tools: DevMcpToolName[] = ["harness.probe"];

  if (options.stackProvider)
    tools.push("stack.start", "stack.status", "stack.stop");

  if (options.harness)
    tools.push(
      "journey.list",
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
    tools.push(
      "browser.open",
      "browser.sessions",
      "browser.snapshot",
      "browser.close",
    );
    if (options.browserSessions.act) tools.push("browser.act");
    if (options.browserSessions.screenshot) tools.push("browser.screenshot");
  }

  return tools;
}

function summaryFor(name: DevMcpToolName): string {
  const summaries: Record<DevMcpToolName, string> = {
    "journey.prompt": "Register or validate a textual journey prompt.",
    "journey.list": "List available journeys and profiles.",
    "journey.validate": "Validate journey grammar before execution.",
    "harness.probe": "Report Dev MCP server capabilities and readiness.",
    "stack.start": "Start the managed development stack.",
    "stack.status": "Read managed stack readiness.",
    "stack.stop": "Stop the managed development stack.",
    "run.begin": "Begin a journey run.",
    "run.reset": "Reset run state without deleting external resources.",
    "run.status": "Read current run state.",
    "run.reseed":
      "Delete journey-owned resources and run environment seed again.",
    "run.explainFailure":
      "Summarize the current failure with suggested next tools.",
    "run.teardown": "Delete journey-owned resources for a run.",
    "browser.open": "Open an MCP-owned browser session.",
    "browser.sessions": "List MCP-owned browser sessions.",
    "browser.snapshot": "Capture the primary browser forensics packet.",
    "browser.act": "Act on a current browser snapshot ref.",
    "browser.wait": "Wait for browser-visible state.",
    "browser.apiCall": "Exercise an application API from the browser context.",
    "browser.screenshot": "Capture a supporting screenshot artifact.",
    "browser.close": "Close an MCP-owned browser session.",
    "journey.step": "Run one journey step.",
    "journey.untilPhase": "Run journey steps until a phase boundary.",
    "journey.phase": "Run a journey phase.",
    "journey.run": "Run a journey through completion.",
    "closure.run": "Run headless closure from a clean environment.",
    "artifact.read": "Read a safe emitted artifact.",
    "cleanup.plan": "Preview journey-owned cleanup.",
    "proof.timeline": "Read the proof timeline artifact.",
  };
  return summaries[name];
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
  stack: StackStatusPacket | undefined,
): Record<string, unknown> {
  if (args.execution !== undefined)
    return stack ? { ...args, execution: withStackStatus(args.execution, stack) } : args;
  const browserExecution = typeof args.browserSessionId === "string"
    ? browserSessions?.execution?.(args.browserSessionId)
    : undefined;
  const execution = stack ? withStackStatus(browserExecution, stack) : browserExecution;
  return execution === undefined ? args : { ...args, execution };
}

function withStackStatus(execution: unknown, stack: StackStatusPacket): unknown {
  if (execution === undefined) return { stack };
  if (!isRecord(execution)) return execution;
  if ("stack" in execution) return execution;
  return { ...execution, stack };
}

function normalizeHarnessResponse(response: McpToolResponse): {
  status: DevMcpToolStatus;
  [key: string]: unknown;
} {
  if (
    response.status === "ok" ||
    response.status === "blocked" ||
    response.status === "not-found" ||
    response.status === "error"
  ) {
    return response as { status: DevMcpToolStatus; [key: string]: unknown };
  }
  return {
    status: "error",
    error: `Unsupported harness response status: ${response.status}`,
  };
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
    next: { actions: [{ id: "inspect-capabilities", tool: "harness.probe" }] },
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

function stoppedStackStatus(): StackStatusPacket {
  return {
    status: "stopped",
    summary: "No managed stack handle is active.",
    services: [],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}

function serializableHandle(handle: unknown): unknown {
  if (!isRecord(handle)) return handle;
  return Object.fromEntries(
    Object.entries(handle)
      .filter(([, value]) => isSerializableHandleField(value))
      .map(([key, value]) => [key, serializableHandleValue(value)]),
  );
}

function serializableHandleValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.filter(isSerializableHandleField).map(serializableHandleValue);
  if (isRecord(value)) return serializableHandle(value);
  return value;
}

function isSerializableHandleField(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (isRecord(value) && !("pid" in value || "stdin" in value || "stdout" in value))
  );
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing required string argument: ${name}`);
  return value;
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
      const { z } = (await import("zod/v4")) as unknown as {
        z: {
          object: (shape: Record<string, unknown>) => {
            passthrough: () => unknown;
          };
        };
      };
      const mcpServer = new McpServer({
        name: "agent-e2e-dev-mcp",
        version: "0.0.0",
      });
      const inputSchema = z.object({}).passthrough();

      for (const tool of router.listTools()) {
        mcpServer.registerTool(
          tool.name,
          { description: tool.summary, inputSchema },
          async (args: unknown) => {
            const result = await router.callTool(
              tool.name,
              isRecord(args) ? args : {},
            );
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
