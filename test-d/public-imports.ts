import type { AgentE2EDefaultHarnessApiScaffold } from '@agent-e2e/harness';
import type { AgentE2EHarnessCoreScaffold } from '@agent-e2e/harness/core';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type RootSurfaceIsDefaultHarnessApi = Expect<Equal<AgentE2EDefaultHarnessApiScaffold['surface'], 'default-harness-api'>>;
type CoreSurfaceIsHarnessCore = Expect<Equal<AgentE2EHarnessCoreScaffold['surface'], 'harness-core'>>;

export type PublicImportContract = RootSurfaceIsDefaultHarnessApi | CoreSurfaceIsHarnessCore;
