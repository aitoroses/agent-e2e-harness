import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** One file the scaffolder writes, addressed relative to the target directory. */
export interface ScaffoldFile {
  /** POSIX-style path relative to the target directory. */
  relativePath: string;
  contents: string;
}

const CONFIG_TEMPLATE = `import { defineAgentE2EConfig } from "@agent-e2e/harness/dev-mcp";
import type { PlaywrightHarnessTypes } from "@agent-e2e/harness";
import {
  createSampleJourney,
  type SampleObserved,
  type SampleProfileData,
} from "./journeys/sample.journey.js";

// The Harness types for this project: a Playwright execution surface plus the
// per-journey profile data and observed payload your steps produce.
type SampleHarness = PlaywrightHarnessTypes<SampleProfileData, SampleObserved>;

export default defineAgentE2EConfig<SampleHarness>({
  journeys: [createSampleJourney()],

  // \`browserSessions\` is omitted on purpose: the Dev MCP auto-creates a
  // Playwright-backed browser session for you, so this config boots with zero
  // extra wiring. To take control of the session lifecycle (custom artifact
  // root, a shared manager, your own controller), wire it explicitly — this
  // type-checks under strict mode as of @agent-e2e/harness 1.4.0:
  //
  //   import { createPlaywrightMcpBrowserSessionManager } from "@agent-e2e/harness/playwright-mcp";
  //   ...
  //   browserSessions: createPlaywrightMcpBrowserSessionManager(),
  //
  // Add a \`stackProvider\` when your journeys need managed infrastructure (e.g.
  // a Testcontainers PostgreSQL stack via @agent-e2e/harness/testcontainers).
});
`;

const SAMPLE_JOURNEY_TEMPLATE = `import { definePlaywrightJourney } from "@agent-e2e/harness";

// A Journey is a reviewed UX contract, built from PHASES and STEPS:
//   - a PHASE is a named state your app is in (think: a screen or milestone).
//   - a STEP is a single visual frame within that state — one observable
//     interaction you can land on, screenshot, and assert against. The Dev MCP
//     can time-travel to an exact frame with \`journey.untilStep\`.
// Keep steps proof-light: do the smallest real interaction, observe a few
// values, and assert them with \`proofs\`.

// Per-profile configuration. Point \`baseUrl\` at the app you want to validate.
export interface SampleProfileData {
  baseUrl: string;
}

// The values your step observes from the running UI and hands to its proofs.
export interface SampleObserved {
  pageTitle: string;
}

export function createSampleJourney() {
  return definePlaywrightJourney<SampleProfileData, SampleObserved>({
    id: "sample:home",
    title: "Sample home page journey",
    profiles: [
      // The default profile. Add more (staging, attached runtimes, …) as your
      // project grows.
      { id: "local", data: { baseUrl: "http://localhost:3000" }, isDefault: true },
    ],
    phases: [
      {
        // PHASE = state: "the home page has loaded".
        id: "phase:home",
        title: "Home page is reachable",
        steps: [
          {
            // STEP = frame: "we can read the page title".
            id: "step:title",
            title: "Read the page title",
            execute: async ({ execution, profile }) => {
              await execution.page.goto(profile.data.baseUrl);
              const pageTitle = await execution.page.title();
              return { status: "passed", observed: { pageTitle } };
            },
            proofs: [
              {
                id: "proof:title-present",
                title: "The page rendered a non-empty <title>",
                check: async ({ observed }) => observed.pageTitle.trim().length > 0,
              },
            ],
          },
        ],
      },
    ],
  });
}
`;

/** The files `agent-e2e init` writes. Pure — content is asserted in tests. */
export function generateScaffoldFiles(): ScaffoldFile[] {
  return [
    { relativePath: "agent-e2e.config.ts", contents: CONFIG_TEMPLATE },
    { relativePath: "journeys/sample.journey.ts", contents: SAMPLE_JOURNEY_TEMPLATE },
  ];
}

export interface InitOptions {
  /** Directory to scaffold into; defaults to ".". Resolved against cwd. */
  targetDir: string;
  /** Overwrite existing files instead of skipping them. */
  force: boolean;
}

