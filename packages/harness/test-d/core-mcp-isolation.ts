import type { AgentE2EHarnessCoreContract } from '@agent-e2e/harness/core';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type CoreSurface = Expect<Equal<AgentE2EHarnessCoreContract['surface'], 'harness-core'>>;

export type CoreIsolationContract = CoreSurface;
