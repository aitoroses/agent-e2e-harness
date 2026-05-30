import type { Browser, Page } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import {
  createRunArtifacts,
  forensicsRelativePath,
  safePathSegment,
  writeBinaryArtifact,
  writeJsonArtifact,
  type RunArtifacts,
} from "../artifacts/index.js";
import type { ArtifactRef } from "../core/index.js";
import { runBrowserAction } from "./actions.js";
import { runPageCode, runPlaywrightCode, effectiveTimeout, type BrowserCodeRunInput, type BrowserCodeRunResult } from "./code-runner.js";
import { createBrowserRefStore, descriptorForSelector, locatorFor, type BrowserLocatorDescriptor, type BrowserRefStore, type BrowserRefTarget } from "./refs.js";
import { createBrowserSignalBuffer, type BrowserConsoleLevel, type BrowserConsoleReadInput, type BrowserNetworkReadInput, type BrowserSignalBuffer } from "./signals.js";

// Re-export the shared browser-action input types so the Dev MCP browser
// session controller contract can be typed against the same public vocabulary
// the manager already uses (see DevMcpBrowserWorkbenchController). These are
// pure data shapes with no Playwright runtime dependency.
export type { BrowserCodeRunInput, BrowserCodeRunResult } from "./code-runner.js";

export interface AgentE2EPlaywrightMcpApiContract {
  surface: "playwright-backed-mcp-contracts";
}

export interface BrowserSessionMode {
  headed: boolean;
  headless: boolean;
  slowMoMs: number;
  consumer: "mcp" | "closure" | "ci";
}

