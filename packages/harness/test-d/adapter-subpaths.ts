import { allocateTcpPort, type AgentE2EStackApiContract, type StackProvider } from '@agent-e2e/harness/stack';
import { defineAgentE2EConfig, DEFAULT_DEV_MCP_PORT, type AgentE2EDevMcpApiContract, type DevMcpToolName } from '@agent-e2e/harness/dev-mcp';
import type { AgentE2EPlaywrightMcpApiContract, BrowserSnapshotPacket } from '@agent-e2e/harness/playwright-mcp';
import type { RunArtifacts } from '@agent-e2e/harness/artifacts';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type StackSurface = Expect<Equal<AgentE2EStackApiContract['surface'], 'stack-provider-contracts'>>;
type DevMcpSurface = Expect<Equal<AgentE2EDevMcpApiContract['surface'], 'dev-mcp-http-server-contracts'>>;
type PlaywrightMcpSurface = Expect<Equal<AgentE2EPlaywrightMcpApiContract['surface'], 'playwright-backed-mcp-contracts'>>;

const toolName: DevMcpToolName = 'browser.snapshot';
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
const devMcpConfig = defineAgentE2EConfig({
  journeys: [],
  stackProvider,
  port: DEFAULT_DEV_MCP_PORT,
  browserSessions: false
});
const snapshot: BrowserSnapshotPacket = {
  status: 'ok',
  browserSessionId: 'browser-1',
  url: 'http://127.0.0.1:3000',
  summary: 'Page snapshot',
  refs: [],
  artifacts: [],
  warnings: [],
  errors: [],
  next: { actions: [] }
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
void snapshot;
void runArtifacts;
export type AdapterSubpathContract = StackSurface | DevMcpSurface | PlaywrightMcpSurface;
