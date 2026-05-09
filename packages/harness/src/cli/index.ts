#!/usr/bin/env bun
import {
  startAgentE2EDevMcpFromConfig,
  type StartAgentE2EDevMcpFromConfigOptions,
} from "../dev-mcp/index.js";

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...flags] = argv;

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case "dev-mcp":
      return await runDevMcpCommand(flags);
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printHelp();
      return 1;
  }
}

async function runDevMcpCommand(flags: string[]): Promise<number> {
  if (flags.includes("--help") || flags.includes("-h")) {
    printDevMcpHelp();
    return 0;
  }

  await startAgentE2EDevMcpFromConfig(parseDevMcpOptions(flags));
  return 0;
}

function parseDevMcpOptions(flags: string[]): StartAgentE2EDevMcpFromConfigOptions {
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
        throw new Error(`Unknown dev-mcp option: ${flag}`);
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

function printHelp(): void {
  process.stdout.write(`agent-e2e-harness

Commands:
  dev-mcp   Start the Bun-backed Dev MCP server from agent-e2e.config.ts
`);
}

function printDevMcpHelp(): void {
  process.stdout.write(`agent-e2e-harness dev-mcp

Starts the Bun-backed Agent E2E Dev MCP server from agent-e2e.config.ts.

Options:
  -c, --config <path>       Config path, defaults to agent-e2e.config.ts
      --cwd <path>          Working directory for config resolution
      --host <host>         MCP host, defaults to 127.0.0.1
      --port <port>         MCP port, defaults to 3766
      --path <path>         MCP HTTP path, defaults to /mcp
      --artifact-root <dir> Artifact root, defaults to .agents-e2e/artifacts
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
