import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import {
  defineAgentE2EConfig,
  loadAgentE2EConfig,
  startAgentE2EAttachedFromConfig,
  startAgentE2EDevMcpFromConfig,
  startAgentE2EDevMcp,
  startDevMcpStreamableHttpServer,
  DEFAULT_DEV_MCP_PORT,
  type DevMcpHttpServerHandle,
} from "@agent-e2e/harness/dev-mcp";
import { createMcpHarnessServer } from "../src/mcp/index.js";
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
    const server = await startDevMcpStreamableHttpServer({
      harness,
      browserSessions: {
        open: async () => ({ browserSessionId: "browser-1" }),
        close: async (browserSessionId) => ({ status: "closed", browserSessionId }),
        list: () => [],
        inspect: async (input) => ({ status: "ok", input }),
        refs: async (input) => ({ status: "ok", input }),
        act: async (input) => ({ status: "ok", input }),
        wait: async (input) => ({ status: "ok", input }),
        evaluate: async (input) => ({ status: "ok", input, output: null }),
        playwright: async (input) => ({ status: "ok", input, output: null }),
      },
    });
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
      expect(tools.tools.map((tool) => tool.name)).not.toContain("harness.probe");
      expect(tools.tools.map((tool) => tool.name)).toContain("run.reseed");
      expect(tools.tools.find((tool) => tool.name === "journey.inspect")?.inputSchema).toMatchObject({
        type: "object",
        properties: { journeyId: expect.objectContaining({ type: "string" }) },
        required: ["journeyId"],
      });
      expect(tools.tools.find((tool) => tool.name === "journey.step")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          runId: expect.objectContaining({ type: "string" }),
          phaseId: expect.objectContaining({ type: "string" }),
          stepId: expect.objectContaining({ type: "string" }),
        },
        required: ["runId", "phaseId", "stepId"],
      });
      expect(tools.tools.find((tool) => tool.name === "browser.act")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          browserSessionId: expect.objectContaining({ type: "string" }),
          action: expect.objectContaining({ enum: ["click", "fill", "press", "hover", "focus", "check", "uncheck", "select", "scroll"] }),
        },
        required: ["browserSessionId", "action"],
      });
      expect(tools.tools.find((tool) => tool.name === "browser.inspect")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          browserSessionId: expect.objectContaining({ type: "string" }),
          target: expect.objectContaining({ description: expect.stringContaining("UI forensics ref") }),
        },
        required: ["browserSessionId"],
      });
      expect(tools.tools.find((tool) => tool.name === "browser.refs")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          enabled: expect.objectContaining({ type: "boolean" }),
        },
        required: ["browserSessionId", "enabled"],
      });
      expect(tools.tools.find((tool) => tool.name === "browser.eval")?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          code: expect.objectContaining({ description: expect.stringContaining("page context") }),
          timeoutMs: expect.objectContaining({ description: expect.stringContaining("30000") }),
        },
        required: ["browserSessionId", "code"],
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
      const inspect = await client.callTool({
        name: "journey.inspect",
        arguments: { journeyId: "journey:http" },
      });
      const inspectText =
        inspect.content[0]?.type === "text" ? inspect.content[0].text : "";
      expect(JSON.parse(inspectText)).toMatchObject({
        status: "ok",
        tool: "journey.inspect",
        contract: {
          id: "journey:http",
          title: "HTTP journey",
          phases: [{ id: "phase:http", steps: [{ id: "step:http" }] }],
        },
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

  it("advertises stack.list in the Dev MCP manifest when a stack provider is configured", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-dev-mcp-stack-manifest-"));
    const artifactRoot = join(tmpRoot, ".agents-e2e", "artifacts");
    const stackProvider: StackProvider<{ id: string }> = {
      id: "manifest-stack",
      start: async () => ({ id: "stack-1" }),
      status: () => ({
        status: "ready",
        summary: "ready",
        services: [],
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
    const config = defineAgentE2EConfig<HttpHarness, { id: string }>({
      journeys: [makeHttpJourney()],
      artifactRoot,
      stackProvider,
      port: 0,
      browserSessions: false,
      installSignalHandlers: false,
      logger: false,
    });

    const server = await startAgentE2EDevMcp(config);
    handles.push(server);

    expect(server.manifest.stack).toMatchObject({
      startTool: "stack.start",
      listTool: "stack.list",
      statusTool: "stack.status",
      logsTool: "stack.logs",
      stopTool: "stack.stop",
    });

    await server.close();
    handles = handles.filter((handle) => handle !== server);
    await rm(tmpRoot, { recursive: true, force: true });
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

  it("loads TypeScript Agent E2E config modules on any runtime (no Bun required)", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-ts-config-"));
    const configPath = join(tmpRoot, "agent-e2e.config.ts");
    // A .ts config loads via jiti under Node, Bun, or Deno — no runtime gate.
    await writeFile(configPath, "export default { journeys: [] };\n");

    await expect(loadAgentE2EConfig({ cwd: tmpRoot })).resolves.toMatchObject({ journeys: [] });

    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("reloads journey config without restarting the Dev MCP endpoint", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-reload-"));
    // .ts so jiti owns the module graph and can re-evaluate it in process;
    // native ESM (.mjs/.js) is globally cached by URL and cannot hot-reload.
    const configPath = join(tmpRoot, "agent-e2e.config.ts");
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

  it("starts Attached Runtime Mode from config and exposes runtime tools", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), "agent-e2e-attached-mcp-"));
    const configPath = join(tmpRoot, "agent-e2e.config.mjs");
    await writeAttachedConfig(configPath);

    const server = await startAgentE2EAttachedFromConfig({
      configPath,
      targetId: "compose",
      port: 0,
      installSignalHandlers: false,
      logger: false,
    });
    handles.push(server);
    expect(server.manifest).toMatchObject({
      mode: "attached",
      runtime: { targetId: "compose", listTool: "runtime.list" },
    });

    const client = new Client({
      name: "agent-e2e-attached-client",
      version: "0.0.0",
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["runtime.list", "runtime.status"]));
      const status = await client.callTool({ name: "runtime.status", arguments: {} });
      const text = status.content[0]?.type === "text" ? status.content[0].text : "";
      expect(JSON.parse(text)).toMatchObject({
        status: "ok",
        targetId: "compose",
        runtime: { status: "ready" },
      });
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

const CORE_URL = pathToFileURL(resolve(process.cwd(), "dist/core/index.js")).href;
const DEV_MCP_URL = pathToFileURL(resolve(process.cwd(), "dist/dev-mcp/index.js")).href;
const RUNTIME_URL = pathToFileURL(resolve(process.cwd(), "dist/runtime/index.js")).href;

async function writeConfig(path: string, journeyId: string): Promise<void> {
  // Temp configs live outside any node_modules, so import the built package by
  // file URL (a real consumer resolves '@agent-e2e/harness/*' from its own
  // node_modules; jiti uses Node resolution, exercised by the showcase config).
  await writeFile(
    path,
    `import { defineJourney } from ${JSON.stringify(CORE_URL)};
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

async function writeAttachedConfig(path: string): Promise<void> {
  await writeFile(
    path,
    `import { defineJourney } from ${JSON.stringify(CORE_URL)};
import { defineAgentE2EConfig } from ${JSON.stringify(DEV_MCP_URL)};
import { attachedRuntime } from ${JSON.stringify(RUNTIME_URL)};

export default defineAgentE2EConfig({
  browserSessions: false,
  journeys: [
    defineJourney({
      id: 'journey:attached',
      title: 'Attached',
      profiles: [{ id: 'attached', data: {}, isDefault: true, runtimeTargetId: 'compose' }],
      phases: [{ id: 'phase', title: 'Phase', steps: [{ id: 'step', title: 'Step', execute: async () => ({ status: 'passed' }) }] }]
    })
  ],
  runtimeTargets: [
    attachedRuntime({
      id: 'compose',
      status: async () => ({ status: 'ready', summary: 'ready', services: [], artifacts: [], warnings: [], errors: [] })
    })
  ]
});
`,
  );
}
