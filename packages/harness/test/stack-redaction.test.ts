import { describe, expect, it } from "vitest";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import type { StackProvider } from "@agent-e2e/harness/stack";

// A handle shaped like a real Testcontainers handle: a few useful scalars plus
// secrets and a fat nested provider object (the kind that previously leaked
// tens of KB of inspectResult/env/sockets into the tool transcript).
interface LeakyHandle {
  id: string;
  host: string;
  port: number;
  password: string;
  connectionUri: string;
  inspectResult: { Env: string[]; Mounts: Array<Record<string, unknown>>; socketPath: string };
  stop: () => Promise<void>;
}

function leakyProvider(): StackProvider<LeakyHandle> {
  return {
    id: "leaky-stack",
    async start() {
      return {
        id: "stack-1",
        host: "127.0.0.1",
        port: 15432,
        password: "s3cr3t-pw",
        connectionUri: "postgresql://agent:s3cr3t-pw@127.0.0.1:15432/app",
        inspectResult: {
          Env: ["POSTGRES_PASSWORD=s3cr3t-pw", "PATH=/usr/bin"],
          Mounts: [{ Source: "/var/lib/docker/overlay2/abc", Destination: "/data" }],
          socketPath: "/var/run/docker.sock",
        },
        stop: async () => undefined,
      };
    },
    status: (handle) => ({
      status: "ready",
      summary: `ready:${handle.id}`,
      services: [
        {
          id: "postgres",
          kind: "database",
          status: "ready",
          url: handle.connectionUri,
          endpoints: [
            { id: "postgres", kind: "postgres", url: handle.connectionUri, sensitive: true },
          ],
        },
        {
          id: "app",
          kind: "web",
          status: "ready",
          url: "http://127.0.0.1:3000",
          endpoints: [{ id: "app", kind: "http", url: "http://127.0.0.1:3000", sensitive: false }],
        },
      ],
      artifacts: [],
      warnings: [],
      errors: [],
    }),
    stop: () => ({
      status: "stopped",
      summary: "stopped",
      services: [],
      artifacts: [],
      warnings: [],
      errors: [],
    }),
  };
}

describe("stack response secret hygiene", () => {
  it("projects stack.start handle to safe scalars, drops nested provider internals, and redacts secrets", async () => {
    const router = createDevMcpToolRouter({ stackProvider: leakyProvider() });
    const response = await router.callTool("stack.start", { stackId: "alpha" });

    expect(response.status).toBe("ok");
    const handle = response.handle as Record<string, unknown>;

    // Safe scalars survive.
    expect(handle).toMatchObject({ id: "stack-1", host: "127.0.0.1", port: 15432 });
    // Secret-keyed fields are redacted, never echoed.
    expect(handle.password).toBe("[redacted]");
    expect(handle.connectionUri).toBe("[redacted]");
    // Nested provider internals are dropped wholesale, not serialized.
    expect(handle.inspectResult).toBeUndefined();
    expect("stop" in handle).toBe(false);
    expect(JSON.stringify(response)).not.toContain("s3cr3t-pw");
    expect(JSON.stringify(response)).not.toContain("docker.sock");
  });

  it("redacts sensitive endpoint and service URLs in stack status responses", async () => {
    const router = createDevMcpToolRouter({ stackProvider: leakyProvider() });
    await router.callTool("stack.start", { stackId: "alpha" });
    const response = await router.callTool("stack.status", { stackId: "alpha" });

    const services = (response.stack as { services: Array<Record<string, any>> }).services;
    const postgres = services.find((service) => service.id === "postgres");
    const app = services.find((service) => service.id === "app");

    expect(postgres?.url).toBe("[redacted]");
    expect(postgres?.endpoints[0].url).toBe("[redacted]");
    expect(postgres?.endpoints[0].sensitive).toBe(true);
    // Non-sensitive service URLs (the browser target) are preserved.
    expect(app?.url).toBe("http://127.0.0.1:3000");
    expect(JSON.stringify(response)).not.toContain("s3cr3t-pw");
  });
});
