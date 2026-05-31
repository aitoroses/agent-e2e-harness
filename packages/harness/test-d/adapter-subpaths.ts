import { allocateTcpPort, type AgentE2EStackApiContract, type StackProvider } from '@agent-e2e/harness/stack';
import { defineAgentE2EConfig, DEFAULT_DEV_MCP_PORT, type AgentE2EDevMcpApiContract, type DevMcpToolName } from '@agent-e2e/harness/dev-mcp';
import type { AgentE2EPlaywrightMcpApiContract, BrowserInspectResult } from '@agent-e2e/harness/playwright-mcp';
import type { RunArtifacts } from '@agent-e2e/harness/artifacts';
import { createResourceRegistry, defineResourceKind, type HarnessTypes } from '@agent-e2e/harness/core';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type StackSurface = Expect<Equal<AgentE2EStackApiContract['surface'], 'stack-provider-contracts'>>;
type DevMcpSurface = Expect<Equal<AgentE2EDevMcpApiContract['surface'], 'dev-mcp-http-server-contracts'>>;
type PlaywrightMcpSurface = Expect<Equal<AgentE2EPlaywrightMcpApiContract['surface'], 'playwright-backed-mcp-contracts'>>;

const toolName: DevMcpToolName = 'browser.inspect';
const stackProvider: StackProvider<{ id: string }> = {
  id: 'typed-stack',
  async start() {
    return { id: 'stack' };
  },
  status() {
    return { status: 'ready', summary: 'ready', services: [], artifacts: [], warnings: [], errors: [] };
  },
  stop() {
    return { status: 'stopped', summary: 'stopped', services: [], artifacts: [], warnings: [], errors: [] };
  }
};
type RecordResource = { kind: 'record'; id: string };
type TypeHarness = HarnessTypes<unknown, Record<string, never>, Record<string, never>, RecordResource>;
const resourceRegistry = createResourceRegistry<RecordResource>([
  defineResourceKind({
    kind: 'record',
    create: async (input: object) => ({ kind: 'record' as const, id: String((input as { id?: string }).id ?? 'record') }),
    delete: async (_resource: RecordResource) => undefined
  })
]);
const devMcpConfig = defineAgentE2EConfig<TypeHarness>({
  journeys: [],
  resourceRegistry,
  stackProvider,
  port: DEFAULT_DEV_MCP_PORT,
  browserSessions: false
});
const inspectResult: BrowserInspectResult = {
  status: 'ok',
  browserSessionId: 'browser-1',
  url: 'http://127.0.0.1:3000',
  target: { input: null, kind: 'page', resolved: true },
  artifacts: { inspect: 'inspections/0001/inspect.md' },
  signals: { consoleErrors: 0, networkFailures: 0 },
  refsOverlayEnabled: false
};
const runArtifacts: RunArtifacts = {
  journeyId: 'journey:type',
  runId: 'run:type',
  root: '/tmp/artifacts',
  absDir: '/tmp/artifacts/journey-type/run-type',
  relDir: '.agents-e2e/artifacts/journey-type/run-type'
};
void toolName;
void stackProvider;
void devMcpConfig;
void allocateTcpPort;
void inspectResult;
void runArtifacts;
export type AdapterSubpathContract = StackSurface | DevMcpSurface | PlaywrightMcpSurface;
