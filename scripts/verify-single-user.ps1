param(
    [string]$ApiUrl = "http://127.0.0.1:8000",
    [string]$ProjectId = "testframe-565c5da8",
    [string]$OutputDirectory = "$env:TEMP\chimera-single-user-verification"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function Get-Json($Path) {
    return Invoke-RestMethod -Uri "$ApiUrl$Path"
}

$health = Get-Json "/api/health"
$config = Get-Json "/api/installation/config"
if ($health.status -ne "ok") { throw "API health check failed" }
if ($config.deploymentMode -ne "single-user" -or $config.identityProvider -ne "local") {
    throw "Installation is not configured for single-user local identity"
}

$project = Get-Json "/api/projects/$ProjectId"
$healthReport = Get-Json "/api/projects/$ProjectId/validation?target=production"

$backupPath = Join-Path $OutputDirectory "project-backup.zip"
$wordPath = Join-Path $OutputDirectory "storyboard.docx"
Invoke-WebRequest "$ApiUrl/api/projects/$ProjectId/backup.zip" -OutFile $backupPath | Out-Null
Invoke-WebRequest "$ApiUrl/api/projects/$ProjectId/storyboard.docx" -OutFile $wordPath | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$backupArchive = [System.IO.Compression.ZipFile]::OpenRead($backupPath)
try {
    $manifestEntry = $backupArchive.GetEntry("manifest.json")
    if ($null -eq $manifestEntry) { throw "Backup manifest.json is missing" }
    $manifestReader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try { $manifest = $manifestReader.ReadToEnd() | ConvertFrom-Json } finally { $manifestReader.Dispose() }
    if ($manifest.projectId -ne $ProjectId) { throw "Backup manifest project does not match the requested project" }
} finally {
    $backupArchive.Dispose()
}
if ((Get-Item $wordPath).Length -lt 1024) { throw "Word export is unexpectedly small" }

$scormStatus = "blocked by production validation"
try {
    $scormPath = Join-Path $OutputDirectory "scorm12.zip"
    Invoke-WebRequest "$ApiUrl/api/projects/$ProjectId/scorm-12.zip" -OutFile $scormPath | Out-Null
    $scormStatus = "built"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 422) { throw }
}

[pscustomobject]@{
    ApiHealth = $health.status
    DeploymentMode = $config.deploymentMode
    IdentityProvider = $config.identityProvider
    Project = $project.title
    Revision = $project.storyboard.revision
    SceneCount = $project.sceneCount
    ProductionValidation = if ($healthReport.passed) { "passed" } else { "blocked" }
    BackupBytes = (Get-Item $backupPath).Length
    BackupManifest = "valid"
    WordBytes = (Get-Item $wordPath).Length
    Scorm12 = $scormStatus
    OutputDirectory = $OutputDirectory
} | Format-List
