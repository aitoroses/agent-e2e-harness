#!/usr/bin/env node
import {
  startAgentE2EAttachedFromConfig,
  startAgentE2EDevMcpFromConfig,
  type StartAgentE2EAttachedFromConfigOptions,
  type StartAgentE2EDevMcpFromConfigOptions,
} from "../dev-mcp/index.js";
import {
  runAgentE2EVerifyFromConfig,
  type RunAgentE2EVerifyFromConfigOptions,
  type VerifyCleanupMode,
  type VerifyReporterMode,
} from "../verify/index.js";

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...flags] = argv;

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case "dev":
      return await runDevCommand(flags);
    case "attached":
      return await runAttachedCommand(flags);
    case "verify":
      return await runVerifyCommand(flags);
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printHelp();
      return 1;
  }
}

export function isLongLivedCliCommand(command: string | undefined): boolean {
  return command === "dev" || command === "attached";
}

async function runAttachedCommand(flags: string[]): Promise<number> {
  if (flags.includes("--help") || flags.includes("-h")) {
    printAttachedHelp();
    return 0;
  }

  await startAgentE2EAttachedFromConfig(parseAttachedOptions(flags));
  return 0;
}

async function runDevCommand(flags: string[]): Promise<number> {
  if (flags.includes("--help") || flags.includes("-h")) {
    printDevHelp();
    return 0;
  }

  const plan = planDevInvocation(flags, process.env);
  if (plan.mode === "reexec") return await reexecUnderRuntimeWatch(plan.argv);

  await startAgentE2EDevMcpFromConfig(parseDevOptions(plan.flags));
  return 0;
}

export const WATCH_REEXEC_ENV = "AGENT_E2E_WATCH_REEXEC";

export type DevInvocationPlan =
  | { mode: "serve"; flags: string[] }
  | { mode: "reexec"; argv: string[] };

/**
 * Decide whether `dev` should serve directly or re-exec itself under the
 * runtime's `--watch`. The default path is in-process hot-reload (jiti
 * re-evaluates edited journey/config modules), so `--watch` is an opt-in
 * fallback that hard-restarts the whole process on file change behind the same
 * MCP port. The re-exec sets a sentinel env var so the restarted child (which
 * still carries `--watch`) serves instead of re-exec'ing again.
 */
export function planDevInvocation(
  flags: string[],
  env: NodeJS.ProcessEnv,
): DevInvocationPlan {
  const wantsWatch = flags.includes("--watch");
  const withoutWatch = flags.filter((flag) => flag !== "--watch");
  if (wantsWatch && !env[WATCH_REEXEC_ENV]) {
    const entry = process.argv[1] ?? "";
    return { mode: "reexec", argv: ["--watch", entry, "dev", ...withoutWatch] };
  }
  return { mode: "serve", flags: withoutWatch };
}

async function reexecUnderRuntimeWatch(argv: string[]): Promise<number> {
  const { spawn } = await import("node:child_process");
  // Re-exec under the same runtime's --watch (Node or Bun both support it);
  // process.execPath is whichever interpreter launched the CLI.
  const child = spawn(process.execPath, argv, {
    stdio: "inherit",
    env: { ...process.env, [WATCH_REEXEC_ENV]: "1" },
  });
  const forward = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  return await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function runVerifyCommand(flags: string[]): Promise<number> {
  if (flags.includes("--help") || flags.includes("-h")) {
    printVerifyHelp();
    return 0;
  }

  const report = await runAgentE2EVerifyFromConfig({
    ...parseVerifyOptions(flags),
    stdout: process.stdout,
  });
  return report.exitCode;
}

function parseDevOptions(flags: string[]): StartAgentE2EDevMcpFromConfigOptions {
  const options: StartAgentE2EDevMcpFromConfigOptions = {};
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!flag) continue;
    const value = flags[index + 1];
    switch (flag) {
      case "--config":
      case "-c":
        options.configPath = requireValue(flag, value);
        index += 1;
        break;
      case "--cwd":
        options.cwd = requireValue(flag, value);
        index += 1;
        break;
      case "--host":
        options.host = requireValue(flag, value);
        index += 1;
        break;
      case "--port":
        options.port = parsePort(requireValue(flag, value));
        index += 1;
        break;
      case "--path":
        options.path = requireValue(flag, value);
        index += 1;
        break;
      case "--artifact-root":
        options.artifactRoot = requireValue(flag, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown dev option: ${flag}`);
    }
  }
  return options;
}

function parseAttachedOptions(flags: string[]): StartAgentE2EAttachedFromConfigOptions {
  const options: Partial<StartAgentE2EAttachedFromConfigOptions> = {};
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!flag) continue;
    const value = flags[index + 1];
    switch (flag) {
      case "--target":
        options.targetId = requireValue(flag, value);
        index += 1;
        break;
      case "--config":
      case "-c":
        options.configPath = requireValue(flag, value);
        index += 1;
        break;
      case "--cwd":
        options.cwd = requireValue(flag, value);
        index += 1;
        break;
      case "--host":
        options.host = requireValue(flag, value);
        index += 1;
        break;
      case "--port":
        options.port = parsePort(requireValue(flag, value));
        index += 1;
        break;
      case "--path":
        options.path = requireValue(flag, value);
        index += 1;
        break;
      case "--artifact-root":
        options.artifactRoot = requireValue(flag, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown attached option: ${flag}`);
    }
  }
  if (!options.targetId) throw new Error("attached requires --target <id>");
  return options as StartAgentE2EAttachedFromConfigOptions;
}

