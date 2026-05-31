import type { ElementHandle, Page } from "playwright";
import { FORENSICS_BROWSER_SOURCE, FORENSICS_SINGLETON_GLOBAL } from "../forensics/browser-script.js";
import {
  asInspectPage,
  deriveForensics,
  ensureForensicsInstalled,
  type ForensicsCapture,
  type ForensicsNode,
} from "../forensics/inspect-capture.js";

export type { ForensicsNode, ForensicsRect, PageFacts } from "../forensics/inspect-capture.js";

export type RefState = "live" | "stale" | "retired" | "unknown";

const GLOBAL = FORENSICS_SINGLETON_GLOBAL;

/**
 * Node-side mirror of the in-page UI forensics registry. All live operations go
 * through `page` so there is a single source of truth: the injected singleton
 * assigns stable, monotonic, never-reused refs, and this object caches the last
 * derived tree for metadata reads (`selected`) without re-deriving.
 */
export interface BrowserRefRegistry {
  ensureInstalled(page: Page): Promise<void>;
  capture(page: Page, maxNodes?: number): Promise<ForensicsCapture>;
  resolveHandle(page: Page, ref: string): Promise<ElementHandle<Element> | null>;
  refState(page: Page, ref: string): Promise<RefState>;
  enableOverlay(page: Page): Promise<void>;
  disableOverlay(page: Page): Promise<void>;
  overlayEnabled(page: Page): Promise<boolean>;
  cachedNodes(): ForensicsNode[];
  selected(refs?: readonly string[]): ForensicsNode[];
}

export function createBrowserRefRegistry(): BrowserRefRegistry {
  let installed = false;
  let cache: ForensicsNode[] = [];

  async function ensureInstalled(page: Page): Promise<void> {
    // Cheap fast-path once installed: the manager also registers the source via
    // addInitScript so it survives navigations. Re-installing is harmless (the
    // singleton early-returns) but avoids re-sending the source on every call.
    if (installed) {
      const present = await page.evaluate(
        (global: string) => Boolean((window as unknown as Record<string, unknown>)[global]),
        GLOBAL,
      );
      if (present) return;
    }
    await ensureForensicsInstalled(asInspectPage(page));
    installed = true;
  }

  // Reading the tree goes through the one shared derive helper so there is a
  // single way to read it; the registry only adds caching of the act-target
  // nodes (for act's metadata + browser.playwright refs) plus resolveHandle /
  // refState / overlay on top.
  async function capture(page: Page, maxNodes?: number): Promise<ForensicsCapture> {
    const result = await deriveForensics(asInspectPage(page), maxNodes);
    cache = result.nodes;
    return result;
  }

  async function resolveHandle(page: Page, ref: string): Promise<ElementHandle<Element> | null> {
    await ensureInstalled(page);
    const handle = await page.evaluateHandle(
      (args: { global: string; ref: string }) => {
        const api = (window as unknown as Record<string, { resolveEl: (ref: string) => Element | null }>)[args.global];
        return api ? api.resolveEl(args.ref) : null;
      },
      { global: GLOBAL, ref },
    );
    const element = handle.asElement() as ElementHandle<Element> | null;
    if (!element) {
      await handle.dispose();
      return null;
    }
    return element;
  }

  async function refState(page: Page, ref: string): Promise<RefState> {
    await ensureInstalled(page);
    return (await page.evaluate(
      (args: { global: string; ref: string }) => {
        const api = (window as unknown as Record<string, { refState: (ref: string) => string }>)[args.global];
        return api ? api.refState(args.ref) : "unknown";
      },
      { global: GLOBAL, ref },
    )) as RefState;
  }

  async function enableOverlay(page: Page): Promise<void> {
    await ensureInstalled(page);
    await page.evaluate((global: string) => {
      const api = (window as unknown as Record<string, { enableOverlay: () => boolean }>)[global];
      if (api) api.enableOverlay();
    }, GLOBAL);
  }

  async function disableOverlay(page: Page): Promise<void> {
    await ensureInstalled(page);
    await page.evaluate((global: string) => {
      const api = (window as unknown as Record<string, { disableOverlay: () => boolean }>)[global];
      if (api) api.disableOverlay();
    }, GLOBAL);
  }

  async function overlayEnabled(page: Page): Promise<boolean> {
    return Boolean(
      await page.evaluate((global: string) => {
        const api = (window as unknown as Record<string, { overlayEnabled: () => boolean }>)[global];
        return api ? api.overlayEnabled() : false;
      }, GLOBAL),
    );
  }

  return {
    ensureInstalled,
    capture,
    resolveHandle,
    refState,
    enableOverlay,
    disableOverlay,
    overlayEnabled,
    cachedNodes: () => cache,
    selected(refs) {
      if (!refs || refs.length === 0) return cache;
      const wanted = new Set(refs);
      return cache.filter((node) => wanted.has(node.ref));
    },
  };
}

// Whether the singleton init script should also be registered via addInitScript
// so the registry survives soft navigations within the session.
export const FORENSICS_INIT_SCRIPT = `${FORENSICS_BROWSER_SOURCE};\nvoid 0;`;
