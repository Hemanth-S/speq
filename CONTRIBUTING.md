# Contributing to speq

## How to propose a change to a command

Open an issue describing:
- Which command you were using
- What problem you hit (be specific — paste the output or behaviour you saw)
- What you expected instead
- Your project's language/framework (commands may behave differently across stacks)

This helps us understand the real-world context before making changes.

## How to test a change

Use the modified command on a real project — not a toy example. speq commands
are prompts, not code, so the only meaningful test is running them end-to-end
and observing the results.

When testing, note:
- Did the command follow its steps in order?
- Did it reference real codebase elements (tables, APIs, services)?
- Did it produce the expected output files?
- Did it interact correctly with Beads (`bd`) commands?
- Were there any places where it got stuck, hallucinated, or skipped steps?

## PR checklist

Before submitting a pull request, confirm:

- [ ] Command tested on a real project (not just read and approved)
- [ ] `docs/prompts-reference.md` updated if the reasoning behind a design decision changed
- [ ] `docs/faq.md` updated if a new edge case is covered
- [ ] `CHANGELOG.md` entry added under `## [Unreleased]`
