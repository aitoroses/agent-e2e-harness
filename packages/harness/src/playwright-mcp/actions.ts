import type { Page } from "playwright";
import { locatorFor, type BrowserLocatorDescriptor, type BrowserRefTarget } from "./refs.js";

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

export async function runBrowserAction(
  page: Page,
  target: BrowserRefTarget | BrowserLocatorDescriptor,
  input: BrowserActionInput,
): Promise<void> {
  const locator = locatorFor(page, target);
  if (input.action === "click") {
    await locator.click();
    return;
  }
  if (input.action === "fill") {
    if (input.text === undefined)
      throw new Error("browser.act fill requires text.");
    await locator.fill(input.text);
    return;
  }
  if (input.action === "press") {
    if (input.key === undefined)
      throw new Error("browser.act press requires key.");
    await locator.press(input.key);
    return;
  }
  if (input.action === "hover") {
    await locator.hover();
    return;
  }
  if (input.action === "focus") {
    await locator.focus();
    return;
  }
  if (input.action === "check") {
    await locator.check();
    return;
  }
  if (input.action === "uncheck") {
    await locator.uncheck();
    return;
  }
  if (input.action === "select") {
    const values = input.values ?? (input.value !== undefined ? [input.value] : undefined);
    if (!values || values.length === 0)
      throw new Error("browser.act select requires value or values.");
    await locator.selectOption(values);
    return;
  }
  if (input.action === "scroll") {
    if (input.selector || input.ref) await locator.scrollIntoViewIfNeeded();
    await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 500);
    return;
  }
  throw new Error(`Unsupported browser.act action: ${input.action satisfies never}`);
}
