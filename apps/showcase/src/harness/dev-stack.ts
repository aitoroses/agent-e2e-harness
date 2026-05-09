import { resolve } from "node:path";
import {
  allocateTcpPort,
  createProcessStackProvider,
  type ProcessStackHandle,
  type StackProvider,
  type StackStatusPacket,
} from "@agent-e2e/harness/stack";
import {
  createPostgresTestcontainersProvider,
  type PostgresStackHandle,
} from "./postgres-testcontainers.js";
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
  postgresHandle: PostgresStackHandle;
  appHandle: ProcessStackHandle;
  app: StackProvider<ProcessStackHandle>;
}

export function createShowcaseDevStackProvider(
  config: ShowcaseDevStackProviderConfig = {},
): StackProvider<ShowcaseDevStackHandle> {
  const appHost = config.appHost ?? process.env.AGENT_E2E_SHOWCASE_HOST ?? "127.0.0.1";
  const configuredAppUrl = config.appUrl ?? process.env.AGENT_E2E_SHOWCASE_URL;
  const configuredAppPort = optionalPort(config.appPort ?? process.env.AGENT_E2E_SHOWCASE_PORT)
    ?? portFromUrl(configuredAppUrl);
  const logPath = resolve(repoRoot, "apps/showcase/.agents-e2e/logs/next-dev.log");
  const postgres = createPostgresTestcontainersProvider({
    image: config.postgresImage ?? process.env.AGENT_E2E_POSTGRES_IMAGE ?? "postgres:16-alpine",
    database: config.database ?? "proof_notes",
    username: config.username ?? "agent",
    password: config.password ?? "agent",
    schemaSql: PROOF_NOTES_SCHEMA_SQL,
  });

  return {
    id: "showcase-devmode-stack",
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
          "--workspace",
          "@agent-e2e/showcase",
          "--",
          "--hostname",
          appHost,
          "--port",
          String(appPort),
        ],
        cwd: repoRoot,
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
