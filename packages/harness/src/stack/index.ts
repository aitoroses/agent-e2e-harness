import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { z } from "zod/v4";

export interface AgentE2EStackApiContract {
  surface: 'stack-provider-contracts';
}

export type StackLifecyclePhase = 'prepare' | 'start' | 'status' | 'stop';

export interface StackStatusPacket {
  status: 'ready' | 'degraded' | 'stopped' | 'failed';
  summary: string;
  services: StackServiceStatus[];
  artifacts: Array<{ id: string; kind: string; uri: string }>;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
  next?: { actions: Array<{ id?: string; tool?: string; input?: Record<string, unknown>; why: string }> };
}

export interface StackServiceStatus {
  id: string;
  status: 'ready' | 'degraded' | 'stopped' | 'failed';
  kind?: string;
  url?: string;
  endpoints?: StackServiceEndpoint[];
  checks?: StackServiceCheck[];
}

export interface StackServiceEndpoint {
  id: string;
  kind: string;
  url?: string;
  sensitive?: boolean;
}

export interface StackServiceCheck {
  id: string;
  status: 'passed' | 'failed' | 'warning';
  summary: string;
}

export type StackLogStream = "stdout" | "stderr" | "combined";

export interface StackLogsInput {
  serviceId: string;
  tail: number;
  stream?: StackLogStream;
}

export interface StackLogEntry {
  stream?: "stdout" | "stderr";
  message: string;
}

export interface StackLogsOutput {
  status: "ok" | "failed";
  summary: string;
  serviceId: string;
  stream: StackLogStream;
  tail: number;
  entries: StackLogEntry[];
  truncated: boolean;
  error?: { code: string; message: string };
}

type MaybePromise<T> = T | Promise<T>;

type StackExploreSchema = z.ZodType<unknown>;

export type StackExploreAvailability = "dev" | "verify";
export type StackExploreRisk = "none" | "local-mutation" | "destructive" | "external-side-effect";

export interface StackExploreToolDefinition<
  THandle = unknown,
  TInputSchema extends StackExploreSchema = StackExploreSchema,
  TOutputSchema extends StackExploreSchema = StackExploreSchema,
> {
  id: string;
  title: string;
  description: string;
  availableIn: readonly StackExploreAvailability[];
  risk: StackExploreRisk;
  input: TInputSchema;
  output: TOutputSchema;
  run(args: {
    input: z.infer<TInputSchema>;
    handle: THandle;
  }): MaybePromise<z.infer<TOutputSchema>>;
}

export interface StackExploreToolDescriptor {
  id: string;
  title: string;
  description: string;
  availableIn: readonly StackExploreAvailability[];
  risk: StackExploreRisk;
  inputSchema: unknown;
  outputSchema: unknown;
}

export type StackExploreToolById<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = Extract<TTools[number], { id: TId }>;

export type StackExploreInputFor<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = z.infer<StackExploreToolById<TTools, TId>["input"]>;

export type StackExploreOutputFor<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = z.infer<StackExploreToolById<TTools, TId>["output"]>;

export type VerifySafeStackExploreTool<TTool> =
  TTool extends StackExploreToolDefinition<any, any, any>
    ? "verify" extends TTool["availableIn"][number]
      ? "none" extends TTool["risk"]
        ? TTool
        : never
      : never
    : never;

export type VerifySafeStackExploreTools<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[],
> = readonly VerifySafeStackExploreTool<TTools[number]>[];

export interface StackExploreExecutionClient<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[] = readonly StackExploreToolDefinition<any, any, any>[],
> {
  run<TId extends TTools[number]["id"]>(
    toolId: TId,
    input: StackExploreInputFor<TTools, TId>,
  ): Promise<StackExploreOutputFor<TTools, TId>>;
}

export type StackExecutionSurface<
  TTools extends readonly StackExploreToolDefinition<any, any, any>[] = readonly StackExploreToolDefinition<any, any, any>[],
> = StackStatusPacket & {
  explore: StackExploreExecutionClient<VerifySafeStackExploreTools<TTools>>;
};

export interface StackProvider<THandle = unknown> {
  readonly id: string;
  readonly explore?: readonly StackExploreToolDefinition<THandle, any, any>[];
  prepare?(): Promise<StackStatusPacket> | StackStatusPacket;
  start(): Promise<THandle>;
  status(handle: THandle): Promise<StackStatusPacket> | StackStatusPacket;
  logs?(handle: THandle, input: StackLogsInput): Promise<StackLogsOutput> | StackLogsOutput;
  stop(handle: THandle): Promise<StackStatusPacket> | StackStatusPacket;
}

