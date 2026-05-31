import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  beginJourneyRun,
  runJourneyStep,
  teardownOwnedResources,
  type AnyHarnessTypes,
  type ExecutableJourney,
  type JourneyRun,
  type OwnershipLedger,
  type ResourceAdapter,
} from "../core/index.js";
import {
  createRunArtifactRecorder,
  safePathSegment,
  timestampSegment,
  writeJsonArtifact,
  type RunArtifactRecorder,
} from "../artifacts/index.js";
import {
  type StackExecutionSurface,
  type StackProvider,
} from "../stack/index.js";
import {
  attachRunSignals,
  captureStepScreenshot,
  emptySignalSlice,
  uniqueArtifacts,
  writeStepArtifacts,
} from "../mcp/run-forensics.js";
import { selectVerifyRuns, type VerifySelectionOptions, type VerifySuiteConfig } from "./selection.js";
import {
  renderTerminalReport,
  suiteArtifactDir,
  writeVerifyReports,
  type VerifyReporterMode,
  type VerifyRunReport,
  type VerifyRunStatus,
  type VerifySuiteReport,
} from "./reporting.js";
import { runWorkerStackQueue, type VerifyWorkerStackSnapshot } from "./worker-stack-scheduler.js";

export type VerifyCleanupMode = "per-run" | "suite-end" | "none";

export interface AgentE2EVerifyConfig {
  workers?: number;
  reporter?: VerifyReporterMode;
  warningsAsErrors?: boolean;
  failFast?: boolean;
  cleanup?: VerifyCleanupMode;
  suites?: readonly VerifySuiteConfig[];
}

export interface VerifyRunOptions extends VerifySelectionOptions {
  configPath: string;
  artifactRoot: string;
  workers?: number;
  reporter?: VerifyReporterMode;
  warningsAsErrors?: boolean;
  failFast?: boolean;
  cleanup?: VerifyCleanupMode;
  headed?: boolean;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  randomSuffix?: () => string;
  createBrowser?: (options: { headed: boolean }) => Promise<VerifyBrowser>;
  stdout?: Pick<NodeJS.WriteStream, "write">;
}

export interface VerifyBrowser {
  newContext(): Promise<VerifyBrowserContext>;
  close(): Promise<void>;
}

export interface VerifyBrowserContext {
  newPage(): Promise<unknown>;
  close(): Promise<void>;
}

export interface VerifySuiteInput<TTypes extends AnyHarnessTypes = AnyHarnessTypes, TStackHandle = unknown> {
  journeys: readonly ExecutableJourney<TTypes>[];
  resourceAdapters?: readonly ResourceAdapter<TTypes>[];
  stackProvider?: StackProvider<TStackHandle>;
  verify?: AgentE2EVerifyConfig;
  options: VerifyRunOptions;
}

export async function runVerifySuite<
  TTypes extends AnyHarnessTypes = AnyHarnessTypes,
  TStackHandle = unknown,
