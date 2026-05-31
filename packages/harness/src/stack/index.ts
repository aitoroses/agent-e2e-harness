import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { z } from "zod/v4";
export {
  allocateTcpPort,
  createStackStartContext,
  type StackAllocationRecord,
  type StackArtifactPathAllocation,
  type StackArtifactPathAllocationOptions,
  type StackArtifactScope,
  type StackPortAllocation,
  type StackPortAllocationOptions,
  type StackStartContext,
  type StackStartContextOptions,
  type StackStartMode,
} from "./allocation.js";
import type { StackStartContext } from "./allocation.js";

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

type StackCapabilitySchema = z.ZodType<unknown>;

export type StackCapabilityAvailability = "dev" | "verify";
export type StackCapabilityRisk = "none" | "local-mutation" | "destructive" | "external-side-effect";

export interface StackCapabilityDefinition<
  THandle = unknown,
  TInputSchema extends StackCapabilitySchema = StackCapabilitySchema,
  TOutputSchema extends StackCapabilitySchema = StackCapabilitySchema,
> {
  id: string;
  title: string;
  description: string;
  availableIn: readonly StackCapabilityAvailability[];
  risk: StackCapabilityRisk;
  input: TInputSchema;
  output: TOutputSchema;
  run(args: {
    input: z.infer<TInputSchema>;
    handle: THandle;
  }): MaybePromise<z.infer<TOutputSchema>>;
}

export interface StackCapabilityDescriptor {
  id: string;
  title: string;
  description: string;
  availableIn: readonly StackCapabilityAvailability[];
  risk: StackCapabilityRisk;
  inputSchema: unknown;
  outputSchema: unknown;
}

export type StackCapabilityById<
  TTools extends readonly StackCapabilityDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = Extract<TTools[number], { id: TId }>;

export type StackCapabilityInputFor<
  TTools extends readonly StackCapabilityDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = z.infer<StackCapabilityById<TTools, TId>["input"]>;

export type StackCapabilityOutputFor<
  TTools extends readonly StackCapabilityDefinition<any, any, any>[],
  TId extends TTools[number]["id"],
> = z.infer<StackCapabilityById<TTools, TId>["output"]>;

export type VerifySafeStackCapability<TCapability> =
  TCapability extends StackCapabilityDefinition<any, any, any>
    ? "verify" extends TCapability["availableIn"][number]
      ? "none" extends TCapability["risk"]
        ? TCapability
        : never
      : never
    : never;

export type VerifySafeStackCapabilities<
  TCapabilities extends readonly StackCapabilityDefinition<any, any, any>[],
> = readonly VerifySafeStackCapability<TCapabilities[number]>[];

export interface StackCapabilityExecutionClient<
  TCapabilities extends readonly StackCapabilityDefinition<any, any, any>[] = readonly StackCapabilityDefinition<any, any, any>[],
> {
  run<TId extends TCapabilities[number]["id"]>(
    toolId: TId,
    input: StackCapabilityInputFor<TCapabilities, TId>,
  ): Promise<StackCapabilityOutputFor<TCapabilities, TId>>;
}

export type StackExecutionSurface<
  TCapabilities extends readonly StackCapabilityDefinition<any, any, any>[] = readonly StackCapabilityDefinition<any, any, any>[],
> = StackStatusPacket & {
  capability: StackCapabilityExecutionClient<VerifySafeStackCapabilities<TCapabilities>>;
};

