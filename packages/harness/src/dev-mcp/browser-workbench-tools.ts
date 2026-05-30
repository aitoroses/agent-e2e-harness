import type {
  BrowserActInput,
  BrowserCodeRunInput,
  BrowserFindInput,
  BrowserGetInput,
  BrowserScreenshotInput,
  BrowserSignalToolInput,
  BrowserWaitInput,
} from "../playwright-mcp/index.js";

type RuntimeZod = typeof import("zod/v4").z;

export const DEV_MCP_BROWSER_WORKBENCH_TOOLS = [
  "browser.open",
  "browser.sessions",
  "browser.snapshot",
  "browser.find",
  "browser.act",
  "browser.wait",
  "browser.get",
  "browser.eval",
  "browser.playwright",
  "browser.console",
  "browser.network",
  "browser.screenshot",
  "browser.close",
] as const;

export type DevMcpBrowserWorkbenchToolName = (typeof DEV_MCP_BROWSER_WORKBENCH_TOOLS)[number];

// Method params are typed against the shared public browser-action input types
// (the same ones the Playwright manager already uses) rather than
// `Record<string, unknown>`. Under strictFunctionTypes a manager method whose
// parameter is narrower than `Record<string, unknown>` is not assignable to a
// wider-parameter field, so the public factory failed to satisfy this contract
// when wired explicitly. Aligning the params makes
// `createPlaywrightMcpBrowserSessionManager()` assignable here, and tightens
// call-site safety for any other controller implementation.
export interface DevMcpBrowserWorkbenchController {
  find?: (input: BrowserFindInput) => Promise<unknown>;
  act?: (input: BrowserActInput) => Promise<unknown>;
  wait?: (input: BrowserWaitInput) => Promise<unknown>;
  get?: (input: BrowserGetInput) => Promise<unknown>;
  evaluate?: (input: BrowserCodeRunInput) => Promise<unknown>;
  playwright?: (input: BrowserCodeRunInput) => Promise<unknown>;
  console?: (input: BrowserSignalToolInput) => Promise<unknown>;
  network?: (input: BrowserSignalToolInput) => Promise<unknown>;
  screenshot?: (input: BrowserScreenshotInput) => Promise<unknown>;
}

export function implementedBrowserWorkbenchToolNames(
  controller: DevMcpBrowserWorkbenchController,
): readonly DevMcpBrowserWorkbenchToolName[] {
  const tools: DevMcpBrowserWorkbenchToolName[] = [
    "browser.open",
    "browser.sessions",
    "browser.snapshot",
  ];
  if (controller.find) tools.push("browser.find");
  if (controller.act) tools.push("browser.act");
  if (controller.wait) tools.push("browser.wait");
  if (controller.get) tools.push("browser.get");
  if (controller.evaluate) tools.push("browser.eval");
  if (controller.playwright) tools.push("browser.playwright");
  if (controller.console) tools.push("browser.console");
  if (controller.network) tools.push("browser.network");
  if (controller.screenshot) tools.push("browser.screenshot");
  tools.push("browser.close");
  return tools;
}

export function browserWorkbenchSummary(name: DevMcpBrowserWorkbenchToolName): string {
  return {
    "browser.open": "Open an MCP-owned Playwright browser session for exploratory E2E work.",
    "browser.sessions": "List active MCP-owned browser sessions with current URLs and timestamps.",
    "browser.snapshot": "Capture the primary browser state packet with visible refs and a structured artifact.",
    "browser.find": "Resolve a semantic locator into reusable browser refs without acting.",
    "browser.act": "Perform one UI action using a current browser ref or CSS selector.",
    "browser.wait": "Wait for an explicit browser condition and report elapsed timeout feedback.",
    "browser.get": "Read one targeted browser value such as text, HTML, value, attribute, title, URL, or count.",
    "browser.eval": "Run an async page-context function body with JSON input and JSON-serializable output.",
    "browser.playwright": "Run an async Playwright-context function body against the live MCP-owned page and browser.",
    "browser.console": "Read per-session browser console signals with cursor-based incremental filtering.",
    "browser.network": "Read per-session browser network request/response/failure signals with cursor-based filtering.",
    "browser.screenshot": "Capture an explicit supporting screenshot artifact for the browser session.",
    "browser.close": "Close an MCP-owned browser session.",
  }[name];
}

