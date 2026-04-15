# speq setup script for Windows (PowerShell)
# Checks for and installs all dependencies needed to run speq.

$ErrorActionPreference = "Stop"
$RequiredNodeMajor = 18

function Write-Check($msg) { Write-Host "  $($msg.PadRight(40))" -NoNewline }
function Write-Ok($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

Write-Host "speq setup"
Write-Host "=========="
Write-Host ""

# --- Node.js ---
Write-Check "Node.js >= $RequiredNodeMajor"
try {
    $nodeVersion = & node --version 2>$null
    if ($nodeVersion) {
        $major = [int]($nodeVersion -replace '^v','').Split('.')[0]
        if ($major -ge $RequiredNodeMajor) {
            Write-Ok "found $nodeVersion"
        } else {
            Write-Fail "found $nodeVersion (need >= $RequiredNodeMajor)"
            Write-Host ""
            Write-Host "Node.js >= $RequiredNodeMajor is required. Found: $nodeVersion"
            Write-Host "Install from https://nodejs.org or via: winget install OpenJS.NodeJS.LTS"
            exit 1
        }
    } else {
        throw "not found"
    }
} catch {
    Write-Fail "not found"
    Write-Host ""
    Write-Host "Node.js >= $RequiredNodeMajor is required but not found."
    Write-Host "Install from https://nodejs.org or via: winget install OpenJS.NodeJS.LTS"
    exit 1
}

# --- npm ---
Write-Check "npm"
try {
    $npmVersion = & npm --version 2>$null
    if ($npmVersion) {
        Write-Ok "found $npmVersion"
    } else {
        throw "not found"
    }
} catch {
    Write-Fail "not found"
    Write-Host "npm is required. It should be included with Node.js."
    exit 1
}

# --- speq CLI ---
Write-Check "speq CLI"
try {
    $speqVersion = & speq --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $speqVersion) {
        Write-Ok "found $speqVersion"
    } else {
        throw "not found"
    }
} catch {
    Write-Host "installing..." -NoNewline
    & npm install -g "github:Hemanth-S/speq" 2>$null
    try {
        $speqVersion = & speq --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "installed $speqVersion"
        } else {
            throw "failed"
        }
    } catch {
        Write-Fail "installation failed"
        Write-Host "Failed to install speq. Check npm permissions."
        exit 1
    }
}

# --- Beads (bd) ---
Write-Check "Beads (bd)"
try {
    $bdVersion = & bd --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $bdVersion) {
        Write-Ok "found $($bdVersion | Select-Object -First 1)"
    } else {
        throw "not found"
    }
} catch {
    Write-Host "installing..." -NoNewline
    & npm install -g "@beads/bd" 2>$null
    try {
        $bdVersion = & bd --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "installed $($bdVersion | Select-Object -First 1)"
        } else {
            throw "failed"
        }
    } catch {
        Write-Fail "installation failed"
        Write-Host "Failed to install @beads/bd. Check npm permissions."
        exit 1
    }
}

# --- Claude Code ---
Write-Check "Claude Code CLI"
try {
    $null = & claude --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "found"
    } else {
        throw "not found"
    }
} catch {
    Write-Info "not found (optional for setup, required for speq commands)"
    Write-Info "Install from: https://claude.ai/code"
}

Write-Host ""
Write-Host "All dependencies satisfied. speq is ready to use." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  cd C:\path\to\your-project"
Write-Host "  speq init"
Write-Host "  speq requirements"