export interface StackProvider<THandle = unknown> {
  readonly id: string;
  /**
   * Provider-declared stack capabilities.
   *
   * Capabilities are product/runtime-specific operations used by agents to inspect,
   * prepare, or locally mutate a managed stack when a universal `stack.*`,
   * `journey.*`, or `browser.*` operation is not expressive enough.
   */
  readonly capabilities?: readonly StackCapabilityDefinition<THandle, any, any>[];
  prepare?(): Promise<StackStatusPacket> | StackStatusPacket;
  start(context: StackStartContext): Promise<THandle>;
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
  /**
   * @deprecated Ignored as of 1.4.0. `start()` is launch-only and readiness is
   * gated by the caller (the Dev MCP `stackStart.readyTimeoutMs`), so the
   * provider no longer blocks on readiness. Kept for config compatibility.
   */
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


export function defineStackCapability<
  THandle,
  const TInputSchema extends StackCapabilitySchema,
  const TOutputSchema extends StackCapabilitySchema,
>(
  capability: StackCapabilityDefinition<THandle, TInputSchema, TOutputSchema>,
): StackCapabilityDefinition<THandle, TInputSchema, TOutputSchema> {
  assertValidCapability(capability);
  return capability;
}

export function defineStackCapabilities<THandle>() {
  return <
    const TTools extends readonly StackCapabilityDefinition<THandle, any, any>[],
  >(
    capabilities: TTools,
  ): TTools => {
    for (const capability of capabilities) assertValidCapability(capability);
    return capabilities;
  };
}

export function createStackExecutionSurface<
  THandle,
  const TCapabilities extends readonly StackCapabilityDefinition<THandle, any, any>[],
>(
  status: StackStatusPacket,
  provider: { readonly capabilities?: TCapabilities },
  handle: THandle,
): StackExecutionSurface<TCapabilities> {
  const capability = createStackCapabilityExecutionClient(provider, handle);
  return {
    ...status,
    capability,
  };
}

export function createStackCapabilityExecutionClient<
  THandle,
  const TCapabilities extends readonly StackCapabilityDefinition<THandle, any, any>[],
>(
  provider: { readonly capabilities?: TCapabilities },
  handle: THandle,
): StackCapabilityExecutionClient<VerifySafeStackCapabilities<TCapabilities>> {
  return {
    async run(toolId, input) {
      const tool = stackCapabilityDefinitions(provider).find((candidate) =>
        candidate.id === toolId &&
        candidate.availableIn.includes("verify") &&
        candidate.risk === "none"
      );
      if (!tool)
        throw new Error(`Verify-safe stack capability not found: ${String(toolId)}`);
      const inputResult = tool.input.safeParse(input);
      if (!inputResult.success)
        throw new Error(`Invalid stack capability input for ${String(toolId)}: ${inputResult.error.message}`);
      const output = await tool.run({ input: inputResult.data, handle });
      const outputResult = tool.output.safeParse(output);
      if (!outputResult.success)
        throw new Error(`Invalid stack capability output for ${String(toolId)}: ${outputResult.error.message}`);
      return outputResult.data;
    },
  };
}

export function stackCapabilityDefinitions<THandle>(
  provider: {
    readonly capabilities?: readonly StackCapabilityDefinition<THandle, any, any>[];
  },
): readonly StackCapabilityDefinition<THandle, any, any>[] {
  return provider.capabilities ?? [];
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

      // Launch-only: spawn and hand back the LIVE handle immediately. Readiness
      // is a single authority — `status()` (canFetch(readyUrl)) — and the gate
      // (how long to wait, when to give up and diagnose) is owned by the caller
      // (StackInstanceManager), which holds this handle while it polls. Waiting
      // here instead would tear the child down on timeout before any handle
      // escaped, so the failing service's logs could never be captured.
      return handle;
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

function assertValidCapability(capability: StackCapabilityDefinition): void {
  if (!capability.id) throw new Error("Stack capability requires id.");
  if (!capability.title) throw new Error(`Stack capability ${capability.id} requires title.`);
  if (!capability.description) throw new Error(`Stack capability ${capability.id} requires description.`);
  if (capability.availableIn.length === 0)
    throw new Error(`Stack capability ${capability.id} requires at least one availability target.`);
  if (capability.availableIn.includes("verify") && capability.risk !== "none") {
    throw new Error(
      `Stack capability ${capability.id} cannot be available in verify unless risk is none.`,
    );
  }
}
