# Seed Ownership Matrix

The Proof Notes showcase needs seed to create or ensure baseline state without making that state eligible for generic run teardown.

## Ownership classes

| Class | Meaning | Example | Generic reseed cleanup? |
| --- | --- | --- | --- |
| `checked` | Existing environment state was verified. | PostgreSQL reachable; schema version exists. | No. |
| `ensured` | Seed made baseline state true, creating it if missing. | Baseline workspace and demo user exist. | No. |
| `seedOwned` | Seed created disposable setup state that seed/stack policy may replace. | Temporary source fixture or seed scratch row. | No generic run-ledger cleanup; only explicit seed/stack policy. |
| `journeyOwned` | Journey created product-visible resources as part of the proof and recorded them in the ownership ledger. | Proof note created through the UI. | Yes. |

## Reseed contract

`reseed` returns the selected profile to seeded state:

1. Read the run ownership ledger.
2. Destroy only `journeyOwned` resources through registered resource adapters.
3. Run Environment Seed again.
4. Emit cleanup + seed artifacts.

Seed-created baseline resources are not automatically inserted into the run-owned ledger. The existing behavior that treats `seedGate.manifest.environment.created` as run-owned cleanup input must be removed or replaced before Proof Notes app work starts.

## Proof Notes policy

- Baseline workspace: `ensured`; survives reseed.
- Demo user: `ensured`; survives reseed.
- PostgreSQL schema: `checked`/stack-owned; survives run reseed and is removed only when the stack stops.
- Proof note created through UI: `journeyOwned`; removed by reseed/teardown.
