import type { Browser, Page } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import {
  createRunArtifacts,
  forensicsRelativePath,
  safePathSegment,
  timestampSegment,
  writeBinaryArtifact,
  writeJsonArtifact,
  type RunArtifacts,
} from "../artifacts/index.js";
import type { ArtifactRef } from "../core/index.js";

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
  action: "click" | "fill" | "press";
  text?: string;
  key?: string;
}

export interface BrowserActResult {
  status: "ok" | "not-found" | "failed";
  browserSessionId: string;
  action?: BrowserActInput["action"];
  target?: { ref?: string; selector: string; role?: string; name?: string };
  artifact?: ArtifactRef | undefined;
  error?: { code: string; message: string };
  next: { actions: Array<{ id: string; tool?: string; why: string }> };
}

interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  mode: BrowserSessionMode;
  createdAt: string;
  lastUsedAt: string;
  refs: Map<string, { selector: string; role?: string; name?: string }>;
  run: RunArtifacts;
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
      refs: new Map(),
      run,
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

    session.refs = new Map(
      pageData.refs.map((ref) => [
        ref.ref,
        { selector: ref.selector, role: ref.role, name: ref.name },
      ]),
    );
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
      forensicsRelativePath(`browser-snapshot-${timestampSegment()}.json`),
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
    const filename = screenshotFilename(
      input.path ?? `screenshot-${timestampSegment()}.png`,
    );
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
      const locator = session.page.locator(target.selector);
      if (input.action === "click") {
        await locator.click();
      } else if (input.action === "fill") {
        if (input.text === undefined)
          throw new Error("browser.act fill requires text.");
        await locator.fill(input.text);
      } else if (input.action === "press") {
        if (input.key === undefined)
          throw new Error("browser.act press requires key.");
        await locator.press(input.key);
      } else {
        throw new Error(`Unsupported browser.act action: ${input.action}`);
      }

      await session.page.waitForTimeout(250);
      const actionScreenshot = await screenshot({
        browserSessionId: input.browserSessionId,
        path: `action-${input.action}-${timestampSegment()}.png`,
      });
      session.lastUsedAt = new Date().toISOString();
      return {
        status: "ok",
        browserSessionId: input.browserSessionId,
        action: input.action,
        target,
        artifact: actionScreenshot.artifact,
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
        target,
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

  return { open, snapshot, act, screenshot, close, closeAll, list, execution };
}

async function closeBrowserBounded(browser: Browser): Promise<void> {
  const close = browser.close();
  await Promise.race([
    close,
    delay(BROWSER_CLOSE_TIMEOUT_MS).then(() => undefined),
  ]);
  void close.catch(() => undefined);
}

function screenshotFilename(value: string): string {
  const leaf = value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
  return `${safePathSegment(leaf.replace(/\.png$/i, ""))}.png`;
}

function resolveActTarget(
  session: BrowserSession,
  input: BrowserActInput,
): { ref?: string; selector: string; role?: string; name?: string } | undefined {
  if (input.selector) return { selector: input.selector };
  if (!input.ref) return undefined;
  const ref = session.refs.get(input.ref);
  if (!ref) return undefined;
  return { ref: input.ref, ...ref };
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
