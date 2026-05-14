import type { Page } from "playwright";

export type BrowserConsoleLevel = "log" | "debug" | "info" | "warning" | "error";

export interface BrowserConsoleEntry {
  cursor: number;
  timestamp: string;
  level: BrowserConsoleLevel;
  text: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
}

export interface BrowserNetworkEntry {
  cursor: number;
  timestamp: string;
  kind: "request" | "response" | "requestfailed";
  method?: string;
  url: string;
  statusCode?: number;
  failureText?: string;
}

export interface BrowserSignalReadResult<TEntry> {
  status: "ok" | "not-found";
  entries: TEntry[];
  nextCursor: number;
}

export interface BrowserConsoleReadInput {
  since?: number;
  level?: BrowserConsoleLevel;
  limit?: number;
  clear?: boolean;
}

export interface BrowserNetworkReadInput {
  since?: number;
  urlIncludes?: string;
  status?: "all" | "failed";
  limit?: number;
  clear?: boolean;
}

export interface BrowserSignalBuffer {
  console(input?: BrowserConsoleReadInput): BrowserSignalReadResult<BrowserConsoleEntry>;
  network(input?: BrowserNetworkReadInput): BrowserSignalReadResult<BrowserNetworkEntry>;
}

export function createBrowserSignalBuffer(page: Page): BrowserSignalBuffer {
  let consoleCursor = 0;
  let networkCursor = 0;
  const consoleEntries: BrowserConsoleEntry[] = [];
  const networkEntries: BrowserNetworkEntry[] = [];

  page.on("console", (message) => {
    const location = message.location();
    consoleEntries.push({
      cursor: ++consoleCursor,
      timestamp: new Date().toISOString(),
      level: normalizeConsoleLevel(message.type()),
      text: message.text(),
      location: {
        ...(location.url ? { url: location.url } : {}),
        ...(location.lineNumber !== undefined ? { lineNumber: location.lineNumber } : {}),
        ...(location.columnNumber !== undefined ? { columnNumber: location.columnNumber } : {}),
      },
    });
  });

  page.on("request", (request) => {
    networkEntries.push({
      cursor: ++networkCursor,
      timestamp: new Date().toISOString(),
      kind: "request",
      method: request.method(),
      url: request.url(),
    });
  });

  page.on("response", (response) => {
    networkEntries.push({
      cursor: ++networkCursor,
      timestamp: new Date().toISOString(),
      kind: "response",
      method: response.request().method(),
      url: response.url(),
      statusCode: response.status(),
    });
  });

  page.on("requestfailed", (request) => {
    const failureText = request.failure()?.errorText;
    networkEntries.push({
      cursor: ++networkCursor,
      timestamp: new Date().toISOString(),
      kind: "requestfailed",
      method: request.method(),
      url: request.url(),
      ...(failureText ? { failureText } : {}),
    });
  });

  return {
    console(input = {}) {
      const entries = consoleEntries
        .filter((entry) => entry.cursor > (input.since ?? 0))
        .filter((entry) => !input.level || entry.level === input.level)
        .slice(-(input.limit ?? 100));
      const nextCursor = consoleCursor;
      if (input.clear) consoleEntries.splice(0);
      return { status: "ok", entries, nextCursor };
    },
    network(input = {}) {
      const entries = networkEntries
        .filter((entry) => entry.cursor > (input.since ?? 0))
        .filter((entry) => !input.urlIncludes || entry.url.includes(input.urlIncludes))
        .filter((entry) => input.status !== "failed" || entry.kind === "requestfailed" || isFailedStatus(entry.statusCode))
        .slice(-(input.limit ?? 100));
      const nextCursor = networkCursor;
      if (input.clear) networkEntries.splice(0);
      return { status: "ok", entries, nextCursor };
    },
  };
}

function normalizeConsoleLevel(level: string): BrowserConsoleLevel {
  if (level === "warning" || level === "error" || level === "debug" || level === "info")
    return level;
  return "log";
}

function isFailedStatus(statusCode: number | undefined): boolean {
  return statusCode !== undefined && statusCode >= 400;
}
