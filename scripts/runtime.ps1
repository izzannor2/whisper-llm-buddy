param(
    [ValidateSet('start','setup','prepare','stop','repair','pull','check','service')]
    [string]$Action = 'start',
    [ValidateSet('all','ollama','llama','agent','web')][string]$Service = 'all',
    [switch]$Offline,
    [switch]$NoBrowser,
    [switch]$Reinstall
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $Root
$LogDir = Join-Path $Root 'logs'
$Node = $null
$Npm = $null
$Ports = @{ agent = 3847; web = 8080; ollama = 11434; llama = 8081 }

function Initialize-Folders {
    foreach ($dir in @('logs','config','.ollama','models/gguf','bin/node','bin/ollama','bin/llama','projects/3d','public/updates')) {
        New-Item -ItemType Directory -Path (Join-Path $Root $dir) -Force | Out-Null
    }
    $env:OLLAMA_MODELS = Join-Path $Root '.ollama'
    $env:OLLAMA_HOST = '127.0.0.1:11434'
}

function Find-Binary($Relative, $Name) {
    $portable = Join-Path $Root $Relative
    if (Test-Path -LiteralPath $portable -PathType Leaf) { return $portable }
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return $null
}

function Initialize-Node {
    $script:Node = Find-Binary 'bin/node/node.exe' 'node.exe'
    if (-not $Node) { throw 'Node.js not found. Install Node 20 LTS or run scripts\prepare-usb.bat.' }
    $env:PATH = "$(Split-Path $Node -Parent);$env:PATH"
    $script:Npm = Find-Binary 'bin/node/npm.cmd' 'npm.cmd'
    if (-not $Npm) { throw 'npm not found. Repair your Node installation or run scripts\prepare-usb.bat.' }
    $version = & $Node --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v20\.') { throw "Node 20 LTS required. Detected: $version ($Node)." }
    Write-Host "Node: $Node ($version)"
    Write-Host "npm: $Npm"
}

function Ensure-Dependencies {
    $required = @('node_modules/react/package.json','node_modules/react-dom/package.json','node_modules/vite/bin/vite.js','node_modules/express/package.json','node_modules/ws/package.json')
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Root $_)) })
    $stampPath = Join-Path $Root 'node_modules/.hub-install-stamp'
    $lock = Join-Path $Root 'package-lock.json'
    $fingerprint = if (Test-Path $lock) { (Get-FileHash $lock -Algorithm SHA256).Hash } else { (Get-FileHash 'package.json' -Algorithm SHA256).Hash }
    $stamp = if (Test-Path $stampPath) { (Get-Content $stampPath -Raw).Trim() } else { '' }
    if ($missing.Count -eq 0 -and $stamp -eq $fingerprint) { Write-Host '[OK] Dependencies match the lockfile.'; return }
    if ($Offline) {
        if ($missing.Count -gt 0) { throw 'Offline dependencies missing. Run scripts\prepare-usb.bat on a connected PC first.' }
        Write-Warning 'Offline mode: dependencies present, lockfile stamp unverified; no installation attempted.'
        return
    }
    $install = if (Test-Path $lock) { 'ci' } else { 'install' }
    Write-Host "Installing dependencies: npm $install (no model downloads)."
    & $Npm $install
    if ($LASTEXITCODE -ne 0) { throw "npm $install failed (exit $LASTEXITCODE). Check the output above." }
    Set-Content -LiteralPath $stampPath -Value $fingerprint
}

function Test-Service($Name) {
    try {
        $base = "http://127.0.0.1:$($Ports[$Name])"
        if ($Name -eq 'web') {
            $r = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 2
            return ($r.StatusCode -eq 200 -and $r.Content -match '<div\s+id=["'']root["'']')
        }
        $path = switch ($Name) { 'agent' { '/status' } 'ollama' { '/api/tags' } 'llama' { '/health' } }
        $r = Invoke-RestMethod "$base$path" -TimeoutSec 2
        switch ($Name) {
            'agent' { return ($null -ne $r.platform -and $r.capabilities -contains 'exec') }
            'ollama' { return ($null -ne $r.PSObject.Properties['models']) }
            'llama' { return ($r.status -eq 'ok') }
        }
    } catch { return $false }
    return $false
}

function Port-Owners($Port) {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($idValue in @($connections.OwningProcess | Sort-Object -Unique)) {
        Get-CimInstance Win32_Process -Filter "ProcessId=$idValue" -ErrorAction SilentlyContinue
    }
}

function Assert-Port-Free($Name) {
    $owners = @(Port-Owners $Ports[$Name])
    if ($owners.Count -gt 0) {
        foreach ($owner in $owners) { Write-Host "Port $($Ports[$Name]): PID $($owner.ProcessId) / $($owner.Name)" }
        throw "Port $($Ports[$Name]) is occupied but $Name is not healthy. Close the listed process or use STOP-PORTABLE-AI.bat for this project's services."
    }
}

