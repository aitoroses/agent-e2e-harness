import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import {
  defineAgentE2EConfig,
  loadAgentE2EConfig,
  startAgentE2EDevMcpFromConfig,
  startAgentE2EDevMcp,
  startDevMcpStreamableHttpServer,
  DEFAULT_DEV_MCP_PORT,
  type DevMcpHttpServerHandle,
} from "@agent-e2e/harness/dev-mcp";
import { createMcpHarnessServer } from "@agent-e2e/harness/mcp";
import type { StackProvider } from "@agent-e2e/harness/stack";

type HttpHarness = HarnessTypes<
  { runId: string },
  Record<string, never>,
  Record<string, never>,
  { kind: "record"; id: string }
>;

function makeHttpJourney() {
  return defineJourney<HttpHarness>({
    id: "journey:http",
    title: "HTTP journey",
    profiles: [{ id: "profile:http", data: {}, isDefault: true }],
    phases: [
      {
        id: "phase:http",
        title: "HTTP phase",
        steps: [
          {
            id: "step:http",
            title: "HTTP step",
            execute: async () => ({ status: "passed" }),
          },
        ],
      },
    ],
  });
}

describe("Dev MCP Streamable HTTP server", () => {
  let handles: DevMcpHttpServerHandle[] = [];

  afterEach(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
    handles = [];
  });

  it("serves the frozen tool grammar through the official MCP Streamable HTTP client", async () => {
    const harness = createMcpHarnessServer({ journeys: [makeHttpJourney()] });
    const server = await startDevMcpStreamableHttpServer({ harness });
    handles.push(server);
    const client = new Client({
      name: "agent-e2e-test-client",
      version: "0.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url)),
    );

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("harness.probe");
      expect(tools.tools.map((tool) => tool.name)).toContain("run.reseed");

      const probe = await client.callTool({
        name: "harness.probe",
        arguments: {},
      });
      const text =
        probe.content[0]?.type === "text" ? probe.content[0].text : "";
      expect(JSON.parse(text)).toMatchObject({
        status: "ok",
        tool: "harness.probe",
        ready: true,
      });

      const list = await client.callTool({
        name: "journey.list",
        arguments: {},
      });
      const listText =
        list.content[0]?.type === "text" ? list.content[0].text : "";
      expect(JSON.parse(listText)).toMatchObject({
        status: "ok",
        tool: "journey.list",
        journeys: [{ id: "journey:http" }],
      });
    } finally {
      await client.close();
    }
  });

  it("rejects localhost lookalike origins before reaching MCP handlers", async () => {
    const server = await startDevMcpStreamableHttpServer();
    handles.push(server);

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        origin: "http://127.0.0.10:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden-local-dev-origin",
    });
  });

  it("rejects non-local browser origins before reaching MCP handlers", async () => {
    const server = await startDevMcpStreamableHttpServer();
    handles.push(server);

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden-local-dev-origin",
    });
  });

  it("stops an active stack when the HTTP server closes", async () => {
    const events: string[] = [];
    const stackProvider: StackProvider<{ id: string }> = {
      id: "http-stack",
      start: async () => {
        events.push("start");
        return { id: "stack-1" };
      },
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
        artifacts: [],
        warnings: [],
        errors: [],
      }),
      stop: async (handle) => {
        events.push(`stop:${handle.id}`);
        return {
          status: "stopped",
          summary: "stopped",
          services: [],
          artifacts: [],
          warnings: [],
          errors: [],
        };
      },
    };
    const server = await startDevMcpStreamableHttpServer({ stackProvider });
    handles.push(server);
    const client = new Client({
      name: "agent-e2e-stack-cleanup-test-client",
      version: "0.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url)),
    );

    try {
      await client.callTool({ name: "stack.start", arguments: {} });
    } finally {
      await client.close();
      await server.close();
      handles = handles.filter((handle) => handle !== server);
    }
    expect(events).toEqual(["start", "stop:stack-1"]);
  });

  it("starts a convention-based Dev MCP server without requiring a manifest file", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-dev-mcp-"));
    const artifactRoot = join(tmpRoot, ".agents-e2e", "artifacts");
    const config = defineAgentE2EConfig<HttpHarness>({
      journeys: [makeHttpJourney()],
      artifactRoot,
      port: 0,
      browserSessions: false,
      installSignalHandlers: false,
      logger: false,
    });

    const server = await startAgentE2EDevMcp(config);
    handles.push(server);

    expect(server.manifest).toMatchObject({
      mcpUrl: server.url,
      artifactRoot,
      path: "/mcp",
    });
    expect(server.manifest).not.toHaveProperty("appUrl");

    const client = new Client({
      name: "agent-e2e-convention-client",
      version: "0.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url)),
    );
    try {
      const list = await client.callTool({
        name: "journey.list",
        arguments: {},
      });
      const text = list.content[0]?.type === "text" ? list.content[0].text : "";
      expect(JSON.parse(text)).toMatchObject({
        status: "ok",
        journeys: [{ id: "journey:http" }],
      });
    } finally {
      await client.close();
      await server.close();
      handles = handles.filter((handle) => handle !== server);
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("loads conventional Agent E2E config modules", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-config-"));
    const configPath = join(tmpRoot, "agent-e2e.config.mjs");
    await writeFile(configPath, "export default { journeys: [] };\n");

    await expect(loadAgentE2EConfig({ cwd: tmpRoot })).resolves.toMatchObject({
      journeys: [],
    });
    expect(DEFAULT_DEV_MCP_PORT).toBe(3766);

    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("requires Bun for TypeScript Agent E2E config modules", async () => {
    if ("Bun" in globalThis) return;
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-ts-config-"));
    const configPath = join(tmpRoot, "agent-e2e.config.ts");
    await writeFile(configPath, "export default { journeys: [] };\n");

    await expect(loadAgentE2EConfig({ cwd: tmpRoot })).rejects.toThrow("require Bun");

    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("reloads journey config without restarting the Dev MCP endpoint", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    const configPath = join(tmpRoot, "agent-e2e.config.mjs");
    await writeConfig(configPath, "journey:one");

    const server = await startAgentE2EDevMcpFromConfig({
      configPath,
      port: 0,
      installSignalHandlers: false,
      logger: false,
    });
    handles.push(server);
    const client = new Client({
      name: "agent-e2e-reload-client",
      version: "0.0.0",
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));

    try {
      await expect(listJourneyIds(client)).resolves.toEqual(["journey:one"]);
      await delay(20);
      await writeConfig(configPath, "journey:two");
      await expect(listJourneyIds(client)).resolves.toEqual(["journey:two"]);
    } finally {
      await client.close();
      await server.close();
      handles = handles.filter((handle) => handle !== server);
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

async function listJourneyIds(client: Client): Promise<string[]> {
  const list = await client.callTool({ name: "journey.list", arguments: {} });
  const text = list.content[0]?.type === "text" ? list.content[0].text : "";
  const payload = JSON.parse(text) as { journeys: Array<{ id: string }> };
  return payload.journeys.map((journey) => journey.id);
}

async function writeConfig(path: string, journeyId: string): Promise<void> {
  await writeFile(
    path,
    `import { defineJourney } from '@agent-e2e/harness/core';
export default {
  browserSessions: false,
  journeys: [
    defineJourney({
      id: ${JSON.stringify(journeyId)},
      title: 'Reloaded journey',
      profiles: [{ id: 'default', data: {}, isDefault: true }],
      phases: [{ id: 'phase:reload', title: 'Reload', steps: [{ id: 'step:reload', title: 'Reload step', execute: async () => ({ status: 'passed' }) }] }]
    })
  ]
};
`,
  );
}
