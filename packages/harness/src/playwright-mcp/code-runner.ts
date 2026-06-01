import type { Browser, Page } from "playwright";
import type { ForensicsNode } from "./refs.js";

export interface BrowserCodeRunInput {
  browserSessionId: string;
  code: string;
  input?: unknown;
  timeoutMs?: number;
  refs?: string[];
}

export interface BrowserCodeRunResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  output?: unknown;
  durationMs: number;
  timeoutMs: number;
  error?: { code: string; message: string };
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
}

export interface BrowserPlaywrightRunContext {
  browser: Browser;
  page: Page;
  refs: ForensicsNode[];
}

const DEFAULT_CODE_TIMEOUT_MS = 5_000;
const MAX_CODE_TIMEOUT_MS = 30_000;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
  new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
};

export async function runPageCode(
  page: Page,
  input: BrowserCodeRunInput,
): Promise<BrowserCodeRunResult> {
  return runWithTimeout(input, async () => {
    const output = await page.evaluate(
      async ({ code, input: pageInput }) => {
        const PageAsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
        };
        const fn = new PageAsyncFunction("input", code);
        return await fn(pageInput);
      },
      { code: input.code, input: input.input ?? null },
    );
    return toJsonSerializable(output);
  });
}

export async function runPlaywrightCode(
  context: BrowserPlaywrightRunContext,
  input: BrowserCodeRunInput,
): Promise<BrowserCodeRunResult> {
  return runWithTimeout(input, async () => {
    const fn = new AsyncFunction("page", "browser", "context", "input", "refs", input.code);
    const output = await fn(
      context.page,
      context.browser,
      context.page.context(),
      input.input ?? null,
      context.refs.map(serializableRef),
    );
    return toJsonSerializable(output);
  });
}

function runWithTimeout(
  input: BrowserCodeRunInput,
  operation: () => Promise<unknown>,
): Promise<BrowserCodeRunResult> {
  const timeoutMs = effectiveTimeout(input.timeoutMs);
  const start = Date.now();
  const run = operation();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BrowserCodeTimeoutError(timeoutMs)), timeoutMs);
  });

  return Promise.race([run, timeout])
    .then((output) => ({
      status: "ok" as const,
      browserSessionId: input.browserSessionId,
      output,
      durationMs: Date.now() - start,
      timeoutMs,
      next: refreshRefsNext(),
    }))
    .catch((error) => ({
      status: "failed" as const,
      browserSessionId: input.browserSessionId,
      durationMs: Date.now() - start,
      timeoutMs,
      error: {
        code: error instanceof BrowserCodeTimeoutError
          ? "browser-code-timeout"
          : "browser-code-failed",
        message: error instanceof Error ? error.message : String(error),
      },
      next: refreshRefsNext(),
    }))
    .finally(() => {
      if (timer) clearTimeout(timer);
      void run.catch(() => undefined);
    });
}

export function effectiveTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_CODE_TIMEOUT_MS;
  return Math.min(MAX_CODE_TIMEOUT_MS, Math.max(1, Math.floor(timeoutMs)));
}

function toJsonSerializable(output: unknown): unknown {
  if (output === undefined) return undefined;
  const text = JSON.stringify(output);
  if (text === undefined)
    throw new Error("Code output must be JSON-serializable.");
  return JSON.parse(text) as unknown;
}

function serializableRef(ref: ForensicsNode): Record<string, unknown> {
  return {
    ref: ref.ref,
    selector: ref.selector,
    ...(ref.role ? { role: ref.role } : {}),
    ...(ref.name ? { name: ref.name } : {}),
    rect: ref.rect,
  };
}

function refreshRefsNext() {
  return {
    actions: [
      {
        id: "snapshot",
        tool: "browser.snapshot",
        why: "Refresh refs after browser code runs; page state may have changed.",
      },
    ],
  };
}

class BrowserCodeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Browser code timed out after ${timeoutMs}ms.`);
  }
}
