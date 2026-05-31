import { setTimeout as delay } from "node:timers/promises";
import {
  createStackExecutionSurface,
  createStackStartContext,
  stackCapabilityDefinitions,
  type StackAllocationRecord,
  type StackExecutionSurface,
  type StackLogsInput,
  type StackLogsOutput,
  type StackProvider,
  type StackServiceStatus,
  type StackStatusPacket,
} from "../stack/index.js";

/** Total start attempts (first try + retries) when none is configured. */
const DEFAULT_STACK_START_MAX_ATTEMPTS = 2;
/** Delay between bounded start retries when none is configured. */
const DEFAULT_STACK_START_RETRY_BACKOFF_MS = 750;
/** How long a single attempt polls status() for readiness before giving up. */
const DEFAULT_STACK_START_READY_TIMEOUT_MS = 90_000;
/** Interval between readiness status() polls within an attempt. */
const DEFAULT_STACK_START_READY_POLL_INTERVAL_MS = 500;
/** Lines of log tail captured per non-ready service on a failed start. */
const DIAGNOSTIC_LOG_TAIL = 20;

export class StackInstanceManagerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StackInstanceManagerError";
  }
}

/** Per-service startup diagnostic. `logsTail` is raw (the router redacts it). */
export interface StackStartServiceDiagnostic {
  id: string;
  status: StackServiceStatus["status"];
  /** Tail of the service's startup logs — populated only for non-ready services. */
  logsTail: string[];
}

/**
 * Self-diagnosing context for a failed `stack.start`: how many attempts were
 * made, and which services were not ready (with a bounded tail of their logs)
 * so external cold-start (image pull / dev-server compile) vs. an internal
 * init-ordering bug can be decided from data, not reasoning.
 */
export interface StackStartDiagnostics {
  attempts: number;
  services: StackStartServiceDiagnostic[];
  /** Set when the provider status was unavailable, so services could not be enumerated. */
  note?: string;
}

/**
 * Thrown when a managed stack fails to start after exhausting the bounded retry.
 * Distinct from {@link StackInstanceManagerError} (a deterministic precondition,
 * mapped to a `blocked` envelope): this is a real start/readiness failure the
 * router maps to a coherent `failed` envelope, now carrying {@link StackStartDiagnostics}.
 */
export class StackStartFailedError extends Error {
  constructor(
    message: string,
    readonly diagnostics: StackStartDiagnostics,
  ) {
    super(message);
    this.name = "StackStartFailedError";
  }
}

/**
 * Internal: a single non-ready start attempt. Carries the per-service
 * diagnostics captured from the live handle before its teardown, so the bounded
 * retry loop can surface them if every attempt fails.
 */
class StackNotReadyError extends Error {
  constructor(
    message: string,
    readonly services: StackStartServiceDiagnostic[],
  ) {
    super(message);
    this.name = "StackNotReadyError";
  }
}

export interface StackInstanceStartResult<TStackHandle> {
  stackId: string;
  handle: TStackHandle;
  stack: StackStatusPacket;
  allocations: readonly StackAllocationRecord[];
  /** Total attempts the bounded retry made; > 1 means the start self-healed. */
  attempts: number;
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
export type StackCapabilityRunResult = StackExploreRunResult;

export class StackInstanceManager<TStackHandle> {
  private readonly handles = new Map<string, TStackHandle>();
  private readonly allocations = new Map<string, readonly StackAllocationRecord[]>();
  private readonly stoppingStackIds = new Set<string>();
  private stackIdSequence = 0;

  constructor(
    private readonly provider: StackProvider<TStackHandle>,
    private readonly options: {
      artifactRoot: string;
      /** Total start attempts (first try + retries); minimum 1. */
      startMaxAttempts?: number;
      /** Delay between bounded start retries, in milliseconds. */
      startRetryBackoffMs?: number;
      /** How long one attempt polls status() for readiness before giving up. */
      startReadyTimeoutMs?: number;
      /** Interval between readiness status() polls within an attempt. */
      startReadyPollIntervalMs?: number;
    },
  ) {}

