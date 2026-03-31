<#
.SYNOPSIS
    SC Hub Disruption Monitor - Startup Script
.DESCRIPTION
    Launches backend (FastAPI) and frontend (Vite) dev servers.
    Installs dependencies if needed. Safe to run repeatedly.
.PARAMETER BackendPort
    Port for FastAPI backend (default: 3101)
.PARAMETER FrontendPort
    Port for Vite frontend (default: 3100)
.PARAMETER SkipInstall
    Skip dependency installation
.PARAMETER BackendOnly
    Only start the backend
.PARAMETER FrontendOnly
    Only start the frontend
#>

param(
    [int]$BackendPort = 3101,
    [int]$FrontendPort = 3100,
    [switch]$SkipInstall,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }

# -- Helpers ----------------------------------------------------------

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("  " + ("-" * $msg.Length)) -ForegroundColor DarkGray
}

function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [XX] $msg" -ForegroundColor Red }
function Write-Info($msg)  { Write-Host "  ...  $msg" -ForegroundColor DarkGray }

function Test-Port([int]$Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $Port)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

function Wait-ForPort([int]$Port, [int]$TimeoutSec = 30) {
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
        $elapsed += 0.5
    }
    return $false
}

function Stop-PortProcess([int]$Port) {
    # Find and kill all processes listening on this port
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $killed = $false
    foreach ($conn in $connections) {
        $procId = $conn.OwningProcess
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc -and -not $proc.HasExited) {
            Write-Warn "Killing $($proc.ProcessName) (PID $procId) on port $Port"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            $killed = $true
        } else {
            Write-Info "Stale TCP entry for PID $procId on port $Port (process already gone)"
        }
    }
    if ($killed) {
        # Wait for OS to release the port
        $retries = 0
        while ($retries -lt 12 -and (Test-Port $Port)) {
            Start-Sleep -Milliseconds 500
            $retries++
        }
    }
}

function Test-PortBindable([int]$Port) {
    # Actually try to bind the port -- more reliable than TCP connect test
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

# -- Banner -----------------------------------------------------------

Write-Host ""
Write-Host "  +----------------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |  SC Hub Disruption Monitor                    |" -ForegroundColor DarkCyan
Write-Host "  |  Backend :$BackendPort  |  Frontend :$FrontendPort            |" -ForegroundColor DarkCyan
Write-Host "  +----------------------------------------------+" -ForegroundColor DarkCyan

# -- Prerequisite checks ----------------------------------------------

Write-Header "Checking prerequisites"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Err "Python not found. Install Python 3.10+ and add to PATH."
    exit 1
}
Write-Ok "Python: $(python --version 2>&1)"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Err "Node.js not found. Install Node.js 18+ and add to PATH."
    exit 1
}
Write-Ok "Node.js: $(node --version 2>&1)"

$pip = Get-Command pip -ErrorAction SilentlyContinue
if (-not $pip) {
    Write-Err "pip not found."
    exit 1
}
Write-Ok "pip available"

# -- Install dependencies ---------------------------------------------

