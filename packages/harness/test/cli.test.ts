import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isLongLivedCliCommand } from "../src/cli/index.js";

const execFileAsync = promisify(execFile);
const cliPath = resolve(process.cwd(), "dist/cli/index.js");

describe("Agent E2E CLI", () => {
  it("documents the public command surface", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e");
    expect(stdout).toContain("dev");
    expect(stdout).toContain("attached");
    expect(stdout).toContain("verify");
    expect(stdout).not.toContain("dev-mcp");
    expect(stdout).not.toContain("demo");
    expect(stdout).not.toContain("seed");
  });

  it("documents the Attached Runtime Mode command", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "attached", "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e attached");
    expect(stdout).toContain("--target <id>");
    expect(stdout).toContain("Attached Runtime Mode");
    expect(stdout).not.toContain("Dev MCP");
  });

  it("keeps dev and attached commands long-lived after startup", () => {
    expect(isLongLivedCliCommand("dev")).toBe(true);
    expect(isLongLivedCliCommand("attached")).toBe(true);
    expect(isLongLivedCliCommand("verify")).toBe(false);
  });

  it("documents the Dev MCP command", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "dev", "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e dev");
    expect(stdout).toContain("agent-e2e.config.ts");
    expect(stdout).toContain("--artifact-root");
    expect(stdout).not.toContain("--no-reload");
    expect(stdout).not.toContain("--manifest");
  });

  it("documents the config-backed verify command", async () => {
    const { stdout } = await execFileAsync("bun", [cliPath, "verify", "--help"], { cwd: process.cwd() });

    expect(stdout).toContain("agent-e2e verify");
    expect(stdout).toContain("--journey");
    expect(stdout).toContain("--suite");
    expect(stdout).toContain("--workers");
    expect(stdout).toContain("--reporter");
  });

  it("runs verify from agent-e2e.config.ts without a user-owned Playwright wrapper", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agent-e2e-cli-"));
    const artifactRoot = join(tempDir, "artifacts");
    const coreImport = pathToFileURL(resolve(process.cwd(), "dist/core/index.js")).href;
    const configPath = join(tempDir, "agent-e2e.config.mjs");
    await writeFile(
      configPath,
      `import { defineJourney } from ${JSON.stringify(coreImport)};

export default {
  journeys: [
    defineJourney({
      id: "notes:create",
      title: "Create note",
      profiles: [{ id: "default", data: {}, isDefault: true }],
      phases: [{
        id: "phase:create",
        title: "Create",
        steps: [{
          id: "step:create",
          title: "Create",
          execute: async () => ({ status: "passed" })
        }]
      }]
    })
  ],
  verify: { reporter: "quiet" }
};
`,
      "utf8",
    );

    const { stdout } = await execFileAsync(
      "bun",
      [cliPath, "verify", "--config", configPath, "--artifact-root", artifactRoot],
      { cwd: process.cwd() },
    );

    expect(stdout).toContain("Agent E2E verify: 1 passed, 0 failed");
    expect(existsSync(join(artifactRoot, "_suites"))).toBe(true);
  });
});
