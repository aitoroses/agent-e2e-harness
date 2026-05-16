import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { safePathSegment } from "../artifacts/index.js";
import type { StackAllocationRecord, StackStatusPacket } from "../stack/index.js";

export type VerifyReporterMode = "list" | "quiet" | "json" | "github";

export type VerifyRunStatus =
  | "passed"
  | "failed"
  | "seed_blocked"
  | "cleanup_failed"
  | "warning_failed"
  | "error";

export interface VerifyRunReport {
  journeyId: string;
  profileId: string;
  runId: string;
  stackId?: string;
  status: VerifyRunStatus;
  durationMs: number;
  artifactDir: string;
  seedStatus?: string;
  stepStatuses: readonly { phaseId: string; stepId: string; status: string }[];
  cleanupStatus?: "passed" | "failed" | "skipped";
  warnings: readonly string[];
  errors: readonly string[];
}

export interface VerifyStackReport {
  stackId: string;
  workerIndex?: number;
  status: string;
  summary: string;
  timing: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
  };
  services: StackStatusPacket["services"];
  artifacts: StackStatusPacket["artifacts"];
  warnings: StackStatusPacket["warnings"];
  errors: StackStatusPacket["errors"];
  allocations: readonly StackAllocationRecord[];
}

export interface VerifySuiteReport {
  suiteId: string;
  status: "passed" | "failed";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  configPath: string;
  artifactDir: string;
  workers: number;
  reporter: VerifyReporterMode;
  warningsAsErrors: boolean;
  failFast: boolean;
  stack?: {
    status: string;
    summary: string;
    allocations?: readonly StackAllocationRecord[];
  };
  stacks: readonly VerifyStackReport[];
  runs: readonly VerifyRunReport[];
  warnings: readonly string[];
  errors: readonly string[];
  exitCode: number;
  exitReason: string;
}

export async function writeVerifyReports(report: VerifySuiteReport): Promise<void> {
  await mkdir(resolve(report.artifactDir), { recursive: true });
  await Promise.all([
    writeFile(resolve(report.artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(resolve(report.artifactDir, "report.md"), renderMarkdownReport(report), "utf8"),
  ]);
}

export function renderTerminalReport(report: VerifySuiteReport, mode: VerifyReporterMode): string {
  if (mode === "json") return `${JSON.stringify(report)}\n`;
  if (mode === "quiet") return renderSummary(report);
  const lines = report.runs.map((run, index) =>
    `[${index + 1}/${report.runs.length}] ${run.journeyId} ${run.profileId} ${run.status} ${formatDuration(run.durationMs)}`
  );
  lines.push(...report.stacks
    .filter((stack) => stack.status !== "ready")
    .map((stack) => `[stack] ${stack.stackId} ${stack.status} ${stack.summary}`));
  lines.push(renderSummary(report).trimEnd());
  if (mode === "github") lines.push(renderGithubAnnotations(report).trimEnd());
  return `${lines.filter(Boolean).join("\n")}\n`;
}

export function renderGithubAnnotations(report: VerifySuiteReport): string {
  const lines: string[] = [];
  for (const run of report.runs) {
    if (run.status === "passed") continue;
    const message = `${run.journeyId}/${run.profileId} ${run.status}. See ${run.artifactDir}`;
    lines.push(`::error title=Agent E2E ${run.status}::${escapeAnnotation(message)}`);
  }
  for (const warning of report.warnings) {
    lines.push(`::warning title=Agent E2E warning::${escapeAnnotation(warning)}`);
  }
  for (const stack of report.stacks) {
    if (stack.status === "ready") continue;
    const message = `${stack.stackId} ${stack.status}. ${stack.summary}`;
    lines.push(`::error title=Agent E2E stack ${stack.status}::${escapeAnnotation(message)}`);
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function suiteArtifactDir(artifactRoot: string, suiteId: string): string {
  return resolve(artifactRoot, "_suites", safePathSegment(suiteId));
}

function renderMarkdownReport(report: VerifySuiteReport): string {
  const rows = report.runs.map((run) =>
    `| ${run.journeyId} | ${run.profileId} | ${run.stackId ?? ""} | ${run.status} | ${formatDuration(run.durationMs)} | ${run.artifactDir} |`
  );
  const stackRows = report.stacks.map((stack) =>
    `| ${stack.stackId} | ${stack.workerIndex ?? ""} | ${stack.status} | ${stack.summary} | ${formatStackServices(stack)} | ${formatStackAllocations(stack)} | ${formatStackDiagnostics(stack)} |`
  );
  return `# Agent E2E Verify Report

- Suite: \`${report.suiteId}\`
- Status: \`${report.status}\`
- Config: \`${report.configPath}\`
- Workers: ${report.workers}
- Duration: ${formatDuration(report.durationMs)}
- Exit: ${report.exitCode} (${report.exitReason})

## Stack Instances

| Stack | Worker | Status | Summary | Services | Allocations | Diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
${stackRows.length ? stackRows.join("\n") : "| _None_ |  |  |  |  |  |  |"}

## Runs

| Journey | Profile | Stack | Status | Duration | Artifacts |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Warnings

${report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "_None_"}

## Errors

${report.errors.length ? report.errors.map((error) => `- ${error}`).join("\n") : "_None_"}
`;
}

function formatStackServices(stack: VerifyStackReport): string {
  if (stack.services.length === 0) return "_None_";
  return stack.services
    .map((service) => `${service.id} ${service.status}${service.url ? ` (${service.url})` : ""}`)
    .join("<br>");
}

function formatStackAllocations(stack: VerifyStackReport): string {
  if (stack.allocations.length === 0) return "_None_";
  return stack.allocations
    .map((allocation) => {
      if (allocation.kind === "port") return `${allocation.name} port ${allocation.resource.url}`;
      return `${allocation.name} ${allocation.kind} ${allocation.resource.path}`;
    })
    .join("<br>");
}

function formatStackDiagnostics(stack: VerifyStackReport): string {
  const diagnostics = [
    ...stack.warnings.map((warning) => `warning:${warning.code} ${warning.message}`),
    ...stack.errors.map((error) => `error:${error.code} ${error.message}`),
  ];
  return diagnostics.length ? diagnostics.join("<br>") : "_None_";
}

function renderSummary(report: VerifySuiteReport): string {
  const passed = report.runs.filter((run) => run.status === "passed").length;
  const failed = report.runs.length - passed;
  const failedStacks = report.stacks.filter((stack) => stack.status !== "ready").length;
  const stackSummary = report.stacks.length > 0 ? `, ${failedStacks} stack failed` : "";
  return `Agent E2E verify: ${passed} passed, ${failed} failed${stackSummary}
Report: ${report.artifactDir}
`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeAnnotation(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
