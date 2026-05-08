import type { ArtifactRef, HarnessTypes, ResourceAdapter } from "@agent-e2e/harness/core";

export const SHOWCASE_JOURNEY_ID = "showcase:proof-notes";
export const SHOWCASE_PROFILE_ID = "profile:default";
export const SHOWCASE_PHASE_ID = "phase:proof-notes";
export const SHOWCASE_STEP_ID = "step:create-proof-note";
export const SHOWCASE_RESOURCE_ADAPTER_ID = "showcase-proof-note-api";

export const PROOF_NOTE_RESOURCE_KIND = "proof-note";
export const PROOF_BASELINE_RESOURCE_KIND = "proof-baseline";
export const PROOF_NOTE_BODY = "Proof note created through the browser";

export const BASELINE_WORKSPACE = {
  id: "workspace:seed",
  name: "Seeded Proof Workspace",
};

export const BASELINE_USER = {
  id: "user:seed",
  name: "Seeded Agent User",
};

export const PROOF_NOTES_SCHEMA_SQL = `
  create table if not exists proof_workspaces (
    id text primary key,
    name text not null
  );
  create table if not exists proof_users (
    id text primary key,
    name text not null
  );
  create table if not exists proof_notes (
    id text primary key,
    workspace_id text not null references proof_workspaces(id),
    author_id text not null references proof_users(id),
    body text not null,
    owned_by_run text not null,
    created_at timestamptz not null default now()
  );
`;

export interface ProofNoteResource {
  kind: typeof PROOF_NOTE_RESOURCE_KIND;
  id: string;
}

export type ShowcaseResource = ProofNoteResource | {
  kind: typeof PROOF_BASELINE_RESOURCE_KIND;
  id: string;
};

export function notesApiUrl(baseUrl: string) {
  return `${baseUrl}/api/notes`;
}

export function seedApiUrl(baseUrl: string) {
  return `${baseUrl}/api/seed`;
}

export function noteApiUrl(baseUrl: string, id: string) {
  return `${notesApiUrl(baseUrl)}/${encodeURIComponent(id)}`;
}

export function createDeletedProofNoteArtifact(resourceId: string): ArtifactRef {
  return {
    id: `artifact:deleted:${resourceId.replace(/[^A-Za-z0-9:_-]/g, "-")}`,
    kind: "cleanup",
    uri: `artifact://showcase/deleted/${resourceId}`,
  };
}

export function createShowcaseResourceAdapter<
  TTypes extends HarnessTypes<unknown, object, object, ShowcaseResource>,
>(baseUrl: string): ResourceAdapter<TTypes> {
  return {
    id: SHOWCASE_RESOURCE_ADAPTER_ID,
    supports: (resource) =>
      resource.kind === PROOF_NOTE_RESOURCE_KIND && resource.id.startsWith("proof-note:"),
    delete: async (resource) => {
      const response = await fetch(noteApiUrl(baseUrl, resource.id), { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Failed to delete proof note ${resource.id}: ${response.status}`);
      }
      return { artifact: createDeletedProofNoteArtifact(resource.id) };
    },
  };
}
