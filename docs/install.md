# Installing speq

## Prerequisites
- Node.js >= 18
- Git
- Claude Code (claude.ai/code or the Claude desktop app)

## Automated setup

### macOS / Linux

```bash
curl -sL https://raw.githubusercontent.com/Hemanth-S/speq/main/setup.sh | bash
```

Or clone and run locally:
```bash
git clone https://github.com/Hemanth-S/speq.git
./speq/setup.sh
```

The script checks for Node.js >= 18, installs `speq` and `@beads/bd`
globally via npm, and verifies `claude` is available.

### Windows (PowerShell)

```powershell
git clone https://github.com/Hemanth-S/speq.git
.\speq\setup.ps1
```

The script performs the same checks and installs as the Bash version.

## Manual setup

```bash
npm install -g github:Hemanth-S/speq
npm install -g @beads/bd
```

Verify:
```bash
speq --version
bd --version
```

## Initialise a project

```bash
cd /path/to/your-project
speq init
```

This does three things:
1. Creates `.claude/commands/` and copies all 8 command prompt files
2. Amends `CLAUDE.md` with speq instructions (using `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers — safe to run repeatedly)
3. Runs `bd init` if `.beads/` does not already exist

Commit `.claude/commands/` and `CLAUDE.md` to your repo so every
contributor and worktree has them.

## Verify setup

From your project directory:
```bash
speq --help          # should list all commands
speq requirements    # should start the requirements conversation
```

Or open Claude Code and run:
```
/requirements
```
Claude should start asking about your codebase.
