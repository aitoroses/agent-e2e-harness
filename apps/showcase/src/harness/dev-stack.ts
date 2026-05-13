import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { resolve } from "node:path";
import {
  allocateTcpPort,
  type StackProvider,
  type StackStatusPacket,
} from "@agent-e2e/harness/stack";
import { PROOF_NOTES_SCHEMA_SQL } from "../proof-notes-contract.js";

const showcaseRoot = process.env.AGENT_E2E_SHOWCASE_ROOT ?? process.cwd();
const repoRoot = resolve(showcaseRoot, "../..");

export interface ShowcaseDevStackProviderConfig {
  appHost?: string | undefined;
  appUrl?: string | undefined;
  appPort?: string | number | undefined;
  postgresImage?: string | undefined;
  database?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
}

export interface ShowcaseDevStackHandle {
  appUrl: string;
  sidecar: ShowcaseStackSidecarClient;
}

export function createShowcaseDevStackProvider(
  config: ShowcaseDevStackProviderConfig = {},
): StackProvider<ShowcaseDevStackHandle> {
  const appHost = config.appHost ?? process.env.AGENT_E2E_SHOWCASE_HOST ?? "127.0.0.1";
  const configuredAppUrl = config.appUrl ?? process.env.AGENT_E2E_SHOWCASE_URL;
  const configuredAppPort = optionalPort(config.appPort ?? process.env.AGENT_E2E_SHOWCASE_PORT)
    ?? portFromUrl(configuredAppUrl);
  const logPath = resolve(repoRoot, "apps/showcase/.agents-e2e/logs/next-dev.log");
  const sidecarScript = resolve(showcaseRoot, "scripts/showcase-stack-sidecar.mjs");

  return {
    id: "showcase-devmode-stack",
    async start() {
      const appPort = configuredAppPort ?? await allocateTcpPort(appHost);
      const appUrl = configuredAppUrl ?? `http://${appHost}:${appPort}`;
      const sidecar = new ShowcaseStackSidecarClient(sidecarScript);
      try {
        await sidecar.start({
          appHost,
          appPort,
          appUrl,
          database: config.database ?? "proof_notes",
          logPath,
          password: config.password ?? "agent",
          postgresImage: config.postgresImage ?? process.env.AGENT_E2E_POSTGRES_IMAGE ?? "postgres:16-alpine",
          readyTimeoutMs: 90_000,
          repoRoot,
          schemaSql: PROOF_NOTES_SCHEMA_SQL,
          username: config.username ?? "agent",
        });
        const handle = { appUrl } as ShowcaseDevStackHandle;
        Object.defineProperty(handle, "sidecar", { value: sidecar, enumerable: false });
        return handle;
      } catch (error) {
        await sidecar.close();
        throw error;
      }
    },
    async status(handle) {
      return await handle.sidecar.status();
    },
    async stop(handle) {
      try {
        return await handle.sidecar.stop();
      } finally {
        await handle.sidecar.close();
      }
    },
  };
}

interface ShowcaseStackSidecarStartInput {
  appHost: string;
  appPort: number;
  appUrl: string;
  database: string;
  logPath: string;
  password: string;
  postgresImage: string;
  readyTimeoutMs: number;
  repoRoot: string;
  schemaSql: string;
  username: string;
}

type SidecarPayload = Record<string, unknown>;

class ShowcaseStackSidecarClient {
  private nextId = 1;
  private process: ChildProcessWithoutNullStreams | undefined;
  private lines: Interface | undefined;
  private pending = new Map<number, {
    reject: (error: Error) => void;
    resolve: (value: SidecarPayload) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(private readonly scriptPath: string) {}

  async start(input: ShowcaseStackSidecarStartInput): Promise<StackStatusPacket> {
    return this.stackResponse(await this.request("start", { ...input }, 120_000));
  }

  async status(): Promise<StackStatusPacket> {
    return this.stackResponse(await this.request("status", {}, 15_000));
  }

  async stop(): Promise<StackStatusPacket> {
    return this.stackResponse(await this.request("stop", {}, 30_000));
  }

  async close(): Promise<void> {
    const child = this.process;
    this.lines?.close();
    this.lines = undefined;
    this.process = undefined;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Showcase stack sidecar closed before response ${id}.`));
    }
    this.pending.clear();
    if (!child || child.killed) return;
    child.stdin.end();
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(resolve, 1_000).unref();
    });
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process) return this.process;
    const child = spawn(process.env.AGENT_E2E_SHOWCASE_NODE_BIN ?? "node", [this.scriptPath], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.once("exit", (code, signal) => {
      const error = new Error(`Showcase stack sidecar exited (${signal ?? code ?? "unknown"}).`);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pending.clear();
      this.lines?.close();
      this.lines = undefined;
      this.process = undefined;
    });
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    this.process = child;
    return child;
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SidecarPayload> {
    const child = this.ensureProcess();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Showcase stack sidecar ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { reject, resolve, timeout });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private handleLine(line: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      process.stderr.write(`[showcase-stack-sidecar] ${line}\n`);
      return;
    }
    if (!isSidecarResponse(payload)) return;
    const pending = this.pending.get(payload.id);
    if (!pending) return;
    this.pending.delete(payload.id);
    clearTimeout(pending.timeout);
    if (payload.ok) pending.resolve(payload.result);
    else pending.reject(new Error(payload.error));
  }

  private stackResponse(payload: SidecarPayload): StackStatusPacket {
    const stack = payload.stack;
    if (!isStackStatusPacket(stack))
      throw new Error("Showcase stack sidecar returned an invalid stack packet.");
    return stack;
  }
}

function isSidecarResponse(value: unknown): value is {
  error: string;
  id: number;
  ok: boolean;
  result: SidecarPayload;
} {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "number" &&
    typeof (value as { ok?: unknown }).ok === "boolean",
  );
}

function isStackStatusPacket(value: unknown): value is StackStatusPacket {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as StackStatusPacket).status === "string" &&
    Array.isArray((value as StackStatusPacket).services) &&
    Array.isArray((value as StackStatusPacket).artifacts) &&
    Array.isArray((value as StackStatusPacket).warnings) &&
    Array.isArray((value as StackStatusPacket).errors),
  );
}

function optionalPort(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535)
    throw new Error(`Invalid port: ${value}`);
  return parsed;
}

function portFromUrl(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = new URL(value);
  return optionalPort(parsed.port);
}