export interface BrowserSnapshotPacket {
  status: "ok" | "failed";
  browserSessionId: string;
  url: string;
  title?: string;
  summary: string;
  refs: Array<{ ref: string; role?: string; name?: string; selector?: string }>;
  artifacts: ArtifactRef[];
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
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

export interface BrowserScreenshotInput {
  browserSessionId: string;
  /**
   * Optional screenshot filename. It is always written under this run's
   * forensics directory; path separators and unsafe characters are sanitized.
   */
  path?: string;
  fullPage?: boolean;
}

export interface BrowserScreenshotResult {
  status: "ok" | "not-found";
  browserSessionId: string;
  artifact?: ArtifactRef | undefined;
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

export interface BrowserFindInput {
  browserSessionId: string;
  by: "role" | "text" | "label" | "placeholder" | "testId" | "selector";
  value: string;
  name?: string;
  exact?: boolean;
  limit?: number;
}

export interface BrowserFindResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  targets: BrowserRefTarget[];
  error?: { code: string; message: string };
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
}

export interface BrowserGetInput {
  browserSessionId: string;
  ref?: string;
  selector?: string;
  kind: "text" | "html" | "value" | "attribute" | "title" | "url" | "count";
  attribute?: string;
}

export interface BrowserGetResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  kind: BrowserGetInput["kind"];
  value?: unknown;
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

export interface BrowserSignalToolInput extends BrowserConsoleReadInput, BrowserNetworkReadInput {
  browserSessionId: string;
}

interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  mode: BrowserSessionMode;
  createdAt: string;
  lastUsedAt: string;
  refs: BrowserRefStore;
  signals: BrowserSignalBuffer;
  run: RunArtifacts;
  // Monotonic capture counter for this session's forensics files. Forensics
  // captures are session-scoped exploration (not bound to a phase/step), so the
  // sequence tags each file with its capture ORDER and the action that produced
  // it — replacing the old timestamp-only names that sorted as noise.
  forensicsSeq: number;
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
      refs: createBrowserRefStore(),
      signals,
      run,
      forensicsSeq: 0,
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
            id: "snapshot",
            tool: "browser.snapshot",
            why: "Inspect the visible browser state before acting.",
          },
        ],
      },
    };
  }

  async function snapshot(
    browserSessionId: string,
  ): Promise<BrowserSnapshotPacket> {
    const session = sessions.get(browserSessionId);
    if (!session) return missingSnapshot(browserSessionId);
    session.lastUsedAt = new Date().toISOString();

    const pageData = await session.page.evaluate(() => {
      function visible(element: Element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      }

      function labelFor(element: Element) {
        const aria = element.getAttribute("aria-label");
        if (aria) return aria.trim();
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        const placeholder = element.getAttribute("placeholder");
        const title = element.getAttribute("title");
        return (
          text ||
          placeholder ||
          title ||
          element.getAttribute("name") ||
          element.id ||
          element.tagName.toLowerCase()
        ).slice(0, 120);
      }

      function roleFor(element: Element) {
        const explicit = element.getAttribute("role");
        if (explicit) return explicit;
        const tag = element.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "a") return "link";
        if (tag === "input" || tag === "textarea" || tag === "select")
          return "textbox";
        if (/^h[1-6]$/.test(tag)) return "heading";
        return tag;
      }

      function selectorFor(element: Element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const testId = element.getAttribute("data-testid");
        if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
        const noteId = element.getAttribute("data-note-id");
        if (noteId) return `[data-note-id="${CSS.escape(noteId)}"]`;
        return cssPathFor(element);
      }

      function cssPathFor(element: Element) {
        const parts: string[] = [];
        let current: Element | null = element;
        while (current && current !== document.body) {
          if (current.id) {
            parts.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          const testId = current.getAttribute("data-testid");
          if (testId) {
            parts.unshift(`[data-testid="${CSS.escape(testId)}"]`);
            break;
          }
          const noteId = current.getAttribute("data-note-id");
          if (noteId) {
            parts.unshift(`[data-note-id="${CSS.escape(noteId)}"]`);
            break;
          }
          parts.unshift(nthOfTypeSelector(current));
          current = current.parentElement;
        }
        return `body > ${parts.join(" > ")}`;
      }

      function nthOfTypeSelector(element: Element) {
        const tag = element.tagName.toLowerCase();
        const name = element.getAttribute("name");
        if (name) return `${tag}[name="${CSS.escape(name)}"]`;
        const siblings = [...(element.parentElement?.children ?? [])].filter(
          (sibling) => sibling.tagName.toLowerCase() === tag,
        );
        return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`;
      }

      const candidates = [
        ...document.querySelectorAll(
          "button,a,input,textarea,select,[role],h1,h2,h3,[data-testid],[data-note-id]",
        ),
      ]
        .filter(visible)
        .slice(0, 80);

      return {
        url: window.location.href,
        title: document.title,
        refs: candidates.map((element, index) => ({
          ref: `@e${index + 1}`,
          role: roleFor(element),
          name: labelFor(element),
          selector: selectorFor(element),
        })),
        visibleErrors: [
          ...document.querySelectorAll('[role="alert"], .error, [data-error]'),
        ]
          .filter(visible)
          .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 10),
      };
    });

    session.refs.replaceSnapshot(pageData.refs);
    const packet = {
      status: "ok",
      browserSessionId,
      url: pageData.url,
      title: pageData.title,
      summary:
        pageData.visibleErrors.length > 0
          ? "Browser snapshot captured with visible errors."
          : "Browser snapshot captured.",
      refs: pageData.refs,
      artifacts: [],
      warnings: [],
      errors: pageData.visibleErrors.map((message, index) => ({
        code: `visible-error-${index + 1}`,
        message: message ?? "Visible error",
      })),
      next: {
        actions: [
          {
            id: "act",
            tool: "browser.act",
            why: "Use a fresh snapshot ref for the next browser action.",
          },
        ],
      },
    } satisfies BrowserSnapshotPacket;
    const artifact = await writeJsonArtifact(
      session.run,
      forensicsRelativePath(`${nextForensicsName(session, "browser-snapshot")}.json`),
      packet,
      {
        name: "browser-snapshot",
        kind: "browser-snapshot",
        description:
          "Full browser snapshot with URL, title, refs, visible errors, and next actions.",
      },
    );
    return { ...packet, artifacts: [artifact] };
  }

  async function screenshot(
    input: BrowserScreenshotInput,
  ): Promise<BrowserScreenshotResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return { status: "not-found", browserSessionId: input.browserSessionId };
    session.lastUsedAt = new Date().toISOString();
    const customLabel = input.path
      ? (input.path.split(/[\\/]/).filter(Boolean).at(-1) ?? input.path).replace(/\.png$/i, "")
      : undefined;
    const filename = `${nextForensicsName(session, "browser-screenshot", customLabel)}.png`;
    const buffer = await session.page.screenshot({
      fullPage: input.fullPage ?? true,
    });
    const artifact = await writeBinaryArtifact(
      session.run,
      forensicsRelativePath(filename),
      buffer,
      {
      kind: "screenshot",
      name: "screenshot",
      description: "Browser screenshot captured from an MCP-owned session.",
      },
    );
    return {
      status: "ok",
      browserSessionId: input.browserSessionId,
      artifact,
    };
  }

  async function act(input: BrowserActInput): Promise<BrowserActResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        error: {
          code: "browser-session-not-found",
          message: `No browser session exists for ${input.browserSessionId}`,
        },
        next: {
          actions: [
            {
              id: "open-browser",
              tool: "browser.open",
              why: "Create an MCP-owned browser session before acting.",
            },
          ],
        },
      };

    const target = resolveActTarget(session, input);
    if (!target)
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        action: input.action,
        error: {
          code: "browser-act-target-missing",
          message:
            "browser.act requires either a selector or a ref from the latest browser.snapshot.",
        },
        next: {
          actions: [
            {
              id: "snapshot",
              tool: "browser.snapshot",
              why: "Capture fresh refs before retrying browser.act.",
            },
          ],
        },
      };

    try {
      await runBrowserAction(session.page, target, input);
      await session.page.waitForTimeout(250);
      session.lastUsedAt = new Date().toISOString();
      return {
        status: "ok",
        browserSessionId: input.browserSessionId,
        action: input.action,
        target: publicTarget(target),
        next: {
          actions: [
            {
              id: "snapshot",
              tool: "browser.snapshot",
              why: "Inspect the browser state after the action.",
            },
          ],
        },
      };
    } catch (error) {
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        action: input.action,
        target: publicTarget(target),
        error: {
          code: "browser-act-failed",
          message: error instanceof Error ? error.message : String(error),
        },
        next: {
          actions: [
            {
              id: "snapshot",
              tool: "browser.snapshot",
              why: "Inspect the current browser state before retrying.",
            },
          ],
        },
      };
    }
  }

  async function find(input: BrowserFindInput): Promise<BrowserFindResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        targets: [],
        error: {
          code: "browser-session-not-found",
          message: `No browser session exists for ${input.browserSessionId}`,
        },
        next: openBrowserNext(),
      };

    try {
      const base = findDescriptor(input);
      const locator = locatorFor(session.page, base);
      const count = await locator.count();
      const limit = Math.min(Math.max(1, input.limit ?? 10), 50);
      const targets: Array<Omit<BrowserRefTarget, "ref" | "source">> = [];
      for (let index = 0; index < Math.min(count, limit); index += 1) {
        const nth = locator.nth(index);
        const name = await readableLocatorName(nth);
        targets.push({
          locator: base.kind === "selector" ? base : { ...base, index },
          ...(base.kind === "selector" ? { selector: base.selector } : {}),
          ...(input.by === "role" ? { role: input.value } : {}),
          ...(name ? { name } : {}),
        });
      }
      const storedTargets = session.refs.replaceFind(targets);
      session.lastUsedAt = new Date().toISOString();
      return {
        status: "ok",
        browserSessionId: input.browserSessionId,
        targets: storedTargets,
        next: {
          actions: [
            {
              id: "act-or-get",
              tool: "browser.act",
              why: "Use returned refs for actions or targeted reads.",
            },
          ],
        },
      };
    } catch (error) {
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        targets: [],
        error: {
          code: "browser-find-failed",
          message: error instanceof Error ? error.message : String(error),
        },
        next: {
          actions: [
            {
              id: "snapshot",
              tool: "browser.snapshot",
              why: "Inspect visible state before retrying the semantic lookup.",
            },
          ],
        },
      };
    }
  }

  async function get(input: BrowserGetInput): Promise<BrowserGetResult> {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return {
        status: "not-found",
        browserSessionId: input.browserSessionId,
        kind: input.kind,
        error: {
          code: "browser-session-not-found",
          message: `No browser session exists for ${input.browserSessionId}`,
        },
      };

    try {
      if (input.kind === "title")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: await session.page.title() };
      if (input.kind === "url")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: session.page.url() };

      const target = resolveTarget(session, input);
      if (!target)
        return {
          status: "failed",
          browserSessionId: input.browserSessionId,
          kind: input.kind,
          error: {
            code: "browser-target-missing",
            message: "browser.get requires a ref or selector for this kind.",
          },
        };
      const locator = locatorFor(session.page, target);
      if (input.kind === "count")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: await locator.count() };
      if (await locator.count() === 0)
        return {
          status: "not-found",
          browserSessionId: input.browserSessionId,
          kind: input.kind,
          error: {
            code: "browser-target-not-found",
            message: "No element matched the requested ref or selector.",
          },
        };
      if (input.kind === "text")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: await locator.first().textContent() };
      if (input.kind === "html")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: await locator.first().innerHTML() };
      if (input.kind === "value")
        return { status: "ok", browserSessionId: input.browserSessionId, kind: input.kind, value: await locator.first().inputValue() };
      if (input.kind === "attribute") {
        if (!input.attribute)
          throw new Error("browser.get attribute requires attribute.");
        return {
          status: "ok",
          browserSessionId: input.browserSessionId,
          kind: input.kind,
          value: await locator.first().getAttribute(input.attribute),
        };
      }
      throw new Error(`Unsupported browser.get kind: ${input.kind}`);
    } catch (error) {
      return {
        status: "failed",
        browserSessionId: input.browserSessionId,
        kind: input.kind,
        error: {
          code: "browser-get-failed",
          message: error instanceof Error ? error.message : String(error),
        },
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
        error: {
          code: "browser-session-not-found",
          message: `No browser session exists for ${input.browserSessionId}`,
        },
      };

    try {
      if (input.until.kind === "ref" || input.until.kind === "selector") {
        const target = input.until.kind === "ref"
          ? session.refs.get(input.until.ref)
          : descriptorForSelector(input.until.selector);
        if (!target)
          throw new Error(input.until.kind === "ref"
            ? `Unknown browser ref: ${input.until.ref}`
            : "Unknown browser selector target.");
        await locatorFor(session.page, target).waitFor({
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
          ({ code, input: pageInput }) => {
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

  async function console(input: BrowserSignalToolInput) {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return { status: "not-found", browserSessionId: input.browserSessionId, entries: [], nextCursor: input.since ?? 0 };
    session.lastUsedAt = new Date().toISOString();
    return { browserSessionId: input.browserSessionId, ...session.signals.console(input) };
  }

  async function network(input: BrowserSignalToolInput) {
    const session = sessions.get(input.browserSessionId);
    if (!session)
      return { status: "not-found", browserSessionId: input.browserSessionId, entries: [], nextCursor: input.since ?? 0 };
    session.lastUsedAt = new Date().toISOString();
    return { browserSessionId: input.browserSessionId, ...session.signals.network(input) };
  }

  async function close(browserSessionId: string): Promise<BrowserCloseResult> {
    const session = sessions.get(browserSessionId);
    if (!session) return { status: "not-found", browserSessionId };
    sessions.delete(browserSessionId);
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

  return {
    open,
    snapshot,
    find,
    act,
    wait,
    get,
    evaluate,
    playwright,
    console,
    network,
    screenshot,
    close,
    closeAll,
    list,
    execution,
  };
}

async function closeBrowserBounded(browser: Browser): Promise<void> {
  const close = browser.close();
  await Promise.race([
    close,
    delay(BROWSER_CLOSE_TIMEOUT_MS).then(() => undefined),
  ]);
  void close.catch(() => undefined);
}

/**
 * Build a forensics filename stem tagged with this session's capture sequence
 * and the action that produced it (e.g. `0001-browser-snapshot`,
 * `0002-browser-screenshot-login-form`). The sequence makes captures sort in
 * capture order and disambiguates repeats; the action and optional label make
 * each file self-identifying instead of timestamp-only noise. Any caller-
 * supplied label is sanitized, so path traversal cannot escape the forensics
 * directory.
 */
function nextForensicsName(session: BrowserSession, action: string, label?: string): string {
  const seq = String((session.forensicsSeq += 1)).padStart(4, "0");
  const labelSegment = label ? safePathSegment(label) : "";
  return [seq, action, labelSegment].filter(Boolean).join("-");
}

function resolveActTarget(
  session: BrowserSession,
  input: BrowserActInput,
): BrowserRefTarget | BrowserLocatorDescriptor | undefined {
  if (input.selector) return descriptorForSelector(input.selector);
  if (!input.ref) return undefined;
  const ref = session.refs.get(input.ref);
  if (!ref) return undefined;
  return ref;
}

function resolveTarget(
  session: BrowserSession,
  input: { ref?: string; selector?: string },
): BrowserRefTarget | BrowserLocatorDescriptor | undefined {
  if (input.selector) return descriptorForSelector(input.selector);
  return input.ref ? session.refs.get(input.ref) : undefined;
}

function publicTarget(
  target: BrowserRefTarget | BrowserLocatorDescriptor,
): { ref?: string; selector?: string; role?: string; name?: string } {
  if ("ref" in target) {
    return {
      ref: target.ref,
      ...(target.selector ? { selector: target.selector } : {}),
      ...(target.role ? { role: target.role } : {}),
      ...(target.name ? { name: target.name } : {}),
    };
  }
  return target.kind === "selector" ? { selector: target.selector } : {};
}

function findDescriptor(input: BrowserFindInput): BrowserLocatorDescriptor {
  if (input.by === "selector") return { kind: "selector", selector: input.value };
  if (input.by === "role")
    return {
      kind: "role",
      role: input.value,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.exact !== undefined ? { exact: input.exact } : {}),
    };
  if (input.by === "text")
    return {
      kind: "text",
      text: input.value,
      ...(input.exact !== undefined ? { exact: input.exact } : {}),
    };
  if (input.by === "label")
    return {
      kind: "label",
      text: input.value,
      ...(input.exact !== undefined ? { exact: input.exact } : {}),
    };
  if (input.by === "placeholder")
    return {
      kind: "placeholder",
      text: input.value,
      ...(input.exact !== undefined ? { exact: input.exact } : {}),
    };
  return { kind: "testId", testId: input.value };
}

async function readableLocatorName(locator: ReturnType<Page["locator"]>): Promise<string | undefined> {
  const text = (await locator.first().textContent().catch(() => null))?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 120);
  const aria = await locator.first().getAttribute("aria-label").catch(() => null);
  if (aria) return aria.slice(0, 120);
  const placeholder = await locator.first().getAttribute("placeholder").catch(() => null);
  if (placeholder) return placeholder.slice(0, 120);
  const value = await locator.first().inputValue().catch(() => null);
  return value ? value.slice(0, 120) : undefined;
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

function missingSnapshot(browserSessionId: string): BrowserSnapshotPacket {
  return {
    status: "failed",
    browserSessionId,
    url: "",
    summary: "Browser session not found.",
    refs: [],
    artifacts: [],
    warnings: [],
    errors: [
      {
        code: "browser-session-not-found",
        message: `No browser session exists for ${browserSessionId}`,
      },
    ],
    next: {
      actions: [
        {
          id: "open-browser",
          tool: "browser.open",
          why: "Create an MCP-owned browser session before taking a snapshot.",
        },
      ],
    },
  };
}
