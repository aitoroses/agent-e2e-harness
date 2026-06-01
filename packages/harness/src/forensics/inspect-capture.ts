// Shared inspect-evidence capture. This module is execution-neutral: it depends
// only on a structural `InspectPage` (evaluate + screenshot), never on the
// Playwright package, so BOTH the Playwright MCP manager (ad-hoc browser.inspect)
// and the journey-step recorder in `mcp/` can reuse one evidence system. There
// is no second evidence path — `browser.inspect` and `journey.step` both write
// the same compact inspect.md / inspect.json (+ screenshot) through here.
import {
  writeBinaryArtifact,
  writeJsonArtifact,
  writeTextArtifact,
  type RunArtifacts,
} from "../artifacts/index.js";
import type { ArtifactRef } from "../core/index.js";
import { FORENSICS_BROWSER_SOURCE, FORENSICS_SINGLETON_GLOBAL } from "./browser-script.js";

export interface ForensicsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// One referencable node in the UI forensics tree — the unit shared by
// browser.inspect (evidence), browser.refs (overlay), and browser.act (resolve).
export interface ForensicsNode {
  ref: string;
  role?: string;
  name?: string;
  selector: string;
  sig?: string;
  rect: ForensicsRect;
  disabled?: boolean;
}

export interface TreeNodeScroll {
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  overflowX: string;
  overflowY: string;
  scrollable: boolean;
}

export interface TreeNodeLayout {
  display: string;
  position: string;
  flexDirection?: string;
  flexWrap?: string;
  gap?: string;
  justifyContent?: string;
  alignItems?: string;
  gridTemplateColumns?: string;
  zIndex?: string;
}

export interface TreeNodeStyle {
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  background?: string;
  border?: string;
  borderRadius?: string;
  padding?: string;
  shadow?: string;
}

// A node in the OC-grade UI forensics tree: factual geometry / visibility /
// scroll / layout / style state plus identity. Referencable nodes carry `ref`
// (so screenshot pixels map to act targets); structural nodes (landmarks,
// containers, scroll regions) have no ref but give layout/visibility context.
export interface ForensicsTreeNode {
  depth: number;
  tag: string;
  ref?: string;
  role?: string;
  name?: string;
  selector?: string;
  dataUi?: string;
  testId?: string;
  id?: string;
  rect: ForensicsRect;
  visible: boolean;
  hidden?: string;
  disabled?: boolean;
  scroll?: TreeNodeScroll;
  layout?: TreeNodeLayout;
  style?: TreeNodeStyle;
}

export interface PageSummary {
  interactive: number;
  landmarks: Array<{ role: string; name?: string }>;
  headings: Record<string, number>;
  alerts: number;
  dialogs: number;
  forms: number;
  formControls: number;
  tables: number;
  images: number;
  imagesMissingAlt: number;
}

