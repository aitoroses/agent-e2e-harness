import { resolve } from "node:path";
import { z } from "zod/v4";
import {
  allocateTcpPort,
  createProcessStackProvider,
  defineStackExploreTools,
  type ProcessStackHandle,
  type StackLogsInput,
  type StackLogsOutput,
  type StackExecutionSurface,
  type StackProvider,
  type StackStatusPacket,
} from "@agent-e2e/harness/stack";
import {
  createPostgresTestcontainersProvider,
  type PostgresStackHandle,
} from "./postgres-testcontainers.js";
import { PROOF_NOTES_SCHEMA_SQL } from "../proof-notes-contract.js";

const showcaseRoot = resolve(process.env.AGENT_E2E_SHOWCASE_ROOT ?? process.cwd());

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
  postgresHandle: PostgresStackHandle;
  appHandle: ProcessStackHandle;
  app: StackProvider<ProcessStackHandle>;
}

export const showcaseExploreTools = defineStackExploreTools<ShowcaseDevStackHandle>()([
  {
    id: "notes.list",
    title: "List proof notes",
    description: "Read proof notes from the showcase PostgreSQL database.",
    availableIn: ["dev", "verify"],
    risk: "none",
    input: z.object({
      limit: z.number().int().positive().max(100).optional(),
    }),
    output: z.object({
      notes: z.array(z.object({
        id: z.string(),
        body: z.string(),
        workspaceId: z.string(),
        authorId: z.string(),
        ownedByRun: z.string(),
        createdAt: z.string(),
      })),
    }),
    async run({ input, handle }) {
      const rows = await queryPostgres<{
        id: string;
        body: string;
        workspace_id: string;
        author_id: string;
        owned_by_run: string;
        created_at: Date;
      }>(
        handle.postgresHandle.connectionUri,
        "select id, body, workspace_id, author_id, owned_by_run, created_at from proof_notes order by created_at desc limit $1",
        [input.limit ?? 20],
      );
      return {
        notes: rows.rows.map((row) => ({
          id: row.id,
          body: row.body,
          workspaceId: row.workspace_id,
          authorId: row.author_id,
          ownedByRun: row.owned_by_run,
          createdAt: row.created_at.toISOString(),
        })),
      };
    },
  },
  {
    id: "postgres.query",
    title: "Run PostgreSQL query",
    description: "Run SQL against the local showcase PostgreSQL database.",
    availableIn: ["dev"],
    risk: "local-mutation",
    input: z.object({
      sql: z.string().min(1),
    }),
    output: z.object({
      rows: z.array(z.record(z.string(), z.unknown())),
      rowCount: z.number().nullable(),
    }),
    async run({ input, handle }) {
      return await queryPostgres<Record<string, unknown>>(
        handle.postgresHandle.connectionUri,
        input.sql,
      );
    },
  },
]);

export type ShowcaseStackExecution = StackExecutionSurface<typeof showcaseExploreTools>;

export function createShowcaseDevStackProvider(
  config: ShowcaseDevStackProviderConfig = {},
): StackProvider<ShowcaseDevStackHandle> {
  const appHost = config.appHost ?? process.env.AGENT_E2E_SHOWCASE_HOST ?? "127.0.0.1";
  const configuredAppUrl = config.appUrl ?? process.env.AGENT_E2E_SHOWCASE_URL;
  const configuredAppPort = optionalPort(config.appPort ?? process.env.AGENT_E2E_SHOWCASE_PORT)
    ?? portFromUrl(configuredAppUrl);
  const logPath = resolve(showcaseRoot, ".agents-e2e/logs/next-dev.log");
  const postgres = createPostgresTestcontainersProvider({
    image: config.postgresImage ?? process.env.AGENT_E2E_POSTGRES_IMAGE ?? "postgres:16-alpine",
    database: config.database ?? "proof_notes",
    username: config.username ?? "agent",
    password: config.password ?? "agent",
    schemaSql: PROOF_NOTES_SCHEMA_SQL,
  });

  return {
    id: "showcase-devmode-stack",
    explore: showcaseExploreTools,
    async start() {
      const appPort = configuredAppPort ?? await allocateTcpPort(appHost);
      const appUrl = configuredAppUrl ?? `http://${appHost}:${appPort}`;
      const postgresHandle = await postgres.start();
      const app = createProcessStackProvider({
        id: "showcase-next-dev",
        serviceId: "showcase-next-dev",
        serviceUrl: appUrl,
        readyUrl: `${appUrl}/api/notes`,
        readyTimeoutMs: 90_000,
        command: "npm",
        args: [
          "run",
          "dev",
          "--",
          "--hostname",
          appHost,
          "--port",
          String(appPort),
        ],
        cwd: showcaseRoot,
        env: {
          DATABASE_URL: postgresHandle.connectionUri,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        logPath,
      });
      try {
        const appHandle = await app.start();
        return { appUrl, postgresHandle, appHandle, app };
      } catch (error) {
        await postgres.stop(postgresHandle);
        throw error;
      }
    },
    async status(handle) {
      const [appStatus, postgresStatus] = await Promise.all([
        handle.app.status(handle.appHandle),
        postgres.status(handle.postgresHandle),
      ]);
      return combineStatus(
        appStatus.status === "ready" && postgresStatus.status === "ready" ? "ready" : "degraded",
        `Showcase dev stack ${appStatus.status === "ready" ? "ready" : "not ready"} at ${handle.appUrl}`,
        appStatus,
        postgresStatus,
      );
    },
    logs(handle, input) {
      if (input.serviceId === handle.appHandle.serviceId && handle.app.logs)
        return handle.app.logs(handle.appHandle, input);
      return failedLogs(input, "stack-log-source-missing", `${input.serviceId} does not expose live logs in the showcase stack.`);
    },
    async stop(handle) {
      const [appStopped, postgresStopped] = await Promise.all([
        handle.app.stop(handle.appHandle),
        postgres.stop(handle.postgresHandle),
      ]);
      return combineStatus("stopped", "Showcase dev stack stopped.", appStopped, postgresStopped);
    },
  };
}

function combineStatus(
  status: StackStatusPacket["status"],
  summary: string,
  ...packets: StackStatusPacket[]
): StackStatusPacket {
  return {
    status,
    summary,
    services: packets.flatMap((packet) => packet.services),
    artifacts: packets.flatMap((packet) => packet.artifacts),
    warnings: packets.flatMap((packet) => packet.warnings),
    errors: packets.flatMap((packet) => packet.errors),
    next: {
      actions: [
        {
          id: "read-next-dev-logs",
          tool: "stack.logs",
          input: { serviceId: "showcase-next-dev", tail: 80, stream: "combined" },
          why: "Inspect recent Next.js process logs.",
        },
      ],
    },
  };
}

function failedLogs(
  input: StackLogsInput,
  code: string,
  message: string,
): StackLogsOutput {
  return {
    status: "failed",
    summary: message,
    serviceId: input.serviceId,
    stream: input.stream ?? "combined",
    tail: input.tail,
    entries: [],
    truncated: false,
    error: { code, message },
  };
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

async function queryPostgres<T>(
  connectionString: string,
  sql: string,
  values?: unknown[],
): Promise<{ rows: T[]; rowCount: number | null }> {
  const { Client } = (await import("pg")) as unknown as {
    Client: new (config: { connectionString: string }) => {
      connect(): Promise<void>;
      query<TQuery = unknown>(
        query: string,
        values?: unknown[],
      ): Promise<{ rows: TQuery[]; rowCount: number | null }>;
      end(): Promise<void>;
    };
  };
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await client.query<T>(sql, values);
  } finally {
    await client.end();
  }
}
