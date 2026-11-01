param(
    [string]$PythiaRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) '..\Pythia'),
    [ValidateRange(1024, 65535)][int]$Port = 8001,
    [switch]$EnableImages,
    [switch]$EnableMedia,
    [string]$ImageCredentialFile = (Join-Path $env:USERPROFILE '.pythia\analysis-api-key.credential'),
    [string]$ImageProjectId = $env:PYTHIA_MEX_PROJECT_ID,
    [string]$ImageModel = 'gpt-image-1.5'
)
$ErrorActionPreference = 'Stop'
$PythiaRoot = (Resolve-Path -LiteralPath $PythiaRoot).Path
$python = Join-Path $PythiaRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath (Join-Path $PythiaRoot 'service\app.py'))) {
    throw 'A Pythia checkout with its prepared Python environment is required. Supply -PythiaRoot if it is elsewhere.'
}
$endpoint = "http://127.0.0.1:$Port"
$headers = @{}
if ($env:CHIMERA_PYTHIA_API_KEY) { $headers.Authorization = "Bearer $env:CHIMERA_PYTHIA_API_KEY" }
function Test-PythiaEngine {
    try {
        $health = Invoke-RestMethod "$endpoint/health" -Headers $headers -TimeoutSec 2
        $capabilities = Invoke-RestMethod "$endpoint/capabilities" -Headers $headers -TimeoutSec 2
        return ($health.status -eq 'ok' -and $null -ne $health.contract_version -and $null -ne $capabilities.capabilities)
    } catch { return $false }
}
if (Test-PythiaEngine) {
    if ($EnableImages -or $EnableMedia) {
        $imageStatus = Invoke-RestMethod "$endpoint/media/images/status" -Headers $headers -TimeoutSec 3
        if (-not $imageStatus.configured) { throw 'Pythia is running without images enabled. Restart it with -EnableImages; no process was changed.' }
    }
    if ($EnableMedia) {
        $mediaStatus = Invoke-RestMethod "$endpoint/media/status" -Headers $headers -TimeoutSec 3
        if (-not $mediaStatus.configured) { throw 'Pythia is running without scene/audio/video enabled. Restart it with -EnableMedia; no process was changed.' }
    }
    Write-Output "Pythia Engine is already available at $endpoint"; exit 0
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
    throw "Port $Port is occupied, but the Pythia Engine check failed. Check the service and server-side authentication; no process was changed."
}
$logRoot = Join-Path $env:LOCALAPPDATA 'Chimera\logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$errorLog = Join-Path $logRoot "pythia-$stamp-error.log"
$taskImageNames = @('PYTHIA_MEX_IMAGE_ENABLED','PYTHIA_MEX_MEDIA_ENABLED','PYTHIA_MEX_API_KEY','PYTHIA_MEX_IMAGE_MODEL','PYTHIA_MEX_PROJECT_ID')
$taskImagePrevious = @{}
foreach ($taskName in $taskImageNames) { $taskImagePrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName,'Process') }
$taskSecure = $null
$taskPointer = [IntPtr]::Zero
try {
    if ($EnableImages -or $EnableMedia) {
        if (-not $env:PYTHIA_MEX_API_KEY) {
            if (-not (Test-Path -LiteralPath $ImageCredentialFile)) { throw 'Supply the existing encrypted image credential file or PYTHIA_MEX_API_KEY; never paste a key into a command.' }
            $taskSecure = ConvertTo-SecureString -String (Get-Content -LiteralPath $ImageCredentialFile -Raw)
            $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
            $env:PYTHIA_MEX_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
        }
        $env:PYTHIA_MEX_IMAGE_ENABLED = '1'
        if ($EnableMedia) { $env:PYTHIA_MEX_MEDIA_ENABLED = '1' }
        $env:PYTHIA_MEX_IMAGE_MODEL = $ImageModel
        if ($ImageProjectId) { $env:PYTHIA_MEX_PROJECT_ID = $ImageProjectId }
    }
    $process = Start-Process -FilePath $python -WorkingDirectory $PythiaRoot -ArgumentList @('-m', 'uvicorn', 'service.app:create_app', '--factory', '--host', '127.0.0.1', '--port', "$Port") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "pythia-$stamp.log") -RedirectStandardError $errorLog
}
finally {
    foreach ($taskName in $taskImageNames) { [Environment]::SetEnvironmentVariable($taskName,$taskImagePrevious[$taskName],'Process') }
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    if ($null -ne $taskSecure) { $taskSecure.Dispose() }
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (Test-PythiaEngine) {
        Write-Output "Pythia Engine is available at $endpoint (PID $($process.Id))."
        Write-Output 'Chimera uses port 8001 by default. For another port, set CHIMERA_PYTHIA_BASE_URL in the Chimera backend environment before starting it.'
        Write-Output 'Connection health does not verify live model generation. Open Settings > Pythia, then test an author-reviewed request.'
        exit 0
    }
    if ($process.HasExited) { throw "Pythia exited during startup. Inspect $errorLog locally." }
    Start-Sleep -Milliseconds 500
}
throw "Pythia did not pass its Engine check. Inspect $errorLog locally. PID $($process.Id) was left available for diagnosis."
