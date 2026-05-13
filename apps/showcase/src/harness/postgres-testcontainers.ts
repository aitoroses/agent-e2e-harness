import { execFile } from "node:child_process";
import type { StackProvider, StackStatusPacket } from "@agent-e2e/harness/stack";

export interface PostgresTestcontainersProviderConfig {
  image?: string;
  database: string;
  username: string;
  password: string;
  schemaSql?: string;
  schemaExecutor?: (handle: PostgresStackHandle, schemaSql: string) => Promise<void>;
}

export interface PostgresStackHandle {
  containerId: string;
  connectionUri: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  stop: () => Promise<void>;
}

export interface PostgresTestcontainersRuntime {
  PostgreSqlContainer: new (image: string) => PostgresContainerBuilder;
}

export interface PostgresContainerBuilder {
  withDatabase(database: string): PostgresContainerBuilder;
  withUsername(username: string): PostgresContainerBuilder;
  withPassword(password: string): PostgresContainerBuilder;
  start(): Promise<StartedPostgresContainer>;
}

export interface StartedPostgresContainer {
  getConnectionUri(): string;
  getHost(): string;
  getPort(): number;
  getDatabase(): string;
  getUsername(): string;
  getPassword(): string;
  getId(): string;
  stop(): Promise<void>;
}

export type PostgresRuntimeLoader =
  () => Promise<PostgresTestcontainersRuntime>;

export function createPostgresTestcontainersProvider(
  config: PostgresTestcontainersProviderConfig,
  loadRuntime: PostgresRuntimeLoader = loadPostgresRuntime,
): StackProvider<PostgresStackHandle> {
  return {
    id: "showcase-postgres-testcontainer",
    async start() {
      const runtime = await loadRuntime();
      const container = await new runtime.PostgreSqlContainer(
        config.image ?? "postgres:16-alpine",
      )
        .withDatabase(config.database)
        .withUsername(config.username)
        .withPassword(config.password)
        .start();
      const handle: PostgresStackHandle = {
        containerId: container.getId(),
        connectionUri: container.getConnectionUri(),
        host: container.getHost(),
        port: container.getPort(),
        database: container.getDatabase(),
        username: container.getUsername(),
        password: container.getPassword(),
        stop: () => container.stop(),
      };

      if (config.schemaSql)
        await (config.schemaExecutor ?? runSchema)(handle, config.schemaSql);

      return handle;
    },
    status(handle) {
      return postgresStatus(
        "ready",
        "Showcase PostgreSQL Testcontainer is ready.",
        handle,
      );
    },
    async stop(handle) {
      await handle.stop();
      return postgresStatus(
        "stopped",
        "Showcase PostgreSQL Testcontainer stopped.",
        handle,
      );
    },
  };
}

async function loadPostgresRuntime(): Promise<PostgresTestcontainersRuntime> {
  const postgres = (await import("@testcontainers/postgresql")) as unknown as {
    PostgreSqlContainer: PostgresTestcontainersRuntime["PostgreSqlContainer"];
  };
  return {
    PostgreSqlContainer: postgres.PostgreSqlContainer,
  };
}

async function runSchema(
  handle: PostgresStackHandle,
  schemaSql: string,
): Promise<void> {
  const { stdout, stderr } = await execFileAsync("docker", [
    "exec",
    "-i",
    handle.containerId,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    handle.username,
    "-d",
    handle.database,
    "-c",
    schemaSql,
  ]);
  if (stderr.trim()) {
    throw new Error(`PostgreSQL schema initialization failed: ${stderr}`);
  }
  void stdout;
}

function execFileAsync(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function postgresStatus(
  status: StackStatusPacket["status"],
  summary: string,
  handle: PostgresStackHandle,
): StackStatusPacket {
  return {
    status,
    summary,
    services: [
      {
        id: "postgres",
        status,
        url: handle.connectionUri,
      },
    ],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}
