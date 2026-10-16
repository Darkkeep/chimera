param([Parameter(Mandatory = $true)][ValidateSet('Backend', 'Frontend')][string]$Service)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Service -eq 'Backend') {
    if (!(Test-Path backend/.venv/Scripts/python.exe)) { throw 'Run Install-Chimera.ps1 first.' }
    Set-Location backend
    & ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
} else {
    npm.cmd run dev --prefix frontend -- --host 127.0.0.1 --strictPort
}
if ($LASTEXITCODE -ne 0) { throw "$Service exited with code $LASTEXITCODE." }
