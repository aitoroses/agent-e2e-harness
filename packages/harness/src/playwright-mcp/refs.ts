import type { Locator, Page } from "playwright";

export type BrowserRefSource = "snapshot" | "find";

export type BrowserLocatorDescriptor =
  | { kind: "selector"; selector: string }
  | { kind: "role"; role: string; name?: string; exact?: boolean; index?: number }
  | { kind: "text"; text: string; exact?: boolean; index?: number }
  | { kind: "label"; text: string; exact?: boolean; index?: number }
  | { kind: "placeholder"; text: string; exact?: boolean; index?: number }
  | { kind: "testId"; testId: string; index?: number };

export interface BrowserRefTarget {
  ref: string;
  source: BrowserRefSource;
  locator: BrowserLocatorDescriptor;
  selector?: string;
  role?: string;
  name?: string;
}

export interface BrowserRefStore {
  replaceSnapshot(refs: Array<{ ref: string; selector: string; role?: string; name?: string }>): void;
  replaceFind(targets: Array<Omit<BrowserRefTarget, "ref" | "source">>): BrowserRefTarget[];
  get(ref: string): BrowserRefTarget | undefined;
  selected(refs?: readonly string[]): BrowserRefTarget[];
  all(): BrowserRefTarget[];
}

export function createBrowserRefStore(): BrowserRefStore {
  const refs = new Map<string, BrowserRefTarget>();

  return {
    replaceSnapshot(snapshotRefs) {
      for (const ref of [...refs.keys()]) {
        if (ref.startsWith("@e")) refs.delete(ref);
      }
      for (const ref of snapshotRefs) {
        refs.set(ref.ref, {
          ref: ref.ref,
          source: "snapshot",
          selector: ref.selector,
          ...(ref.role ? { role: ref.role } : {}),
          ...(ref.name ? { name: ref.name } : {}),
          locator: { kind: "selector", selector: ref.selector },
        });
      }
    },
    replaceFind(targets) {
      for (const ref of [...refs.keys()]) {
        if (ref.startsWith("@f")) refs.delete(ref);
      }
      const created = targets.map((target, index) => ({
        ...target,
        ref: `@f${index + 1}`,
        source: "find" as const,
      }));
      for (const target of created) refs.set(target.ref, target);
      return created;
    },
    get(ref) {
      return refs.get(ref);
    },
    selected(selectedRefs) {
      if (!selectedRefs || selectedRefs.length === 0) return [...refs.values()];
      return selectedRefs.map((ref) => refs.get(ref)).filter(Boolean) as BrowserRefTarget[];
    },
    all() {
      return [...refs.values()];
    },
  };
}

export function locatorFor(page: Page, target: BrowserRefTarget | BrowserLocatorDescriptor): Locator {
  const descriptor = "locator" in target ? target.locator : target;
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

export function descriptorForSelector(selector: string): BrowserLocatorDescriptor {
  return { kind: "selector", selector };
}
