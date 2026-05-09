import type { GuidanceAction } from "../core/index.js";

export type ToolStatus = "ok" | "not-found" | "blocked" | "error";

export interface ToolResponse {
  status: ToolStatus;
  guidance?: readonly GuidanceAction[];
  [key: string]: unknown;
}

export function normalizeToolResponse(response: {
  status: unknown;
  [key: string]: unknown;
}): ToolResponse {
  if (isToolStatus(response.status)) return response as ToolResponse;
  return {
    status: "error",
    error: `Unsupported tool response status: ${String(response.status)}`,
  };
}

function isToolStatus(status: unknown): status is ToolStatus {
  return status === "ok" || status === "blocked" || status === "not-found" || status === "error";
}
