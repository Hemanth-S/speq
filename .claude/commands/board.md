---
description: Render the live sprint board — pipeline state, Beads issues, config, and cost — to .speq/board.html
---

You are rendering the speq sprint board for the current project.

## Step 1 — Render the board

Run: speq board

Expected output: `Board written to .speq/board.html`
Exit code: 0

If `speq: command not found`, tell the user to install/build speq first
(`npm install -g speq` or, in this repo, `npm run build && npm link`)
and stop.

If the command exits non-zero, surface the stderr message verbatim and stop.
Do not attempt to repair or retry.

## Step 2 — Report the path

Print one line:

  Sprint board: <absolute path to .speq/board.html>

Use the absolute path so the user can click it or paste it into a browser.

## Step 3 — Offer to open it

Ask the user: "Open in browser? (y/n)"

If they answer yes:
  - macOS:  open .speq/board.html
  - Linux:  xdg-open .speq/board.html
  - Windows: start .speq/board.html

If they answer no, stop. The file persists at the same path — they can
re-render any time with /board.

## Notes

- The board reads `.speq/runs/`, `speq.config.yaml`, and `bd list` output.
  If any of those are missing the board renders what it can and surfaces
  the gap inline — no crash.
- The HTML is self-contained (inlined CSS, no external resources). Safe
  to open offline. Contains no secrets — `process.env` is never serialised.
- Re-run /board to refresh after a pipeline step completes or after
  editing `speq.config.yaml`.