  async start(input: { stackId?: string } = {}): Promise<StackInstanceStartResult<TStackHandle>> {
    const stackId = input.stackId ?? this.generateStackId();
    // Deterministic precondition: never retry an id collision, and never invoke
    // the provider for one. This guard must run before the bounded retry loop.
    if (this.handles.has(stackId)) {
      throw new StackInstanceManagerError(
        "stack-id-already-running",
        `A Stack Instance is already running with stackId: ${stackId}`,
      );
    }

    // A freshly-started Dev MCP server's very first stack.start hits cold-start
    // timing — Docker image pull/daemon warmup, a cold dev-server compile gated
    // by a readiness probe — which intermittently trips the readiness deadline
    // and throws. The next call always succeeds because the image is cached and
    // the dev server is warm, so a small bounded retry lets the first call
    // self-heal. We only retry the provider start/readiness path: a
    // StackInstanceManagerError is a deterministic precondition failure and is
    // surfaced immediately. Each failed attempt fully tears its own handle down
    // (see startOnce), so retrying cannot leak or stack handles.
    const maxAttempts = Math.max(1, this.options.startMaxAttempts ?? DEFAULT_STACK_START_MAX_ATTEMPTS);
    const backoffMs = Math.max(0, this.options.startRetryBackoffMs ?? DEFAULT_STACK_START_RETRY_BACKOFF_MS);
    let lastError: unknown;
    // Per-service diagnostics from the most recent attempt. Empty when the
    // provider's status threw outright (no packet to enumerate services from).
    let lastServices: StackStartServiceDiagnostic[] = [];
    let statusUnavailable = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.startOnce(stackId);
        return { ...result, attempts: attempt };
      } catch (error) {
        if (error instanceof StackInstanceManagerError) throw error;
        lastError = error;
        if (error instanceof StackNotReadyError) {
          lastServices = error.services;
          statusUnavailable = false;
        } else {
          // provider.start / provider.status threw outright: there is no status
          // packet, so we cannot enumerate services or map logs to them.
          lastServices = [];
          statusUnavailable = true;
        }
        if (attempt < maxAttempts && backoffMs > 0) await delay(backoffMs);
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    const diagnostics: StackStartDiagnostics = {
      attempts: maxAttempts,
      services: lastServices,
      ...(statusUnavailable
        ? {
            note: "Provider status was unavailable on the final attempt, so per-service logs could not be captured.",
          }
        : {}),
    };
    // Throw a dedicated StackStartFailedError (not a StackInstanceManagerError)
    // so the Dev MCP router maps it to a coherent `failed` envelope — now
    // carrying self-diagnosing per-service context — rather than a `blocked`
    // precondition envelope.
    throw new StackStartFailedError(
      maxAttempts > 1
        ? `Managed stack failed to start after ${maxAttempts} attempts. Last error: ${reason}`
        : reason,
      diagnostics,
    );
  }

  private async startOnce(
    stackId: string,
  ): Promise<Omit<StackInstanceStartResult<TStackHandle>, "attempts">> {
    const context = createStackStartContext({
      mode: "dev",
      stackId,
      workerCount: 1,
      artifactRoot: this.options.artifactRoot,
    });
    // `provider.start()` is launch-only: it returns a LIVE handle without
    // blocking on readiness. The manager owns the readiness gate — it polls
    // `status()` while holding the handle, so on a readiness timeout the handle
    // is still alive and the failing service's logs are reachable. (A provider
    // that waits internally and throws would leave no handle to diagnose.)
    const handle = await this.provider.start(context);
    let succeeded = false;
    try {
      const stack = await this.awaitReady(handle);
      if (stack.status !== "ready") {
        // Not ready within the readiness window (a `degraded` service that never
        // came up, or a terminal `failed`/`stopped`). Capture per-service
        // diagnostics from the LIVE handle BEFORE the finally block tears it
        // down, so the failed envelope shows which service was not ready and the
        // tail of its startup logs.
        const services = await this.captureServiceDiagnostics(handle, stack);
        throw new StackNotReadyError(
          stack.summary || `Managed stack did not become ready (status: ${stack.status}).`,
          services,
        );
      }
      succeeded = true;
      this.handles.set(stackId, handle);
      const allocations = context.allocations();
      this.allocations.set(stackId, allocations);
      return { stackId, handle, stack, allocations };
    } finally {
      if (!succeeded) {
        try {
          await this.provider.stop(handle);
        } catch {
          // Preserve the readiness/status failure that caused startup cleanup.
        }
      }
    }
  }

