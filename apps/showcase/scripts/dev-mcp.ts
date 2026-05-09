#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { createMcpHarnessServer } from "@agent-e2e/harness/mcp";
import {
  startDevMcpStreamableHttpServer,
  type DevMcpBrowserSessionController,
} from "@agent-e2e/harness/dev-mcp";
import { createPlaywrightMcpBrowserSessionManager } from "@agent-e2e/harness/playwright-mcp";
import { allocateTcpPort } from "@agent-e2e/harness/stack";
import { createShowcaseDevStackProvider } from "../src/harness/dev-stack.js";
import {
  createShowcaseMcpJourney,
  createShowcaseResourceAdapter,
  type ShowcaseMcpHarness,
} from "../src/harness/dev-mcp-journey.js";

interface DevMcpManifest {
  mcpUrl: string;
  appUrl: string;
  appPort: number;
  mcpPort: number;
  artifactRoot: string;
}

const showcaseRoot = process.env.AGENT_E2E_SHOWCASE_ROOT ?? process.cwd();
const repoRoot = resolve(showcaseRoot, "../..");
const artifactRoot = process.env.AGENT_E2E_ARTIFACT_ROOT ?? resolve(repoRoot, ".agents-e2e/artifacts");
const host = process.env.AGENT_E2E_MCP_HOST ?? "127.0.0.1";
const port = optionalPort(process.env.AGENT_E2E_MCP_PORT);
const appHost = process.env.AGENT_E2E_SHOWCASE_HOST ?? "127.0.0.1";
const configuredShowcaseUrl = process.env.AGENT_E2E_SHOWCASE_URL;
const appPort = await resolveAppPort(appHost, configuredShowcaseUrl);
const showcaseUrl = configuredShowcaseUrl ?? `http://${appHost}:${appPort}`;

const showcaseJourney = createShowcaseMcpJourney(showcaseUrl);
const resourceAdapter = createShowcaseResourceAdapter(showcaseUrl);
const harness = createMcpHarnessServer<ShowcaseMcpHarness>({
  journeys: [showcaseJourney],
  resourceAdapters: [resourceAdapter],
  artifactRoot,
});
const browserSessions = createPlaywrightMcpBrowserSessionManager({ artifactRoot });
const stackProvider = createShowcaseDevStackProvider({
  appHost,
  appPort,
  appUrl: showcaseUrl,
});
const server = await startDevMcpStreamableHttpServer({
  harness,
  browserSessions: browserSessions as unknown as DevMcpBrowserSessionController,
  stackProvider,
  host,
  ...(port === undefined ? {} : { port }),
  allowedOrigins: [`http://${host}:0`, showcaseUrl],
});

const manifestPath = resolve(repoRoot, ".agents-e2e/dev-mcp.json");
await writeRuntimeManifest(manifestPath, {
  mcpUrl: server.url,
  appUrl: showcaseUrl,
  appPort,
  mcpPort: server.port,
  artifactRoot,
});

console.log(`Agent E2E showcase Dev MCP ready`);
console.log(`  MCP:      ${server.url}`);
console.log(`  App:      ${showcaseUrl}`);
console.log(`  Stack:    call stack.start before seed/browser proof`);
console.log(`  Browser:  Playwright-owned, headed by default`);
console.log(`  Artifacts: ${artifactRoot}`);
console.log(`  Manifest: ${manifestPath}`);
console.log(``);
console.log(`Proof order:`);
console.log(`  1. mcporter call --http-url ${server.url} --allow-http --tool 'stack.start' --args '{}' --output json`);
console.log(`  2. mcporter call --http-url ${server.url} --allow-http --tool 'run.begin' --args '{"journeyId":"showcase:proof-notes","runId":"showcase-dev"}' --output json`);
console.log(`  3. browser.open appUrl?agentE2ERunId=showcase-dev -> browser.snapshot -> browser.act -> journey.step --browserSessionId -> cleanup.plan/reseed`);

async function shutdown(signal: NodeJS.Signals) {
  console.log(`
${signal} received; stopping Dev MCP...`);
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

function optionalPort(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535)
    throw new Error(`Invalid port: ${value}`);
  return parsed;
}

async function resolveAppPort(host: string, configuredUrl: string | undefined): Promise<number> {
  const configured = optionalPort(process.env.AGENT_E2E_SHOWCASE_PORT) ?? portFromUrl(configuredUrl);
  return configured ?? await allocateTcpPort(host);
}

function portFromUrl(value: string | undefined): number | undefined {
  if (!value) return undefined;
  return optionalPort(new URL(value).port);
}

async function writeRuntimeManifest(path: string, manifest: DevMcpManifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
