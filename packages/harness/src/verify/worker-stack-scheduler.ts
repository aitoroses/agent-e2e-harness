import {
  createStackExecutionSurface,
  createStackStartContext,
  type StackAllocationRecord,
  type StackExecutionSurface,
  type StackProvider,
  type StackStatusPacket,
} from "../stack/index.js";

export interface VerifyWorkerRunContext {
  workerIndex: number;
  stackId?: string;
  stack?: StackExecutionSurface;
}

export interface VerifyWorkerStackSnapshot {
  stackId: string;
  workerIndex: number;
  status: string;
  summary: string;
  allocations: readonly StackAllocationRecord[];
}

export async function runWorkerStackQueue<TSelected, TStackHandle>(input: {
  selected: readonly TSelected[];
  workers: number;
  suiteId: string;
  artifactRoot: string;
  stackProvider?: StackProvider<TStackHandle>;
  shouldSchedule: () => boolean;
  onSuiteWarning: (warning: string) => void;
  onSuiteError: (error: string) => void;
  run: (selected: TSelected, context: VerifyWorkerRunContext) => Promise<void>;
  afterRunsBeforeStop?: () => Promise<void>;
}): Promise<VerifyWorkerStackSnapshot[]> {
  if (input.selected.length === 0) return [];

  const stackSnapshots: VerifyWorkerStackSnapshot[] = [];
  const startedStacks: Array<{ workerIndex: number; handle: TStackHandle }> = [];
  const configuredWorkers = Math.max(1, input.workers);
  const activeWorkerCount = Math.min(configuredWorkers, input.selected.length);
  let next = 0;
  let stopScheduling = false;

  const shouldSchedule = () => !stopScheduling && input.shouldSchedule();
  const stop = () => {
    stopScheduling = true;
  };

  async function worker(workerIndex: number): Promise<void> {
    let workerStack: Awaited<ReturnType<typeof startWorkerStack<TStackHandle>>> | undefined;
    while (shouldSchedule()) {
      const index = next++;
      const item = input.selected[index];
      if (!item) return;

      if (input.stackProvider) {
        if (!workerStack) {
          workerStack = await startWorkerStack({
            provider: input.stackProvider,
            suiteId: input.suiteId,
            artifactRoot: input.artifactRoot,
            workerIndex,
            workerCount: configuredWorkers,
            onSuiteError: input.onSuiteError,
            snapshots: stackSnapshots,
            stopScheduling: stop,
          });
          if (workerStack.handle !== undefined) {
            startedStacks.push({ workerIndex, handle: workerStack.handle });
          }
        }
        if (!workerStack.ready) return;
      }

      await input.run(item, {
        workerIndex,
        ...(workerStack?.ready ? { stackId: workerStack.stackId, stack: workerStack.stack } : {}),
      });
    }
  }

  try {
    await Promise.all(Array.from({ length: activeWorkerCount }, (_, workerIndex) => worker(workerIndex)));
    await input.afterRunsBeforeStop?.();
  } finally {
    const stackProvider = input.stackProvider;
    if (stackProvider) {
      await Promise.all(startedStacks
        .sort((left, right) => left.workerIndex - right.workerIndex)
        .map(async (workerStack) => {
          try {
            const stopped = await stackProvider.stop(workerStack.handle);
            for (const warning of stopped.warnings) input.onSuiteWarning(warning.message);
            for (const error of stopped.errors) input.onSuiteError(error.message);
          } catch (error) {
            input.onSuiteError(error instanceof Error ? error.message : String(error));
          }
        }));
    }
  }

  return stackSnapshots.sort((left, right) => left.workerIndex - right.workerIndex);
}

async function startWorkerStack<TStackHandle>(input: {
  provider: StackProvider<TStackHandle>;
  suiteId: string;
  artifactRoot: string;
  workerIndex: number;
  workerCount: number;
  onSuiteError: (error: string) => void;
  snapshots: VerifyWorkerStackSnapshot[];
  stopScheduling: () => void;
}): Promise<
  | {
      ready: true;
      stackId: string;
      handle: TStackHandle;
      stack: StackExecutionSurface;
    }
  | {
      ready: false;
      stackId: string;
      handle?: TStackHandle;
    }
> {
  const stackId = `worker-${input.workerIndex}`;
  const context = createStackStartContext({
    mode: "verify",
    suiteId: input.suiteId,
    stackId,
    workerIndex: input.workerIndex,
    workerCount: input.workerCount,
    artifactRoot: input.artifactRoot,
  });

  let handle: TStackHandle | undefined;
  try {
    handle = await input.provider.start(context);
    const status = await input.provider.status(handle);
    input.snapshots.push(snapshotFor(stackId, input.workerIndex, status, context.allocations()));
    if (status.status !== "ready") {
      input.onSuiteError(status.summary);
      input.stopScheduling();
      return { ready: false, stackId, handle };
    }
    return {
      ready: true,
      stackId,
      handle,
      stack: createStackExecutionSurface(status, input.provider, handle),
    };
  } catch (error) {
    input.onSuiteError(error instanceof Error ? error.message : String(error));
    input.stopScheduling();
    return handle === undefined ? { ready: false, stackId } : { ready: false, stackId, handle };
  }
}

function snapshotFor(
  stackId: string,
  workerIndex: number,
  status: StackStatusPacket,
  allocations: readonly StackAllocationRecord[],
): VerifyWorkerStackSnapshot {
  return {
    stackId,
    workerIndex,
    status: status.status,
    summary: status.summary,
    allocations,
  };
}
