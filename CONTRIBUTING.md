# Contributing to speq

## Development setup

```bash
git clone https://github.com/Hemanth-S/speq.git
cd speq
npm install
npm run build    # compile TypeScript
npm test         # run all tests
```

## How to propose a change

Open an issue describing:
- Which command or CLI feature you were using
- What problem you hit (be specific — paste the output or behaviour you saw)
- What you expected instead
- Your project's language/framework (commands may behave differently across stacks)

This helps us understand the real-world context before making changes.

## How to test a change

### CLI changes (src/*.ts)

Run the test suite:
```bash
npm test                # all tests
npm run test:coverage   # with coverage report
```

Tests are in `test/` and use Vitest. Coverage thresholds: 80% lines, 70% branches.

### Command prompt changes (.claude/commands/*.md)

Use the modified command on a real project — not a toy example. speq commands
are prompts, so the only meaningful test is running them end-to-end
and observing the results.

When testing, note:
- Did the command follow its steps in order?
- Did it reference real codebase elements (tables, APIs, services)?
- Did it produce the expected output files?
- Did it interact correctly with Beads (`bd`) commands?
- Were there any places where it got stuck, hallucinated, or skipped steps?

## PR checklist

Before submitting a pull request, confirm:

- [ ] `npm test` passes with no failures
- [ ] `npm run build` compiles cleanly
- [ ] Command tested on a real project (if prompt changes)
- [ ] `docs/prompts-reference.md` updated if the reasoning behind a design decision changed
- [ ] `docs/faq.md` updated if a new user-facing workflow or edge case is covered
- [ ] `docs/install.md` updated if setup or installation steps changed
- [ ] `CHANGELOG.md` entry added under `## [Unreleased]`
