#!/usr/bin/env bash
set -euo pipefail

# speq setup script for macOS and Linux
# Checks for and installs all dependencies needed to run speq.

REQUIRED_NODE_MAJOR=18

print_check() { printf "  %-40s" "$1"; }
print_ok()    { echo "✓ $1"; }
print_fail()  { echo "✗ $1"; }
print_info()  { echo "  $1"; }

echo "speq setup"
echo "=========="
echo ""

# --- Node.js ---
print_check "Node.js >= ${REQUIRED_NODE_MAJOR}"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node --version)"
  NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ]; then
    print_ok "found $NODE_VERSION"
  else
    print_fail "found $NODE_VERSION (need >= $REQUIRED_NODE_MAJOR)"
    echo ""
    echo "Node.js >= ${REQUIRED_NODE_MAJOR} is required. Found: ${NODE_VERSION}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "Install via: brew install node"
    else
      echo "Install via: https://nodejs.org or your package manager"
    fi
    exit 1
  fi
else
  print_fail "not found"
  echo ""
  echo "Node.js >= ${REQUIRED_NODE_MAJOR} is required but not found."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Install via: brew install node"
  else
    echo "Install via: https://nodejs.org or your package manager (e.g., apt install nodejs)"
  fi
  exit 1
fi

# --- npm ---
print_check "npm"
if command -v npm >/dev/null 2>&1; then
  print_ok "found $(npm --version)"
else
  print_fail "not found"
  echo "npm is required. It should be included with Node.js."
  exit 1
fi

# --- speq CLI ---
print_check "speq CLI"
if command -v speq >/dev/null 2>&1; then
  print_ok "found $(speq --version 2>/dev/null || echo 'installed')"
else
  echo "installing..."
  npm install -g github:Hemanth-S/speq
  if command -v speq >/dev/null 2>&1; then
    print_ok "installed $(speq --version 2>/dev/null || echo 'ok')"
  else
    print_fail "installation failed"
    echo "Failed to install speq. Check npm permissions."
    exit 1
  fi
fi

# --- Beads (bd) ---
print_check "Beads (bd)"
if command -v bd >/dev/null 2>&1; then
  print_ok "found $(bd --version 2>/dev/null | head -1)"
else
  echo "installing..."
  npm install -g @beads/bd
  if command -v bd >/dev/null 2>&1; then
    print_ok "installed $(bd --version 2>/dev/null | head -1)"
  else
    print_fail "installation failed"
    echo "Failed to install @beads/bd. Check npm permissions."
    exit 1
  fi
fi

# --- Claude Code ---
print_check "Claude Code CLI"
if command -v claude >/dev/null 2>&1; then
  print_ok "found"
else
  print_info "not found (optional for setup, required for speq commands)"
  print_info "Install from: https://claude.ai/code"
fi

echo ""
echo "All dependencies satisfied. speq is ready to use."
echo ""
echo "Next steps:"
echo "  cd /path/to/your-project"
echo "  speq init"
echo "  speq requirements"
