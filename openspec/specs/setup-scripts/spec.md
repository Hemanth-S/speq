# setup-scripts Specification

## Purpose
Provide cross-platform setup scripts (Bash for Mac/Linux, PowerShell for
Windows) that check for and install all speq dependencies, enabling a
developer to go from zero to a working `speq` CLI in under 5 minutes.

## Codebase references
- Tables/collections: none
- APIs called or extended: npm registry (for global installs)
- Services/modules reused: `docs/install.md` — current manual install steps as reference
- New schema required: `setup.sh` (Bash script), `setup.ps1` (PowerShell script)

## Requirements

### Requirement: Bash Setup Script
The setup script SHALL check for and install all dependencies on macOS and Linux.

#### Scenario: All dependencies already present [P1]
- GIVEN Node.js >= 18 is installed
- AND   `speq` is already installed globally via npm
- AND   `@beads/bd` is already installed globally via npm
- AND   `claude` is in PATH
- WHEN  the user runs `./setup.sh`
- THEN  the script prints a checkmark for each dependency found
- AND   prints "All dependencies satisfied. speq is ready to use."
- AND   exits with code 0

#### Scenario: Node.js missing [P2]
- GIVEN Node.js is not installed
- WHEN  the user runs `./setup.sh`
- THEN  the script prints "Node.js >= 18 is required but not found."
- AND   prints installation instructions for the current platform (brew for macOS, package manager for Linux)
- AND   exits with code 1

#### Scenario: Node.js version too old [P2]
- GIVEN Node.js is installed but version is < 18
- WHEN  the user runs `./setup.sh`
- THEN  the script prints "Node.js >= 18 is required. Found: <version>"
- AND   prints upgrade instructions
- AND   exits with code 1

#### Scenario: speq and bd not installed [P1]
- GIVEN Node.js >= 18 is installed
- AND   neither `speq` nor `@beads/bd` is installed globally
- WHEN  the user runs `./setup.sh`
- THEN  the script installs `speq` globally via `npm install -g speq`
- AND   installs `@beads/bd` globally via `npm install -g @beads/bd`
- AND   verifies both are in PATH after installation
- AND   prints a summary of what was installed

#### Scenario: Script is idempotent [P1]
- GIVEN `./setup.sh` has already been run successfully
- WHEN  the user runs `./setup.sh` again
- THEN  the script detects all dependencies are present
- AND   does not reinstall anything
- AND   exits with code 0

#### Scenario: npm registry unavailable [P2]
- GIVEN Node.js >= 18 is installed
- AND   the npm registry is unreachable
- WHEN  the user runs `./setup.sh`
- THEN  the script prints the npm error output
- AND   prints "npm install failed. Check your network connection and try again."
- AND   exits with code 1

#### Scenario: Setup script prevents command injection [P0]
- GIVEN the script is run from a directory path containing shell metacharacters
- WHEN  the user runs `./setup.sh`
- THEN  all directory paths are properly quoted in the script
- AND   no injected commands are executed

### Requirement: PowerShell Setup Script
The setup script SHALL perform equivalent dependency checks and installs on Windows.

#### Scenario: All dependencies already present on Windows [P1]
- GIVEN Node.js >= 18 is installed on Windows
- AND   `speq` is already installed globally via npm
- AND   `@beads/bd` is already installed globally via npm
- WHEN  the user runs `.\setup.ps1`
- THEN  the script prints a checkmark for each dependency found
- AND   prints "All dependencies satisfied. speq is ready to use."
- AND   exits with code 0

#### Scenario: Node.js missing on Windows [P2]
- GIVEN Node.js is not installed on Windows
- WHEN  the user runs `.\setup.ps1`
- THEN  the script prints "Node.js >= 18 is required but not found."
- AND   prints "Install from https://nodejs.org or via winget: winget install OpenJS.NodeJS.LTS"
- AND   exits with code 1

#### Scenario: Install dependencies on Windows [P1]
- GIVEN Node.js >= 18 is installed on Windows
- AND   neither `speq` nor `@beads/bd` is installed globally
- WHEN  the user runs `.\setup.ps1`
- THEN  the script installs `speq` globally via `npm install -g speq`
- AND   installs `@beads/bd` globally via `npm install -g @beads/bd`
- AND   verifies both are available after installation
- AND   prints a summary of what was installed

#### Scenario: PowerShell script prevents injection [P0]
- GIVEN the script is run from a directory path containing PowerShell special characters
- WHEN  the user runs `.\setup.ps1`
- THEN  all paths use proper PowerShell quoting
- AND   no injected commands are executed