function Get-ServiceCommand($Name) {
    switch ($Name) {
        'agent' { return @{ bin = $Node; args = @((Join-Path $Root 'server/index.cjs')) } }
        'web' {
            if ($Offline) {
                if (-not (Test-Path 'dist/index.html')) { throw 'dist/index.html missing. Run scripts\prepare-usb.bat first.' }
                return @{ bin = $Node; args = @((Join-Path $Root 'server/static.cjs')) }
            }
            return @{ bin = $Node; args = @((Join-Path $Root 'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','8080','--strictPort') }
        }
        'ollama' {
            $bin = Find-Binary 'bin/ollama/ollama.exe' 'ollama.exe'
            if ($bin) { return @{ bin = $bin; args = @('serve') } }
        }
        'llama' {
            $bin = Get-ChildItem (Join-Path $Root 'bin/llama') -Filter llama-server.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            $binPath = if ($bin) { $bin.FullName } else { Find-Binary 'bin/llama/llama-server.exe' 'llama-server.exe' }
            $model = Get-ChildItem (Join-Path $Root 'models/gguf') -Filter '*.gguf' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -First 1
            if ($binPath -and $model) { return @{ bin = $binPath; args = @('-m',$model.FullName,'--host','127.0.0.1','--port','8081') } }
        }
    }
    return $null
}

function Start-ServiceProcess($Name) {
    if (Test-Service $Name) { Write-Host "[OK] Reusing healthy $Name on :$($Ports[$Name])."; return }
    Assert-Port-Free $Name
    $command = Get-ServiceCommand $Name
    if (-not $command) { Write-Warning "$Name not configured. No binary/model downloaded; configure it manually."; return }
    Write-Host "Starting $Name. Output: logs/$Name.log"
    # Each service re-enters this same file. No generated launch scripts or cmd nesting.
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action service -Service $Name"
    if ($Offline) { $arguments += ' -Offline' }
    Start-Process -FilePath "$PSHOME/powershell.exe" -ArgumentList $arguments -WorkingDirectory $Root | Out-Null
    $seconds = if ($Name -eq 'llama') { 120 } else { 45 }
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        if (Test-Service $Name) { Write-Host "[OK] $Name ready on :$($Ports[$Name])."; return }
        Start-Sleep -Milliseconds 750
    } while ((Get-Date) -lt $deadline)
    $logPath = Join-Path $LogDir "$Name.log"
    if (Test-Path $logPath) { Get-Content $logPath -Tail 30 | Write-Host }
    throw "$Name failed readiness checks. See logs/$Name.log. Frontend/browser launch has been stopped."
}

function Stop-OwnedServices {
    # Stop only listeners belonging to this project, never all node.exe processes
    # or stale PIDs that might now belong to another application.
    foreach ($name in @('web','agent','ollama','llama')) {
        foreach ($owner in @(Port-Owners $Ports[$name])) {
            $owned = $owner.CommandLine -and $owner.CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0
            if ($name -eq 'ollama') {
                $recordPath = Join-Path $LogDir 'ollama-process.json'
                if (Test-Path $recordPath) {
                    $record = Get-Content $recordPath -Raw | ConvertFrom-Json
                    $owned = $record.pid -eq $owner.ProcessId -and $record.created -eq ([string]$owner.CreationDate) -and $record.root -eq $Root
                }
            }
            if ($owned) {
                Stop-Process -Id $owner.ProcessId -ErrorAction Stop
                Write-Host "[OK] Stopped $name PID $($owner.ProcessId) on :$($Ports[$name])."
            } else { Write-Warning "Left external $name untouched: PID $($owner.ProcessId), $($owner.Name)." }
        }
    }
}

