import type { AgentE2EHarnessCoreContract } from '@agent-e2e/harness/core';
import type { AgentE2EMcpApiContract } from '@agent-e2e/harness/mcp';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type CoreSurface = Expect<Equal<AgentE2EHarnessCoreContract['surface'], 'harness-core'>>;
type MpcSurface = Expect<Equal<AgentE2EMcpApiContract['surface'], 'mcp-control-surface'>>;

export type CoreAndMcpIsolationContract = CoreSurface | MpcSurface;
