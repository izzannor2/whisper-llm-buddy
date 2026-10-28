# LocalDev AI - PowerShell Setup Script (Windows)
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (Test-Path "bin\node\node.exe") {
    $env:PATH = "$(Join-Path (Get-Location) 'bin\node');$env:PATH"
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       LocalDev AI - Quick Setup          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Node.js
Write-Host "[1/6] Checking Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "      [!] Node.js not found - installing..." -ForegroundColor Yellow
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Host "      [*] Installing via winget..."
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "      [*] Downloading Node.js installer..."
        $msiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $msiPath = "$env:TEMP\nodejs_install.msi"
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath
        Write-Host "      [*] Running installer..."
        Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /qn /norestart" -Wait
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    }
    $env:PATH = "$env:ProgramFiles\nodejs;$env:LOCALAPPDATA\Programs\nodejs;$env:PATH"
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "      [ERROR] Node.js install failed. Install manually: https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    Write-Host "      [OK] Node.js installed!" -ForegroundColor Green
}
Write-Host "      [OK] Node.js $(node --version)" -ForegroundColor Green

# Step 2: Dependencies
Write-Host "[2/6] Installing dependencies..."
if (-not (Test-Path "node_modules")) {
    if (Test-Path "package-lock.json") { npm ci } else { npm install }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      [!] Retrying..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
        if (Test-Path "package-lock.json") { npm ci } else { npm install }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "      [ERROR] Dependency installation failed. Run REPAIR-APP.bat." -ForegroundColor Red
            exit 1
        }
    }
}
Write-Host "      [OK] Dependencies ready" -ForegroundColor Green

# Step 3: Ollama
Write-Host "[3/6] Checking Ollama..."
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd -and (Test-Path "bin\ollama\ollama.exe")) {
    $ollamaCmd = Get-Item "bin\ollama\ollama.exe"
}
if (-not $ollamaCmd) {
    Write-Host "      [!] Ollama not found - installing..." -ForegroundColor Yellow
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
        $env:PATH = "$env:LOCALAPPDATA\Programs\Ollama;$env:PATH"
    } else {
        Write-Host "      [!] Install Ollama manually: https://ollama.com/download" -ForegroundColor Yellow
    }
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
}

if ($ollamaCmd) {
    Write-Host "      [OK] Ollama found" -ForegroundColor Green
    Write-Host "      [INFO] Setup does NOT auto-pull models. After RUN-ALL.bat starts Ollama," -ForegroundColor Yellow
    Write-Host "             run scripts\advanced\PULL-DEFAULT-MODEL.bat to fetch qwen2.5:3b." -ForegroundColor Yellow
} else {
    Write-Host "      [*] Ollama not available - install Ollama or configure a GGUF model." -ForegroundColor Yellow
}

# Step 4: Directories (canonical paths matching RUN-ALL.bat)
Write-Host "[4/6] Setting up directories..."
@(".ollama", "models\gguf", "bin\llama", "bin\ollama", "bin\node", "config", "logs", "public\updates", "projects\3d") | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}
Write-Host "      [OK] Directories ready" -ForegroundColor Green

# Step 5: Check GGUF models
Write-Host "[5/6] Checking local models..."
$ggufModel = Get-ChildItem -Path "models\gguf" -Filter "*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ggufModel) {
    Write-Host "      [OK] Found: $($ggufModel.Name)" -ForegroundColor Green
} else {
    Write-Host "      [*] No GGUF models found (optional)" -ForegroundColor Yellow
}

# Step 6: Start
Write-Host "[6/6] Starting development server..."
Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " App: http://localhost:8080"
Write-Host " Press Ctrl+C to stop"
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

& "$env:COMSPEC" /c 'call RUN-ALL.bat'
exit $LASTEXITCODE