  /**
   * Poll `provider.status(handle)` until the stack is `ready`, a terminal
   * `failed`/`stopped` packet arrives, or the readiness window elapses. Returns
   * the last packet either way (the caller decides ready vs. diagnose). The
   * single source of readiness truth is `status()`; this is the gate around it.
   */
  private async awaitReady(handle: TStackHandle): Promise<StackStatusPacket> {
    const readyTimeoutMs = Math.max(
      0,
      this.options.startReadyTimeoutMs ?? DEFAULT_STACK_START_READY_TIMEOUT_MS,
    );
    const pollIntervalMs = Math.max(
      0,
      this.options.startReadyPollIntervalMs ?? DEFAULT_STACK_START_READY_POLL_INTERVAL_MS,
    );
    const deadline = Date.now() + readyTimeoutMs;
    let packet = await this.provider.status(handle);
    while (packet.status !== "ready") {
      // A terminal packet will not recover by waiting — diagnose it now.
      if (packet.status === "failed" || packet.status === "stopped") break;
      // Otherwise the stack is still warming up (`degraded`): keep polling until
      // the readiness window closes.
      if (Date.now() >= deadline) break;
      await delay(pollIntervalMs);
      packet = await this.provider.status(handle);
    }
    return packet;
  }

  /**
   * Build per-service diagnostics from a non-ready status packet. Ready services
   * get an empty `logsTail` (the locked rule: only the culprits carry logs, so
   * the payload stays small and points straight at what failed). Logs are pulled
   * via the same `provider.logs` plumbing `stack.logs` uses — no parallel path.
   */
  private async captureServiceDiagnostics(
    handle: TStackHandle,
    packet: StackStatusPacket,
  ): Promise<StackStartServiceDiagnostic[]> {
    const services: StackStartServiceDiagnostic[] = [];
    for (const service of packet.services) {
      const logsTail =
        service.status === "ready" ? [] : await this.safeServiceLogsTail(handle, service.id);
      services.push({ id: service.id, status: service.status, logsTail });
    }
    return services;
  }

  private async safeServiceLogsTail(handle: TStackHandle, serviceId: string): Promise<string[]> {
    if (!this.provider.logs) return [];
    try {
      const output = await this.provider.logs(handle, { serviceId, tail: DIAGNOSTIC_LOG_TAIL });
      return output.entries.map((entry) => entry.message);
    } catch {
      // Logs are a best-effort aid; a logs failure must never mask the start
      // failure, and an unmatched service simply gets an empty tail.
      return [];
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
    return this.runProviderCapability("stack.explore.run", "stack-explore", "Stack exploration tool", input);
  }

  async capabilityRun(input: {
    stackId?: string;
    toolId: string;
    input: unknown;
  }): Promise<StackCapabilityRunResult> {
    return this.runProviderCapability("stack.capability.run", "stack-capability", "Stack capability", input);
  }

  private async runProviderCapability(
    surfaceName: string,
    errorPrefix: string,
    noun: string,
    input: {
      stackId?: string;
      toolId: string;
      input: unknown;
    },
  ): Promise<StackCapabilityRunResult> {
    const capability = stackCapabilityDefinitions(this.provider).find((tool) => tool.id === input.toolId);
    if (!capability) {
      throw new StackInstanceManagerError(
        `${errorPrefix}-tool-not-found`,
        `${noun} not found: ${input.toolId}`,
      );
    }

    const handle = this.requireHandle(surfaceName, input.stackId);

    const inputResult = capability.input.safeParse(input.input ?? {});
    if (!inputResult.success) {
      throw new StackInstanceManagerError(
        `${errorPrefix}-invalid-input`,
        inputResult.error.message,
      );
    }

    let output: unknown;
    try {
      output = await capability.run({ input: inputResult.data, handle });
    } catch (error) {
      throw new StackInstanceManagerError(
        `${errorPrefix}-handler-failed`,
        error instanceof Error ? error.message : String(error),
      );
    }

    const outputResult = capability.output.safeParse(output);
    if (!outputResult.success) {
      throw new StackInstanceManagerError(
        `${errorPrefix}-invalid-output`,
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

  async execution(stackId: string, tool = "run.begin"): Promise<StackExecutionSurface> {
    const handle = this.requireHandle(tool, stackId);
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
