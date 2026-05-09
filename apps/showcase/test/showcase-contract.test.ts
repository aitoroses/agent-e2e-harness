import { afterEach, describe, expect, it, vi } from "vitest";
import { beginJourneyRun, runJourneyStep } from "@agent-e2e/harness";

import { createShowcaseJourney } from "../src/journey.js";
import { createShowcaseMcpJourney } from "../src/harness/dev-mcp-journey.js";
import {
  BASELINE_USER,
  BASELINE_WORKSPACE,
  PROOF_NOTE_BODY,
} from "../src/proof-notes-contract.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("showcase journey contracts", () => {
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
      execution: showcaseStackExecution(),
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
      execution: showcaseStackExecution(),
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
      { kind: "proof-note", id: "proof-note:current", baseUrl: "http://showcase.local" },
    ]);
  });
});

function showcaseStackExecution() {
  return {
    stack: {
      status: "ready" as const,
      summary: "ready",
      services: [{ id: "showcase-next-dev", status: "ready" as const, url: "http://showcase.local" }],
      artifacts: [],
      warnings: [],
      errors: [],
    },
  };
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
