import type { Browser, Page } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import {
  createRunArtifacts,
  type RunArtifacts,
} from "../artifacts/index.js";
import { asInspectPage, writeInspection } from "../forensics/inspect-capture.js";
import { runBrowserAction, type BrowserActionable } from "./actions.js";
import { runPageCode, runPlaywrightCode, effectiveTimeout, type BrowserCodeRunInput, type BrowserCodeRunResult } from "./code-runner.js";
import {
  createBrowserRefRegistry,
  FORENSICS_INIT_SCRIPT,
  type BrowserRefRegistry,
} from "./refs.js";
import { createBrowserSignalBuffer, type BrowserSignalBuffer } from "./signals.js";

// Re-export the shared browser-action input types so the Dev MCP browser
// session controller contract can be typed against the same public vocabulary
// the manager already uses (see DevMcpBrowserWorkbenchController). These are
// pure data shapes with no Playwright runtime dependency.
export type { BrowserCodeRunInput, BrowserCodeRunResult } from "./code-runner.js";
export type { ForensicsNode, ForensicsRect, PageFacts } from "./refs.js";

export interface AgentE2EPlaywrightMcpApiContract {
  surface: "playwright-backed-mcp-contracts";
}

export interface BrowserSessionMode {
  headed: boolean;
  headless: boolean;
  slowMoMs: number;
  consumer: "mcp" | "closure" | "ci";
}

export interface BrowserOpenInput {
  headed?: boolean;
  slowMoMs?: number;
  targetUrl?: string;
  journeyId?: string;
  runId?: string;
  artifactRoot?: string | undefined;
}

export interface BrowserOpenResult {
  status: "open";
  browserSessionId: string;
  browserMode: BrowserSessionMode;
  url: string;
  artifactDir: string;
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
}

export interface BrowserCloseResult {
  status: "closed" | "not-found";
  browserSessionId: string;
}

export interface BrowserActInput {
  browserSessionId: string;
  ref?: string;
  selector?: string;
  action: "click" | "fill" | "press" | "hover" | "focus" | "check" | "uncheck" | "select" | "scroll";
  text?: string;
  key?: string;
  value?: string;
  values?: string[];
  deltaX?: number;
  deltaY?: number;
}

export interface BrowserActResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  action?: BrowserActInput["action"];
  target?: { ref?: string; selector?: string; role?: string; name?: string };
  error?: { code: string; message: string };
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
}

// browser.inspect is the standard evidence path. Its tool output is a compact
// index; detailed state lives in the artifacts it writes.
export interface BrowserInspectInput {
  browserSessionId: string;
  target?: string;
  depth?: number;
  maxNodes?: number;
}

export interface BrowserInspectResult {
  status: "ok" | "not-found";
  browserSessionId: string;
  url: string;
  title?: string;
  target: { input: string | null; kind: "page" | "ref" | "selector"; resolved: boolean };
  artifacts: { inspect?: string | undefined; inspectJson?: string | undefined; screenshot?: string | undefined };
  signals: { consoleErrors: number; networkFailures: number };
  refsOverlayEnabled: boolean;
  error?: { code: string; message: string };
}

export interface BrowserRefsInput {
  browserSessionId: string;
  enabled: boolean;
}

export interface BrowserRefsResult {
  status: "ok" | "not-found";
  browserSessionId: string;
  enabled: boolean;
  error?: { code: string; message: string };
}

export interface BrowserWaitInput {
  browserSessionId: string;
  until: BrowserWaitCondition;
  timeoutMs?: number;
}

export type BrowserWaitCondition =
  | { kind: "ref"; ref: string; state?: "attached" | "detached" | "visible" | "hidden" }
  | { kind: "selector"; selector: string; state?: "attached" | "detached" | "visible" | "hidden" }
  | { kind: "text"; text: string; exact?: boolean }
  | { kind: "url"; pattern: string }
  | { kind: "load"; state?: "load" | "domcontentloaded" | "networkidle" }
  | { kind: "function"; code: string; input?: unknown };

export interface BrowserWaitResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  matched?: BrowserWaitCondition;
  durationMs: number;
  timeoutMs: number;
  error?: { code: string; message: string };
}

interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  mode: BrowserSessionMode;
  createdAt: string;
  lastUsedAt: string;
  refs: BrowserRefRegistry;
  signals: BrowserSignalBuffer;
  run: RunArtifacts;
  // Monotonic capture counter for this session's inspections. Each browser.inspect
  // call writes to inspections/<seq>/ so captures sort in capture order.
  inspectionSeq: number;
}

export const PLAYWRIGHT_MCP_DEFAULT_BROWSER_MODE: BrowserSessionMode = {
  headed: true,
  headless: false,
  slowMoMs: 0,
  consumer: "mcp",
};

