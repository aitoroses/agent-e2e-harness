import {
  createProofNote,
  listProofNotes,
  seedProofNotesBaseline,
} from "../../../src/proof-notes-store.js";
import { PROOF_NOTE_BODY } from "../../../src/proof-notes-contract.js";

export async function GET() {
  await seedProofNotesBaseline();
  return Response.json(await listProofNotes());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { body?: string; runId?: string };
  const params = new URL(request.url).searchParams;
  const note = await createProofNote({
    body: body.body ?? PROOF_NOTE_BODY,
    runId: body.runId ?? params.get("agentE2ERunId") ?? params.get("runId") ?? "run:browser",
  });
  return Response.json({ status: "created", note }, { status: 201 });
}
