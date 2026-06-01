// In-page UI forensics tree + stable ref registry + refs overlay.
//
// This module is injected into the browser page as a single idempotent
// singleton (`window.__agentE2EForensics`). It is the ONE source of truth for
// referencable UI nodes, so `browser.inspect`, the `browser.refs` overlay, and
// `browser.act` all resolve against the same registry:
//
// - `inspect` calls `inspectTree()` to read an OC-grade UI forensics tree
//   (page summary + per-node geometry/visibility/scroll/layout/style facts +
//   a compact hierarchical tree) and `derive()`/`pageFacts()` for refs/state.
// - the `refs` overlay paints exactly the REFERENCABLE nodes `derive()` returns
//   (not the whole tree — the tree carries supporting structural nodes for
//   reasoning, the overlay stays low-noise) and keeps labels in sync via a
//   MutationObserver + scroll/resize listeners, all in-page.
// - `act` resolves a ref to the live element through `resolveEl(ref)`.
//
// Ref stability is best-effort within a session: a node keeps its ref while its
// identity signature (data-ui / data-testid / id / role+name / DOM path) stays
// recognizable across rerenders. When a node disappears its ref is RETIRED and
// the id is reserved — never reused in this session — so a stale `@ref` fails
// cleanly instead of silently pointing at a different element.
//
// Everything here observes facts only — there is no diagnosis, scoring, or
// "this looks wrong" heuristic anywhere in the collector.
//
// The script is shipped as a string so it can be injected with both
// `page.evaluate(SOURCE)` (install-on-demand) and `page.addInitScript({ content })`
// (survive soft navigations) without depending on the harness tsconfig DOM lib.

export const FORENSICS_SINGLETON_GLOBAL = "__agentE2EForensics";
export const FORENSICS_OVERLAY_CONTAINER_ID = "agent-e2e-refs-overlay";
export const FORENSICS_REF_PREFIX = "@e";

// Selector set that defines a "referencable" node — a real, actionable act
// target only (controls + actionable ARIA roles + contenteditable). The overlay
// paints exactly these, and they are the only entries in "Interactive (DOM
// order)". Landmarks/headings/containers are NOT here — they live in the tree.
const REFERENCABLE_SELECTOR =
  "a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=textbox],[role=checkbox],[role=radio],[role=combobox],[role=menuitem],[role=tab],[role=switch],[role=option],[contenteditable='true'],[data-note-id]";

// Broader set of structurally significant nodes included in the layout tree for
// reasoning (landmarks, sections, forms, tables, lists, media, headings, scroll
// containers). These are NOT painted by the overlay. Noisy leaves (table rows /
// cells, list items, paragraphs) are intentionally pruned to keep the tree
// scannable; the table/list still appears as a single container node.
const SIGNIFICANT_SELECTOR =
  REFERENCABLE_SELECTOR +
  ",header,nav,main,aside,footer,form,section,article,fieldset,table,ul,ol,dialog,figure,img,h1,h2,h3,h4,h5,h6,label,[role],[data-ui],[data-testid]";

