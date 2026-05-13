import { describe, expect, it } from "vitest";
import {
  createPostgresTestcontainersProvider,
  type PostgresTestcontainersRuntime,
} from "../src/harness/postgres-testcontainers.js";

describe("showcase PostgreSQL Testcontainers provider", () => {
  it("starts PostgreSQL, applies schema SQL, reports status, and stops through injected runtime", async () => {
    const events: string[] = [];
    const runtime: PostgresTestcontainersRuntime = {
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
        async start() {
          events.push("container:start");
          return {
            getConnectionUri: () =>
              "postgresql://agent:agent@127.0.0.1:15432/proof_notes",
            getHost: () => "127.0.0.1",
            getPort: () => 15432,
            getDatabase: () => "proof_notes",
            getUsername: () => "agent",
            getPassword: () => "agent",
            getId: () => "container-123",
            stop: async () => {
              events.push("container:stop");
            },
          };
        }
      },
    };
    const provider = createPostgresTestcontainersProvider(
      {
        image: "postgres:16-alpine",
        database: "proof_notes",
        username: "agent",
        password: "agent",
        schemaSql: "create table proof_notes(id text primary key);",
        schemaExecutor: async (_handle, schemaSql) => {
          events.push(`schema:${schemaSql}`);
        },
      },
      async () => runtime,
    );

    const handle = await provider.start();
    expect(handle).toMatchObject({
      host: "127.0.0.1",
      port: 15432,
      database: "proof_notes",
    });
    expect(provider.status(handle)).toMatchObject({
      status: "ready",
      services: [{ id: "postgres", status: "ready" }],
    });
    await expect(provider.stop(handle)).resolves.toMatchObject({
      status: "stopped",
    });
    expect(events).toEqual([
      "image:postgres:16-alpine",
      "database:proof_notes",
      "username:agent",
      "password:agent",
      "container:start",
      "schema:create table proof_notes(id text primary key);",
      "container:stop",
    ]);
  });
});