export const playwrightMcpApiContract: AgentE2EPlaywrightMcpApiContract = {
  surface: "playwright-backed-mcp-contracts",
};

const BROWSER_CLOSE_TIMEOUT_MS = 1_000;

// browser.wait's ref-state vocabulary (attached|detached|visible|hidden) mapped
// onto Playwright's ElementHandle.waitForElementState vocabulary. `attached` ->
// `stable` (present and settled); `detached` is handled by the null-handle path
// above, so the live-handle case only ever maps the remaining three.
const REF_HANDLE_STATE: Record<"attached" | "detached" | "visible" | "hidden", "stable" | "hidden" | "visible"> = {
  attached: "stable",
  detached: "hidden",
  visible: "visible",
  hidden: "hidden",
};

export function createPlaywrightMcpBrowserSessionManager(options: { artifactRoot?: string } = {}) {
  const sessions = new Map<string, BrowserSession>();

  async function open(
    input: BrowserOpenInput = {},
  ): Promise<BrowserOpenResult> {
    const mode = browserMode(input);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch(
      mode.slowMoMs > 0
        ? { headless: mode.headless, slowMo: mode.slowMoMs }
        : { headless: mode.headless },
    );
    const page = await browser.newPage();
    // Install the UI forensics singleton on every document so refs and the
    // overlay survive soft navigations within the session.
    await page.addInitScript({ content: FORENSICS_INIT_SCRIPT });
    const signals = createBrowserSignalBuffer(page);
    if (input.targetUrl) await page.goto(input.targetUrl);
    const id = `browser-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const run = createRunArtifacts({
      artifactRoot: input.artifactRoot ?? options.artifactRoot,
      journeyId: input.journeyId ?? "browser",
      runId: input.runId ?? id,
    });
    sessions.set(id, {
      id,
      browser,
      page,
      mode,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      refs: createBrowserRefRegistry(),
      signals,
      run,
      inspectionSeq: 0,
    });
    return {
      status: "open",
      browserSessionId: id,
      browserMode: mode,
      url: page.url(),
      artifactDir: run.relDir,
      next: {
        actions: [
          {
            id: "inspect",
            tool: "browser.inspect",
            why: "Capture compact UI state evidence and refs before acting.",
          },
        ],
      },
    };
  }

  async function inspect(input: BrowserInspectInput): Promise<BrowserInspectResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        url: "",
        target: { input: input.target ?? null, kind: targetKind(input.target), resolved: false },
        artifacts: {},
        signals: { consoleErrors: 0, networkFailures: 0 },
        refsOverlayEnabled: false,
        error: { code: "browser-session-not-found", message: `No browser session exists for ${input.browserSessionId}` },
      };
    session.lastUsedAt = new Date().toISOString();

    const maxNodes = clampMaxNodes(input.maxNodes);
    const capture = await session.refs.capture(session.page, maxNodes);
    const overlayEnabled = capture.facts.overlayEnabled;
    const target = await resolveInspectTarget(session, input.target);
    const signals = inspectSignals(session);

    const seq = (session.inspectionSeq += 1);
    const dirRelative = `inspections/${String(seq).padStart(4, "0")}`;
    const { md, json, screenshot } = await writeInspection({
      page: asInspectPage(session.page),
      run: session.run,
      dirRelative,
      capture,
      target,
      signals,
    });

    return {
      status: "ok",
      browserSessionId: input.browserSessionId,
      url: capture.facts.url,
      title: capture.facts.title,
      target,
      artifacts: { inspect: md.path, inspectJson: json.path, screenshot: screenshot.path },
      signals,
      refsOverlayEnabled: overlayEnabled,
    };
  }

  async function refs(input: BrowserRefsInput): Promise<BrowserRefsResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        enabled: input.enabled,
        error: { code: "browser-session-not-found", message: `No browser session exists for ${input.browserSessionId}` },
      };
    session.lastUsedAt = new Date().toISOString();
    if (input.enabled) await session.refs.enableOverlay(session.page);
    else await session.refs.disableOverlay(session.page);
    const enabled = await session.refs.overlayEnabled(session.page);
    return { status: "ok", browserSessionId: input.browserSessionId, enabled };
  }

  async function act(input: BrowserActInput): Promise<BrowserActResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        error: { code: "browser-session-not-found", message: `No browser session exists for ${input.browserSessionId}` },
        next: { actions: [{ id: "open-browser", tool: "browser.open", why: "Create an MCP-owned browser session before acting." }] },
      };

    if (!input.selector && !input.ref)
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        action: input.action,
        error: { code: "browser-act-target-missing", message: "browser.act requires either a selector or a ref from browser.inspect." },
        next: { actions: [{ id: "inspect", tool: "browser.inspect", why: "Capture fresh refs before retrying browser.act." }] },
      };

    let actionable: BrowserActionable;
    let publicMeta: { ref?: string; selector?: string; role?: string; name?: string };
    if (input.ref) {
      const state = await session.refs.refState(session.page, input.ref);
      if (state !== "live") {
        return {
          status: "failed",
          browserSessionId: input.browserSessionId,
          action: input.action,
          target: { ref: input.ref },
          error: { code: `browser-ref-${state}`, message: `Ref ${input.ref} is ${state}. Re-run browser.inspect to refresh refs.` },
          next: { actions: [{ id: "inspect", tool: "browser.inspect", why: "Refresh the ref registry before retrying." }] },
        };
      }
      const handle = await session.refs.resolveHandle(session.page, input.ref);
      if (!handle)
        return {
          status: "failed",
          browserSessionId: input.browserSessionId,
          action: input.action,
          target: { ref: input.ref },
          error: { code: "browser-ref-stale", message: `Ref ${input.ref} no longer resolves to a live element.` },
          next: { actions: [{ id: "inspect", tool: "browser.inspect", why: "Refresh the ref registry before retrying." }] },
        };
      actionable = handle;
      const node = session.refs.cachedNodes().find((candidate) => candidate.ref === input.ref);
      publicMeta = { ref: input.ref, ...(node?.selector ? { selector: node.selector } : {}), ...(node?.role ? { role: node.role } : {}), ...(node?.name ? { name: node.name } : {}) };
    } else {
      const selector = input.selector as string;
      // A Playwright Locator structurally satisfies BrowserActionable, the same
      // way a resolved ElementHandle does — browser.act treats refs and raw
      // selectors identically.
      actionable = session.page.locator(selector);
      publicMeta = { selector };
    }

    try {
      await runBrowserAction(session.page, actionable, input);
      await session.page.waitForTimeout(250);
      session.lastUsedAt = new Date().toISOString();
      return {
        status: "ok",
        browserSessionId: input.browserSessionId,
        action: input.action,
        target: publicMeta,
        next: { actions: [{ id: "inspect", tool: "browser.inspect", why: "Inspect the browser state after the action." }] },
      };
    } catch (error) {
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        action: input.action,
        target: publicMeta,
        error: { code: "browser-act-failed", message: error instanceof Error ? error.message : String(error) },
        next: { actions: [{ id: "inspect", tool: "browser.inspect", why: "Inspect the current browser state before retrying." }] },
      };
    }
  }

  async function wait(input: BrowserWaitInput): Promise<BrowserWaitResult> {
    const session = sessions.get(input.browserSessionId);
    const timeoutMs = effectiveTimeout(input.timeoutMs);
    const start = Date.now();
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        durationMs: Date.now() - start,
        timeoutMs,
        error: { code: "browser-session-not-found", message: `No browser session exists for ${input.browserSessionId}` },
      };

    try {
      if (input.until.kind === "ref") {
        const wantedState = input.until.state ?? "visible";
        const handle = await session.refs.resolveHandle(session.page, input.until.ref);
        if (!handle) {
          // A retired/stale ref already satisfies a wait for it to go away;
          // otherwise the ref cannot become attached/visible, so fail.
          if (wantedState === "detached" || wantedState === "hidden") {
            session.lastUsedAt = new Date().toISOString();
            return { status: "ok", browserSessionId: input.browserSessionId, matched: input.until, durationMs: Date.now() - start, timeoutMs };
          }
          throw new Error(`Ref ${input.until.ref} does not resolve to a live element.`);
        }
        await handle.waitForElementState(REF_HANDLE_STATE[wantedState], { timeout: timeoutMs });
      } else if (input.until.kind === "selector") {
        await session.page.locator(input.until.selector).waitFor({
          state: input.until.state ?? "visible",
          timeout: timeoutMs,
        });
      } else if (input.until.kind === "text") {
        await session.page.getByText(input.until.text, {
          ...(input.until.exact !== undefined ? { exact: input.until.exact } : {}),
        }).waitFor({ state: "visible", timeout: timeoutMs });
      } else if (input.until.kind === "url") {
        await session.page.waitForURL(input.until.pattern, { timeout: timeoutMs });
      } else if (input.until.kind === "load") {
        await session.page.waitForLoadState(input.until.state ?? "load", { timeout: timeoutMs });
      } else {
        await session.page.waitForFunction(
          ({ code, input: pageInput }: { code: string; input: unknown }) => {
            const fn = new Function("input", code) as (input: unknown) => unknown;
            return fn(pageInput);
          },
          { code: input.until.code, input: input.until.input ?? null },
          { timeout: timeoutMs },
        );
      }
      session.lastUsedAt = new Date().toISOString();
      return {
        status: "ok",
        browserSessionId: input.browserSessionId,
        matched: input.until,
        durationMs: Date.now() - start,
        timeoutMs,
      };
    } catch (error) {
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        durationMs: Date.now() - start,
        timeoutMs,
        error: {
          code: isTimeoutError(error) ? "browser-wait-timeout" : "browser-wait-failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async function evaluate(input: BrowserCodeRunInput): Promise<BrowserCodeRunResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session) return missingCodeRun(input.browserSessionId, input.timeoutMs);
    const result = await runPageCode(session.page, input);
    session.lastUsedAt = new Date().toISOString();
    return result;
  }

  async function playwright(input: BrowserCodeRunInput): Promise<BrowserCodeRunResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session) return missingCodeRun(input.browserSessionId, input.timeoutMs);
    const result = await runPlaywrightCode(
      {
        browser: session.browser,
        page: session.page,
        refs: session.refs.selected(input.refs),
      },
      input,
    );
    session.lastUsedAt = new Date().toISOString();
    return result;
  }

  async function close(browserSessionId: string): Promise<BrowserCloseResult> {
    const session = sessions.get(browserSessionId);
    if (!session) return { status: "not-found", browserSessionId };
    sessions.delete(browserSessionId);
    // Tear the overlay down before closing so no overlay state lingers.
    try {
      await session.refs.disableOverlay(session.page);
    } catch {
      // Page may already be gone; closing the browser removes the overlay anyway.
    }
    await closeBrowserBounded(session.browser);
    return { status: "closed", browserSessionId };
  }

  async function closeAll(): Promise<BrowserCloseResult[]> {
    const ids = [...sessions.keys()];
    const results: BrowserCloseResult[] = [];
    for (const id of ids) {
      results.push(await close(id));
    }
    return results;
  }

  function list() {
    return [...sessions.values()].map((session) => ({
      browserSessionId: session.id,
      browserMode: session.mode,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      url: session.page.url(),
    }));
  }

  function execution(browserSessionId: string): { browser: Browser; page: Page } | undefined {
    const session = sessions.get(browserSessionId);
    return session ? { browser: session.browser, page: session.page } : undefined;
  }

  async function resolveInspectTarget(
    session: BrowserSession,
    target: string | undefined,
  ): Promise<BrowserInspectResult["target"]> {
    if (!target) return { input: null, kind: "page", resolved: true };
    if (target.startsWith("@")) {
      const state = await session.refs.refState(session.page, target);
      return { input: target, kind: "ref", resolved: state === "live" };
    }
    const count = await session.page.locator(target).count().catch(() => 0);
    return { input: target, kind: "selector", resolved: count > 0 };
  }

  return {
    open,
    inspect,
    refs,
    act,
    wait,
    evaluate,
    playwright,
    close,
    closeAll,
    list,
    execution,
  };
}

function inspectSignals(session: BrowserSession): { consoleErrors: number; networkFailures: number } {
  const consoleErrors = session.signals.console({ level: "error", limit: 100_000 }).entries.length;
  const networkFailures = session.signals.network({ status: "failed", limit: 100_000 }).entries.length;
  return { consoleErrors, networkFailures };
}

function targetKind(target: string | undefined): "page" | "ref" | "selector" {
  if (!target) return "page";
  return target.startsWith("@") ? "ref" : "selector";
}

function clampMaxNodes(maxNodes: number | undefined): number {
  if (maxNodes === undefined) return 200;
  return Math.min(1_000, Math.max(1, Math.floor(maxNodes)));
}

async function closeBrowserBounded(browser: Browser): Promise<void> {
  const close = browser.close();
  await Promise.race([
    close,
    delay(BROWSER_CLOSE_TIMEOUT_MS).then(() => undefined),
  ]);
  void close.catch(() => undefined);
}

function missingCodeRun(
  browserSessionId: string,
  timeoutMs: number | undefined,
): BrowserCodeRunResult {
  return {
    status: "not-found",
    browserSessionId,
    durationMs: 0,
    timeoutMs: effectiveTimeout(timeoutMs),
    error: {
      code: "browser-session-not-found",
      message: `No browser session exists for ${browserSessionId}`,
    },
    next: openBrowserNext(),
  };
}

function openBrowserNext() {
  return {
    actions: [
      {
        id: "open-browser",
        tool: "browser.open",
        why: "Create an MCP-owned browser session before using browser workbench tools.",
      },
    ],
  };
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout/i.test(error.message);
}

function browserMode(input: BrowserOpenInput): BrowserSessionMode {
  const headed = input.headed ?? PLAYWRIGHT_MCP_DEFAULT_BROWSER_MODE.headed;
  return {
    headed,
    headless: !headed,
    slowMoMs: Math.max(0, input.slowMoMs ?? 0),
    consumer: "mcp",
  };
}
