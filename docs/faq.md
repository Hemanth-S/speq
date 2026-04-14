# FAQ

## Can I use speq on an existing project with code already written?

Yes — this is the primary use case. The `/project:requirements` and
`/project:enrich` commands both start by scanning your codebase to
understand what already exists. Specs and tasks are generated relative to
your current code, not from a blank slate. You will not get tasks to
rebuild things that already work.

## What if my project does not use Beads / bd?

Beads (`bd`) is the task tracker speq uses to manage the TDD loop. If you
do not have it installed, the `/project:plan` command will install it for
you (`npm install -g @beads/bd`). Beads stores tasks locally in a `.beads`
directory — it does not require a server, account, or API key.

If you prefer a different task tracker, you would need to modify the
`plan.md`, `implement.md`, `verify.md`, and `done.md` commands to use your
tool's CLI instead of `bd`.

## What if I do not have any tests yet?

That is fine. The `/project:implement` command follows strict TDD — it
writes the first test before writing any implementation code. It will
detect your project's language and framework and use the appropriate test
runner. If no test configuration exists, it will set one up.

## What if the codebase scan finds nothing (empty project)?

The requirements and enrich commands will note that the project is empty
and adjust accordingly. The PRD will not have a Codebase Integration
section with existing tables or APIs, and specs will define everything as
new. The workflow still works — you just get a PRD and specs that describe
a greenfield build.

## Can I run just one phase instead of the full pipeline?

Yes. Every command is independent:

- `/project:requirements` — just gather requirements and write PRD.md
- `/project:enrich` — just ground an existing PRD in the codebase
- `/project:spec` — just generate specs from PRD.md
- `/project:plan` — just create the task graph from specs
- `/project:implement` — just run the TDD loop on existing tasks
- `/project:verify` — just run the pre-ship gate checks
- `/project:done` — just close the feature cycle

`/project:ship` is the only command that chains them all together.

## How do I add or modify a command?

Each command is a Markdown file in `.claude/commands/`. Edit the file
directly — the format is a YAML frontmatter block with a `description`
field, followed by the prompt body in Markdown.

Test your change by running the command on a real project. See
CONTRIBUTING.md for the full PR checklist.

## Does speq work with monorepos?

It works at the directory level. If your monorepo has separate services in
subdirectories, run speq from the specific service directory you are
working on. The codebase scan will scope to the current directory. If your
feature spans multiple services, you may need to run speq once per service
or adjust the scan paths in the requirements/enrich commands.

## What does speq do if bd commands fail?

If a `bd` command fails (e.g., `bd create` returns an error), the
implement loop stops and reports the exact error to the user. It does not
retry automatically or skip the task. Fix the issue and re-run the command
to continue.

## Do I need an Anthropic API key?

You need Claude Code, which requires an Anthropic account. speq itself does
not make API calls — it is a set of prompts that run inside Claude Code.
Your Claude Code subscription or API key handles the model access.