export interface ProcessStackProviderConfig {
  id?: string;
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  serviceId?: string;
  serviceUrl?: string;
  readyUrl?: string;
  readyTimeoutMs?: number;
  logPath?: string;
  stopSignal?: NodeJS.Signals;
}

export interface ProcessStackHandle {
  pid: number;
  startedAt: string;
  serviceId: string;
  serviceUrl?: string;
  readyUrl?: string;
  logPath?: string;
  stop: () => Promise<void>;
  process: ChildProcess;
}

export const stackApiContract: AgentE2EStackApiContract = { surface: 'stack-provider-contracts' };


export function defineStackExploreTool<
  THandle,
  const TInputSchema extends StackExploreSchema,
  const TOutputSchema extends StackExploreSchema,
>(
  tool: StackExploreToolDefinition<THandle, TInputSchema, TOutputSchema>,
): StackExploreToolDefinition<THandle, TInputSchema, TOutputSchema> {
  assertValidExploreTool(tool);
  return tool;
}

export function defineStackExploreTools<THandle>() {
  return <
    const TTools extends readonly StackExploreToolDefinition<THandle, any, any>[],
  >(
    tools: TTools,
  ): TTools => {
    for (const tool of tools) assertValidExploreTool(tool);
    return tools;
  };
}

export function createStackExecutionSurface<
  THandle,
  const TTools extends readonly StackExploreToolDefinition<THandle, any, any>[],
>(
  status: StackStatusPacket,
  provider: { readonly explore?: TTools },
  handle: THandle,
): StackExecutionSurface<TTools> {
  return {
    ...status,
    explore: createStackExploreExecutionClient(provider, handle),
  };
}

export function createStackExploreExecutionClient<
  THandle,
  const TTools extends readonly StackExploreToolDefinition<THandle, any, any>[],
>(
  provider: { readonly explore?: TTools },
  handle: THandle,
): StackExploreExecutionClient<VerifySafeStackExploreTools<TTools>> {
  return {
    async run(toolId, input) {
      const tool = (provider.explore ?? []).find((candidate) =>
        candidate.id === toolId &&
        candidate.availableIn.includes("verify") &&
        candidate.risk === "none"
      );
      if (!tool)
        throw new Error(`Verify-safe stack exploration tool not found: ${String(toolId)}`);
      const inputResult = tool.input.safeParse(input);
      if (!inputResult.success)
        throw new Error(`Invalid stack exploration input for ${String(toolId)}: ${inputResult.error.message}`);
      const output = await tool.run({ input: inputResult.data, handle });
      const outputResult = tool.output.safeParse(output);
      if (!outputResult.success)
        throw new Error(`Invalid stack exploration output for ${String(toolId)}: ${outputResult.error.message}`);
      return outputResult.data;
    },
  };
}

export async function allocateTcpPort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("Could not allocate a TCP port."));
      });
    });
  });
}

export function createProcessStackProvider(
  config: ProcessStackProviderConfig,
): StackProvider<ProcessStackHandle> {
  const serviceId = config.serviceId ?? config.id ?? "managed-process";
  return {
    id: config.id ?? serviceId,
    async start() {
      const logFd = config.logPath ? openLogFile(config.logPath) : undefined;
      const child = spawn(config.command, [...(config.args ?? [])], {
        cwd: config.cwd,
        detached: true,
        env: { ...process.env, ...withoutUndefined(config.env ?? {}) },
        stdio:
          logFd === undefined
            ? "ignore"
            : ["ignore", logFd, logFd],
      });
      child.unref();
      if (logFd !== undefined) child.once("exit", () => closeSync(logFd));
      const handle: ProcessStackHandle = {
        pid: child.pid ?? -1,
        startedAt: new Date().toISOString(),
        serviceId,
        process: child,
        stop: () => stopProcess(child, config.stopSignal ?? "SIGTERM"),
      };
      if (config.serviceUrl) handle.serviceUrl = config.serviceUrl;
      if (config.readyUrl) handle.readyUrl = config.readyUrl;
      if (config.logPath) handle.logPath = config.logPath;

      try {
        if (config.readyUrl)
          await waitForReady(config.readyUrl, config.readyTimeoutMs ?? 90_000);
        return handle;
      } catch (error) {
        await handle.stop();
        throw error;
      }
    },
    async status(handle) {
      const ready = handle.readyUrl ? await canFetch(handle.readyUrl) : isAlive(handle);
      return processStatusPacket(ready ? "ready" : "degraded", handle);
    },
    async stop(handle) {
      await handle.stop();
      return processStatusPacket("stopped", handle);
    },
    logs(handle, input) {
      return processLogs(handle, input);
    },
  };
}

