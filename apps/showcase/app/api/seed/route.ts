import { seedProofNotesBaseline } from "../../../src/proof-notes-store.js";

export async function POST() {
  const snapshot = await seedProofNotesBaseline();
  return Response.json({ status: "seeded", snapshot });
}
