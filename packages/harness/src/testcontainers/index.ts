/**
 * First-class Testcontainers PostgreSQL Stack Provider.
 *
 * This is the one harness module that intentionally depends on consumer
 * infrastructure packages (`@testcontainers/postgresql`, `pg`,
 * `testcontainers`). They are loaded through a `loadRuntime` seam (dynamic
 * `import` by default) so they stay optional peer dependencies: a consumer that
 * never imports `@agent-e2e/harness/testcontainers` never needs them installed.
 *
 * Requires Bun `>=1.3.14` when the Dev MCP runtime is Bun: Bun `<=1.3.5` hangs
 * forever in `PostgreSqlContainer.start()` during PostgreSQL's multi-phase init.
 */
import { setTimeout as delay } from "node:timers/promises";
import type { StackProvider, StackStartContext, StackStatusPacket } from "../stack/index.js";

export interface PostgresTestcontainersProviderConfig {
  image?: string;
  database: string;
  username: string;
  password: string;
  schemaSql?: string;
  schemaTimeoutMs?: number;
  startupTimeoutMs?: number;
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
  Client: new (config: { connectionString: string; connectionTimeoutMillis?: number }) => PostgresClient;
  Wait: {
    forLogMessage(message: RegExp): unknown;
  };
}

export interface PostgresContainerBuilder {
  withDatabase(database: string): PostgresContainerBuilder;
  withUsername(username: string): PostgresContainerBuilder;
  withPassword(password: string): PostgresContainerBuilder;
  withWaitStrategy(waitStrategy: unknown): PostgresContainerBuilder;
  withStartupTimeout(startupTimeoutMs: number): PostgresContainerBuilder;
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

export type PostgresRuntimeLoader = () => Promise<PostgresTestcontainersRuntime>;

export function createPostgresTestcontainersProvider(
  config: PostgresTestcontainersProviderConfig,
  loadRuntime: PostgresRuntimeLoader = loadPostgresRuntime,
): StackProvider<PostgresStackHandle> {
  return {
    id: "postgres-testcontainer",
    async start(_context: StackStartContext) {
      const runtime = await loadRuntime();
      const container = await new runtime.PostgreSqlContainer(
        config.image ?? "postgres:16-alpine",
      )
        .withDatabase(config.database)
        .withUsername(config.username)
        .withPassword(config.password)
        .withWaitStrategy(runtime.Wait.forLogMessage(/database system is ready to accept connections/))
        .withStartupTimeout(config.startupTimeoutMs ?? 45_000)
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

      if (config.schemaSql) {
        try {
          await runSchema(
            runtime,
            handle.connectionUri,
            config.schemaSql,
            config.schemaTimeoutMs ?? 15_000,
          );
        } catch (error) {
          await stopPostgresHandle(handle).catch(() => undefined);
          throw error;
        }
      }

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
      const warnings: StackStatusPacket["warnings"] = [];
      try {
        await stopPostgresHandle(handle);
      } catch (error) {
        warnings.push({
          code: "postgres-stop-timeout",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      const status = postgresStatus(
        "stopped",
        "PostgreSQL Testcontainer stopped.",
        handle,
      );
      return { ...status, warnings };
    },
  };
}

async function loadPostgresRuntime(): Promise<PostgresTestcontainersRuntime> {
  // Loaded through indirection so these optional peer dependencies are not
  // hard module-resolution targets for the dependency-free harness build.
  const postgres = (await importOptional("@testcontainers/postgresql")) as {
    PostgreSqlContainer: PostgresTestcontainersRuntime["PostgreSqlContainer"];
  };
  const pg = (await importOptional("pg")) as {
    Client: PostgresTestcontainersRuntime["Client"];
  };
  const testcontainers = (await importOptional("testcontainers")) as {
    Wait: PostgresTestcontainersRuntime["Wait"];
  };
  return {
    PostgreSqlContainer: postgres.PostgreSqlContainer,
    Client: pg.Client,
    Wait: testcontainers.Wait,
  };
}

async function importOptional(specifier: string): Promise<Record<string, unknown>> {
  try {
    return (await import(specifier)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `@agent-e2e/harness/testcontainers requires the optional peer dependency "${specifier}". ` +
        `Install it in the consumer app (e.g. \`npm i -D ${specifier}\`). Original error: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

async function runSchema(
  runtime: PostgresTestcontainersRuntime,
  connectionString: string,
  schemaSql: string,
  timeoutMs: number,
): Promise<void> {
  const client = await connectWithRetry(runtime, connectionString, timeoutMs);
  try {
    await withTimeout(
      client.query(schemaSql),
      timeoutMs,
      `Timed out applying PostgreSQL schema after ${timeoutMs}ms.`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function connectWithRetry(
  runtime: PostgresTestcontainersRuntime,
  connectionString: string,
  timeoutMs: number,
): Promise<PostgresClient> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const client = new runtime.Client({
      connectionString,
      connectionTimeoutMillis: Math.min(remainingMs, 5_000),
    });
    try {
      await withTimeout(
        client.connect(),
        remainingMs,
        `Timed out connecting to PostgreSQL after ${timeoutMs}ms.`,
      );
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await delay(Math.min(500, Math.max(0, deadline - Date.now())));
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out connecting to PostgreSQL after ${timeoutMs}ms. Last error: ${reason}`);
}

async function stopPostgresHandle(handle: PostgresStackHandle): Promise<void> {
  await withTimeout(
    handle.stop(),
    10_000,
    "Timed out stopping PostgreSQL Testcontainer after 10000ms.",
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return await Promise.race([
    promise,
    delay(timeoutMs).then(() => {
      throw new Error(message);
    }),
  ]);
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
        kind: "database",
        status,
        url: handle.connectionUri,
        endpoints: [
          {
            id: "postgres",
            kind: "postgres",
            url: handle.connectionUri,
            sensitive: true,
          },
        ],
        checks: [
          {
            id: "postgres.ready",
            status: status === "ready" ? "passed" : status === "degraded" || status === "failed" ? "failed" : "warning",
            summary:
              status === "ready"
                ? "PostgreSQL accepted schema setup and is ready."
                : status === "stopped"
                  ? "PostgreSQL container is stopped."
                  : "PostgreSQL readiness failed.",
          },
        ],
      },
    ],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}