if (-not $SkipInstall) {
    Write-Header "Installing dependencies"

    if (-not $FrontendOnly) {
        Write-Info "pip install -r backend/requirements.txt"
        try {
            & pip install -q -r "$Root\backend\requirements.txt" 2>&1 | Out-Null
            Write-Ok "Backend dependencies installed"
        } catch {
            Write-Err "Failed to install backend deps: $_"
            exit 1
        }
    }

    if (-not $BackendOnly) {
        Push-Location "$Root\frontend"
        try {
            if (-not (Test-Path "node_modules")) {
                Write-Info "npm install (first run)"
                & npm install 2>&1 | Out-Null
                Write-Ok "Frontend dependencies installed"
            } else {
                Write-Ok "Frontend node_modules present"
            }
        } catch {
            Write-Err "Failed to install frontend deps: $_"
            exit 1
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Info "Skipping dependency install (-SkipInstall)"
}

# -- Free ports -------------------------------------------------------

Write-Header "Preparing ports"

if (-not $FrontendOnly) {
    if (Test-Port $BackendPort) {
        Stop-PortProcess $BackendPort
    }
    if (-not (Test-PortBindable $BackendPort)) {
        Write-Err "Port $BackendPort not bindable. Free it or use -BackendPort <N>."
        exit 1
    }
    Write-Ok "Port $BackendPort available"
}

if (-not $BackendOnly) {
    if (Test-Port $FrontendPort) {
        Stop-PortProcess $FrontendPort
    }
    if (-not (Test-PortBindable $FrontendPort)) {
        Write-Err "Port $FrontendPort not bindable. Free it or use -FrontendPort <N>."
        exit 1
    }
    Write-Ok "Port $FrontendPort available"
}

# -- Launch services --------------------------------------------------

$backendPid = $null
$frontendPid = $null

# Detect Windows Terminal (wt.exe) for tabbed launch
$hasWT = $null -ne (Get-Command wt.exe -ErrorAction SilentlyContinue)

if ($hasWT) {
    Write-Header "Launching in Windows Terminal (tabbed)"

    # Write temp launcher scripts so wt doesn't need complex quoting
    $tempDir = Join-Path $env:TEMP "disruption-monitor-launcher"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    $beScript = Join-Path $tempDir "backend.ps1"
    $feScript = Join-Path $tempDir "frontend.ps1"

    if (-not $FrontendOnly) {
        @"
Set-Location "$Root"
Write-Host "Starting Backend on :$BackendPort ..." -ForegroundColor Cyan
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $BackendPort --reload
"@ | Set-Content -Path $beScript -Encoding UTF8
    }

    if (-not $BackendOnly) {
        @"
Set-Location "$Root\frontend"
Write-Host "Starting Frontend on :$FrontendPort ..." -ForegroundColor Cyan
npx vite --port $FrontendPort --host
"@ | Set-Content -Path $feScript -Encoding UTF8
    }

    # Build wt command: first tab + additional tabs with ;
    if (-not $FrontendOnly -and -not $BackendOnly) {
        # Both tabs
        & wt.exe new-tab --title "Disruption Monitor - Backend" powershell -NoExit -File $beScript `; new-tab --title "Disruption Monitor - Frontend" powershell -NoExit -File $feScript
    } elseif (-not $FrontendOnly) {
        & wt.exe new-tab --title "Disruption Monitor - Backend" powershell -NoExit -File $beScript
    } elseif (-not $BackendOnly) {
        & wt.exe new-tab --title "Disruption Monitor - Frontend" powershell -NoExit -File $feScript
    }

    Write-Info "Windows Terminal launched with named tabs"

} else {
    Write-Info "Windows Terminal (wt.exe) not found -- using separate windows"

    if (-not $FrontendOnly) {
        $beCmd = "Set-Location '$Root'; python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $BackendPort --reload"
        $backendProc = Start-Process powershell -ArgumentList "-NoExit", "-Command", $beCmd `
            -WindowStyle Normal -PassThru
        $backendPid = $backendProc.Id
    }

    if (-not $BackendOnly) {
        $feCmd = "Set-Location '$Root\frontend'; npx vite --port $FrontendPort --host"
        $frontendProc = Start-Process powershell -ArgumentList "-NoExit", "-Command", $feCmd `
            -WindowStyle Normal -PassThru
        $frontendPid = $frontendProc.Id
    }
}

# -- Verify services started -----------------------------------------

if (-not $FrontendOnly) {
    Write-Header "Verifying Backend (:$BackendPort)"
    Write-Info "Waiting for backend..."
    if (Wait-ForPort $BackendPort 20) {
        Write-Ok "Backend is live"
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$BackendPort/api/v1/health" -TimeoutSec 5
            Write-Ok "Health: status=$($health.status)"
            if ($health.claude_api.status -eq "connected") {
                Write-Ok "Claude API: connected (live scanning)"
            } else {
                Write-Info "Claude API: $($health.claude_api.status) (sample data mode)"
            }
        } catch {
            Write-Warn "Health check parse failed (service may still be OK)"
        }
    } else {
        Write-Err "Backend failed to start within 20s -- check the terminal tab"
    }
}

if (-not $BackendOnly) {
    Write-Header "Verifying Frontend (:$FrontendPort)"
    Write-Info "Waiting for frontend..."
    if (Wait-ForPort $FrontendPort 30) {
        Write-Ok "Frontend is live"
    } else {
        Write-Err "Frontend failed to start within 30s -- check the terminal tab"
    }
}

# -- Summary ----------------------------------------------------------

Write-Host ""
Write-Host "  +------------------------------------------------------+" -ForegroundColor Green
Write-Host "  |  SC Hub Disruption Monitor -- RUNNING                 |" -ForegroundColor Green
Write-Host "  |                                                       |" -ForegroundColor Green

if (-not $FrontendOnly) {
    $bLive = Test-Port $BackendPort
    $bDot = if ($bLive) { "[*]" } else { "[ ]" }
    Write-Host "  |  $bDot Backend API    http://localhost:$BackendPort           |" -ForegroundColor $(if ($bLive) { "Green" } else { "Red" })
    Write-Host "  |      Swagger UI    http://localhost:$BackendPort/docs       |" -ForegroundColor DarkGray
    Write-Host "  |      Health        http://localhost:$BackendPort/api/v1/health|" -ForegroundColor DarkGray
}
if (-not $BackendOnly) {
    $fLive = Test-Port $FrontendPort
    $fDot = if ($fLive) { "[*]" } else { "[ ]" }
    Write-Host "  |  $fDot Frontend App   http://localhost:$FrontendPort           |" -ForegroundColor $(if ($fLive) { "Green" } else { "Red" })
}

Write-Host "  |                                                       |" -ForegroundColor Green
if ($backendPid)  { Write-Host "  |  Backend PID:  $backendPid                                 |" -ForegroundColor DarkGray }
if ($frontendPid) { Write-Host "  |  Frontend PID: $frontendPid                                 |" -ForegroundColor DarkGray }
Write-Host "  |                                                       |" -ForegroundColor Green
Write-Host "  |  Close the spawned terminal windows to stop services. |" -ForegroundColor DarkGray
Write-Host "  +------------------------------------------------------+" -ForegroundColor Green
Write-Host ""

# -- Open browser -----------------------------------------------------

if (-not $BackendOnly -and (Test-Port $FrontendPort)) {
    Start-Process "http://localhost:$FrontendPort"
    Write-Ok "Opened browser to http://localhost:$FrontendPort"
}
