import type {
  BrowserActInput,
  BrowserCodeRunInput,
  BrowserInspectInput,
  BrowserRefsInput,
  BrowserWaitInput,
} from "../playwright-mcp/index.js";

type RuntimeZod = typeof import("zod/v4").z;

export const DEV_MCP_BROWSER_WORKBENCH_TOOLS = [
  "browser.open",
  "browser.sessions",
  "browser.inspect",
  "browser.refs",
  "browser.act",
  "browser.wait",
  "browser.eval",
  "browser.playwright",
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
  inspect?: (input: BrowserInspectInput) => Promise<unknown>;
  refs?: (input: BrowserRefsInput) => Promise<unknown>;
  act?: (input: BrowserActInput) => Promise<unknown>;
  wait?: (input: BrowserWaitInput) => Promise<unknown>;
  evaluate?: (input: BrowserCodeRunInput) => Promise<unknown>;
  playwright?: (input: BrowserCodeRunInput) => Promise<unknown>;
}

export function implementedBrowserWorkbenchToolNames(
  controller: DevMcpBrowserWorkbenchController,
): readonly DevMcpBrowserWorkbenchToolName[] {
  const tools: DevMcpBrowserWorkbenchToolName[] = [
    "browser.open",
    "browser.sessions",
  ];
  if (controller.inspect) tools.push("browser.inspect");
  if (controller.refs) tools.push("browser.refs");
  if (controller.act) tools.push("browser.act");
  if (controller.wait) tools.push("browser.wait");
  if (controller.evaluate) tools.push("browser.eval");
  if (controller.playwright) tools.push("browser.playwright");
  tools.push("browser.close");
  return tools;
}

export function browserWorkbenchSummary(name: DevMcpBrowserWorkbenchToolName): string {
  return {
    "browser.open": "Open an MCP-owned Playwright browser session for exploratory E2E work.",
    "browser.sessions": "List active MCP-owned browser sessions with current URLs and timestamps.",
    "browser.inspect": "Capture compact UI state evidence: page facts, refs, signals, and artifact paths. The standard evidence path.",
    "browser.refs": "Toggle the live refs overlay that paints UI forensics refs onto the page for human/operator viewing.",
    "browser.act": "Perform one UI action using a current ref from browser.inspect or a CSS selector.",
    "browser.wait": "Wait for an explicit browser condition and report elapsed timeout feedback.",
    "browser.eval": "Run an async page-context function body with JSON input and JSON-serializable output.",
    "browser.playwright": "Run an async Playwright-context function body against the live MCP-owned page and browser.",
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
    stringId().describe("Browser ref returned by browser.inspect (@eN).");
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
    case "browser.close":
      return { browserSessionId: sessionId() };
    case "browser.inspect":
      return {
        browserSessionId: sessionId(),
        target: stringId().optional().describe("Omit for the current page, '@<ref>' for a UI forensics ref, or any selector / Playwright locator-compatible target."),
        depth: z.number().int().positive().optional().describe("Optional UI tree depth hint."),
        maxNodes: z.number().int().positive().max(1_000).optional().describe("Maximum referencable nodes to capture; defaults to 200."),
      };
    case "browser.refs":
      return {
        browserSessionId: sessionId(),
        enabled: z.boolean().describe("Enable to paint the refs overlay; disable to remove it completely."),
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
  }
}