>(input: VerifySuiteInput<TTypes, TStackHandle>): Promise<VerifySuiteReport> {
  const startedAtDate = input.options.now?.() ?? new Date();
  const startedAt = startedAtDate.toISOString();
  const resolved = resolveVerifyOptions(input.verify, input.options);
  const suiteId = createSuiteId(resolved.env, startedAtDate, input.options.randomSuffix);
  const artifactDir = suiteArtifactDir(resolved.artifactRoot, suiteId);
  await mkdir(artifactDir, { recursive: true });

  const selectionInput = {
    journeys: input.journeys,
    options: resolved.selection,
    ...(input.verify?.suites ? { suites: input.verify.suites } : {}),
  };
  const selected = selectVerifyRuns<TTypes>(selectionInput).selected;

  let stackSnapshots: VerifyWorkerStackSnapshot[] = [];
  const runs: VerifyRunReport[] = [];
  const suiteEndCleanups: Array<{
    journey: ExecutableJourney<TTypes>;
    profileId: string;
    report: VerifyRunReport;
    ledger: OwnershipLedger<TTypes>;
  }> = [];
  const suiteWarnings: string[] = [];
  const suiteErrors: string[] = [];
  let browser: VerifyBrowser | undefined;
  let browserPromise: Promise<VerifyBrowser> | undefined;
  const getBrowser = async () => {
    browserPromise ??= (resolved.createBrowser ?? createPlaywrightBrowser)({ headed: resolved.headed });
    browser = await browserPromise;
    return browser;
  };

  try {
    let stopScheduling = false;
    stackSnapshots = await runWorkerStackQueue({
      selected,
      workers: resolved.workers,
      suiteId,
      artifactRoot: resolved.artifactRoot,
      ...(input.stackProvider ? { stackProvider: input.stackProvider } : {}),
      shouldSchedule: () => !stopScheduling,
      onSuiteWarning: (warning) => suiteWarnings.push(warning),
      onSuiteError: (error) => suiteErrors.push(error),
      ...(resolved.cleanup === "suite-end"
        ? {
            afterRunsBeforeStop: async () => {
              await cleanupSuiteEnd({
                suiteId,
                artifactRoot: resolved.artifactRoot,
                cleanups: suiteEndCleanups,
                resourceAdapters: input.resourceAdapters ?? [],
              });
            },
          }
        : {}),
      run: async (selectedRun, worker) => {
        const result = await runSingleVerifyRun({
          suiteId,
          artifactRoot: resolved.artifactRoot,
          journey: selectedRun.journey,
          profileId: selectedRun.profile.id,
          index: selectedRun.index,
          browser: await getBrowser(),
          resourceAdapters: input.resourceAdapters ?? [],
          cleanup: resolved.cleanup,
          warningsAsErrors: resolved.warningsAsErrors,
          ...(worker.stack ? { stack: worker.stack } : {}),
          ...(worker.stackId ? { stackId: worker.stackId } : {}),
        });
        runs.push(result.report);
        if (resolved.cleanup === "suite-end" && result.ledger) {
          suiteEndCleanups.push({
            journey: selectedRun.journey,
            profileId: selectedRun.profile.id,
            report: result.report,
            ledger: result.ledger,
          });
        }
        if (result.report.status === "cleanup_failed") stopScheduling = true;
        if (resolved.failFast && result.report.status !== "passed") stopScheduling = true;
      },
    });
  } catch (error) {
    suiteErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        suiteErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  const endedAtDate = input.options.now?.() ?? new Date();
  const failedRuns = runs.filter((run) => run.status !== "passed");
  const status = failedRuns.length === 0 && suiteErrors.length === 0 ? "passed" : "failed";
  const hasStackFailure = stackSnapshots.some((stack) => stack.status !== "ready");
  const legacyStack = stackSnapshots.length === 1 ? stackSnapshots[0] : undefined;
  const report: VerifySuiteReport = {
    suiteId,
    status,
    startedAt,
    endedAt: endedAtDate.toISOString(),
    durationMs: Math.max(0, endedAtDate.getTime() - startedAtDate.getTime()),
    configPath: input.options.configPath,
    artifactDir,
    workers: resolved.workers,
    reporter: resolved.reporter,
    warningsAsErrors: resolved.warningsAsErrors,
    failFast: resolved.failFast,
    ...(legacyStack
      ? {
          stack: {
            status: legacyStack.status,
            summary: legacyStack.summary,
            allocations: legacyStack.allocations,
          },
        }
      : {}),
    stacks: stackSnapshots,
    runs: runs.sort((left, right) => runIndex(left.runId) - runIndex(right.runId)),
    warnings: suiteWarnings,
    errors: suiteErrors,
    exitCode: status === "passed" ? 0 : 1,
    exitReason: status === "passed"
      ? "all selected runs passed"
      : hasStackFailure
        ? "stack runtime failed"
        : "one or more selected runs failed",
  };
  await writeVerifyReports(report);
  input.options.stdout?.write(renderTerminalReport(report, resolved.reporter));
  return report;
}

async function runSingleVerifyRun<TTypes extends AnyHarnessTypes>(input: {
  suiteId: string;
  artifactRoot: string;
  journey: ExecutableJourney<TTypes>;
  profileId: string;
  index: number;
  browser: VerifyBrowser;
  stack?: StackExecutionSurface;
  resourceAdapters: readonly ResourceAdapter<TTypes>[];
  cleanup: VerifyCleanupMode;
  warningsAsErrors: boolean;
  stackId?: string;
}): Promise<{ report: VerifyRunReport; ledger?: OwnershipLedger<TTypes> }> {
  const started = Date.now();
  const runId = runIdFor(input.journey.id, input.profileId, input.index);
  const artifacts = createRunArtifactRecorder(
    {
      artifactRoot: input.artifactRoot,
      suiteId: input.suiteId,
      journeyId: input.journey.id,
      profileId: input.profileId,
      runId,
    },
    input.journey,
  );
  const context = await input.browser.newContext();
  const page = await context.newPage();
  const execution = {
    browser: input.browser,
    context,
    page,
    ...(input.stack ? { stack: input.stack } : {}),
  } as TTypes["executionSurface"];
  const stepStatuses: Array<{ phaseId: string; stepId: string; status: string }> = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let status: VerifyRunStatus = "passed";
  let seedStatus: string | undefined;
  let cleanupStatus: VerifyRunReport["cleanupStatus"] = "skipped";
  let ledger: OwnershipLedger<TTypes> | undefined;

  try {
    const begin = await beginJourneyRun(input.journey, {
      profileId: input.profileId,
      execution,
      runId,
    });
    await artifacts.writeSeed(begin.seedGate);
    seedStatus = begin.seedGate.manifest.status;
    warnings.push(...begin.seedGate.manifest.warnings.map((warning) => warning.message));
    errors.push(...begin.seedGate.manifest.errors.map((error) => error.message));
    if (begin.status === "blocked") {
      status = "seed_blocked";
    } else {
      const result = await runJourneyWithArtifacts(begin.run, artifacts);
      ledger = begin.run.ownershipLedger;
      stepStatuses.push(...result.stepStatuses);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      status = result.failed ? "failed" : "passed";
      if (input.cleanup === "per-run") {
        const cleanup = await teardownOwnedResources(begin.run.ownershipLedger, input.resourceAdapters);
        await artifacts.writeCleanupPlan(cleanup.plan);
        await artifacts.writeTeardown(cleanup, "cleanup");
        cleanupStatus = cleanup.artifacts.failed.length > 0 ? "failed" : "passed";
        if (cleanupStatus === "failed") {
          status = "cleanup_failed";
          errors.push(...cleanup.artifacts.failed.map((failure) => failure.error));
        }
      }
    }
    if (input.warningsAsErrors && status === "passed" && warnings.length > 0) {
      status = "warning_failed";
      errors.push("warnings-as-errors enabled");
    }
    await artifacts.writeRunReport({
      status,
      runId,
      journeyId: input.journey.id,
      profileId: input.profileId,
      artifactDir: artifacts.run.relDir,
      stepStatuses,
      cleanupStatus,
      warnings,
      errors,
    });
  } catch (error) {
    status = "error";
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }

  const report: VerifyRunReport = {
    journeyId: input.journey.id,
    profileId: input.profileId,
    runId,
    ...(input.stackId ? { stackId: input.stackId } : {}),
    status,
    durationMs: Math.max(0, Date.now() - started),
    artifactDir: artifacts.run.relDir,
    ...(seedStatus ? { seedStatus } : {}),
    stepStatuses,
    cleanupStatus,
    warnings,
    errors,
  };
  return ledger ? { report, ledger } : { report };
}

async function cleanupSuiteEnd<TTypes extends AnyHarnessTypes>(input: {
  suiteId: string;
  artifactRoot: string;
  cleanups: readonly {
    journey: ExecutableJourney<TTypes>;
    profileId: string;
    report: VerifyRunReport;
    ledger: OwnershipLedger<TTypes>;
  }[];
  resourceAdapters: readonly ResourceAdapter<TTypes>[];
}): Promise<void> {
  for (const item of input.cleanups) {
    const artifacts = createRunArtifactRecorder(
      {
        artifactRoot: input.artifactRoot,
        suiteId: input.suiteId,
        journeyId: item.journey.id,
        profileId: item.profileId,
        runId: item.report.runId,
      },
      item.journey,
    );
    const cleanup = await teardownOwnedResources(item.ledger, input.resourceAdapters);
    await artifacts.writeCleanupPlan(cleanup.plan);
    await artifacts.writeTeardown(cleanup, "cleanup");
    item.report.cleanupStatus = cleanup.artifacts.failed.length > 0 ? "failed" : "passed";
    if (item.report.cleanupStatus === "failed") {
      item.report.status = "cleanup_failed";
      item.report.errors = [
        ...item.report.errors,
        ...cleanup.artifacts.failed.map((failure) => failure.error),
      ];
    }
  }
}

async function runJourneyWithArtifacts<TTypes extends AnyHarnessTypes>(
  run: JourneyRun<TTypes>,
  artifacts: RunArtifactRecorder<TTypes>,
): Promise<{
  failed: boolean;
  stepStatuses: VerifyRunReport["stepStatuses"];
  warnings: string[];
  errors: string[];
}> {
  const signals = attachRunSignals(run.execution);
  const stepStatuses: Array<{ phaseId: string; stepId: string; status: string }> = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const timeline: Array<Record<string, unknown>> = [];
  let failed = false;

  for (const phase of run.journey.phases) {
    for (const step of phase.steps) {
      const mark = signals.mark();
      const beforeArtifact = await captureStepScreenshot(artifacts.run, run.journey, run.execution, phase.id, step.id, "before");
      const result = await runJourneyStep(run, { phaseId: phase.id, stepId: step.id });
      const terminalScreenshot = await captureStepScreenshot(
        artifacts.run,
        run.journey,
        run.execution,
        result.phaseId,
        result.stepId,
        result.status === "passed" ? "after" : result.status === "skipped" ? "skipped" : "failure",
      );
      const generatedArtifacts = await writeStepArtifacts({
        artifacts,
        run,
        result,
        execution: run.execution,
        beforeArtifact,
        terminalScreenshot,
        signalSlice: signals.slice(mark),
      });
      uniqueArtifacts([...result.artifacts, ...generatedArtifacts]);
      await artifacts.writeOwnedResources(run);
      timeline.push({
        phaseId: result.phaseId,
        stepId: result.stepId,
        status: result.status,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        durationMs: result.durationMs,
      });
      await writeJsonArtifact(artifacts.run, "timeline.json", timeline, { name: "timeline" });
      await writeJsonArtifact(artifacts.run, "metrics.json", { steps: timeline }, { name: "metrics" });
      stepStatuses.push({ phaseId: result.phaseId, stepId: result.stepId, status: result.status });
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      if (result.status === "failed" || result.status === "error") {
        failed = true;
        return { failed, stepStatuses, warnings, errors };
      }
    }
  }
  return { failed, stepStatuses, warnings, errors };
}

function resolveVerifyOptions(config: AgentE2EVerifyConfig | undefined, options: VerifyRunOptions) {
  const env = options.env ?? process.env;
  const reporter = options.reporter ?? config?.reporter ?? (env.GITHUB_ACTIONS === "true" ? "github" : "list");
  const selection: VerifySelectionOptions = {};
  if (options.suite !== undefined) selection.suite = options.suite;
  if (options.journey !== undefined) selection.journey = options.journey;
  if (options.tag !== undefined) selection.tag = options.tag;
  if (options.exclude !== undefined) selection.exclude = options.exclude;
  if (options.profile !== undefined) selection.profile = options.profile;
  if (options.allProfiles !== undefined) selection.allProfiles = options.allProfiles;

  return {
    artifactRoot: options.artifactRoot,
    workers: options.workers ?? config?.workers ?? 1,
    reporter,
    warningsAsErrors: options.warningsAsErrors ?? config?.warningsAsErrors ?? false,
    failFast: options.failFast ?? config?.failFast ?? false,
    cleanup: options.cleanup ?? config?.cleanup ?? "per-run",
    headed: options.headed ?? false,
    env,
    createBrowser: options.createBrowser,
    selection,
  };
}

function createSuiteId(
  env: Record<string, string | undefined>,
  date: Date,
  randomSuffix = () => Math.random().toString(16).slice(2, 6),
): string {
  if (env.GITHUB_RUN_ID) {
    return `verify-github-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? "1"}`;
  }
  return `verify-${timestampSegment(date)}-${safePathSegment(randomSuffix())}`;
}

function runIdFor(journeyId: string, profileId: string, index: number): string {
  return `${safePathSegment(journeyId)}-${safePathSegment(profileId)}-${String(index).padStart(2, "0")}`;
}

function runIndex(runId: string): number {
  const parsed = Number(runId.split("-").at(-1));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

async function createPlaywrightBrowser(options: { headed: boolean }): Promise<VerifyBrowser> {
  const { chromium } = await import("playwright");
  return await chromium.launch({ headless: !options.headed });
}
