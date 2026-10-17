---
name: implement-issue
description: Implement a Te Jalo user story (US-XXX) or GitHub issue end-to-end following the repo's strict workflow. Orchestrates issue & dependency discovery via gh, codebase-memory-mcp graph exploration, design-tree clarification via grilling (grill-me), deep-module seam confirmation via codebase-design + tdd, vertical-slice Red->Green TDD with YAGNI discipline (ponytail), OpenAPI contract sync, two-axis parallel review via code-review, quality gates (bun test, bun check-types, bun check), and PR / Stacked PR creation via pr. Use whenever the user passes a GitHub issue URL, issue number (#N), or user story ID (US-XXX), or asks to implement an issue/story.
---

# Implement Issue (`US-XXX` / `#N`)

End-to-end orchestrator for implementing a **Te Jalo** (`andes-hack`) user story or GitHub issue while strictly enforcing `AGENTS.md` / `CLAUDE.md` engineering rules and optimizing the 5 Hackathon Evaluation Rubric criteria (**Complejidad técnica 30%**, **Funciona E2E 25%**, **Calidad técnica 20%**, **Problema e impacto 15%**, **Claridad y tradeoffs 10%**).

Consult [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md) and [`docs/agents/domain.md`](../../../docs/agents/domain.md).

## Phase 1 — Fetch Issue, Dependencies & Codebase Context

1. **Fetch the issue via `gh`:**
   ```bash
   gh issue view <number-or-url> --json number,title,body,labels,comments,state
   ```
   State the issue number, `US-XXX` code, title, affected layers (`Capas: db | api | web | infra`), and rubric weights (`Rúbrica:`).
2. **Verify dependencies (`Depende de:`):**
   - Check every upstream `US-XXX` listed in `Depende de:`.
   - If an upstream issue is still `OPEN`, check whether an open PR branch exists (`git branch -a` / `gh pr list`) so you can build a **Stacked PR** on top of it (`--base <parent-branch>`), or warn the user before proceeding.
3. **Explore with `codebase-memory-mcp` first:**
   - Use `search_graph`, `trace_path`, and `get_code_snippet` to inspect existing modules, schemas, routes, and components touched by the story. Fall back to `view_file`/grep only for config files or string literals.

**Completion criterion:** You have the full spec (interface, visible Spanish copy, states/errors, Gherkin Happy/Bad paths, acceptance criteria, suggested seams, and suggested PR title) and have mapped every file the change must reach.

---

## Phase 2 — Grill Ambiguities & Confirm TDD Seams (`grilling` + `codebase-design` + `tdd`)

Before writing any test or production code, run a single alignment checkpoint with the user:

1. **Grill genuine design forks (`grilling` / `grill-me`):**
   - Look up all facts in the codebase yourself first — never ask the user for facts discoverable in files or configs.
   - If the issue leaves architectural or UX decisions open (e.g., Single PR vs Stacked PRs across `db → api → web`, algorithm parameters, or edge-case behavior not covered by Gherkin), format them as a single **frontier round** from [`.agents/skills/grilling/SKILL.md`](../grilling/SKILL.md) (`❓ **Q1** ... ➡️ <recommended answer>`), worded so `"sí"` / `"yes"` accepts the recommendation.
   - If the issue specification is already 100% unambiguous on design decisions, skip the questions and state the key technical decision + tradeoff you will document in the PR.
2. **Propose and confirm TDD Seams ([`tdd`](../tdd/SKILL.md) + [`codebase-design`](../codebase-design/SKILL.md)):**
   - Using the `Notas técnicas -> Seams sugeridos` from the issue and the deep-module principles in [`codebase-design`](../codebase-design/SKILL.md), list the exact **public seams** to test:
     - ** Seam 1 (`<public interface / route / component>`):** _What it catches_ vs _What it leaves out_.
     - **Ordered Vertical Slices (Tracer Bullets):** List the 1-by-1 `Red → Green` slices you will execute, starting from the Happy Path and followed by the Bad Paths / edge cases.
   - _(Exception: If the issue explicitly states `Seams sugeridos: no aplica TDD`, state the live verification commands that replace unit tests)._

**Completion criterion:** If there are open design questions or unconfirmed seams, present the brief checkpoint and wait for the user's confirmation (unless the user explicitly asked for autonomous / non-stop execution, in which case proceed with theissue's `Seams sugeridos` and recommended defaults).

---

## Phase 3 — Branching Strategy (Single PR vs Stacked PRs)

Never commit or push directly to `main`.