function processStatusPacket(
  status: StackStatusPacket["status"],
  handle: ProcessStackHandle,
): StackStatusPacket {
  const service: StackStatusPacket["services"][number] = {
    id: handle.serviceId,
    status,
  };
  if (handle.serviceUrl) service.url = handle.serviceUrl;
  if (handle.serviceUrl) {
    service.kind = "web";
    service.endpoints = [
      {
        id: "app",
        kind: "http",
        url: handle.serviceUrl,
        sensitive: false,
      },
    ];
  }
  service.checks = [
    {
      id: handle.readyUrl ? "http.ready" : "process.alive",
      status: status === "ready" ? "passed" : status === "degraded" ? "failed" : "warning",
      summary:
        status === "ready"
          ? `${handle.serviceId} readiness check passed.`
          : status === "degraded"
            ? `${handle.serviceId} readiness check failed.`
            : `${handle.serviceId} is not running.`,
    },
  ];
  return {
    status,
    summary:
      status === "ready"
        ? `${handle.serviceId} is ready.`
        : status === "stopped"
          ? `${handle.serviceId} stopped.`
          : `${handle.serviceId} is not ready.`,
    services: [service],
    artifacts: handle.logPath
      ? [{ id: `artifact:${handle.serviceId}:log`, kind: "log", uri: `file://${handle.logPath}` }]
      : [],
    warnings: [],
    errors:
      status === "degraded"
        ? [
            {
              code: "managed-process-not-ready",
              message: `${handle.serviceId} is not reachable at ${handle.readyUrl ?? "its readiness target"}.`,
            },
          ]
        : [],
  };
}

function processLogs(handle: ProcessStackHandle, input: StackLogsInput): StackLogsOutput {
  const stream = input.stream ?? "combined";
  if (input.serviceId !== handle.serviceId) {
    return failedLogs(input, stream, "stack-log-service-not-found", `No service named ${input.serviceId} is owned by this process stack provider.`);
  }
  if (!handle.logPath || !existsSync(handle.logPath)) {
    return failedLogs(input, stream, "stack-log-source-missing", `${handle.serviceId} does not expose a readable log file.`);
  }
  const lines = readFileSync(handle.logPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  const entries = lines.slice(-input.tail).map((message) => ({ message }));
  return {
    status: "ok",
    summary: `Read ${entries.length} log lines from ${handle.serviceId}.`,
    serviceId: input.serviceId,
    stream,
    tail: input.tail,
    entries,
    truncated: lines.length > entries.length,
  };
}

function failedLogs(
  input: StackLogsInput,
  stream: StackLogStream,
  code: string,
  message: string,
): StackLogsOutput {
  return {
    status: "failed",
    summary: message,
    serviceId: input.serviceId,
    stream,
    tail: input.tail,
    entries: [],
    truncated: false,
    error: { code, message },
  };
}

function openLogFile(path: string): number {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  writeSync(fd, `\n--- managed process start ${new Date().toISOString()} ---\n`);
  return fd;
}

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canFetch(url)) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function canFetch(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function stopProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
): Promise<void> {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      return;
    }
  }
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5_000).then(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // already stopped
      }
    }),
  ]);
}

function isAlive(handle: ProcessStackHandle): boolean {
  if (handle.pid <= 0) return false;
  try {
    process.kill(handle.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withoutUndefined(
  value: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function assertValidExploreTool(tool: StackExploreToolDefinition): void {
  if (!tool.id) throw new Error("Stack exploration tool requires id.");
  if (!tool.title) throw new Error(`Stack exploration tool ${tool.id} requires title.`);
  if (!tool.description) throw new Error(`Stack exploration tool ${tool.id} requires description.`);
  if (tool.availableIn.length === 0)
    throw new Error(`Stack exploration tool ${tool.id} requires at least one availability target.`);
  if (tool.availableIn.includes("verify") && tool.risk !== "none") {
    throw new Error(
      `Stack exploration tool ${tool.id} cannot be available in verify unless risk is none.`,
    );
  }
}
