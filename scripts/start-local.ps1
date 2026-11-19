param([ValidateSet('Backend','Frontend')][string]$Service)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
if ($Service -eq 'Backend') {
    $env:CHIMERA_WORKSPACE = Join-Path $repo 'workspace/local-activation'
    $env:CHIMERA_DEPLOYMENT_PROFILE = 'local'
    & (Join-Path $repo 'backend/.venv/Scripts/python.exe') -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8002
} else {
    $env:VITE_CHIMERA_STUDIO_ENABLED = 'true'
    & node (Join-Path $repo 'frontend/node_modules/vite/bin/vite.js') --config scripts/vite.local.mjs
}
exit $LASTEXITCODE