function parseVerifyOptions(flags: string[]): RunAgentE2EVerifyFromConfigOptions {
  const options: RunAgentE2EVerifyFromConfigOptions = {};
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!flag) continue;
    const value = flags[index + 1];
    switch (flag) {
      case "--config":
      case "-c":
        options.configPath = requireValue(flag, value);
        index += 1;
        break;
      case "--cwd":
        options.cwd = requireValue(flag, value);
        index += 1;
        break;
      case "--artifact-root":
        options.artifactRoot = requireValue(flag, value);
        index += 1;
        break;
      case "--suite":
        options.suite = requireValue(flag, value);
        index += 1;
        break;
      case "--journey":
        options.journey = append(options.journey, requireValue(flag, value));
        index += 1;
        break;
      case "--tag":
        options.tag = append(options.tag, requireValue(flag, value));
        index += 1;
        break;
      case "--exclude":
        options.exclude = append(options.exclude, requireValue(flag, value));
        index += 1;
        break;
      case "--profile":
        options.profile = append(options.profile, requireValue(flag, value));
        index += 1;
        break;
      case "--all-profiles":
        options.allProfiles = true;
        break;
      case "--workers":
        options.workers = parsePositiveInteger(flag, requireValue(flag, value));
        index += 1;
        break;
      case "--reporter":
        options.reporter = parseReporter(requireValue(flag, value));
        index += 1;
        break;
      case "--quiet":
        options.reporter = "quiet";
        break;
      case "--json":
        options.reporter = "json";
        break;
      case "--warnings-as-errors":
        options.warningsAsErrors = true;
        break;
      case "--fail-fast":
        options.failFast = true;
        break;
      case "--cleanup":
        options.cleanup = parseCleanup(requireValue(flag, value));
        index += 1;
        break;
      case "--headed":
        options.headed = true;
        break;
      default:
        throw new Error(`Unknown verify option: ${flag}`);
    }
  }
  return options;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535)
    throw new Error(`Invalid --port value: ${value}`);
  return parsed;
}

function parsePositiveInteger(flag: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function parseReporter(value: string): VerifyReporterMode {
  if (value === "list" || value === "quiet" || value === "json" || value === "github") return value;
  throw new Error(`Invalid --reporter value: ${value}`);
}

function parseCleanup(value: string): VerifyCleanupMode {
  if (value === "per-run" || value === "suite-end" || value === "none") return value;
  throw new Error(`Invalid --cleanup value: ${value}`);
}

function append(values: readonly string[] | undefined, value: string): readonly string[] {
  return [...(values ?? []), value];
}

function printHelp(): void {
  process.stdout.write(`agent-e2e

Commands:
  dev      Start the Dev MCP server from agent-e2e.config.ts
  attached Start Attached Runtime Mode for an externally owned Runtime Target
  verify   Run configured journeys through the CI verify runner
`);
}

function printDevHelp(): void {
  process.stdout.write(`agent-e2e dev

Starts the Agent E2E Dev MCP server from agent-e2e.config.ts. Runs on Node or
Bun (TypeScript config/journeys are loaded via jiti). Journey and config edits
hot-reload in process automatically, behind a stable MCP URL.

Options:
  -c, --config <path>       Config path, defaults to agent-e2e.config.ts
      --cwd <path>          Working directory for config resolution
      --host <host>         MCP host, defaults to 127.0.0.1
      --port <port>         MCP port, defaults to 3766
      --path <path>         MCP HTTP path, defaults to /mcp
      --artifact-root <dir> Artifact root, defaults to .agents-e2e/artifacts
      --watch               Optional fallback: hard-restart the server on file
                            change via the runtime's --watch, instead of the
                            default in-process hot-reload. Disposes the managed
                            stack on each restart.
`);
}

function printAttachedHelp(): void {
  process.stdout.write(`agent-e2e attached

Starts Attached Runtime Mode for an externally owned Runtime Target declared
in agent-e2e.config.ts. The harness connects to an already-running runtime;
it does not start or stop production, staging, preview, or Compose infrastructure.
Use --port when dev is already running on the default MCP port 3766.

Options:
      --target <id>         Required attached Runtime Target id
  -c, --config <path>       Config path, defaults to agent-e2e.config.ts
      --cwd <path>          Working directory for config resolution
      --host <host>         MCP host, defaults to 127.0.0.1
      --port <port>         MCP port, defaults to 3766
      --path <path>         MCP HTTP path, defaults to /mcp
      --artifact-root <dir> Artifact root, defaults to .agents-e2e/artifacts
`);
}

function printVerifyHelp(): void {
  process.stdout.write(`agent-e2e verify

Runs configured journeys from agent-e2e.config.ts through the same stack,
profile, artifact, and cleanup system used by Dev MCP.

Options:
  -c, --config <path>       Config path, defaults to agent-e2e.config.ts
      --cwd <path>          Working directory for config resolution
      --artifact-root <dir> Artifact root, defaults to .agents-e2e/artifacts
      --suite <id>          Start from a named verify suite in config
      --journey <pattern>   Include journey id or glob, repeatable
      --tag <tag>           Include journeys with a tag, repeatable
      --exclude <pattern>   Exclude journey id or glob, repeatable
      --profile <id>        Run a profile id, repeatable
      --all-profiles        Run all profiles for selected journeys
      --workers <count>     Parallel worker count, defaults to 1
      --reporter <mode>     list, quiet, json, or github
      --quiet               Alias for --reporter quiet
      --json                Alias for --reporter json
      --warnings-as-errors  Fail runs that emit warnings
      --fail-fast           Stop scheduling after the first failed run
      --cleanup <mode>      per-run, suite-end, or none
      --headed              Run Playwright headed
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    if (isLongLivedCliCommand(process.argv[2])) process.exitCode = code;
    else process.exit(code);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (isLongLivedCliCommand(process.argv[2])) process.exitCode = 1;
    else process.exit(1);
  });
}
