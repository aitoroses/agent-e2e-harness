'use client';

import { useState } from 'react';

export default function Page() {
  const [status, setStatus] = useState('Ready for proof');

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 48, maxWidth: 720 }}>
      <p style={{ color: '#9a5b00', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Agent E2E Harness Showcase</p>
      <h1>Deterministic proof, from seed to closure</h1>
      <p>
        This tiny Next.js app is intentionally narrow: seed resets client state, the journey clicks one button,
        and closure proves the same behavior without agent intervention.
      </p>
      <button type="button" onClick={() => setStatus('Proof captured')}>
        Prove deterministic UI
      </button>
      <section aria-label="Proof status" style={{ marginTop: 24 }}>
        <strong>{status}</strong>
      </section>
    </main>
  );
}
