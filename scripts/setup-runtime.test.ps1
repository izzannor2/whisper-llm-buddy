# Behavior tests against actual runtime functions without starting local services.
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'runtime.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
foreach ($name in @('Test-Service','Ensure-Dependencies','Stop-OwnedServices')) {
    $definition = $ast.Find({ param($item) $item -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq $name }, $true)
    Invoke-Expression $definition.Extent.Text
}
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message }; Write-Host "PASS: $Message" }
$Ports = @{ agent = 3847; web = 8080; ollama = 11434; llama = 8081 }
function Invoke-RestMethod { return $script:Response }
function Invoke-WebRequest { return $script:WebResponse }
$Response = [pscustomobject]@{ error = 'not an agent' }
Assert (-not (Test-Service 'agent')) 'Wrong service on agent port is rejected'
$Response = [pscustomobject]@{ platform = 'win32'; capabilities = @('exec','file') }
Assert (Test-Service 'agent') 'Real agent status schema accepted'
$Response = [pscustomobject]@{ models = @() }
Assert (Test-Service 'ollama') 'Empty real Ollama registry is healthy, not fabricated'
$Response = [pscustomobject]@{ status = 'loading model' }
Assert (-not (Test-Service 'llama')) 'Loading llama.cpp is not reported ready'
$WebResponse = [pscustomobject]@{ StatusCode = 200; Content = '<html>Unrelated service</html>' }
Assert (-not (Test-Service 'web')) 'Unrelated HTTP 200 is not accepted as app'
$WebResponse = [pscustomobject]@{ StatusCode = 200; Content = '<div id="root"></div>' }
Assert (Test-Service 'web') 'App mount point accepted'

$Root = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory $Root | Out-Null
$original = Get-Location
try {
    Set-Location $Root
    Set-Content 'package-lock.json' '{}'
    $Offline = $true
    $rejected = $false
    try { Ensure-Dependencies } catch { $rejected = $_.Exception.Message -match 'Offline dependencies missing' }
    Assert $rejected 'Offline setup rejects missing dependencies without installing'
    foreach ($file in @('react/package.json','react-dom/package.json','vite/bin/vite.js','express/package.json','ws/package.json')) {
        $full = Join-Path $Root "node_modules/$file"
        New-Item -ItemType Directory (Split-Path $full) -Force | Out-Null
        Set-Content $full '{}'
    }
    Ensure-Dependencies
    Assert (-not (Test-Path 'node_modules/.hub-install-stamp')) 'Offline unverified dependencies are not falsely stamped'

    $LogDir = Join-Path $Root 'logs'
    New-Item -ItemType Directory $LogDir | Out-Null
    $script:Stopped = @()
    function Port-Owners($Port) {
        if ($Port -eq 8080) { [pscustomobject]@{ ProcessId = 101; CommandLine = "node $Root/server/static.cjs"; Name = 'node.exe' } }
        if ($Port -eq 3847) { [pscustomobject]@{ ProcessId = 202; CommandLine = 'node /another/app/server.cjs'; Name = 'node.exe' } }
    }
    function Stop-Process { param($Id, $ErrorAction) $script:Stopped += $Id }
    Stop-OwnedServices
    Assert ($Stopped.Count -eq 1 -and $Stopped[0] -eq 101) 'Stop kills only this project listener, leaving other Node apps untouched'
} finally {
    Set-Location $original
    Remove-Item $Root -Recurse -Force
}
Write-Host 'Runtime behavior tests PASS'