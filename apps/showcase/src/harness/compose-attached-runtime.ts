import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import {
  attachedRuntime,
  defineRuntimeExploreTool,
  type RuntimeLogsInput,
  type RuntimeLogsOutput,
  type RuntimeStatusPacket,
  type RuntimeTarget,
} from "@agent-e2e/harness/runtime";
import {
  SHOWCASE_COMPOSE_TARGET_ID,
} from "../proof-notes-contract.js";

const execFileAsync = promisify(execFile);
const showcaseRoot = resolve(
  process.env.AGENT_E2E_SHOWCASE_ROOT ?? fileURLToPath(new URL("../..", import.meta.url)),
);
const composeFile = resolve(showcaseRoot, "compose.yaml");

export function createShowcaseComposeAttachedRuntimeTarget(): RuntimeTarget {
  const baseUrl = composeBaseUrl();
  return attachedRuntime({
    id: SHOWCASE_COMPOSE_TARGET_ID,
    label: "Showcase Docker Compose",
    description: "Externally started Docker Compose runtime for Attached Runtime Mode dogfood.",
    status: async () => composeStatus(baseUrl),
    logs: async (input) => composeLogs(input),
    access: [
      {
        id: "compose-runtime-logs",
        kind: "runtimeLogs",
        label: "Compose runtime logs",
        description: "Read-only Docker Compose logs for the externally owned showcase runtime.",
      },
    ],
    explore: [
      defineRuntimeExploreTool({
        id: "compose.services",
        title: "List Compose services",
        description: "Observe Docker Compose services for the externally started showcase runtime.",
        risk: "observation",
        access: ["runtimeLogs"],
        input: z.object({}),
        output: z.object({
          services: z.array(z.object({
            name: z.string(),
            status: z.string(),
          })),
        }),
        run: async () => ({ services: await composeServices() }),
      }),
    ],
  });
}

async function composeStatus(baseUrl: string): Promise<RuntimeStatusPacket> {
  const reachable = await canFetch(`${baseUrl}/api/notes`);
  return {
    status: reachable ? "ready" : "degraded",
    summary: reachable
      ? `Showcase Compose runtime ready at ${baseUrl}.`
      : `Showcase Compose runtime is not reachable at ${baseUrl}. Start it with npm run compose:up --workspace @agent-e2e/showcase.`,
    services: [
      {
        id: "showcase-web",
        kind: "next",
        status: reachable ? "ready" : "degraded",
        url: baseUrl,
      },
      {
        id: "postgres",
        kind: "postgres",
        status: "unknown",
      },
    ],
    artifacts: [],
    warnings: reachable ? [] : [{ code: "compose-runtime-not-reachable", message: "The Docker Compose runtime must be started outside attached mode." }],
    errors: [],
    next: {
      actions: [
        {
          id: "read-compose-logs",
          tool: "runtime.logs",
          input: { targetId: SHOWCASE_COMPOSE_TARGET_ID, serviceId: "showcase", tail: 80 },
          why: "Inspect recent Compose service logs.",
        },
      ],
    },
  };
}

async function composeLogs(input: RuntimeLogsInput): Promise<RuntimeLogsOutput> {
  const service = input.serviceId ?? "showcase";
  const tail = input.tail;
  try {
    const { stdout } = await dockerCompose(["logs", "--no-color", "--tail", String(tail), service]);
    const parsed = parseComposeLogs(stdout, {
      serviceId: service,
      tail,
      ...(input.level ? { level: input.level } : {}),
    });
    return {
      status: "ok",
      summary: `Returned ${parsed.entries.length} Compose log line(s) for ${service}.`,
      targetId: SHOWCASE_COMPOSE_TARGET_ID,
      serviceId: service,
      ...(input.level ? { level: input.level } : {}),
      tail,
      entries: parsed.entries,
      truncated: parsed.truncated,
    };
  } catch (error) {
    return {
      status: "failed",
      summary: error instanceof Error ? error.message : String(error),
      targetId: SHOWCASE_COMPOSE_TARGET_ID,
      serviceId: service,
      ...(input.level ? { level: input.level } : {}),
      tail,
      entries: [],
      truncated: false,
      error: {
        code: "compose-logs-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function parseComposeLogs(
  stdout: string,
  input: { serviceId: string; tail: number; level?: string },
): Pick<RuntimeLogsOutput, "tail" | "entries" | "truncated"> {
  return {
    tail: input.tail,
    entries: stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => ({
        serviceId: input.serviceId,
        message: line.replace(/^[^|]+\|\s?/, ""),
        ...(input.level ? { level: input.level } : {}),
      })),
    truncated: false,
  };
}

async function composeServices(): Promise<Array<{ name: string; status: string }>> {
  try {
    const { stdout } = await dockerCompose(["ps", "--format", "json"]);
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { Name?: string; Service?: string; State?: string; Status?: string })
      .map((service) => ({
        name: service.Service ?? service.Name ?? "unknown",
        status: service.State ?? service.Status ?? "unknown",
      }));
  } catch {
    return [];
  }
}

async function dockerCompose(args: readonly string[]) {
  return await execFileAsync("docker", ["compose", "-f", composeFile, ...args], {
    cwd: showcaseRoot,
    env: {
      ...process.env,
      AGENT_E2E_SHOWCASE_COMPOSE_URL: composeBaseUrl(),
    },
  });
}

async function canFetch(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function composeBaseUrl(): string {
  return process.env.AGENT_E2E_SHOWCASE_COMPOSE_URL ?? "http://127.0.0.1:3100";
}
