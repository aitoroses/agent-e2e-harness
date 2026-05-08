import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export interface AgentE2EStackApiContract {
  surface: 'stack-provider-contracts';
}

export type StackLifecyclePhase = 'prepare' | 'start' | 'status' | 'stop';

export interface StackStatusPacket {
  status: 'ready' | 'degraded' | 'stopped' | 'failed';
  summary: string;
  services: Array<{ id: string; status: 'ready' | 'degraded' | 'stopped' | 'failed'; url?: string }>;
  artifacts: Array<{ id: string; kind: string; uri: string }>;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
}

export interface StackProvider<THandle = unknown> {
  readonly id: string;
  prepare?(): Promise<StackStatusPacket> | StackStatusPacket;
  start(): Promise<THandle>;
  status(handle: THandle): Promise<StackStatusPacket> | StackStatusPacket;
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
