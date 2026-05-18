import { afterEach, describe, expect, it, vi } from "vitest";
import { beginJourneyRun, runJourneyStep } from "@agent-e2e/harness";

import { createShowcaseJourney } from "../src/journey.js";
import { createShowcaseMcpJourney } from "../src/harness/dev-mcp-journey.js";
import { createShowcaseDevStackProvider } from "../src/harness/dev-stack.js";
import {
  createShowcaseComposeAttachedRuntimeTarget,
  parseComposeLogs,
} from "../src/harness/compose-attached-runtime.js";
import type { ShowcaseStackExecution } from "../src/harness/dev-stack.js";
import {
  BASELINE_USER,
  BASELINE_WORKSPACE,
  PROOF_NOTE_BODY,
  SHOWCASE_ATTACHED_PROFILE_ID,
  SHOWCASE_COMPOSE_TARGET_ID,
} from "../src/proof-notes-contract.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("showcase journey contracts", () => {
  it("declares concrete stack exploration tools for Dev MCP discovery", () => {
    const provider = createShowcaseDevStackProvider();

    expect(provider.explore).toEqual([
      expect.objectContaining({
        id: "notes.list",
        availableIn: ["dev", "verify"],
        risk: "none",
      }),
      expect.objectContaining({
        id: "postgres.query",
        availableIn: ["dev"],
        risk: "local-mutation",
      }),
    ]);
  });

  it("keeps the Dev MCP and CI journey contracts aligned", () => {
    const baseUrl = "http://127.0.0.1:3000";
    const ciContract = createShowcaseJourney(baseUrl).toInspectableContract();
    const devMcpContract = createShowcaseMcpJourney().toInspectableContract();

    expect(devMcpContract.id).toBe(ciContract.id);
    expect(devMcpContract.profiles.map((profile) => profile.id)).toEqual(
      ciContract.profiles.map((profile) => profile.id),
    );
    expect(devMcpContract.phases.map((phase) => phase.id)).toEqual(
      ciContract.phases.map((phase) => phase.id),
    );

    const ciStep = ciContract.phases[0]?.steps[0];
    const devMcpStep = devMcpContract.phases[0]?.steps[0];
    expect(devMcpStep?.id).toBe(ciStep?.id);
    expect(devMcpStep?.artifacts).toEqual(ciStep?.artifacts);
    expect(devMcpStep?.proofs.map((proof) => proof.id)).toEqual(
      ciStep?.proofs.map((proof) => proof.id),
    );
  });

  it("declares Docker Compose as an attached Runtime Target with product-owned diagnostics", async () => {
    const target = createShowcaseComposeAttachedRuntimeTarget();
    const journey = createShowcaseMcpJourney();
    const attachedProfile = journey.getProfile(SHOWCASE_ATTACHED_PROFILE_ID);

    expect(target).toMatchObject({
      id: SHOWCASE_COMPOSE_TARGET_ID,
      kind: "attached",
      lifecycleOwner: "external",
      label: "Showcase Docker Compose",
    });
    expect(target.logs).toBeTypeOf("function");
    expect(target.access).toEqual([
      expect.objectContaining({
        id: "compose-runtime-logs",
        kind: "runtimeLogs",
      }),
    ]);
    expect(target.explore).toEqual([
      expect.objectContaining({
        id: "compose.services",
        risk: "observation",
      }),
    ]);
    expect(attachedProfile).toMatchObject({
      runtimeTargetId: SHOWCASE_COMPOSE_TARGET_ID,
      runtime: { allowRunLifecycle: true },
    });
    await expect(target.status?.()).resolves.toMatchObject({
      services: [
        expect.objectContaining({ id: "showcase-web", url: "http://127.0.0.1:3100" }),
        expect.objectContaining({ id: "postgres" }),
      ],
    });
  });

  it("reports Compose logs as bounded without claiming source truncation", () => {
    expect(parseComposeLogs("showcase | one\nshowcase | two\n", {
      serviceId: "showcase",
      tail: 2,
    })).toMatchObject({
      tail: 2,
      entries: [
        { serviceId: "showcase", message: "one" },
        { serviceId: "showcase", message: "two" },
      ],
      truncated: false,
    });
  });

  it("does not adopt stale proof notes from another run", async () => {
    stubShowcaseApi([
      {
        id: "proof-note:old",
        body: PROOF_NOTE_BODY,
        ownedByRun: "old-run",
      },
    ]);

    const journey = createShowcaseMcpJourney();
    const begin = await beginJourneyRun(journey, {
      execution: showcaseStackExecution([
        {
          id: "proof-note:old",
          body: PROOF_NOTE_BODY,
          ownedByRun: "old-run",
        },
      ]),
      runId: "showcase-dev",
    });
    expect(begin.status).toBe("running");
    if (begin.status !== "running") throw new Error("expected running run");

    const result = await runJourneyStep(begin.run, {
      phaseId: "phase:proof-notes",
      stepId: "step:create-proof-note",
    });

    expect(result.status).toBe("failed");
    expect(result.ownedResources).toEqual([]);
    expect(result.errors).toContain(
      "Browser-created proof note for run showcase-dev was not found.",
    );
  });

  it("captures only proof notes owned by the active run", async () => {
    stubShowcaseApi([
      {
        id: "proof-note:current",
        body: PROOF_NOTE_BODY,
        ownedByRun: "showcase-dev",
      },
      {
        id: "proof-note:old",
        body: PROOF_NOTE_BODY,
        ownedByRun: "old-run",
      },
    ]);

    const journey = createShowcaseMcpJourney();
    const begin = await beginJourneyRun(journey, {
      execution: showcaseStackExecution([
        {
          id: "proof-note:current",
          body: PROOF_NOTE_BODY,
          ownedByRun: "showcase-dev",
        },
        {
          id: "proof-note:old",
          body: PROOF_NOTE_BODY,
          ownedByRun: "old-run",
        },
      ]),
      runId: "showcase-dev",
    });
    expect(begin.status).toBe("running");
    if (begin.status !== "running") throw new Error("expected running run");

    const result = await runJourneyStep(begin.run, {
      phaseId: "phase:proof-notes",
      stepId: "step:create-proof-note",
    });

    expect(result.status).toBe("passed");
    expect(result.observed).toMatchObject({
      noteId: "proof-note:current",
      noteOwnedByRun: "showcase-dev",
    });
    expect(result.ownedResources).toEqual([
      { kind: "note", id: "proof-note:current", baseUrl: "http://showcase.local" },
    ]);
  });
});

