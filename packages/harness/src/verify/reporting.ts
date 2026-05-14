import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { safePathSegment } from "../artifacts/index.js";

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
  status: VerifyRunStatus;
  durationMs: number;
  artifactDir: string;
  seedStatus?: string;
  stepStatuses: readonly { phaseId: string; stepId: string; status: string }[];
  cleanupStatus?: "passed" | "failed" | "skipped";
  warnings: readonly string[];
  errors: readonly string[];
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
  };
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
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function suiteArtifactDir(artifactRoot: string, suiteId: string): string {
  return resolve(artifactRoot, "_suites", safePathSegment(suiteId));
}

function renderMarkdownReport(report: VerifySuiteReport): string {
  const rows = report.runs.map((run) =>
    `| ${run.journeyId} | ${run.profileId} | ${run.status} | ${formatDuration(run.durationMs)} | ${run.artifactDir} |`
  );
  return `# Agent E2E Verify Report

- Suite: \`${report.suiteId}\`
- Status: \`${report.status}\`
- Config: \`${report.configPath}\`
- Workers: ${report.workers}
- Duration: ${formatDuration(report.durationMs)}
- Exit: ${report.exitCode} (${report.exitReason})

## Runs

| Journey | Profile | Status | Duration | Artifacts |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## Warnings

${report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "_None_"}

## Errors

${report.errors.length ? report.errors.map((error) => `- ${error}`).join("\n") : "_None_"}
`;
}

function renderSummary(report: VerifySuiteReport): string {
  const passed = report.runs.filter((run) => run.status === "passed").length;
  const failed = report.runs.length - passed;
  return `Agent E2E verify: ${passed} passed, ${failed} failed
Report: ${report.artifactDir}
`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeAnnotation(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