- **Single-layer or tightly-coupled story:** Create a branch from up-to-date `main`:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b <feat|fix|chore|test>/us-<xxx>-<short-slug>
  ```
- **Multi-layer story (`db` → `api` → `web`) when using Stacked PRs:**
  - Branch 1: `feat/us-<xxx>-01-db` from `main` (`--base main`)
  - Branch 2: `feat/us-<xxx>-02-api` from `feat/us-<xxx>-01-db` (`--base feat/us-<xxx>-01-db`)
  - Branch 3: `feat/us-<xxx>-03-web` from `feat/us-<xxx>-02-api` (`--base feat/us-<xxx>-02-api`)

---

## Phase 4 — Vertical Slice Implementation (`tdd` + `ponytail`)

Read and obey [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md) ([`tests.md`](../tdd/tests.md), [`mocking.md`](../tdd/mocking.md)) and [`.agents/skills/ponytail/SKILL.md`](../ponytail/SKILL.md) (YAGNI — smallest complete change):

For **each vertical slice** (one tracer bullet at a time):

1. 🔴 **RED:** Write **one** failing test at the agreed public seam:
   - Assert observable behavior and exact Spanish copy/status codes from the issue using **independent literal expected values** (never tautological recomputations).
   - Mock **only at system boundaries** (external APIs, Upstash, Resend, clock/random, or HTTP boundary in UI tests) via injected SDK-style interfaces — never mock internal collaborators or query the DB through a side channel.
   - Run the targeted test file (`bun run --filter <workspace> test <file>`) and capture the **RED** failure output for PR evidence.
2. 🟢 **GREEN:** Write the **minimum production code** required to make that single test pass:
   - Reuse existing workspace utilities (`ApiResponse.failure`, `errorHandler`, `checkRateLimit`, `logEvent`, `@andes-hack/env`, `@andes-hack/db`, `@andes-hack/api`).
   - Do not add speculative abstractions or features for later slices.
   - Re-run the test and confirm **GREEN**.
3. **Repeat** for the next vertical slice until every acceptance criterion, Gherkin Happy Path, and Gherkin Bad Path is covered.

### Layer-Specific Rules During Implementation

- **`packages/db` (Drizzle + Neon):**
  - Export new tables/relations in `packages/db/src/schema/index.ts`.
  - Generate versioned SQL migrations (`bun db:generate`) and apply them (`bun db:migrate`) — never rely solely on `db:push`.
- **`packages/api` & `apps/server` (OpenAPI + Hono + Zod):**
  - Define shared Zod schemas and OpenAPI route contracts so `openapi.json` and `apps/web/src/lib/api-schema.d.ts` stay in sync (`bun run --filter web codegen:openapi` when routes change).
  - Never log PII (emails, license plates, or exact coordinates) in `logEvent`.
- **`apps/web` (Next.js + Tailwind + shadcn/ui):**
  - Match exact Spanish strings, labels, and error states from the issue (`Elementos y texto visible` and `Estados y mensajes`).
  - Respect legal/copy guardrails: never promise absolute safety ("garantiza", "100% seguro") or commercial fares ("tarifa", "precio", "cobro"); frame cost-sharing strictly as a reference estimate of operational fuel/toll expenses.

---

## Phase 5 — Two-Axis Review & Quality Gates (`code-review`)

1. **Run the two-axis review ([`code-review`](../code-review/SKILL.md)):**
   - Compare `git diff <base-branch>...HEAD` against:
     - **Standards Axis:** `AGENTS.md` / `CLAUDE.md` rules + Fowler code-smell baseline.
     - **Spec Axis:** Every bullet in `## Interfaz`, `## Happy path`, `## Bad path`, and `## Criterios de aceptación` of the GitHub issue.
   - Fix any findings or refactorings now (while keeping all tests green).
2. **Run all 3 Mandatory Quality Gates sequentially:**
   ```bash
   bun run test
   bun run check-types
   bun run check
   ```
   All three must exit with code `0`. Verify `git status` has no untracked scratch files or accidental formatting drift.

---

## Phase 6 — Commit & Pull Request (`pr`)

1. **Commit with Conventional Commits** matching the issue's `PR sugerido:` title (and referencing `(#<issue-number>)`).
2. **Push the branch** (`git push -u origin <branch>`).
3. **Create the PR with `gh pr create`** following [`.agents/skills/pr/SKILL.md`](../pr/SKILL.md) and [`.github/pull_request_template.md`](../../../.github/pull_request_template.md):
   - Include `Closes #<issue-number>` (`US-XXX`).
   - **`## Summary`**: Mermaid diagram, call tree, component tree, or diff-sketch.
   - **`## 🥞 Contexto de Stacked PR`** (if part of a stack).
   - **`## Evidence (Strict TDD — Seams & Vertical Slices)`**: List tested seams, paste real **Before (RED)** failing test output and **After (GREEN)** passing test / live verification output.
   - **`## ⚖️ Decisiones Técnicas y Tradeoffs`**: Explicitly state the technical decision made and the discarded alternative / tradeoff (optimizing the 10% Clarity & 30% Technical Complexity rubric criteria).
   - **`## Merge Danger`**: Specify `Door: Two-way | One-way` and `Blast Radius: Bajo | Medio | Alto` with justification.
   - **`## ✅ Quality Gates`**: Check off all 4 gates.
