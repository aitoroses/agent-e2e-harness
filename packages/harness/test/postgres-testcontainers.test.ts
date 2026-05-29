import { describe, expect, it } from "vitest";
import { createStackStartContext } from "@agent-e2e/harness/stack";
import {
  createPostgresTestcontainersProvider,
  type PostgresTestcontainersRuntime,
} from "@agent-e2e/harness/testcontainers";

function testStackContext(stackId: string) {
  return createStackStartContext({
    mode: "dev",
    stackId,
    artifactRoot: ".agents-e2e/artifacts",
  });
}

function fakeRuntime(events: string[], onQuery?: () => void): PostgresTestcontainersRuntime {
  return {
    PostgreSqlContainer: class {
      constructor(private readonly image: string) {
        events.push(`image:${image}`);
      }
      withDatabase(database: string) {
        events.push(`database:${database}`);
        return this;
      }
      withUsername(username: string) {
        events.push(`username:${username}`);
        return this;
      }
      withPassword(password: string) {
        events.push(`password:${password}`);
        return this;
      }
      withWaitStrategy() {
        events.push("wait:postgres-ready-log");
        return this;
      }
      withStartupTimeout(startupTimeoutMs: number) {
        events.push(`startup-timeout:${startupTimeoutMs}`);
        return this;
      }
      async start() {
        events.push("container:start");
        return {
          getConnectionUri: () => "postgresql://agent:agent@127.0.0.1:15432/proof_notes",
          getHost: () => "127.0.0.1",
          getPort: () => 15432,
          getDatabase: () => "proof_notes",
          getUsername: () => "agent",
          getPassword: () => "agent",
          stop: async () => {
            events.push("container:stop");
          },
        };
      }
    },
    Client: class {
      constructor(private readonly config: { connectionString: string }) {
        events.push(`client:${config.connectionString}`);
      }
      async connect() {
        events.push("client:connect");
      }
      async query(sql: string) {
        events.push(`schema:${sql}`);
        onQuery?.();
      }
      async end() {
        events.push("client:end");
      }
    },
    Wait: {
      forLogMessage: () => ({ strategy: "log" }),
    },
  };
}

describe("@agent-e2e/harness/testcontainers PostgreSQL provider", () => {
  it("starts PostgreSQL, applies schema SQL, reports status, and stops through injected runtime", async () => {
    const events: string[] = [];
    const provider = createPostgresTestcontainersProvider(
      {
        image: "postgres:16-alpine",
        database: "proof_notes",
        username: "agent",
        password: "agent",
        schemaSql: "create table proof_notes(id text primary key);",
      },
      async () => fakeRuntime(events),
    );

    const handle = await provider.start(testStackContext("postgres-provider"));
    expect(handle).toMatchObject({ host: "127.0.0.1", port: 15432, database: "proof_notes" });
    expect(provider.status(handle)).toMatchObject({
      status: "ready",
      services: [
        {
          id: "postgres",
          kind: "database",
          status: "ready",
          endpoints: [{ id: "postgres", kind: "postgres", sensitive: true }],
          checks: [{ id: "postgres.ready", status: "passed" }],
        },
      ],
    });
    await expect(provider.stop(handle)).resolves.toMatchObject({ status: "stopped" });
    expect(events).toEqual([
      "image:postgres:16-alpine",
      "database:proof_notes",
      "username:agent",
      "password:agent",
      "wait:postgres-ready-log",
      "startup-timeout:45000",
      "container:start",
      "client:postgresql://agent:agent@127.0.0.1:15432/proof_notes",
      "client:connect",
      "schema:create table proof_notes(id text primary key);",
      "client:end",
      "container:stop",
    ]);
  });

  it("stops a started PostgreSQL container when schema setup fails", async () => {
    const events: string[] = [];
    const provider = createPostgresTestcontainersProvider(
      {
        image: "postgres:16-alpine",
        database: "proof_notes",
        username: "agent",
        password: "agent",
        schemaSql: "bad sql",
      },
      async () =>
        fakeRuntime(events, () => {
          throw new Error("schema failed");
        }),
    );

    await expect(provider.start(testStackContext("postgres-schema-failure"))).rejects.toThrow("schema failed");
    expect(events).toEqual([
      "image:postgres:16-alpine",
      "database:proof_notes",
      "username:agent",
      "password:agent",
      "wait:postgres-ready-log",
      "startup-timeout:45000",
      "container:start",
      "client:postgresql://agent:agent@127.0.0.1:15432/proof_notes",
      "client:connect",
      "schema:bad sql",
      "client:end",
      "container:stop",
    ]);
  });
});
