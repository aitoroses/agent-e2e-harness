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
}

export interface PageFacts {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  headings: Array<{ level: number; text: string }>;
  alerts: string[];
  dialogs: string[];
  loading: boolean;
  overlayEnabled: boolean;
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

const INSPECT_TREE_CAP = 60;
const GLOBAL = FORENSICS_SINGLETON_GLOBAL;

/**
 * Canonical inspect.json payload. Both evidence paths (ad-hoc `browser.inspect`
 * via {@link writeInspection} and `journey.step` via the step recorder) write
 * THIS object, so the single-evidence-path guarantee is enforced by construction:
 * add or rename a field here and both paths move together.
 */
export function buildInspectJson(
  facts: PageFacts,
  nodes: readonly ForensicsNode[],
  target: InspectTarget,
  signals: InspectSignals,
): Record<string, unknown> {
  return {
    url: facts.url,
    title: facts.title,
    viewport: facts.viewport,
    target,
    overlayEnabled: facts.overlayEnabled,
    signals,
    facts: { headings: facts.headings, alerts: facts.alerts, dialogs: facts.dialogs, loading: facts.loading },
    refs: nodes,
  };
}

/** Ensure the in-page forensics singleton is installed (idempotent). */
export async function ensureForensicsInstalled(page: InspectPage): Promise<void> {
  await page.evaluate(`${FORENSICS_BROWSER_SOURCE};\nvoid 0;`);
}

/** Derive the current UI forensics tree and page facts from a raw page. */
export async function deriveForensics(
  page: InspectPage,
  maxNodes?: number,
): Promise<{ nodes: ForensicsNode[]; facts: PageFacts }> {
  await ensureForensicsInstalled(page);
  const out = (await page.evaluate(
    (args: { global: string; maxNodes: number }) => {
      const api = (window as unknown as Record<string, { derive: (n?: number) => unknown[]; pageFacts: () => unknown }>)[args.global];
      if (!api) return { nodes: [], facts: null };
      return { nodes: api.derive(args.maxNodes || undefined), facts: api.pageFacts() };
    },
    { global: GLOBAL, maxNodes: maxNodes ?? 0 },
  )) as { nodes: ForensicsNode[]; facts: PageFacts | null };
  return { nodes: out.nodes, facts: out.facts ?? emptyFacts() };
}

/**
 * Write one inspection's artifacts (inspect.md, inspect.json, screenshot.png)
 * under `dirRelative` in the run, and return the artifact refs. Caller supplies
 * already-derived nodes/facts (so a registry-backed caller keeps its cache) and
 * the signal counters (console/network) from whatever signal source it owns.
 */
export async function writeInspection(input: {
  page: InspectPage;
  run: RunArtifacts;
  dirRelative: string;
  nodes: readonly ForensicsNode[];
  facts: PageFacts;
  target: InspectTarget;
  signals: InspectSignals;
}): Promise<{ md: ArtifactRef; json: ArtifactRef; screenshot: ArtifactRef }> {
  const { run, dirRelative, nodes, facts, target, signals } = input;
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
    buildInspectJson(facts, nodes, target, signals),
    { kind: "json", name: "inspect", description: "Structured UI forensics refs with bounding boxes, page facts, and signals." },
  );
  const md = await writeTextArtifact(
    run,
    `${dirRelative}/inspect.md`,
    renderInspectMarkdown(facts, nodes, target, signals, screenshot.path, json.path),
    { kind: "markdown", name: "inspect", description: "Agent-facing inspect view: where am I, visible state, what can I act on, signals, artifacts, UI tree." },
  );
  return { md, json, screenshot };
}

export function renderInspectMarkdown(
  facts: PageFacts,
  nodes: readonly ForensicsNode[],
  target: InspectTarget,
  signals: InspectSignals,
  screenshotPath: string | undefined,
  jsonPath: string | undefined,
): string {
  const lines: string[] = [];
  lines.push("# Inspect");
  lines.push("");
  lines.push("## Where am I");
  lines.push("");
  lines.push(`- **URL:** ${facts.url}`);
  if (facts.title) lines.push(`- **Title:** ${facts.title}`);
  lines.push(`- **Viewport:** ${facts.viewport.width}x${facts.viewport.height}`);
  lines.push(`- **Target:** ${target.input ?? "current page"} (${target.kind}, ${target.resolved ? "resolved" : "unresolved"})`);
  lines.push(`- **Refs overlay:** ${facts.overlayEnabled ? "enabled" : "disabled"}`);
  lines.push("");
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
  if (facts.loading) {
    lines.push("");
    lines.push("- Loading indicators present.");
  }
  lines.push("");
  lines.push("## What can I act on");
  lines.push("");
  if (nodes.length === 0) {
    lines.push("- (no referencable nodes)");
  } else {
    for (const node of nodes.slice(0, INSPECT_TREE_CAP)) {
      lines.push(`- \`${node.ref}\` ${node.role ?? "node"}${node.name ? ` — ${node.name}` : ""}`);
    }
    if (nodes.length > INSPECT_TREE_CAP) lines.push(`- … ${nodes.length - INSPECT_TREE_CAP} more (see inspect.json)`);
  }
  lines.push("");
  lines.push("## Signals");
  lines.push("");
  lines.push(`- Console errors: ${signals.consoleErrors}`);
  lines.push(`- Network failures: ${signals.networkFailures}`);
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  if (screenshotPath) lines.push(`- [screenshot](${leaf(screenshotPath)})`);
  if (jsonPath) lines.push(`- [inspect.json](${leaf(jsonPath)})`);
  lines.push("");
  lines.push("## UI tree");
  lines.push("");
  for (const node of nodes.slice(0, INSPECT_TREE_CAP)) {
    const rect = node.rect;
    lines.push(`- \`${node.ref}\` [${node.role ?? "node"}] ${node.name ?? ""} \`${node.selector}\` @(${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)})`);
  }
  if (nodes.length > INSPECT_TREE_CAP) lines.push(`- … ${nodes.length - INSPECT_TREE_CAP} more (capped; see inspect.json)`);
  return `${lines.join("\n").trimEnd()}\n`;
}

// Inspect artifacts share a folder, so links between them are just the leaf name.
function leaf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function emptyFacts(): PageFacts {
  return { url: "", title: "", viewport: { width: 0, height: 0 }, headings: [], alerts: [], dialogs: [], loading: false, overlayEnabled: false };
}
