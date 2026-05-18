import {
  definePlaywrightJourney,
  type PlaywrightExecutableJourney,
  type PlaywrightHarnessTypes,
} from "@agent-e2e/harness";
import type { ResourceRegistry } from "@agent-e2e/harness/core";
import {
  BASELINE_USER,
  BASELINE_WORKSPACE,
  PROOF_BASELINE_RESOURCE_KIND,
  PROOF_NOTE_BODY,
  PROOF_NOTE_RESOURCE_KIND,
  SHOWCASE_ATTACHED_PROFILE_ID,
  SHOWCASE_COMPOSE_TARGET_ID,
  SHOWCASE_JOURNEY_ID,
  SHOWCASE_PHASE_ID,
  SHOWCASE_PROFILE_ID,
  SHOWCASE_STEP_ID,
  createShowcaseResourceRegistry as createShowcaseApiResourceRegistry,
  notesApiUrl,
  type ShowcaseResource,
} from "./proof-notes-contract.js";

export interface ShowcaseProfileData {
  baseUrl: string;
}

export interface ShowcaseObserved {
  noteBody: string;
  noteId: string;
  noteOwnedByRun: string;
  persistedAfterReload: boolean;
  baselineWorkspaceId: string;
  baselineUserId: string;
}

export type ShowcaseOwnedResource = ShowcaseResource;

export function createShowcaseJourney(
  baseUrl: string,
): PlaywrightExecutableJourney<
  ShowcaseProfileData,
  ShowcaseObserved,
  ShowcaseOwnedResource
> {
  return definePlaywrightJourney<
    ShowcaseProfileData,
    ShowcaseObserved,
    ShowcaseOwnedResource
  >({
    id: SHOWCASE_JOURNEY_ID,
    title: "Proof Notes persisted journey",
    profiles: [
      { id: SHOWCASE_PROFILE_ID, data: { baseUrl }, isDefault: true },
      {
        id: SHOWCASE_ATTACHED_PROFILE_ID,
        data: { baseUrl },
        runtimeTargetId: SHOWCASE_COMPOSE_TARGET_ID,
        runtime: { allowRunLifecycle: true },
      },
    ],
    seed: async ({ execution, profile }) => {
      if (!execution)
        throw new Error("Showcase seed requires Playwright execution");
      await execution.page.goto(profile.data.baseUrl);
      await execution.page.evaluate(async () => {
        await fetch("/api/seed", { method: "POST" });
      });
      await execution.page.reload();
      await execution.page.getByTestId("workspace-id").waitFor();
      return {
        environment: {
          checked: [
            { kind: PROOF_BASELINE_RESOURCE_KIND, id: `baseline:workspace:${BASELINE_WORKSPACE.id}` },
            { kind: PROOF_BASELINE_RESOURCE_KIND, id: `baseline:user:${BASELINE_USER.id}` },
          ],
        },
        artifacts: [
          {
            id: "artifact:showcase-seed",
            kind: "url",
            uri: profile.data.baseUrl,
          },
        ],
      };
    },
    phases: [
      {
        id: SHOWCASE_PHASE_ID,
        title: "Proof Notes phase",
        steps: [
          {
            id: SHOWCASE_STEP_ID,
            title: "Create and persist proof note",
            execute: async ({ execution, profile, runId }) => {
              const targetUrl = new URL(profile.data.baseUrl);
              targetUrl.searchParams.set("agentE2ERunId", runId);
              await execution.page.goto(targetUrl.toString());
              await execution.page
                .getByRole("button", { name: "Create proof note" })
                .click();
              await execution.page
                .getByLabel("Proof status")
                .getByText(/Proof note persisted:/)
                .waitFor();
              const note = execution.page.locator("[data-note-id]").first();
              const noteId = (await note.getAttribute("data-note-id")) ?? "";
              const noteOwnedByRun = (await note.getAttribute("data-owned-by-run")) ?? "";
              const noteBody = ((await note.locator("strong").textContent()) ?? "")
                .replace(/\s+/g, " ")
                .trim();
              await execution.page.reload();
              await execution.page
                .locator(`[data-note-id="${noteId}"]`)
                .waitFor();
              const baselineWorkspaceId = (
                (await execution.page
                  .getByTestId("workspace-id")
                  .textContent()) ?? ""
              ).replace("Workspace: ", "");
              const baselineUserId = (
                (await execution.page.getByTestId("user-id").textContent()) ??
                ""
              ).replace("User: ", "");
              return {
                status: "passed",
                observed: {
                  noteBody,
                  noteId,
                  noteOwnedByRun,
                  persistedAfterReload: true,
                  baselineWorkspaceId,
                  baselineUserId,
                },
                ownedResources: [{ kind: PROOF_NOTE_RESOURCE_KIND, id: noteId, baseUrl: profile.data.baseUrl }],
                artifacts: [
                  {
                    id: "artifact:showcase-proof-note",
                    kind: "json",
                    uri: notesApiUrl(profile.data.baseUrl),
                  },
                ],
              };
            },
            proofs: [
              {
                id: "proof:note-created-through-ui",
                title: "Proof note was created through the UI and persisted",
                check: async ({ observed, runId }) =>
                  observed.noteBody === PROOF_NOTE_BODY &&
                  observed.persistedAfterReload &&
                  observed.noteOwnedByRun === runId,
              },
              {
                id: "proof:seed-baseline-survived",
                title:
                  "Seeded baseline workspace/user survived proof note creation",
                check: async ({ observed }) =>
                  observed.baselineWorkspaceId === BASELINE_WORKSPACE.id &&
                  observed.baselineUserId === BASELINE_USER.id,
              },
            ],
          },
        ],
      },
    ],
  });
}

export type ShowcaseHarnessTypes = PlaywrightHarnessTypes<
  ShowcaseProfileData,
  ShowcaseObserved,
  ShowcaseOwnedResource
>;

export function createShowcaseResourceRegistry(): ResourceRegistry<ShowcaseOwnedResource> {
  return createShowcaseApiResourceRegistry();
}
