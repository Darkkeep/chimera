$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Assert-Success([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE)." }
}
Get-Command python, node, npm.cmd -ErrorAction Stop | Out-Null
python -c "import sys; assert sys.version_info >= (3,11), 'Python 3.11 or newer is required'"
Assert-Success 'Python version check'
node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<12)) process.exit(1)"
Assert-Success 'Node.js version check (22.12 or newer required)'
python -m venv backend/.venv
Assert-Success 'Create Python environment'
& ./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Assert-Success 'Install backend dependencies'
npm.cmd ci --prefix frontend
Assert-Success 'Install frontend dependencies'
npm.cmd run build --prefix frontend
Assert-Success 'Build frontend'
Write-Host 'Setup complete. Run Start-Chimera.ps1 in two terminals, once with -Service Backend and once with -Service Frontend.'
