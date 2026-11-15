# Compatibility entry point; setup logic is shared with setup.bat.
& (Join-Path $PSScriptRoot 'runtime.ps1') -Action setup @args
exit $LASTEXITCODE