function showcaseStackExecution(
  notes: Array<{ id: string; body: string; ownedByRun: string }> = [],
) {
  return {
    stack: {
      status: "ready" as const,
      summary: "ready",
      services: [{ id: "showcase-next-dev", status: "ready" as const, url: "http://showcase.local" }],
      artifacts: [],
      warnings: [],
      errors: [],
      explore: {
        run: async () => ({
          notes: notes.map((note) => ({
            ...note,
            workspaceId: BASELINE_WORKSPACE.id,
            authorId: BASELINE_USER.id,
            createdAt: "2026-05-14T00:00:00.000Z",
          })),
        }),
      },
    } as unknown as ShowcaseStackExecution,
  };
}

function assertVerifyClientTypes(stack: ShowcaseStackExecution) {
  const notes = stack.explore.run("notes.list", { limit: 1 });
  // @ts-expect-error dev-only tools must not be present in verify-time stack exploration.
  void stack.explore.run("postgres.query", { sql: "select 1" });
  return notes;
}

function stubShowcaseApi(
  notes: Array<{ id: string; body: string; ownedByRun: string }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/api/seed")) {
        return jsonResponse({ status: "seeded" });
      }
      if (url.endsWith("/api/notes")) {
        return jsonResponse({
          workspace: { id: BASELINE_WORKSPACE.id },
          user: { id: BASELINE_USER.id },
          notes,
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }),
  );
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