export interface PageDocument {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface PageFacts {
  url: string;
  title: string;
  viewport: { width: number; height: number; devicePixelRatio?: number };
  document?: PageDocument;
  headings: Array<{ level: number; text: string }>;
  alerts: string[];
  dialogs: string[];
  loading: boolean;
  landmarks?: Array<{ role: string; name?: string }>;
  summary?: PageSummary;
  visibleText?: string[];
  primaryHeading?: string;
  activeLandmark?: string;
  overlayEnabled: boolean;
}

export interface ForensicsCapture {
  nodes: ForensicsNode[];
  facts: PageFacts;
  tree: ForensicsTreeNode[];
  truncated: boolean;
}

export interface InspectTarget {
  input: string | null;
  kind: "page" | "ref" | "selector";
  resolved: boolean;
}

export interface InspectSignals {
  consoleErrors: number;
  networkFailures: number;
  consoleErrorDetails?: Array<{
    text: string;
    location?: { url?: string; lineNumber?: number; columnNumber?: number };
  }>;
  networkFailureDetails?: Array<{
    kind: string;
    method?: string;
    url: string;
    statusCode?: number;
    failureText?: string;
  }>;
}

// Structural subset of Playwright's Page used here, so this module stays free of
// the Playwright package import (and the dev-mcp/mcp boundary checks).
export interface InspectPage {
  evaluate(pageFunction: string | ((arg: never) => unknown), arg?: unknown): Promise<unknown>;
  screenshot(options?: { fullPage?: boolean }): Promise<Uint8Array>;
}

// Single adapter for the forensics boundary: Playwright's `Page.evaluate`
// overloads do not structurally match `InspectPage`, so the cast lives here once
// instead of being re-derived (`as unknown as InspectPage`) at each call site.
export function asInspectPage(page: unknown): InspectPage {
  return page as InspectPage;
}

const MD_TREE_CAP = 120;
const GLOBAL = FORENSICS_SINGLETON_GLOBAL;

/**
 * Canonical inspect.json payload. Both evidence paths (ad-hoc `browser.inspect`
 * via {@link writeInspection} and `journey.step` via the step recorder) write
 * THIS object, so the single-evidence-path guarantee is enforced by construction:
 * add or rename a field here and both paths move together. Detailed state lives
 * here (the tool return stays a compact path-oriented index).
 */
export function buildInspectJson(
  capture: ForensicsCapture,
  target: InspectTarget,
  signals: InspectSignals,
): Record<string, unknown> {
  const { facts, nodes, tree, truncated } = capture;
  return {
    url: facts.url,
    title: facts.title,
    viewport: facts.viewport,
    document: facts.document,
    target,
    overlayEnabled: facts.overlayEnabled,
    signals,
    summary: facts.summary,
    facts: {
      primaryHeading: facts.primaryHeading,
      activeLandmark: facts.activeLandmark,
      headings: facts.headings,
      landmarks: facts.landmarks,
      alerts: facts.alerts,
      dialogs: facts.dialogs,
      loading: facts.loading,
      visibleText: facts.visibleText,
    },
    interactive: nodes,
    tree,
    treeTruncated: truncated,
  };
}

/** Ensure the in-page forensics singleton is installed (idempotent). */
export async function ensureForensicsInstalled(page: InspectPage): Promise<void> {
  await page.evaluate(`${FORENSICS_BROWSER_SOURCE};\nvoid 0;`);
}

/**
 * Derive the full OC-grade UI forensics capture from a raw page: referencable
 * act-target nodes, enriched page facts (summary/document/landmarks/visibleText),
 * and a compact hierarchical tree of significant nodes with geometry/visibility/
 * scroll/layout/style facts.
 */
export async function deriveForensics(
  page: InspectPage,
  maxNodes?: number,
): Promise<ForensicsCapture> {
  await ensureForensicsInstalled(page);
  const out = (await page.evaluate(
    (args: { global: string; maxNodes: number }) => {
      const api = (window as unknown as Record<string, {
        inspectTree?: (n?: number) => unknown;
        derive: (n?: number) => unknown[];
        pageFacts: () => unknown;
      }>)[args.global];
      if (!api) return null;
      if (api.inspectTree) return api.inspectTree(args.maxNodes || undefined);
      return { refs: api.derive(args.maxNodes || undefined), facts: api.pageFacts(), tree: [], truncated: false };
    },
    { global: GLOBAL, maxNodes: maxNodes ?? 0 },
  )) as { refs?: ForensicsNode[]; facts?: PageFacts | null; tree?: ForensicsTreeNode[]; truncated?: boolean } | null;
  if (!out) return { nodes: [], facts: emptyFacts(), tree: [], truncated: false };
  return {
    nodes: out.refs ?? [],
    facts: out.facts ?? emptyFacts(),
    tree: out.tree ?? [],
    truncated: Boolean(out.truncated),
  };
}

/**
 * Write one inspection's artifacts (inspect.md, inspect.json, screenshot.png)
 * under `dirRelative` in the run, and return the artifact refs. Caller supplies
 * the already-derived capture (so a registry-backed caller keeps its cache) and
 * the signal counters (console/network) from whatever signal source it owns.
 */
export async function writeInspection(input: {
  page: InspectPage;
  run: RunArtifacts;
  dirRelative: string;
  capture: ForensicsCapture;
  target: InspectTarget;
  signals: InspectSignals;
}): Promise<{ md: ArtifactRef; json: ArtifactRef; screenshot: ArtifactRef }> {
  const { run, dirRelative, capture, target, signals } = input;
  const screenshotBuffer = await input.page.screenshot({ fullPage: false });
  const screenshot = await writeBinaryArtifact(
    run,
    `${dirRelative}/screenshot.png`,
    screenshotBuffer,
    { kind: "screenshot", name: "screenshot", description: "Visible browser state at inspect time (includes refs overlay when enabled)." },
  );
  const json = await writeJsonArtifact(
    run,
    `${dirRelative}/inspect.json`,
    buildInspectJson(capture, target, signals),
    { kind: "json", name: "inspect", description: "Structured UI forensics: page summary, refs with bounding boxes, and a hierarchical tree with geometry/visibility/scroll/layout/style facts." },
  );
  const md = await writeTextArtifact(
    run,
    `${dirRelative}/inspect.md`,
    renderInspectMarkdown(capture, target, signals),
    { kind: "markdown", name: "inspect", description: "Agent-facing inspect view in Terrarium OC dom-ui-forensics format: header, headings, by-role, interactive refs, a compact UI tree, selectors, and a snippet." },
  );
  return { md, json, screenshot };
}

// Render inspect.md in Terrarium OC's compact `dom-ui-forensics` shape: a
// scannable header, Headings, By role, Interactive (DOM order), a shorthand
// Tree (no inline selectors), a Selectors block, and a Snippet. The richer
// per-node data lives in inspect.json; the markdown optimizes agent UX + tokens.
export function renderInspectMarkdown(
  capture: ForensicsCapture,
  _target: InspectTarget,
  signals: InspectSignals,
): string {
  const { facts, nodes, tree } = capture;
  const labels = assignDisplayLabels(tree);
  const lines: string[] = [];

  // --- Header ---------------------------------------------------------------
  lines.push("# UI Snapshot");
  lines.push("");
  lines.push(`URL: ${displayUrl(facts.url)}`);
  if (facts.title) lines.push(`Title: ${facts.title}`);
  lines.push(`Viewport: ${facts.viewport.width}×${facts.viewport.height}${facts.viewport.devicePixelRatio && facts.viewport.devicePixelRatio !== 1 ? ` @${facts.viewport.devicePixelRatio}x` : ""}`);
  const depth = tree.reduce((max, node) => Math.max(max, node.depth), 0);
  lines.push(`Stats: ${tree.length} nodes · ${nodes.length} interactive · depth ${depth}`);
  lines.push(`Signals: ${signals.consoleErrors} console errors · ${signals.networkFailures} network failures`);
  if (facts.overlayEnabled) lines.push("Overlay: refs enabled");
  lines.push("");

  if ((signals.consoleErrorDetails?.length ?? 0) > 0 || (signals.networkFailureDetails?.length ?? 0) > 0) {
    lines.push("## Signals");
    lines.push("");
    for (const event of signals.consoleErrorDetails ?? []) {
      const location = event.location?.url ? ` (${displayUrl(event.location.url)})` : "";
      lines.push(`- console error: ${truncate(event.text, 180)}${location}`);
    }
    for (const event of signals.networkFailureDetails ?? []) {
      const status = event.statusCode ? ` ${event.statusCode}` : "";
      const failure = event.failureText ? ` ${event.failureText}` : "";
      lines.push(`- network ${event.kind}${status}: ${displayUrl(event.url)}${failure}`);
    }
    lines.push("");
  }

  // --- Headings -------------------------------------------------------------
  const headingNodes = tree.filter((node) => /^h[1-6]$/.test(node.tag) || node.role === "heading");
  if (headingNodes.length > 0) {
    lines.push("## Headings");
    lines.push("");
    for (const node of headingNodes.slice(0, 20)) {
      lines.push(`- ${node.tag} "${truncate(node.name ?? "", 60)}" [${labels.get(node)}]`);
    }
    lines.push("");
  }

  // --- By role --------------------------------------------------------------
  const byRole = new Map<string, string[]>();
  for (const node of tree) {
    const role = node.role && node.role !== node.tag ? node.role : node.tag;
    if (!NOTABLE_ROLES.has(role)) continue;
    const label = labels.get(node);
    if (!label) continue;
    (byRole.get(role) ?? byRole.set(role, []).get(role)!).push(label);
  }
  if (byRole.size > 0) {
    lines.push("## By role");
    lines.push("");
    for (const [role, ids] of byRole) {
      const shown = ids.slice(0, 16).join(", ");
      lines.push(`- ${role}: ${shown}${ids.length > 16 ? `, +${ids.length - 16}` : ""}`);
    }
    lines.push("");
  }

  // --- Interactive (DOM order) — real action targets only -------------------
  lines.push("## Interactive (DOM order)");
  lines.push("");
  lines.push(nodes.length > 0 ? nodes.map((node) => node.ref).join(" ") : "(none)");
  lines.push("");

  // --- Tree (compact shorthand, no inline selectors) ------------------------
  lines.push("## Tree");
  lines.push("");
  if (tree.length === 0) {
    lines.push("(no significant nodes)");
  } else {
    for (const node of tree.slice(0, MD_TREE_CAP)) lines.push(treeLine(node, labels));
    if (tree.length > MD_TREE_CAP) lines.push(`… +${tree.length - MD_TREE_CAP} more nodes (see inspect.json)`);
  }
  lines.push("");

  // --- Selectors (refs → selector; DOM paths live here, never in the tree) --
  const selectorLines: string[] = [];
  for (const node of tree.slice(0, MD_TREE_CAP)) {
    const label = labels.get(node);
    if (label && node.selector) selectorLines.push(`${label} → ${node.selector}`);
  }
  if (selectorLines.length > 0) {
    lines.push("## Selectors");
    lines.push("");
    lines.push(...selectorLines);
    lines.push("");
  }

  // --- Snippet --------------------------------------------------------------
  lines.push("## Snippet");
  lines.push("");
  const snippet = (facts.visibleText ?? []).slice(0, 16).map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");
  lines.push(snippet || "(no visible text)");

  return `${lines.join("\n").trimEnd()}\n`;
}

// Roles surfaced in `## By role` — landmarks, controls, and notable structure.
// Generic containers (div/span/label/listitem/paragraph/figure) are excluded.
const NOTABLE_ROLES = new Set<string>([
  "banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form",
  "button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "tab", "menuitem", "option", "slider", "spinbutton",
  "heading", "alert", "status", "dialog", "alertdialog", "table", "list", "img", "article", "section",
]);

// Actionable nodes keep their real `@eN` (the overlay/act ref); structural and
// heading tree nodes get markdown-local `@sN` / `@hN` labels for cross-reference.
function assignDisplayLabels(tree: readonly ForensicsTreeNode[]): Map<ForensicsTreeNode, string> {
  const labels = new Map<ForensicsTreeNode, string>();
  let structural = 0;
  let heading = 0;
  for (const node of tree) {
    if (node.ref) labels.set(node, node.ref);
    else if (/^h[1-6]$/.test(node.tag) || node.role === "heading") labels.set(node, `@h${++heading}`);
    else labels.set(node, `@s${++structural}`);
  }
  return labels;
}

// One compact OC-style tree line: `<indent>[@id] tag role=X "name" ⊞ x,y w×h
// <flags> <layout> <scroll> <style>` — no inline selectors.
function treeLine(node: ForensicsTreeNode, labels: Map<ForensicsTreeNode, string>): string {
  const indent = "  ".repeat(Math.min(node.depth, 12));
  const tokens: string[] = [`[${labels.get(node)}]`, node.tag];
  if (node.role && node.role !== node.tag) tokens.push(`role=${node.role}`);
  if (node.name) tokens.push(`"${truncate(node.name, 40)}"`);
  tokens.push(`⊞ ${box(node.rect)}`);
  if (!node.visible) tokens.push(`hidden:${node.hidden ?? "yes"}`);
  else if (node.hidden) tokens.push(`hidden:${node.hidden}`);
  if (node.disabled) tokens.push("disabled");
  if (node.layout) tokens.push(...layoutShort(node.layout));
  if (node.scroll?.scrollable) tokens.push(`scroll-y(${node.scroll.scrollTop}/${node.scroll.scrollHeight})`);
  if (node.style) tokens.push(...styleShort(node.style));
  return `${indent}${tokens.join(" ")}`;
}

function layoutShort(layout: TreeNodeLayout): string[] {
  const out: string[] = [];
  if (layout.display === "flex" || layout.display === "inline-flex") {
    out.push(layout.flexDirection && layout.flexDirection.startsWith("col") ? "flex-col" : "flex-row");
    if (layout.gap) out.push(`gap:${stripPx(layout.gap)}`);
  } else if (layout.display === "grid" || layout.display === "inline-grid") {
    out.push("grid");
    if (layout.gap) out.push(`gap:${stripPx(layout.gap)}`);
  }
  if (layout.position && layout.position !== "static") out.push(layout.position);
  return out;
}

function styleShort(style: TreeNodeStyle): string[] {
  const out: string[] = [];
  if (style.background) out.push(`bg:${hex(style.background)}`);
  if (style.padding) out.push(`p:${style.padding.split(/\s+/).map(stripPx).join(",")}`);
  if (style.borderRadius) out.push(`r:${stripPx(style.borderRadius.split(/\s+/)[0] ?? "")}`);
  if (style.border) out.push(`bd:${stripPx(style.border.split(/\s+/)[0] ?? "")}`);
  if (style.shadow) out.push(`sh:${shadowBucket(style.shadow)}`);
  if (style.fontSize) out.push(`f:${stripPx(style.fontSize)}/${style.fontWeight ?? "400"}`);
  return out;
}

// Bucket a raw `box-shadow` into OC's compact size vocabulary by its largest px
// length (blur/spread/offset proxy). Factual size hint, not a judgement.
function shadowBucket(shadow: string): string {
  const lengths = [...shadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Math.abs(Number(m[1])));
  const max = lengths.length ? Math.max(...lengths) : 0;
  if (max <= 2) return "xs";
  if (max <= 6) return "sm";
  if (max <= 16) return "md";
  return "lg";
}

// `rgb(17, 24, 39)` -> `#111827`; alpha is dropped for a compact hint. Non-rgb
// inputs (named colors, already-hex) pass through unchanged.
function hex(color: string): string {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return color;
  const toHex = (value: string) => Number(value).toString(16).padStart(2, "0");
  return `#${toHex(match[1]!)}${toHex(match[2]!)}${toHex(match[3]!)}`;
}

function stripPx(value: string): string {
  return value.replace(/px$/i, "");
}

function box(rect: ForensicsRect): string {
  return `${rect.x},${rect.y} ${rect.width}×${rect.height}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Markdown never exposes a local filesystem path: a `file://` capture is shown
// as `fixture://<basename>`. The real URL is preserved in inspect.json.
function displayUrl(url: string): string {
  if (url.startsWith("file://")) {
    const base = url.split(/[?#]/)[0]!.split("/").filter(Boolean).at(-1) ?? "page";
    return `fixture://${base}`;
  }
  return url;
}

function emptyFacts(): PageFacts {
  return { url: "", title: "", viewport: { width: 0, height: 0 }, headings: [], alerts: [], dialogs: [], loading: false, overlayEnabled: false };
}
