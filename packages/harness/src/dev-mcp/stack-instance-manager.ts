import {
  createStackExecutionSurface,
  createStackStartContext,
  type StackAllocationRecord,
  type StackExecutionSurface,
  type StackLogsInput,
  type StackLogsOutput,
  type StackProvider,
  type StackStatusPacket,
} from "../stack/index.js";

export class StackInstanceManagerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StackInstanceManagerError";
  }
}

export interface StackInstanceStartResult<TStackHandle> {
  stackId: string;
  handle: TStackHandle;
  stack: StackStatusPacket;
  allocations: readonly StackAllocationRecord[];
}

export interface StackInstanceListItem {
  stackId: string;
  stack: StackStatusPacket;
  allocations: readonly StackAllocationRecord[];
}

export interface StackInstanceDisposeResult {
  stack: StackStatusPacket | undefined;
  stacks: StackInstanceListItem[];
  errors: string[];
}

export interface StackExploreRunResult {
  toolId: string;
  output: unknown;
}

export class StackInstanceManager<TStackHandle> {
  private readonly handles = new Map<string, TStackHandle>();
  private readonly allocations = new Map<string, readonly StackAllocationRecord[]>();
  private readonly stoppingStackIds = new Set<string>();
  private stackIdSequence = 0;

  constructor(
    private readonly provider: StackProvider<TStackHandle>,
    private readonly options: { artifactRoot: string },
  ) {}

  async start(input: { stackId?: string } = {}): Promise<StackInstanceStartResult<TStackHandle>> {
    const stackId = input.stackId ?? this.generateStackId();
    if (this.handles.has(stackId)) {
      throw new StackInstanceManagerError(
        "stack-id-already-running",
        `A Stack Instance is already running with stackId: ${stackId}`,
      );
    }

    const context = createStackStartContext({
      mode: "dev",
      stackId,
      workerCount: 1,
      artifactRoot: this.options.artifactRoot,
    });
    const handle = await this.provider.start(context);
    let ready = false;
    try {
      const stack = await this.provider.status(handle);
      ready = true;
      this.handles.set(stackId, handle);
      const allocations = context.allocations();
      this.allocations.set(stackId, allocations);
      return { stackId, handle, stack, allocations };
    } finally {
      if (!ready) {
        try {
          await this.provider.stop(handle);
        } catch {
          // Preserve the readiness/status failure that caused startup cleanup.
        }
      }
    }
  }

  async list(): Promise<StackInstanceListItem[]> {
    const stacks: StackInstanceListItem[] = [];
    for (const [stackId, handle] of this.handles) {
      stacks.push({
        stackId,
        stack: await this.provider.status(handle),
        allocations: this.allocations.get(stackId) ?? [],
      });
    }
    return stacks;
  }

  async status(stackId?: string): Promise<StackStatusPacket> {
    const handle = this.requireHandle("stack.status", stackId);
    return await this.provider.status(handle);
  }

  async logs(stackId: string | undefined, input: StackLogsInput): Promise<StackLogsOutput> {
    const handle = this.requireHandle("stack.logs", stackId);
    if (!this.provider.logs) {
      throw new StackInstanceManagerError(
        "stack-logs-not-supported",
        "This stack provider does not expose logs.",
      );
    }
    return await this.provider.logs(handle, input);
  }

  async exploreRun(input: {
    stackId?: string;
    toolId: string;
    input: unknown;
  }): Promise<StackExploreRunResult> {
    const exploreTool = (this.provider.explore ?? []).find((tool) => tool.id === input.toolId);
    if (!exploreTool) {
      throw new StackInstanceManagerError(
        "stack-explore-tool-not-found",
        `Stack exploration tool not found: ${input.toolId}`,
      );
    }

    const handle = this.requireHandle("stack.explore.run", input.stackId);

    const inputResult = exploreTool.input.safeParse(input.input ?? {});
    if (!inputResult.success) {
      throw new StackInstanceManagerError(
        "stack-explore-invalid-input",
        inputResult.error.message,
      );
    }

    let output: unknown;
    try {
      output = await exploreTool.run({ input: inputResult.data, handle });
    } catch (error) {
      throw new StackInstanceManagerError(
        "stack-explore-handler-failed",
        error instanceof Error ? error.message : String(error),
      );
    }

    const outputResult = exploreTool.output.safeParse(output);
    if (!outputResult.success) {
      throw new StackInstanceManagerError(
        "stack-explore-invalid-output",
        outputResult.error.message,
      );
    }

    return { toolId: input.toolId, output: outputResult.data };
  }

  async stop(stackId?: string): Promise<StackStatusPacket> {
    const resolvedStackId = this.requireStackId("stack.stop", stackId);

    if (this.stoppingStackIds.has(resolvedStackId)) {
      return {
        status: "degraded",
        summary: "Managed stack stop is already in progress.",
        services: [],
        artifacts: [],
        warnings: [{ code: "stack-stop-in-progress", message: "Managed stack stop is already in progress." }],
        errors: [],
      };
    }

    const handle = this.requireHandle("stack.stop", resolvedStackId);

    this.stoppingStackIds.add(resolvedStackId);
    this.handles.delete(resolvedStackId);
    this.allocations.delete(resolvedStackId);
    try {
      return await this.provider.stop(handle);
    } finally {
      this.stoppingStackIds.delete(resolvedStackId);
    }
  }

  async execution(stackId?: string): Promise<StackExecutionSurface | undefined> {
    const handle = this.resolveHandle(stackId);
    if (handle === undefined) return undefined;
    const status = await this.provider.status(handle);
    return createStackExecutionSurface(status, this.provider, handle);
  }

  async dispose(): Promise<StackInstanceDisposeResult> {
    const errors: string[] = [];
    const stacks: StackInstanceListItem[] = [];

    for (const stackId of [...this.handles.keys()]) {
      try {
        const allocations = this.allocations.get(stackId) ?? [];
        stacks.push({ stackId, stack: await this.stop(stackId), allocations });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return { stack: stacks.at(-1)?.stack, stacks, errors };
  }

  private generateStackId(): string {
    let stackId: string;
    do {
      stackId = `stack-${++this.stackIdSequence}`;
    } while (this.handles.has(stackId));
    return stackId;
  }

  private resolveStackId(stackId?: string): string | undefined {
    if (stackId) return stackId;
    return this.handles.keys().next().value;
  }

  private resolveHandle(stackId?: string): TStackHandle | undefined {
    const resolvedStackId = this.resolveStackId(stackId);
    return resolvedStackId ? this.handles.get(resolvedStackId) : undefined;
  }

  private requireStackId(tool: string, stackId?: string): string {
    if (stackId) return stackId;
    throw new StackInstanceManagerError(
      "stack-id-required",
      `${tool} requires an explicit stackId.`,
    );
  }

  private requireHandle(tool: string, stackId?: string): TStackHandle {
    const resolvedStackId = this.requireStackId(tool, stackId);
    const handle = this.handles.get(resolvedStackId);
    if (handle !== undefined) return handle;
    throw new StackInstanceManagerError(
      "stack-not-running",
      `${tool} could not find a running Stack Instance for stackId: ${resolvedStackId}`,
    );
  }
}

export function stoppedStackStatus(): StackStatusPacket {
  return {
    status: "stopped",
    summary: "No managed stack handle is active.",
    services: [],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}
