// In-page UI forensics tree + stable ref registry + refs overlay.
//
// This module is injected into the browser page as a single idempotent
// singleton (`window.__agentE2EForensics`). It is the ONE source of truth for
// referencable UI nodes, so `browser.inspect`, the `browser.refs` overlay, and
// `browser.act` all resolve against the same registry:
//
// - `inspect` calls `derive()` to read the current tree (refs + bounding boxes)
//   and `pageFacts()` to read visible state.
// - the `refs` overlay paints exactly the nodes `derive()` returns and keeps
//   them in sync via a MutationObserver + scroll/resize listeners, all in-page
//   so labels stay live without a round-trip per mutation.
// - `act` resolves a ref to the live element through `resolveEl(ref)`.
//
// Ref stability is best-effort within a session: a node keeps its ref while its
// identity signature (data-ui / data-testid / id / role+name / DOM path) stays
// recognizable across rerenders. When a node disappears its ref is RETIRED and
// the id is reserved — never reused in this session — so a stale `@ref` fails
// cleanly instead of silently pointing at a different element.
//
// The script is shipped as a string so it can be injected with both
// `page.evaluate(SOURCE)` (install-on-demand) and `page.addInitScript({ content })`
// (survive soft navigations) without depending on the harness tsconfig DOM lib.

export const FORENSICS_SINGLETON_GLOBAL = "__agentE2EForensics";
export const FORENSICS_OVERLAY_CONTAINER_ID = "agent-e2e-refs-overlay";
export const FORENSICS_REF_PREFIX = "@e";

// Selector set that defines a "referencable" node in the UI forensics tree. The
// overlay paints exactly these nodes; there is no separate kinds/filter taxonomy.
const REFERENCABLE_SELECTOR =
  "a[href],button,input,textarea,select,summary,[role],[data-testid],[data-ui],[data-note-id],[contenteditable='true'],h1,h2,h3";

export const FORENSICS_BROWSER_SOURCE = `(() => {
  const GLOBAL = ${JSON.stringify(FORENSICS_SINGLETON_GLOBAL)};
  const OVERLAY_ID = ${JSON.stringify(FORENSICS_OVERLAY_CONTAINER_ID)};
  const REF_PREFIX = ${JSON.stringify(FORENSICS_REF_PREFIX)};
  const REFERENCABLE = ${JSON.stringify(REFERENCABLE_SELECTOR)};
  if (window[GLOBAL]) return window[GLOBAL];

  const registry = new Map(); // refId -> { sig, el, retired }
  const bySig = new Map();     // sig -> refId
  const retired = new Set();   // reserved retired ids, never reused
  let counter = 0;

  function visible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function textOf(el) {
    return (el.textContent || "").replace(/\\s+/g, " ").trim();
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
    if (tag === "a") return "link";
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
    return "body > " + parts.join(" > ");
  }

  function selectorFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const ui = el.getAttribute("data-ui");
    if (ui) return '[data-ui="' + CSS.escape(ui) + '"]';
    const testId = el.getAttribute("data-testid");
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
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
  // and retiring refs whose signature is gone. Returns nodes in document order.
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
      nodes.push({
        ref: refId,
        role: roleFor(el),
        name: labelFor(el),
        selector: selectorFor(el),
        sig,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
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
    return {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      headings,
      alerts,
      dialogs,
      loading: busy > 0,
      overlayEnabled: Boolean(api.overlay.enabled),
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
    version: 1,
    derive,
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
