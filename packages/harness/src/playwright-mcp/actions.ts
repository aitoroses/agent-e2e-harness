import type { Page } from "playwright";

export interface BrowserActionInput {
  action: "click" | "fill" | "press" | "hover" | "focus" | "check" | "uncheck" | "select" | "scroll";
  text?: string;
  key?: string;
  value?: string;
  values?: string[];
  deltaX?: number;
  deltaY?: number;
  ref?: string;
  selector?: string;
}

// Minimal action surface shared by Playwright `Locator` (selector targets) and
// `ElementHandle` (refs resolved through the in-page registry). Both satisfy it,
// so `browser.act` works the same whether it acts on a ref or a raw selector.
export interface BrowserActionable {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  hover(): Promise<void>;
  focus(): Promise<void>;
  check(): Promise<void>;
  uncheck(): Promise<void>;
  selectOption(values: string[]): Promise<unknown>;
  scrollIntoViewIfNeeded(): Promise<void>;
}

export async function runBrowserAction(
  page: Page,
  target: BrowserActionable,
  input: BrowserActionInput,
): Promise<void> {
  if (input.action === "click") {
    await target.click();
    return;
  }
  if (input.action === "fill") {
    if (input.text === undefined)
      throw new Error("browser.act fill requires text.");
    await target.fill(input.text);
    return;
  }
  if (input.action === "press") {
    if (input.key === undefined)
      throw new Error("browser.act press requires key.");
    await target.press(input.key);
    return;
  }
  if (input.action === "hover") {
    await target.hover();
    return;
  }
  if (input.action === "focus") {
    await target.focus();
    return;
  }
  if (input.action === "check") {
    await target.check();
    return;
  }
  if (input.action === "uncheck") {
    await target.uncheck();
    return;
  }
  if (input.action === "select") {
    const values = input.values ?? (input.value !== undefined ? [input.value] : undefined);
    if (!values || values.length === 0)
      throw new Error("browser.act select requires value or values.");
    await target.selectOption(values);
    return;
  }
  if (input.action === "scroll") {
    if (input.selector || input.ref) await target.scrollIntoViewIfNeeded();
    await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 500);
    return;
  }
  throw new Error(`Unsupported browser.act action: ${input.action satisfies never}`);
}