export const FORENSICS_BROWSER_SOURCE = `(() => {
  const GLOBAL = ${JSON.stringify(FORENSICS_SINGLETON_GLOBAL)};
  const OVERLAY_ID = ${JSON.stringify(FORENSICS_OVERLAY_CONTAINER_ID)};
  const REF_PREFIX = ${JSON.stringify(FORENSICS_REF_PREFIX)};
  const REFERENCABLE = ${JSON.stringify(REFERENCABLE_SELECTOR)};
  const SIGNIFICANT = ${JSON.stringify(SIGNIFICANT_SELECTOR)};
  const TREE_CAP = 160;
  if (window[GLOBAL]) return window[GLOBAL];

  const registry = new Map(); // refId -> { sig, el, retired }
  const bySig = new Map();     // sig -> refId
  const retired = new Set();   // reserved retired ids, never reused
  let counter = 0;

  function round(n) { return Math.round(n); }

  function visible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function textOf(el) {
    return (el.textContent || "").replace(/\\s+/g, " ").trim();
  }

  function ownTextOf(el) {
    let t = "";
    for (const node of el.childNodes) if (node.nodeType === 3) t += node.textContent;
    return t.replace(/\\s+/g, " ").trim();
  }

  function labelFor(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 120);
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const ref = document.getElementById(labelled);
      if (ref) return textOf(ref).slice(0, 120);
    }
    return (
      textOf(el) ||
      el.getAttribute("placeholder") ||
      el.getAttribute("title") ||
      el.getAttribute("name") ||
      el.getAttribute("alt") ||
      el.id ||
      el.tagName.toLowerCase()
    ).slice(0, 120);
  }

  function roleFor(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return el.getAttribute("href") ? "link" : "generic";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "button" || type === "submit" || type === "reset") return "button";
      return "textbox";
    }
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    if (tag === "aside") return "complementary";
    if (tag === "form") return "form";
    if (tag === "table") return "table";
    if (tag === "ul" || tag === "ol") return "list";
    if (tag === "li") return "listitem";
    if (tag === "img") return "img";
    if (tag === "dialog") return "dialog";
    return tag;
  }

  function nthOfType(el) {
    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute("name");
    if (name) return tag + '[name="' + CSS.escape(name) + '"]';
    const siblings = [...(el.parentElement ? el.parentElement.children : [])].filter(
      (s) => s.tagName.toLowerCase() === tag,
    );
    return tag + ":nth-of-type(" + (siblings.indexOf(el) + 1) + ")";
  }

  function cssPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body && current.nodeType === 1) {
      if (current.id) { parts.unshift("#" + CSS.escape(current.id)); break; }
      const ui = current.getAttribute("data-ui");
      if (ui) { parts.unshift('[data-ui="' + CSS.escape(ui) + '"]'); break; }
      const testId = current.getAttribute("data-testid");
      if (testId) { parts.unshift('[data-testid="' + CSS.escape(testId) + '"]'); break; }
      const noteId = current.getAttribute("data-note-id");
      if (noteId) { parts.unshift('[data-note-id="' + CSS.escape(noteId) + '"]'); break; }
      parts.unshift(nthOfType(current));
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  // Selector priority (stable first): data-ui, data-testid, id, data-note-id,
  // then a DOM-path fallback. The fallback only appears in the Selectors block,
  // never inline in the tree.
  function selectorFor(el) {
    const ui = el.getAttribute("data-ui");
    if (ui) return '[data-ui="' + CSS.escape(ui) + '"]';
    const testId = el.getAttribute("data-testid");
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    if (el.id) return "#" + CSS.escape(el.id);
    const noteId = el.getAttribute("data-note-id");
    if (noteId) return '[data-note-id="' + CSS.escape(noteId) + '"]';
    return cssPath(el);
  }

  // Identity signature drives ref continuity across rerenders. Stable, content-
  // independent keys win; DOM path is the last-resort fallback.
  function signatureFor(el) {
    const ui = el.getAttribute("data-ui");
    if (ui) return "ui:" + ui;
    const testId = el.getAttribute("data-testid");
    if (testId) return "testid:" + testId;
    const noteId = el.getAttribute("data-note-id");
    if (noteId) return "note:" + noteId;
    if (el.id) return "id:" + el.id;
    const role = roleFor(el);
    const name = labelFor(el);
    if (name && name !== el.tagName.toLowerCase()) return "role:" + role + "|name:" + name;
    return "path:" + cssPath(el);
  }

  function dataAttrs(el) {
    const out = {};
    const ui = el.getAttribute("data-ui"); if (ui) out.dataUi = ui;
    const testId = el.getAttribute("data-testid"); if (testId) out.testId = testId;
    if (el.id) out.id = el.id;
    return out;
  }

  function isDisabled(el) {
    if (el.disabled === true) return true;
    if (el.hasAttribute("disabled")) return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
    return false;
  }

  // "hidden-ish" without diagnosis: aria-hidden, fully transparent, or laid out
  // entirely outside the viewport. Distinct from display:none (which fails visible).
  function hiddenReason(el, rect, style) {
    if (el.getAttribute("aria-hidden") === "true") return "aria-hidden";
    if (style.visibility === "hidden") return "visibility-hidden";
    if (style.display === "none") return "display-none";
    if (Number(style.opacity) === 0) return "opacity-0";
    if (rect.width <= 0 || rect.height <= 0) return "zero-size";
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return "offscreen";
    return undefined;
  }

  function scrollFacts(el, style) {
    const scrollableY = el.scrollHeight > el.clientHeight + 1;
    const scrollableX = el.scrollWidth > el.clientWidth + 1;
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollableByStyle = /(auto|scroll|overlay)/.test(overflowY) || /(auto|scroll|overlay)/.test(overflowX);
    if (!scrollableY && !scrollableX && !scrollableByStyle) return undefined;
    return {
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      scrollLeft: round(el.scrollLeft),
      scrollTop: round(el.scrollTop),
      overflowX,
      overflowY,
      scrollable: Boolean(scrollableY || scrollableX),
    };
  }

  function layoutFacts(style) {
    const layout = { display: style.display, position: style.position };
    if (style.display === "flex" || style.display === "inline-flex") {
      layout.flexDirection = style.flexDirection;
      if (style.flexWrap && style.flexWrap !== "nowrap") layout.flexWrap = style.flexWrap;
      if (style.gap && style.gap !== "normal") layout.gap = style.gap;
      if (style.justifyContent && style.justifyContent !== "normal") layout.justifyContent = style.justifyContent;
      if (style.alignItems && style.alignItems !== "normal") layout.alignItems = style.alignItems;
    } else if (style.display === "grid" || style.display === "inline-grid") {
      layout.gridTemplateColumns = style.gridTemplateColumns;
      if (style.gap && style.gap !== "normal") layout.gap = style.gap;
    }
    if (style.zIndex && style.zIndex !== "auto") layout.zIndex = style.zIndex;
    return layout;
  }

  function compactBorder(style) {
    const w = style.borderTopWidth;
    if (!w || w === "0px") return undefined;
    return w + " " + style.borderTopStyle + " " + style.borderTopColor;
  }

  function styleFacts(style) {
    const out = {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
    };
    const bg = style.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") out.background = bg;
    const border = compactBorder(style);
    if (border) out.border = border;
    if (style.borderTopLeftRadius && style.borderTopLeftRadius !== "0px") out.borderRadius = style.borderRadius;
    if (style.paddingTop && style.paddingTop !== "0px") out.padding = style.padding;
    if (style.boxShadow && style.boxShadow !== "none") out.shadow = style.boxShadow;
    return out;
  }

  function candidates() {
    const seen = new Set();
    const out = [];
    const nodes = document.querySelectorAll(REFERENCABLE);
    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (isOverlayNode(el)) continue;
      if (!visible(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  function isOverlayNode(el) {
    const overlay = document.getElementById(OVERLAY_ID);
    return overlay ? overlay === el || overlay.contains(el) : false;
  }

  // Reconcile the live DOM against the registry, preserving refs by signature
  // and retiring refs whose signature is gone. Returns lean act-target nodes in
  // document order (kept light because the overlay calls this every repaint).
  function derive(maxNodes) {
    const els = candidates();
    const seenSigs = new Set();
    const nodes = [];
    for (const el of els) {
      if (maxNodes && nodes.length >= maxNodes) break;
      const sig = signatureFor(el);
      if (seenSigs.has(sig)) continue; // first wins for duplicate signatures
      seenSigs.add(sig);
      let refId = bySig.get(sig);
      if (!refId || retired.has(refId)) {
        refId = REF_PREFIX + ++counter;
        bySig.set(sig, refId);
      }
      registry.set(refId, { sig, el, retired: false });
      const rect = el.getBoundingClientRect();
      const node = {
        ref: refId,
        role: roleFor(el),
        name: labelFor(el),
        selector: selectorFor(el),
        sig,
        rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
      };
      if (isDisabled(el)) node.disabled = true;
      nodes.push(node);
    }
    // Retire refs whose signature is no longer present.
    for (const [refId, entry] of registry) {
      if (entry.retired) continue;
      if (!seenSigs.has(entry.sig)) {
        entry.retired = true;
        entry.el = null;
        retired.add(refId);
        bySig.delete(entry.sig);
      }
    }
    return nodes;
  }

  function resolveEl(ref) {
    const entry = registry.get(ref);
    if (!entry || entry.retired || !entry.el) return null;
    if (!document.contains(entry.el)) return null;
    return entry.el;
  }

  function refState(ref) {
    const entry = registry.get(ref);
    if (!entry) return "unknown";
    if (entry.retired) return "retired";
    if (!entry.el || !document.contains(entry.el)) return "stale";
    return "live";
  }

  function firstText(selector) {
    const el = document.querySelector(selector);
    return el ? textOf(el) : undefined;
  }

  const LANDMARK_SELECTOR = "header,nav,main,aside,footer,form,[role=banner],[role=navigation],[role=main],[role=complementary],[role=contentinfo],[role=search],[role=region]";

  function landmarksFacts() {
    const out = [];
    for (const el of document.querySelectorAll(LANDMARK_SELECTOR)) {
      if (isOverlayNode(el) || !visible(el)) continue;
      const role = roleFor(el);
      const name = el.getAttribute("aria-label") || undefined;
      out.push(name ? { role, name: name.slice(0, 80) } : { role });
      if (out.length >= 12) break;
    }
    return out;
  }

  function headingHistogram() {
    const hist = {};
    for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      hist[tag] = (hist[tag] || 0) + 1;
    }
    return hist;
  }

  function summaryFacts() {
    const interactive = candidates().length;
    const forms = [...document.querySelectorAll("form")].filter(visible);
    const formControls = [...document.querySelectorAll("form input,form select,form textarea,form button")].filter(visible).length;
    const images = [...document.querySelectorAll("img")].filter(visible);
    const imagesMissingAlt = images.filter((img) => !img.getAttribute("alt")).length;
    return {
      interactive,
      landmarks: landmarksFacts(),
      headings: headingHistogram(),
      alerts: [...document.querySelectorAll('[role=alert],[role=status],[aria-live]')].filter(visible).length,
      dialogs: [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]')].filter(visible).length,
      forms: forms.length,
      formControls,
      tables: [...document.querySelectorAll("table")].filter(visible).length,
      images: images.length,
      imagesMissingAlt,
    };
  }

  function visibleTextTop() {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("h1,h2,h3,p,li,button,a,[role=status],[role=alert]")) {
      if (!visible(el)) continue;
      const t = ownTextOf(el) || textOf(el);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t.slice(0, 100));
      if (out.length >= 12) break;
    }
    return out;
  }

  function documentFacts() {
    const root = document.scrollingElement || document.documentElement;
    return {
      width: root.scrollWidth,
      height: root.scrollHeight,
      scrollX: round(window.scrollX),
      scrollY: round(window.scrollY),
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  function pageFacts() {
    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .filter(visible)
      .slice(0, 8)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: textOf(el).slice(0, 160) }));
    const alerts = [...document.querySelectorAll('[role="alert"],[role="status"],.error,[data-error],.alert')]
      .filter(visible)
      .map((el) => textOf(el).slice(0, 200))
      .filter(Boolean)
      .slice(0, 10);
    const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open]')]
      .filter(visible)
      .map((el) => labelFor(el))
      .slice(0, 5);
    const busy = [...document.querySelectorAll('[aria-busy="true"],[data-loading],.loading,[role="progressbar"]')]
      .filter(visible).length;
    const main = document.querySelector("main,[role=main]");
    return {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
      document: documentFacts(),
      headings,
      alerts,
      dialogs,
      loading: busy > 0,
      landmarks: landmarksFacts(),
      summary: summaryFacts(),
      visibleText: visibleTextTop(),
      primaryHeading: headings.length ? headings[0].text : undefined,
      activeLandmark: main ? roleFor(main) : undefined,
      overlayEnabled: Boolean(api.overlay.enabled),
    };
  }

  function treeNodeFor(el, refByEl, depth) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const node = { depth: depth, tag: el.tagName.toLowerCase() };
    const ref = refByEl.get(el);
    if (ref) node.ref = ref;
    const role = roleFor(el);
    if (role && role !== node.tag) node.role = role;
    const name = (labelFor(el) || "").slice(0, 80);
    if (name && name !== node.tag) node.name = name;
    node.selector = selectorFor(el);
    const attrs = dataAttrs(el);
    if (attrs.dataUi) node.dataUi = attrs.dataUi;
    if (attrs.testId) node.testId = attrs.testId;
    if (attrs.id) node.id = attrs.id;
    node.rect = { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) };
    node.visible = visible(el);
    const hidden = hiddenReason(el, rect, style);
    if (hidden) node.hidden = hidden;
    if (isDisabled(el)) node.disabled = true;
    const scroll = scrollFacts(el, style);
    if (scroll) node.scroll = scroll;
    node.layout = layoutFacts(style);
    node.style = styleFacts(style);
    return node;
  }

  // OC-grade forensics tree: lean act-target refs (overlay parity), enriched page
  // facts, and a compact hierarchical tree of significant nodes for reasoning
  // about layout/visibility/scroll. Cap keeps it from becoming a DOM dump.
  function inspectTree(maxNodes) {
    const refs = derive(maxNodes);
    const refByEl = new Map();
    for (const [refId, entry] of registry) if (!entry.retired && entry.el) refByEl.set(entry.el, refId);
    const cap = maxNodes && maxNodes < TREE_CAP ? maxNodes : TREE_CAP;
    const selected = [];
    const inSet = new Set();
    for (const el of document.querySelectorAll(SIGNIFICANT)) {
      if (isOverlayNode(el)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none") continue; // truly removed from layout; skip
      selected.push(el);
      inSet.add(el);
      if (selected.length >= cap) break;
    }
    function depthOf(el) {
      let d = 0;
      let p = el.parentElement;
      while (p) { if (inSet.has(p)) d++; p = p.parentElement; }
      return Math.min(d, 12);
    }
    const tree = selected.map((el) => treeNodeFor(el, refByEl, depthOf(el)));
    return {
      facts: pageFacts(),
      refs,
      tree,
      truncated: selected.length >= cap,
    };
  }

  // ---- Overlay -------------------------------------------------------------
  const overlay = {
    enabled: false,
    container: null,
    observer: null,
    frame: 0,
    onScroll: null,
    onResize: null,
  };

  function ensureContainer() {
    let c = document.getElementById(OVERLAY_ID);
    if (!c) {
      c = document.createElement("div");
      c.id = OVERLAY_ID;
      c.setAttribute("aria-hidden", "true");
      c.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;" +
        "pointer-events:none;z-index:2147483647;";
      (document.body || document.documentElement).appendChild(c);
    }
    overlay.container = c;
    return c;
  }

  function paint() {
    if (!overlay.enabled) return;
    const c = ensureContainer();
    const nodes = derive();
    // All writes below target nodes INSIDE the overlay container, so the
    // MutationObserver filters them out via isOverlayNode — no self-trigger loop,
    // and no fragile "painting" guard that could wedge repaints off.
    c.textContent = "";
    for (const node of nodes) {
      const box = document.createElement("div");
      box.style.cssText =
        "position:fixed;pointer-events:none;box-sizing:border-box;" +
        "border:1px solid rgba(37,99,235,0.9);background:rgba(37,99,235,0.06);" +
        "left:" + node.rect.x + "px;top:" + node.rect.y + "px;" +
        "width:" + node.rect.width + "px;height:" + node.rect.height + "px;";
      const tag = document.createElement("span");
      tag.textContent = node.ref;
      tag.style.cssText =
        "position:absolute;left:0;top:-14px;font:10px/14px ui-monospace,monospace;" +
        "padding:0 3px;color:#fff;background:rgba(37,99,235,0.95);white-space:nowrap;";
      box.appendChild(tag);
      c.appendChild(box);
    }
  }

  function schedulePaint() {
    if (!overlay.enabled) return;
    if (overlay.frame) cancelAnimationFrame(overlay.frame);
    overlay.frame = requestAnimationFrame(() => { overlay.frame = 0; paint(); });
  }

  function enableOverlay() {
    if (overlay.enabled) { paint(); return true; }
    overlay.enabled = true;
    ensureContainer();
    overlay.observer = new MutationObserver((mutations) => {
      // Ignore mutations that come from our own overlay writes; any other DOM
      // change schedules a single debounced repaint.
      for (const m of mutations) {
        if (isOverlayNode(m.target)) continue;
        schedulePaint();
        return;
      }
    });
    overlay.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    overlay.onScroll = () => schedulePaint();
    overlay.onResize = () => schedulePaint();
    window.addEventListener("scroll", overlay.onScroll, true);
    window.addEventListener("resize", overlay.onResize, true);
    paint();
    return true;
  }

  function disableOverlay() {
    overlay.enabled = false;
    if (overlay.observer) { overlay.observer.disconnect(); overlay.observer = null; }
    if (overlay.onScroll) { window.removeEventListener("scroll", overlay.onScroll, true); overlay.onScroll = null; }
    if (overlay.onResize) { window.removeEventListener("resize", overlay.onResize, true); overlay.onResize = null; }
    if (overlay.frame) { cancelAnimationFrame(overlay.frame); overlay.frame = 0; }
    const existing = document.getElementById(OVERLAY_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    overlay.container = null;
    return true;
  }

  const api = {
    version: 2,
    derive,
    inspectTree,
    resolveEl,
    refState,
    pageFacts,
    firstText,
    overlay,
    enableOverlay,
    disableOverlay,
    overlayEnabled: () => Boolean(overlay.enabled),
  };
  window[GLOBAL] = api;
  return api;
})()`;
