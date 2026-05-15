import { defineJourney, type HarnessTypes } from "@agent-e2e/harness/core";
import type { Page } from "playwright";
import type { ShowcaseStackExecution } from "./dev-stack.js";
import {
  BASELINE_USER,
  BASELINE_WORKSPACE,
  PROOF_BASELINE_RESOURCE_KIND,
  PROOF_NOTE_BODY,
  PROOF_NOTE_RESOURCE_KIND,
  SHOWCASE_JOURNEY_ID,
  SHOWCASE_PHASE_ID,
  SHOWCASE_PROFILE_ID,
  SHOWCASE_STEP_ID,
  createShowcaseResourceRegistry,
  notesApiUrl,
  seedApiUrl,
  type ShowcaseResource,
} from "../proof-notes-contract.js";

interface ShowcaseMcpObserved {
  noteBody: string;
  noteId: string;
  noteOwnedByRun: string;
  persistedAfterReload: boolean;
  baselineWorkspaceId: string;
  baselineUserId: string;
  stackObservedNoteCount: number;
}

export type ShowcaseMcpHarness = HarnessTypes<
  { stack?: ShowcaseStackExecution; page?: Page },
  Record<string, never>,
  ShowcaseMcpObserved,
  ShowcaseResource
>;

interface NotesApiSnapshot {
  workspace: { id: string };
  user: { id: string };
  notes?: Array<{ id: string; body: string; ownedByRun: string }>;
}

