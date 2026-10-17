# Issue tracker: GitHub

Issues and specs for this repo (`hack-andes-buscandoanemo/andes-hack`) live as GitHub issues (`US-001` through `US-037`). Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use `--body-file` for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments,state`.
- **List issues**: `gh issue list --state open --limit 50 --json number,title,state,labels`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: Issues are closed automatically when their PR merges with `Closes #<number>` in the PR body, or manually via `gh issue close <number> --comment "..."`.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.
