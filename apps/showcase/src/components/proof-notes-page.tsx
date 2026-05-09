"use client";

import { useEffect, useState } from "react";
import { PROOF_NOTE_BODY } from "../proof-notes-contract.js";

interface ProofNote {
  id: string;
  body: string;
  ownedByRun: string;
}

interface Snapshot {
  workspace: { id: string; name: string };
  user: { id: string; name: string };
  notes: ProofNote[];
}

const card = {
  border: "1px solid rgba(128, 76, 24, 0.18)",
  borderRadius: 24,
  background: "rgba(255, 252, 246, 0.86)",
  boxShadow: "0 24px 80px rgba(91, 55, 19, 0.10)",
} as const;

export function ProofNotesPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("Ready for proof");

  async function refresh() {
    const response = await fetch("/api/notes", { cache: "no-store" });
    setSnapshot((await response.json()) as Snapshot);
  }

  async function createNote() {
    setStatus("Creating proof note");
    const runId = activeRunId();
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: PROOF_NOTE_BODY,
        runId,
      }),
    });
    const payload = (await response.json()) as { note: ProofNote };
    await refresh();
    setStatus(`Proof note persisted: ${payload.note.id}`);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main
      style={{
        width: "min(1040px, calc(100% - 48px))",
        margin: "0 auto",
        padding: "64px 0",
      }}
    >
      <section style={{ ...card, padding: 40 }}>
        <p
          style={{
            color: "#a45d18",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontSize: 13,
            fontWeight: 800,
            margin: 0,
          }}
        >
          Agent E2E Harness Showcase
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
            gap: 32,
            alignItems: "start",
            marginTop: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "clamp(42px, 7vw, 78px)",
                lineHeight: 0.92,
                letterSpacing: "-0.06em",
                margin: 0,
              }}
            >
              Proof Notes, from seeded state to deterministic proof.
            </h1>
            <p
              style={{
                color: "#6f5845",
                fontSize: 18,
                lineHeight: 1.6,
                maxWidth: 680,
              }}
            >
              The harness seeds a baseline workspace and user, creates a proof
              note through the browser, verifies persistence after reload, and
              owns cleanup of the journey-created resource.
            </p>
            <button
              type="button"
              onClick={() => void createNote()}
              style={{
                marginTop: 12,
                padding: "14px 20px",
                borderRadius: 999,
                color: "#fffaf2",
                background: "linear-gradient(135deg, #9f5517, #d17a27)",
                boxShadow: "0 14px 32px rgba(159, 85, 23, 0.25)",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Create proof note
            </button>
            <section
              aria-label="Proof status"
              style={{ marginTop: 20, color: "#3b2a1d", fontWeight: 800 }}
            >
              {status}
            </section>
          </div>

          <aside
            aria-label="Seed baseline"
            style={{
              borderRadius: 20,
              background: "#2b1d13",
              color: "#fff4e4",
              padding: 24,
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#e6a85d",
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              Seed baseline
            </p>
            <dl style={{ display: "grid", gap: 14, margin: "18px 0 0" }}>
              <div>
                <dt style={{ color: "#d7c1a6", fontSize: 13 }}>Workspace</dt>
                <dd
                  data-testid="workspace-id"
                  style={{ margin: "4px 0 0", fontWeight: 800 }}
                >
                  {snapshot?.workspace.id ?? "loading"}
                </dd>
              </div>
              <div>
                <dt style={{ color: "#d7c1a6", fontSize: 13 }}>User</dt>
                <dd
                  data-testid="user-id"
                  style={{ margin: "4px 0 0", fontWeight: 800 }}
                >
                  {snapshot?.user.id ?? "loading"}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section
        aria-label="Proof notes"
        style={{ ...card, marginTop: 24, padding: 28 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "baseline",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.03em" }}>
            Persisted proof notes
          </h2>
          <span style={{ color: "#826a55", fontWeight: 700 }}>
            {snapshot?.notes.length ?? 0} journey-owned
          </span>
        </div>
        {snapshot?.notes.length ? (
          <ul
            style={{
              display: "grid",
              gap: 12,
              padding: 0,
              margin: "20px 0 0",
              listStyle: "none",
            }}
          >
            {snapshot.notes.map((note) => (
              <li
                key={note.id}
                data-note-id={note.id}
                data-owned-by-run={note.ownedByRun}
                style={{
                  borderRadius: 16,
                  background: "#fff7ec",
                  border: "1px solid #ecd8ba",
                  padding: 16,
                }}
              >
                <strong>{note.body}</strong>
                <small
                  style={{ display: "block", color: "#80664c", marginTop: 6 }}
                >
                  owned by {note.ownedByRun} · {note.id}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#80664c", margin: "20px 0 0" }}>
            No proof notes yet. Create one to record a journey-owned resource.
          </p>
        )}
      </section>
    </main>
  );
}

function activeRunId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("agentE2ERunId") ?? params.get("runId") ?? "run:browser";
}
