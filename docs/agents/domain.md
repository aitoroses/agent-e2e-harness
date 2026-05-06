# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a **single-context** layout:

- `CONTEXT.md` at the repo root, when it exists
- `docs/adr/` for architectural decision records, when it exists

The repo is currently early/scaffolded, so these files may not exist yet. Proceed silently when they are absent; producer workflows such as `grill-with-docs` can create them lazily when domain language or durable decisions crystallize.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in, if they exist.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