function Download-Portable($Uri, $Destination, $Nested) {
    $stage = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
    New-Item -ItemType Directory $stage | Out-Null
    try {
        $archive = Join-Path $stage 'runtime.zip'
        Invoke-WebRequest $Uri -OutFile $archive -UseBasicParsing
        Expand-Archive $archive -DestinationPath (Join-Path $stage 'unpacked')
        $source = Join-Path $stage 'unpacked'
        if ($Nested) { $source = (Get-ChildItem $source -Directory | Select-Object -First 1).FullName }
        Copy-Item "$source/*" -Destination $Destination -Recurse -Force
    } finally { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}

$exitCode = 0
$transcript = $false
try {
    Initialize-Folders
    if ($Action -ne 'service') {
        Start-Transcript -Path (Join-Path $LogDir "$Action.log") -Append | Out-Null
        $transcript = $true
        Write-Host "AI Companion Hub | $Action | project: $Root"
    }
    if ($Action -eq 'stop') { Stop-OwnedServices }
    elseif ($Action -eq 'prepare') {
        Write-Host 'Downloads portable Node and Ollama and builds the app. Models are NOT downloaded.'
        if (-not (Test-Path 'bin/node/node.exe')) {
            Download-Portable 'https://nodejs.org/dist/v20.20.0/node-v20.20.0-win-x64.zip' (Join-Path $Root 'bin/node') $true
        }
        if (-not (Test-Path 'bin/ollama/ollama.exe')) {
            Download-Portable 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' (Join-Path $Root 'bin/ollama') $false
        }
        Initialize-Node
        Ensure-Dependencies
        & $Npm run build
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path 'dist/index.html')) { throw 'Portable build failed. See logs/prepare.log.' }
        Write-Host '[OK] Portable files prepared. Use RUN-ALL.bat; pull a model manually before offline use.'
    }
    elseif ($Action -eq 'pull') {
        $bin = Find-Binary 'bin/ollama/ollama.exe' 'ollama.exe'
        if (-not $bin) { throw 'Ollama missing. Run scripts\prepare-usb.bat or install Ollama.' }
        if (-not (Test-Service 'ollama')) { throw 'Start RUN-ALL.bat before pulling a model.' }
        Write-Warning 'Downloads qwen2.5:3b into the running Ollama instance. An external Ollama instance may use its own model folder.'
        & $bin pull 'qwen2.5:3b'
        if ($LASTEXITCODE -ne 0) { throw "Model pull failed (exit $LASTEXITCODE)." }
    }
    else {
        Initialize-Node
        if ($Action -eq 'repair') {
            Stop-OwnedServices
            foreach ($cache in @('node_modules/.vite','node_modules/.cache','dist/.vite')) {
                if (Test-Path $cache) { Remove-Item $cache -Recurse -Force }
            }
            if ($Reinstall -and (Test-Path 'node_modules')) { Remove-Item 'node_modules' -Recurse -Force }
            Ensure-Dependencies
            Write-Host '[OK] Safe caches repaired; models, projects, logs and settings preserved.'
        }
        elseif ($Action -eq 'service') {
            $command = Get-ServiceCommand $Service
            if (-not $command) { throw "$Service is not configured." }
            $env:PORT = [string]$Ports[$Service]
            # Record Ollama identity for safe stopping, including creation time.
            if ($Service -eq 'ollama') {
                $process = Start-Process $command.bin -ArgumentList 'serve' -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $LogDir 'ollama.log') -RedirectStandardError (Join-Path $LogDir 'ollama-error.log')
                $identity = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
                @{ pid = $process.Id; created = [string]$identity.CreationDate; root = $Root } | ConvertTo-Json | Set-Content (Join-Path $LogDir 'ollama-process.json')
                $process.WaitForExit()
                $process.Refresh()
                $exitCode = $process.ExitCode
            } else {
                $nativeArgs = $command.args
                # Native stderr is log data, not a terminating PowerShell error.
                $ErrorActionPreference = 'Continue'
                & $command.bin @nativeArgs 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "$Service.log") -Append
                $exitCode = $LASTEXITCODE
                $ErrorActionPreference = 'Stop'
            }
            if ($exitCode -ne 0) { Write-Host "[ERROR] $Service exited $exitCode." }
        }
        elseif ($Action -eq 'check') {
            foreach ($file in @('server/index.cjs','server/static.cjs','package-lock.json')) {
                if (-not (Test-Path $file)) { throw "Required file missing: $file" }
            }
            foreach ($name in @('agent','web','ollama','llama')) {
                $healthy = Test-Service $name
                Write-Host "$name :$($Ports[$name]) healthy=$healthy"
                foreach ($owner in @(Port-Owners $Ports[$name])) { Write-Host "  PID $($owner.ProcessId) / $($owner.Name)" }
            }
            Write-Host '[OK] Static wiring checked. Unavailable local services are not a functional pass.'
        }
        else {
            Ensure-Dependencies
            if ($Action -eq 'setup') { Write-Host '[OK] Setup complete. Run RUN-ALL.bat. Models must be added manually.' }
            else {
                $names = if ($Service -eq 'all') { @('ollama','llama','agent','web') } else { @($Service) }
                foreach ($name in $names) { Start-ServiceProcess $name }
                if ($Service -eq 'all') {
                    foreach ($path in @('/dev-server/status','/3d/status','/openscad/status','/updates/applied')) {
                        Invoke-RestMethod "http://127.0.0.1:3847$path" -TimeoutSec 10 | Out-Null
                        Write-Host "[OK] Agent endpoint $path"
                    }
                }
                if (-not $NoBrowser -and $names -contains 'web' -and (Test-Service 'web')) { Start-Process 'http://localhost:8080' }
                Write-Host '[OK] Requested configured services ready. No models were downloaded.'
            }
        }
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path $LogDir) { $_ | Out-String | Add-Content (Join-Path $LogDir 'startup-errors.log') }
    $exitCode = 1
} finally {
    if ($transcript) { Stop-Transcript | Out-Null }
}
exit $exitCode