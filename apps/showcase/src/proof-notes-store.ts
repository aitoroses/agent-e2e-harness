import {
  BASELINE_USER,
  BASELINE_WORKSPACE,
  PROOF_NOTES_SCHEMA_SQL,
} from "./proof-notes-contract.js";

export interface ProofNoteRecord {
  id: string;
  body: string;
  workspaceId: string;
  authorId: string;
  ownedByRun: string;
  createdAt: string;
}

export interface ProofNotesSnapshot {
  workspace: { id: string; name: string };
  user: { id: string; name: string };
  notes: ProofNoteRecord[];
}

const memoryState = globalThis as typeof globalThis & {
  __agentE2EProofNotes?: ProofNotesSnapshot;
};

export async function seedProofNotesBaseline(): Promise<ProofNotesSnapshot> {
  if (process.env.DATABASE_URL)
    return withDatabase(async (client) => {
      await ensureSchema(client);
      await client.query(
        "insert into proof_workspaces(id, name) values ($1, $2) on conflict (id) do update set name = excluded.name",
        [BASELINE_WORKSPACE.id, BASELINE_WORKSPACE.name],
      );
      await client.query(
        "insert into proof_users(id, name) values ($1, $2) on conflict (id) do update set name = excluded.name",
        [BASELINE_USER.id, BASELINE_USER.name],
      );
      return readProofNotesSnapshotWithClient(client);
    });

  const snapshot = ensureMemorySnapshot();
  snapshot.workspace = BASELINE_WORKSPACE;
  snapshot.user = BASELINE_USER;
  return snapshot;
}

export async function listProofNotes(): Promise<ProofNotesSnapshot> {
  if (process.env.DATABASE_URL)
    return withDatabase(async (client) => {
      await ensureSchema(client);
      return readProofNotesSnapshotWithClient(client);
    });
  return ensureMemorySnapshot();
}

export async function createProofNote(input: {
  body: string;
  runId: string;
}): Promise<ProofNoteRecord> {
  const id = `proof-note:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  if (process.env.DATABASE_URL)
    return withDatabase(async (client) => {
      await ensureSchema(client);
      await client.query(
        "insert into proof_workspaces(id, name) values ($1, $2) on conflict (id) do nothing",
        [BASELINE_WORKSPACE.id, BASELINE_WORKSPACE.name],
      );
      await client.query(
        "insert into proof_users(id, name) values ($1, $2) on conflict (id) do nothing",
        [BASELINE_USER.id, BASELINE_USER.name],
      );
      await client.query(
        "insert into proof_notes(id, workspace_id, author_id, body, owned_by_run, created_at) values ($1, $2, $3, $4, $5, $6)",
        [
          id,
          BASELINE_WORKSPACE.id,
          BASELINE_USER.id,
          input.body,
          input.runId,
          createdAt,
        ],
      );
      return {
        id,
        body: input.body,
        workspaceId: BASELINE_WORKSPACE.id,
        authorId: BASELINE_USER.id,
        ownedByRun: input.runId,
        createdAt,
      };
    });

  const snapshot = ensureMemorySnapshot();
  const note = {
    id,
    body: input.body,
    workspaceId: BASELINE_WORKSPACE.id,
    authorId: BASELINE_USER.id,
    ownedByRun: input.runId,
    createdAt,
  };
  snapshot.notes.unshift(note);
  return note;
}

export async function deleteProofNote(id: string): Promise<boolean> {
  if (process.env.DATABASE_URL)
    return withDatabase(async (client) => {
      await ensureSchema(client);
      const result = await client.query(
        "delete from proof_notes where id = $1",
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    });

  const snapshot = ensureMemorySnapshot();
  const before = snapshot.notes.length;
  snapshot.notes = snapshot.notes.filter((note) => note.id !== id);
  return snapshot.notes.length !== before;
}

function ensureMemorySnapshot(): ProofNotesSnapshot {
  memoryState.__agentE2EProofNotes ??= {
    workspace: BASELINE_WORKSPACE,
    user: BASELINE_USER,
    notes: [],
  };
  return memoryState.__agentE2EProofNotes;
}

async function withDatabase<T>(
  callback: (client: PgClient) => Promise<T>,
): Promise<T> {
  const { Client } = (await import("pg")) as unknown as {
    Client: new (config: { connectionString: string }) => PgClient;
  };
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? "",
  });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function ensureSchema(client: PgClient): Promise<void> {
  await client.query(PROOF_NOTES_SCHEMA_SQL);
}

async function readProofNotesSnapshotWithClient(
  client: PgClient,
): Promise<ProofNotesSnapshot> {
  const notes = await client.query<{
    id: string;
    body: string;
    workspace_id: string;
    author_id: string;
    owned_by_run: string;
    created_at: Date;
  }>(
    "select id, body, workspace_id, author_id, owned_by_run, created_at from proof_notes order by created_at desc",
  );

  return {
    workspace: BASELINE_WORKSPACE,
    user: BASELINE_USER,
    notes: notes.rows.map((row) => ({
      id: row.id,
      body: row.body,
      workspaceId: row.workspace_id,
      authorId: row.author_id,
      ownedByRun: row.owned_by_run,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

interface PgClient {
  connect(): Promise<void>;
  query<T = unknown>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  end(): Promise<void>;
}
