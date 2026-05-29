import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isCliEntrypoint, isLongLivedCliCommand, planDevInvocation, WATCH_REEXEC_ENV } from "../src/cli/index.js";

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
    expect(stdout).toContain("Use --port when dev is already running on the default MCP port");
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
    expect(stdout).toContain("--watch");
    expect(stdout).toContain("in-process hot-reload");
    expect(stdout).toContain("fallback");
    expect(stdout).toContain("Node or");
    expect(stdout).not.toContain("--no-reload");
    expect(stdout).not.toContain("--manifest");
  });

  it("serves dev directly without --watch and strips the flag", () => {
    const plan = planDevInvocation(["--port", "4000"], {});
    expect(plan).toEqual({ mode: "serve", flags: ["--port", "4000"] });
  });

  it("re-execs under the runtime's --watch when --watch is requested fresh", () => {
    const plan = planDevInvocation(["--watch", "--port", "4000"], {});
    expect(plan.mode).toBe("reexec");
    if (plan.mode === "reexec") {
      expect(plan.argv[0]).toBe("--watch");
      // --watch is stripped from the child's dev flags to avoid re-exec recursion.
      expect(plan.argv).toContain("dev");
      expect(plan.argv.filter((arg) => arg === "--watch")).toHaveLength(1);
      expect(plan.argv).toContain("--port");
      expect(plan.argv).toContain("4000");
    }
  });

  it("serves directly inside the watch re-exec child (sentinel set) without recursing", () => {
    const plan = planDevInvocation(["--watch", "--port", "4000"], { [WATCH_REEXEC_ENV]: "1" });
    expect(plan).toEqual({ mode: "serve", flags: ["--port", "4000"] });
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

  it("treats a symlink to the module as the entrypoint (file:/workspace/npx bins)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-entry-"));
    const target = join(dir, "real-module.js");
    await writeFile(target, "// real module\n", "utf8");
    const link = join(dir, "agent-e2e");
    await symlink(target, link);

    const metaUrl = pathToFileURL(target).href;
    // argv[1] is the symlink path (as Node leaves it for a symlinked bin).
    expect(isCliEntrypoint(metaUrl, link)).toBe(true);
    // Direct invocation (argv[1] === module path) still matches.
    expect(isCliEntrypoint(metaUrl, target)).toBe(true);
    // Negative cases.
    expect(isCliEntrypoint(metaUrl, undefined)).toBe(false);
    expect(isCliEntrypoint(metaUrl, join(dir, "unrelated.js"))).toBe(false);
  });

  it("runs the CLI when launched through a symlinked bin (regression: silent no-op)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-e2e-binlink-"));
    const link = join(dir, "agent-e2e");
    await symlink(cliPath, link); // mirrors node_modules/.bin/agent-e2e -> dist/cli/index.js

    const { stdout } = await execFileAsync("node", [link, "--help"], { cwd: dir });
    expect(stdout).toContain("agent-e2e");
    expect(stdout).toContain("Commands:");
  });
});