/** Parse `init [targetDir] [--force]`. A single positional dir is allowed. */
export function parseInitOptions(flags: readonly string[]): InitOptions {
  let targetDir: string | undefined;
  let force = false;
  for (const flag of flags) {
    if (flag === "--force" || flag === "-f") {
      force = true;
    } else if (flag.startsWith("-")) {
      throw new Error(`Unknown init option: ${flag}`);
    } else if (targetDir === undefined) {
      targetDir = flag;
    } else {
      throw new Error(`init accepts a single [targetDir], got extra argument: ${flag}`);
    }
  }
  return { targetDir: targetDir ?? ".", force };
}

export type InitFileStatus = "written" | "overwritten" | "skipped";

export interface InitFileOutcome {
  relativePath: string;
  absolutePath: string;
  status: InitFileStatus;
}

/** Minimal text-output sink — `process.stdout` and a test spy both satisfy it. */
export interface TextSink {
  write(chunk: string): unknown;
}

export interface InitIo {
  cwd?: string;
  stdout?: TextSink;
}

/**
 * Scaffold a minimal, runnable Agent E2E setup into `options.targetDir`.
 * Non-destructive by default: an existing file is left untouched and reported as
 * `skipped` unless `--force` is set. Returns the per-file outcomes (also useful
 * for tests) and prints a written/skipped report plus next steps.
 */
export async function runInit(options: InitOptions, io: InitIo = {}): Promise<InitFileOutcome[]> {
  const cwd = io.cwd ?? process.cwd();
  const stdout = io.stdout ?? process.stdout;
  const root = isAbsolute(options.targetDir) ? options.targetDir : resolve(cwd, options.targetDir);

  const outcomes: InitFileOutcome[] = [];
  for (const file of generateScaffoldFiles()) {
    const absolutePath = join(root, ...file.relativePath.split("/"));
    const exists = existsSync(absolutePath);
    if (exists && !options.force) {
      outcomes.push({ relativePath: file.relativePath, absolutePath, status: "skipped" });
      continue;
    }
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.contents, "utf8");
    outcomes.push({
      relativePath: file.relativePath,
      absolutePath,
      status: exists ? "overwritten" : "written",
    });
  }

  printInitReport(stdout, root, outcomes, options.force);
  return outcomes;
}

const STATUS_LABEL: Record<InitFileStatus, string> = {
  written: "write",
  overwritten: "over",
  skipped: "skip",
};

function printInitReport(
  stdout: TextSink,
  root: string,
  outcomes: readonly InitFileOutcome[],
  force: boolean,
): void {
  const lines: string[] = [`Scaffolded Agent E2E harness in ${root}`, ""];
  for (const outcome of outcomes) {
    lines.push(`  ${STATUS_LABEL[outcome.status].padEnd(5)} ${outcome.relativePath}`);
  }

  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;
  if (skipped > 0 && !force) {
    lines.push("");
    lines.push(`  ${skipped} existing file(s) left untouched. Re-run with --force to overwrite.`);
  }

  lines.push(
    "",
    "Next steps:",
    "  1. Point `baseUrl` in journeys/sample.journey.ts at your app.",
    "  2. Install Playwright browsers once:  npx playwright install chromium",
    "  3. Start the Dev MCP server:          agent-e2e dev",
    "  4. In another shell, drive it:",
    "       agent-e2e list",
    "       agent-e2e call journey.list    '{}'",
    '       agent-e2e call journey.inspect \'{"journeyId":"sample:home"}\'',
    '       agent-e2e call run.begin       \'{"journeyId":"sample:home"}\'',
    '       agent-e2e call journey.step    \'{"runId":"<from run.begin>","phaseId":"phase:home","stepId":"step:title"}\'',
    "",
    "  Add a stackProvider for managed infra (then stack.start/stack.status), and use",
    "  the browser.* tools to inspect the UI. See the README for the full Dev MCP loop.",
  );

  stdout.write(`${lines.join("\n")}\n`);
}