export function browserWorkbenchInputSchema(
  name: DevMcpBrowserWorkbenchToolName,
  z: RuntimeZod,
): Record<string, unknown> {
  const stringId = () => z.string().min(1);
  const sessionId = () =>
    stringId().describe("Browser session id returned by browser.open.");
  const ref = () =>
    stringId().describe("Browser ref returned by browser.snapshot (@eN) or browser.find (@fN).");
  const selector = () =>
    stringId().describe("CSS selector used directly when a current browser ref is not available.");

  switch (name) {
    case "browser.sessions":
      return {};
    case "browser.open":
      return {
        headed: z.boolean().optional().describe("Whether to show the browser window; defaults to headed for dev exploration."),
        slowMoMs: z.number().nonnegative().optional().describe("Optional Playwright slow motion delay in milliseconds."),
        targetUrl: stringId().optional().describe("Optional URL to navigate to immediately after opening the session."),
        journeyId: stringId().optional().describe("Journey id used to scope emitted artifacts."),
        runId: stringId().optional().describe("Run id used to scope emitted artifacts."),
        artifactRoot: stringId().optional().describe("Artifact root override for this browser session."),
      };
    case "browser.snapshot":
    case "browser.close":
      return { browserSessionId: sessionId() };
    case "browser.find":
      return {
        browserSessionId: sessionId(),
        by: z.enum(["role", "text", "label", "placeholder", "testId", "selector"]).describe("Locator family to resolve before any action is taken."),
        value: stringId().describe("Role name, visible text, label text, placeholder text, test id, or CSS selector depending on by."),
        name: z.string().optional().describe("Accessible name filter when by is role."),
        exact: z.boolean().optional().describe("Whether text-like matching must be exact."),
        limit: z.number().int().positive().max(50).optional().describe("Maximum number of refs to return; defaults to 10."),
      };
    case "browser.act":
      return {
        browserSessionId: sessionId(),
        action: z.enum(["click", "fill", "press", "hover", "focus", "check", "uncheck", "select", "scroll"]).describe("Single UI action to perform."),
        ref: ref().optional(),
        selector: selector().optional(),
        text: z.string().optional().describe("Text for fill actions."),
        key: z.string().optional().describe("Keyboard key for press actions, for example Enter."),
        value: z.string().optional().describe("Single value for select actions."),
        values: z.array(z.string()).optional().describe("One or more option values for select actions."),
        deltaX: z.number().optional().describe("Horizontal wheel delta for scroll actions."),
        deltaY: z.number().optional().describe("Vertical wheel delta for scroll actions; defaults to 500."),
      };
    case "browser.wait":
      return {
        browserSessionId: sessionId(),
        until: z.union([
          z.object({ kind: z.literal("ref"), ref: ref(), state: z.enum(["attached", "detached", "visible", "hidden"]).optional() }),
          z.object({ kind: z.literal("selector"), selector: selector(), state: z.enum(["attached", "detached", "visible", "hidden"]).optional() }),
          z.object({ kind: z.literal("text"), text: z.string().min(1), exact: z.boolean().optional() }),
          z.object({ kind: z.literal("url"), pattern: z.string().min(1) }),
          z.object({ kind: z.literal("load"), state: z.enum(["load", "domcontentloaded", "networkidle"]).optional() }),
          z.object({ kind: z.literal("function"), code: z.string().min(1), input: z.unknown().optional() }),
        ]).describe("Explicit condition to wait for; fixed sleeps are intentionally not exposed."),
        timeoutMs: z.number().int().positive().max(30_000).optional().describe("Wait timeout in milliseconds; capped at 30000."),
      };
    case "browser.get":
      return {
        browserSessionId: sessionId(),
        kind: z.enum(["text", "html", "value", "attribute", "title", "url", "count"]).describe("Targeted read operation to perform."),
        ref: ref().optional(),
        selector: selector().optional(),
        attribute: z.string().optional().describe("Attribute name when kind is attribute."),
      };
    case "browser.eval":
    case "browser.playwright":
      return {
        browserSessionId: sessionId(),
        code: z.string().min(1).describe(name === "browser.eval"
          ? "Async function body executed in the page context with an input argument."
          : "Async function body executed in Node with page, browser, context, input, and refs arguments."),
        input: z.unknown().optional().describe("JSON input passed separately from code."),
        ...(name === "browser.playwright"
          ? { refs: z.array(ref()).optional().describe("Optional current refs to pass to browser.playwright.") }
          : {}),
        timeoutMs: z.number().int().positive().max(30_000).optional().describe("Execution timeout in milliseconds; defaults to 5000 and caps at 30000."),
      };
    case "browser.console":
      return {
        browserSessionId: sessionId(),
        since: z.number().int().nonnegative().optional().describe("Return console entries after this cursor."),
        level: z.enum(["log", "debug", "info", "warning", "error"]).optional().describe("Optional console level filter."),
        limit: z.number().int().positive().optional().describe("Maximum entries to return; defaults to 100."),
        clear: z.boolean().optional().describe("Clear the buffered console entries after reading them."),
      };
    case "browser.network":
      return {
        browserSessionId: sessionId(),
        since: z.number().int().nonnegative().optional().describe("Return network entries after this cursor."),
        urlIncludes: z.string().optional().describe("Only return entries whose URL contains this substring."),
        status: z.enum(["all", "failed"]).optional().describe("Return all network entries or only failed/error responses."),
        limit: z.number().int().positive().optional().describe("Maximum entries to return; defaults to 100."),
        clear: z.boolean().optional().describe("Clear the buffered network entries after reading them."),
      };
    case "browser.screenshot":
      return {
        browserSessionId: sessionId(),
        path: stringId().optional().describe("Optional screenshot filename; path separators are sanitized under the run forensics directory."),
        fullPage: z.boolean().optional().describe("Whether to capture the full page; defaults to true."),
      };
  }
}
