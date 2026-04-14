# Installing speq

## Prerequisites
- Git
- Node.js >= 18 (required for Beads)
- Claude Code (claude.ai/code or the Claude desktop app)

## Setup (one-time, per project)

1. Clone speq:
     git clone https://github.com/<your-username>/speq.git

2. Copy the commands into your project:
     cp -r speq/.claude /path/to/your-project/
     cp speq/CLAUDE.md /path/to/your-project/

3. Install Beads:
     npm install -g @beads/bd
     bd --version   # confirm it works

4. Open your project in Claude Code and verify the commands appear:
     /project:  (tab to see all available commands)

## Verify setup
Open Claude Code in your project and run:
  /project:requirements "test feature"
Claude should start asking about your codebase.
