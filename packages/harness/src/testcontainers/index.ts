import type { StackProvider, StackStatusPacket } from "../stack/index.js";

export interface AgentE2ETestcontainersApiContract {
  surface: "testcontainers-provider-contracts";
}

export interface PostgresContainerProviderConfig {
  image?: string;
  database: string;
  username: string;
  password: string;
  schemaSql?: string;
}

export interface PostgresStackHandle {
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
  Client: new (config: { connectionString: string }) => PostgresClient;
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
  stop(): Promise<void>;
}

export interface PostgresClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

export type PostgresRuntimeLoader =
  () => Promise<PostgresTestcontainersRuntime>;

export const testcontainersApiContract: AgentE2ETestcontainersApiContract = {
  surface: "testcontainers-provider-contracts",
};

export function createPostgresTestcontainersProvider(
  config: PostgresContainerProviderConfig,
  loadRuntime: PostgresRuntimeLoader = loadPostgresRuntime,
): StackProvider<PostgresStackHandle> {
  return {
    id: "testcontainers-postgres",
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
        connectionUri: container.getConnectionUri(),
        host: container.getHost(),
        port: container.getPort(),
        database: container.getDatabase(),
        username: container.getUsername(),
        password: container.getPassword(),
        stop: () => container.stop(),
      };

      if (config.schemaSql)
        await runSchema(runtime, handle.connectionUri, config.schemaSql);

      return handle;
    },
    status(handle) {
      return postgresStatus(
        "ready",
        "PostgreSQL Testcontainer is ready.",
        handle,
      );
    },
    async stop(handle) {
      await handle.stop();
      return postgresStatus(
        "stopped",
        "PostgreSQL Testcontainer stopped.",
        handle,
      );
    },
  };
}

async function loadPostgresRuntime(): Promise<PostgresTestcontainersRuntime> {
  const postgres = (await import("@testcontainers/postgresql")) as unknown as {
    PostgreSqlContainer: PostgresTestcontainersRuntime["PostgreSqlContainer"];
  };
  const pg = (await import("pg")) as unknown as {
    Client: PostgresTestcontainersRuntime["Client"];
  };
  return {
    PostgreSqlContainer: postgres.PostgreSqlContainer,
    Client: pg.Client,
  };
}

async function runSchema(
  runtime: PostgresTestcontainersRuntime,
  connectionString: string,
  schemaSql: string,
): Promise<void> {
  const client = new runtime.Client({ connectionString });
  await client.connect();
  try {
    await client.query(schemaSql);
  } finally {
    await client.end();
  }
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
