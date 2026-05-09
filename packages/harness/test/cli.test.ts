import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = resolve(process.cwd(), "dist/cli/index.js");

describe("Agent E2E CLI", () => {
  it("documents the public command surface", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e-harness");
    expect(stdout).toContain("dev-mcp");
    expect(stdout).not.toContain("demo");
    expect(stdout).not.toContain("seed");
  });

  it("documents the Bun-backed Dev MCP command", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "dev-mcp", "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e-harness dev-mcp");
    expect(stdout).toContain("agent-e2e.config.ts");
    expect(stdout).toContain("--artifact-root");
    expect(stdout).not.toContain("--no-reload");
    expect(stdout).not.toContain("--manifest");
  });
});
