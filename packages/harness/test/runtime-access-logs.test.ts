import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDevMcpToolRouter } from "@agent-e2e/harness/dev-mcp";
import { attachedRuntime } from "@agent-e2e/harness/runtime";

describe("Runtime access and logs", () => {
  it("reports access states without exposing resolver secret material", async () => {
    const router = createDevMcpToolRouter({
      runtimeTargets: [
        attachedRuntime({
          id: "production",
          access: [
            {
              id: "browser-session",
              kind: "browserStorageState",
              description: "Browser storage state for the target.",
              resolver: {
                resolve: async () => ({
                  status: "available",
                  summary: "Browser storage state is available.",
                  material: {
                    cookies: [{ name: "session", value: "super-secret-cookie" }],
                    token: "secret-token",
                  },
                }),
              },
            },
            {
              id: "api-token",
              kind: "apiCredential",
              resolver: {
                resolve: async () => ({
                  status: "requires-bootstrap",
                  summary: "Human login is required.",
                  guidance: ["Run the product login flow before browser.open."],
                }),
              },
            },
          ],
        }),
      ],
    });

    const response = await router.callTool("runtime.access.status", { targetId: "production" });

    expect(response).toMatchObject({
      status: "ok",
      access: [
        expect.objectContaining({
          id: "browser-session",
          kind: "browserStorageState",
          status: "available",
        }),
        expect.objectContaining({
          id: "api-token",
          kind: "apiCredential",
          status: "requires-bootstrap",
          guidance: ["Run the product login flow before browser.open."],
        }),
      ],
    });
    expect(JSON.stringify(response)).not.toContain("super-secret-cookie");
    expect(JSON.stringify(response)).not.toContain("secret-token");
  });

  it("requires bounded runtime logs and writes parsed log evidence to artifacts", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "agent-e2e-runtime-logs-"));
    const router = createDevMcpToolRouter({
      artifactRoot,
      runtimeTargets: [
        attachedRuntime({
          id: "compose",
          logs: async (input) => ({
            status: "ok",
            summary: "Returned recent logs.",
            targetId: "compose",
            serviceId: input.serviceId,
            level: input.level,
            tail: input.tail,
            entries: [
              {
                timestamp: "2026-05-18T10:00:00.000Z",
                level: "info",
                serviceId: input.serviceId,
                message: "showcase ready",
              },
            ],
            truncated: false,
          }),
        }),
      ],
    });

    await expect(router.callTool("runtime.logs", { targetId: "compose" })).resolves.toMatchObject({
      status: "error",
      tool: "runtime.logs",
      error: expect.stringContaining("tail"),
    });

    const response = await router.callTool("runtime.logs", {
      targetId: "compose",
      serviceId: "web",
      level: "info",
      tail: 20,
    });

    expect(response).toMatchObject({
      status: "ok",
      logs: {
        status: "ok",
        serviceId: "web",
        level: "info",
        tail: 20,
        entries: [expect.objectContaining({ message: "showcase ready" })],
        truncated: false,
        artifacts: [expect.objectContaining({ name: "runtime-logs", path: expect.stringContaining("_runtime/compose/") })],
      },
      artifact: expect.objectContaining({ path: expect.stringContaining("_runtime/compose/") }),
    });
    expect(JSON.stringify(response)).not.toContain("query");
    const artifactPath = (response.artifact as { path: string }).path;
    await expect(readFile(artifactPath, "utf8")).resolves.toContain("showcase ready");
    await rm(artifactRoot, { recursive: true, force: true });
  });
});
