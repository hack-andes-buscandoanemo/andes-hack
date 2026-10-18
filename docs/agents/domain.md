# Domain Docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`AGENTS.md` / `CLAUDE.md`** at the repo root: defines the **Te Jalo** domain model (`Organization`/`Community`, `Member`/`User`, `Route`/`Schedule`, `TripMatch`/`MatchingEngine`, `FuelCostEstimate`), the 8-screen E2E navigation flow, and the Hackathon Evaluation Rubric (75% Technical / 25% Product).
- **`GLOSSARY.md`** at the repo root (if present)
- **`docs/decisiones/`**: short ADRs (`0001-slug.md`, in Spanish). Read the ones that touch the area you're about to work in. New ADRs go here, not in `docs/adr/`.

If `GLOSSARY.md` doesn't exist yet, **proceed silently** using the domain vocabulary in `AGENTS.md`. The `/domain-modeling` skill creates it lazily when terms get resolved.

## Use the domain vocabulary

When your output names a domain concept (in an issue title, a branch name, a test name, or a module interface), match the Spanish user-facing copy specified in the user story (`US-XXX`) and the domain entities defined in `AGENTS.md`.
