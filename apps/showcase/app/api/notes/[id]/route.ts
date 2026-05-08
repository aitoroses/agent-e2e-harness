import { deleteProofNote } from "../../../../src/proof-notes-store.js";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteProofNote(decodeURIComponent(id));
  return Response.json(
    { status: deleted ? "deleted" : "not-found", id },
    { status: deleted ? 200 : 404 },
  );
}
