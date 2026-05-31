import type { ElementHandle, Locator, Page } from "playwright";
import { FORENSICS_BROWSER_SOURCE, FORENSICS_SINGLETON_GLOBAL } from "../forensics/browser-script.js";
import type { ForensicsNode, PageFacts } from "../forensics/inspect-capture.js";

export type { ForensicsNode, ForensicsRect, PageFacts } from "../forensics/inspect-capture.js";

// Selector / semantic locator descriptors. `browser.act` and `browser.wait`
// accept a raw selector target; refs resolve through the in-page registry.
export type BrowserLocatorDescriptor =
  | { kind: "selector"; selector: string }
  | { kind: "role"; role: string; name?: string; exact?: boolean; index?: number }
  | { kind: "text"; text: string; exact?: boolean; index?: number }
  | { kind: "label"; text: string; exact?: boolean; index?: number }
  | { kind: "placeholder"; text: string; exact?: boolean; index?: number }
  | { kind: "testId"; testId: string; index?: number };

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
  derive(page: Page, maxNodes?: number): Promise<ForensicsNode[]>;
  pageFacts(page: Page): Promise<PageFacts>;
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
    // addInitScript so it survives navigations. Re-evaluating is harmless (the
    // singleton early-returns) but avoids re-sending the source on every call.
    if (installed) {
      const present = await page.evaluate(
        (global: string) => Boolean((window as unknown as Record<string, unknown>)[global]),
        GLOBAL,
      );
      if (present) return;
    }
    // Evaluating the source as a statement (then `void 0`) avoids returning the
    // non-serializable api object to Playwright.
    await page.evaluate(`${FORENSICS_BROWSER_SOURCE};\nvoid 0;`);
    installed = true;
  }

  async function derive(page: Page, maxNodes?: number): Promise<ForensicsNode[]> {
    await ensureInstalled(page);
    const nodes = (await page.evaluate(
      (args: { global: string; maxNodes: number }) => {
        const api = (window as unknown as Record<string, { derive: (n?: number) => unknown[] }>)[args.global];
        return api ? api.derive(args.maxNodes || undefined) : [];
      },
      { global: GLOBAL, maxNodes: maxNodes ?? 0 },
    )) as ForensicsNode[];
    cache = nodes;
    return nodes;
  }

  async function pageFacts(page: Page): Promise<PageFacts> {
    await ensureInstalled(page);
    return (await page.evaluate(
      (global: string) => {
        const api = (window as unknown as Record<string, { pageFacts: () => unknown }>)[global];
        return api ? api.pageFacts() : null;
      },
      GLOBAL,
    )) as PageFacts;
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
    derive,
    pageFacts,
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

export function descriptorForSelector(selector: string): BrowserLocatorDescriptor {
  return { kind: "selector", selector };
}

export function locatorFor(page: Page, descriptor: BrowserLocatorDescriptor): Locator {
  let locator: Locator;
  if (descriptor.kind === "selector") {
    locator = page.locator(descriptor.selector);
  } else if (descriptor.kind === "role") {
    locator = page.getByRole(descriptor.role as never, {
      ...(descriptor.name !== undefined ? { name: descriptor.name } : {}),
      ...(descriptor.exact !== undefined ? { exact: descriptor.exact } : {}),
    });
  } else if (descriptor.kind === "text") {
    locator = page.getByText(descriptor.text, {
      ...(descriptor.exact !== undefined ? { exact: descriptor.exact } : {}),
    });
  } else if (descriptor.kind === "label") {
    locator = page.getByLabel(descriptor.text, {
      ...(descriptor.exact !== undefined ? { exact: descriptor.exact } : {}),
    });
  } else if (descriptor.kind === "placeholder") {
    locator = page.getByPlaceholder(descriptor.text, {
      ...(descriptor.exact !== undefined ? { exact: descriptor.exact } : {}),
    });
  } else {
    locator = page.getByTestId(descriptor.testId);
  }
  return descriptor.kind !== "selector" && descriptor.index !== undefined
    ? locator.nth(descriptor.index)
    : locator;
}
