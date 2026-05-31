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
const MD_INTERACTIVE_CAP = 40;
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
    renderInspectMarkdown(capture, target, signals, screenshot.path, json.path),
    { kind: "markdown", name: "inspect", description: "Agent-facing inspect view: where am I, summary, visible state, what can I act on, signals, artifacts, and an OC-grade UI forensics tree." },
  );
  return { md, json, screenshot };
}

export function renderInspectMarkdown(
  capture: ForensicsCapture,
  target: InspectTarget,
  signals: InspectSignals,
  screenshotPath: string | undefined,
  jsonPath: string | undefined,
): string {
  const { facts, nodes, tree, truncated } = capture;
  const lines: string[] = [];
  lines.push("# Inspect");
  lines.push("");

  // --- Where am I -----------------------------------------------------------
  lines.push("## Where am I");
  lines.push("");
  lines.push(`- **URL:** ${facts.url}`);
  if (facts.title) lines.push(`- **Title:** ${facts.title}`);
  lines.push(`- **Viewport:** ${facts.viewport.width}x${facts.viewport.height}${facts.viewport.devicePixelRatio ? ` (dpr ${facts.viewport.devicePixelRatio})` : ""}`);
  if (facts.document) lines.push(`- **Document:** ${facts.document.width}x${facts.document.height} (scroll ${facts.document.scrollX},${facts.document.scrollY})`);
  if (facts.primaryHeading) lines.push(`- **Primary heading:** ${facts.primaryHeading}`);
  if (facts.activeLandmark) lines.push(`- **Active landmark:** ${facts.activeLandmark}`);
  lines.push(`- **Target:** ${target.input ?? "current page"} (${target.kind}, ${target.resolved ? "resolved" : "unresolved"})`);
  lines.push(`- **Refs overlay:** ${facts.overlayEnabled ? "enabled" : "disabled"}`);
  lines.push("");

  // --- Summary --------------------------------------------------------------
  const summary = facts.summary;
  if (summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Interactive elements: ${summary.interactive}`);
    lines.push(`- Landmarks: ${summary.landmarks.length}${summary.landmarks.length ? ` (${summary.landmarks.map((l) => l.role).join(", ")})` : ""}`);
    const headingHist = Object.entries(summary.headings).sort().map(([tag, count]) => `${tag}×${count}`).join(", ");
    lines.push(`- Headings: ${headingHist || "none"}`);
    lines.push(`- Alerts/status: ${summary.alerts}`);
    lines.push(`- Dialogs: ${summary.dialogs}`);
    lines.push(`- Forms: ${summary.forms} (${summary.formControls} controls)`);
    lines.push(`- Tables: ${summary.tables}`);
    lines.push(`- Images: ${summary.images} (${summary.imagesMissingAlt} missing alt)`);
    lines.push("");
  }

  // --- Current visible state ------------------------------------------------
  lines.push("## Current visible state");
  lines.push("");
  if (facts.headings.length > 0) {
    for (const heading of facts.headings) lines.push(`- ${"#".repeat(heading.level)} ${heading.text}`);
  } else {
    lines.push("- (no visible headings)");
  }
  if (facts.alerts.length > 0) {
    lines.push("");
    lines.push("**Alerts / errors:**");
    for (const alert of facts.alerts) lines.push(`- ${alert}`);
  }
  if (facts.dialogs.length > 0) {
    lines.push("");
    lines.push("**Dialogs / modals:**");
    for (const dialog of facts.dialogs) lines.push(`- ${dialog}`);
  }
  if (facts.visibleText && facts.visibleText.length > 0) {
    lines.push("");
    lines.push("**Visible text (top):**");
    for (const text of facts.visibleText) lines.push(`- ${text}`);
  }
  if (facts.loading) {
    lines.push("");
    lines.push("- Loading indicators present.");
  }
  lines.push("");

  // --- What can I act on (table) -------------------------------------------
  lines.push("## What can I act on");
  lines.push("");
  if (nodes.length === 0) {
    lines.push("- (no referencable nodes)");
  } else {
    lines.push("| ref | role | name | tag | box | state |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const node of nodes.slice(0, MD_INTERACTIVE_CAP)) {
      const tag = node.selector.startsWith("#") || node.selector.startsWith("[") ? "" : node.selector.split(">").at(-1)?.trim().split(/[:.\[]/)[0] ?? "";
      lines.push(`| ${node.ref} | ${cell(node.role)} | ${cell(node.name)} | ${cell(tag)} | ${box(node.rect)} | ${node.disabled ? "disabled" : "visible"} |`);
    }
    if (nodes.length > MD_INTERACTIVE_CAP) lines.push(`\n_+${nodes.length - MD_INTERACTIVE_CAP} more interactive nodes (see inspect.json)._`);
  }
  lines.push("");

  // --- Signals --------------------------------------------------------------
  lines.push("## Signals");
  lines.push("");
  lines.push(`- Console errors: ${signals.consoleErrors}`);
  lines.push(`- Network failures: ${signals.networkFailures}`);
  lines.push("");

  // --- Artifacts ------------------------------------------------------------
  lines.push("## Artifacts");
  lines.push("");
  if (screenshotPath) lines.push(`- [screenshot](${leaf(screenshotPath)})`);
  if (jsonPath) lines.push(`- [inspect.json](${leaf(jsonPath)})`);
  lines.push("");

  // --- UI tree (hierarchical) ----------------------------------------------
  lines.push("## UI tree");
  lines.push("");
  if (tree.length === 0) {
    lines.push("- (no significant nodes)");
  } else {
    for (const node of tree.slice(0, MD_TREE_CAP)) lines.push(treeLine(node));
    if (truncated || tree.length > MD_TREE_CAP) {
      lines.push(`${"  ".repeat(0)}- … tree capped (${tree.length} nodes shown${truncated ? "; collection also capped" : ""}; full data in inspect.json)`);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// One compact, factual line per tree node. Segments are pipe-separated and only
// present when meaningful, so the tree stays readable but layout/visibility/
// scroll/style facts are right there for reasoning. No diagnosis language.
function treeLine(node: ForensicsTreeNode): string {
  const indent = "  ".repeat(Math.min(node.depth, 12));
  const segments: string[] = [];
  const tagRole = node.role && node.role !== node.tag ? `${node.tag}[${node.role}]` : node.tag;
  const refPart = node.ref ? `\`${node.ref}\` ` : "";
  segments.push(`${refPart}${tagRole}${node.name ? ` "${truncate(node.name, 48)}"` : ""}`);
  segments.push(box(node.rect));
  const flags: string[] = [];
  // A node is flagged `hidden:<reason>` whether it failed the visibility check
  // or is laid out but off-screen / aria-hidden, so the marker is consistent.
  if (!node.visible) flags.push(`hidden:${node.hidden ?? "yes"}`);
  else if (node.hidden) flags.push(`hidden:${node.hidden}`);
  if (node.disabled) flags.push("disabled");
  if (flags.length) segments.push(flags.join(","));
  if (node.layout) segments.push(layoutText(node.layout));
  if (node.scroll?.scrollable) segments.push(`scroll ${node.scroll.scrollTop}/${node.scroll.scrollHeight} (${node.scroll.overflowY})`);
  if (node.style) {
    const styleBits = styleText(node.style);
    if (styleBits) segments.push(styleBits);
  }
  const selectorPart = node.selector ? ` \`${node.selector}\`` : "";
  return `${indent}- ${segments.filter(Boolean).join(" | ")}${selectorPart}`;
}

function layoutText(layout: TreeNodeLayout): string {
  if (layout.display === "flex" || layout.display === "inline-flex") {
    return `flex ${layout.flexDirection ?? "row"}${layout.gap ? ` gap:${layout.gap}` : ""}`;
  }
  if (layout.display === "grid" || layout.display === "inline-grid") {
    return `grid${layout.gap ? ` gap:${layout.gap}` : ""}`;
  }
  if (layout.position && layout.position !== "static") return `${layout.display} ${layout.position}`;
  return layout.display;
}

function styleText(style: TreeNodeStyle): string {
  const bits: string[] = [];
  if (style.fontSize) bits.push(`${style.fontSize}/${style.fontWeight ?? "?"}`);
  if (style.color) bits.push(style.color);
  if (style.background) bits.push(`bg:${style.background}`);
  if (style.border) bits.push(`border:${style.border}`);
  return bits.join(" ");
}

function box(rect: ForensicsRect): string {
  return `${rect.x},${rect.y} ${rect.width}x${rect.height}`;
}

function cell(value: string | undefined): string {
  return (value ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 60) || "—";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Inspect artifacts share a folder, so links between them are just the leaf name.
function leaf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function emptyFacts(): PageFacts {
  return { url: "", title: "", viewport: { width: 0, height: 0 }, headings: [], alerts: [], dialogs: [], loading: false, overlayEnabled: false };
}
