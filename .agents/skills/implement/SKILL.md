---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a GitHub issue URL, `#<number>`, or `US-XXX` story from this repository, follow [`.agents/skills/implement-issue/SKILL.md`](../implement-issue/SKILL.md) (which orchestrates `grilling`, `codebase-design`, `tdd` at pre-agreed seams, `ponytail`, `code-review`, quality gates, and `pr`).

Otherwise:

1. Fetch the ticket reference from the issue tracker (`docs/agents/issue-tracker.md`) and state its title before starting. If the reference is ambiguous, ask or call the Skill tool with `"grilling"`.
2. Propose and confirm public seams before writing tests, then call the Skill tool with `"tdd"` in vertical slices (`Red → Green`).
3. Run typechecking (`bun check-types`), linter (`bun check`), and tests (`bun test`) regularly.
4. Once done, call the Skill tool with `"code-review"` to review the work along Standards and Spec axes.
5. Open a PR or Stacked PR using the `"pr"` skill template (`.github/pull_request_template.md`).