export function createShowcaseMcpJourney() {
  return defineJourney<ShowcaseMcpHarness>({
    id: SHOWCASE_JOURNEY_ID,
    title: "Proof Notes persisted journey",
    profiles: [{ id: SHOWCASE_PROFILE_ID, data: {}, isDefault: true }],
    seed: async ({ execution }) => {
      const baseUrl = showcaseAppUrl(execution);
      if (!baseUrl) return missingStackUrlSeed();
      const response = await fetch(seedApiUrl(baseUrl), { method: "POST" });
      if (!response.ok) {
        return {
          errors: [
            {
              code: "showcase-seed-api-failed",
              message: `Seed API returned ${response.status}`,
              guidance: [{ type: "fix", label: "Inspect stack.status", target: "stack.status" }],
            },
          ],
        };
      }
      return {
        environment: {
          checked: [
            { kind: PROOF_BASELINE_RESOURCE_KIND, id: `baseline:workspace:${BASELINE_WORKSPACE.id}` },
            { kind: PROOF_BASELINE_RESOURCE_KIND, id: `baseline:user:${BASELINE_USER.id}` },
          ],
        },
        artifacts: [{ id: "artifact:showcase-seed", kind: "url", uri: seedApiUrl(baseUrl) }],
      };
    },
    phases: [
      {
        id: SHOWCASE_PHASE_ID,
        title: "Proof Notes phase",
        steps: [
          {
            id: SHOWCASE_STEP_ID,
            title: "Capture browser-created proof note as owned resource",
            execute: async ({ execution, runId }) => {
              const baseUrl = showcaseAppUrl(execution);
              if (!baseUrl) {
                return {
                  status: "failed",
                  errors: ["Showcase app URL was not found in the active stack status."],
                  guidance: [{ type: "inspect", label: "Start managed stack", target: "stack.start" }],
                };
              }
              const response = await fetch(notesApiUrl(baseUrl), { cache: "no-store" });
              if (!response.ok) {
                return {
                  status: "failed",
                  errors: [`Notes API returned ${response.status}`],
                  guidance: [{ type: "inspect", label: "Inspect managed stack", target: "stack.status" }],
                };
              }
              const snapshot = await response.json() as NotesApiSnapshot;
              let note = snapshot.notes?.find(
                (candidate) => candidate.body === PROOF_NOTE_BODY && candidate.ownedByRun === runId,
              );
              if (!note && execution.page) {
                const targetUrl = new URL(baseUrl);
                targetUrl.searchParams.set("agentE2ERunId", runId);
                await execution.page.goto(targetUrl.toString());
                await execution.page.getByRole("button", { name: "Create proof note" }).click();
                await execution.page.getByLabel("Proof status").getByText(/Proof note persisted:/).waitFor();
                const updated = await fetch(notesApiUrl(baseUrl), { cache: "no-store" });
                if (!updated.ok) {
                  return {
                    status: "failed",
                    errors: [`Notes API returned ${updated.status} after browser action`],
                    guidance: [{ type: "inspect", label: "Inspect managed stack", target: "stack.status" }],
                  };
                }
                const updatedSnapshot = await updated.json() as NotesApiSnapshot;
                note = updatedSnapshot.notes?.find(
                  (candidate) => candidate.body === PROOF_NOTE_BODY && candidate.ownedByRun === runId,
                );
              }
              const stackObservation = execution.stack?.explore
                ? await execution.stack.explore.run("notes.list", { limit: 10 })
                : undefined;
              if (stackObservation) {
                note = stackObservation.notes.find(
                  (candidate) => candidate.body === PROOF_NOTE_BODY && candidate.ownedByRun === runId,
                ) ?? note;
              }
              if (!note) {
                return {
                  status: "failed",
                  errors: [`Browser-created proof note for run ${runId} was not found.`],
                  guidance: [
                    { type: "inspect", label: "Open headed browser", target: "browser.open" },
                    { type: "inspect", label: "Capture browser snapshot", target: "browser.snapshot" },
                    { type: "inspect", label: "Resolve Create proof note button", target: "browser.find" },
                    { type: "continue", label: "Click Create proof note", target: "browser.act" },
                    { type: "inspect", label: "Wait for persisted status", target: "browser.wait" },
                  ],
                };
              }
              return {
                status: "passed",
                observed: {
                  noteBody: note.body,
                  noteId: note.id,
                  noteOwnedByRun: note.ownedByRun,
                  persistedAfterReload: true,
                  baselineWorkspaceId: snapshot.workspace.id,
                  baselineUserId: snapshot.user.id,
                  stackObservedNoteCount: stackObservation?.notes.length ?? snapshot.notes?.length ?? 0,
                },
                ownedResources: [{ kind: PROOF_NOTE_RESOURCE_KIND, id: note.id, baseUrl }],
                artifacts: [{ id: "artifact:showcase-proof-note", kind: "json", uri: notesApiUrl(baseUrl) }],
              };
            },
            proofs: [
              {
                id: "proof:note-created-through-ui",
                title: "Browser-created proof note was captured and persisted",
                check: async ({ observed, runId }) =>
                  observed.noteBody === PROOF_NOTE_BODY &&
                  observed.persistedAfterReload === true &&
                  observed.noteOwnedByRun === runId,
              },
              {
                id: "proof:seed-baseline-survived",
                title: "Seeded baseline survived proof note creation",
                check: async ({ observed }) =>
                  observed.baselineWorkspaceId === BASELINE_WORKSPACE.id &&
                  observed.baselineUserId === BASELINE_USER.id &&
                  observed.stackObservedNoteCount >= 1,
              },
            ],
          },
        ],
      },
    ],
  });
}

export { createShowcaseResourceRegistry };

function showcaseAppUrl(execution: ShowcaseMcpHarness["executionSurface"] | undefined): string | undefined {
  const services = execution?.stack?.services ?? [];
  return services.find((service) => service.id === "showcase-next-dev" && service.url)?.url
    ?? services.find((service) => service.url)?.url;
}

function missingStackUrlSeed() {
  return {
    errors: [
      {
        code: "showcase-stack-url-missing",
        message: "Showcase app URL was not found in the active stack status.",
        guidance: [{ type: "inspect" as const, label: "Start managed stack", target: "stack.start" }],
      },
    ],
  };
}
