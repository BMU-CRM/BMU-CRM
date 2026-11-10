# Restores the project to a saved version, after saving the current state.
# Usage: powershell -File scripts/restoreVersion.ps1 -Name ProjectSetup_1
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$versionsRoot = 'C:\Users\dhanu\.claude\projects\e--CRM-2-0\versions'
$source = Join-Path $versionsRoot $Name

if (-not (Test-Path -LiteralPath $source)) {
    throw "Version $Name was not found in $versionsRoot"
}

# Saved first, so that the revert itself can be undone.
$safetyName = 'BeforeRevert_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
& powershell -NoProfile -File (Join-Path $PSScriptRoot 'saveVersion.ps1') -Name $safetyName
if ($LASTEXITCODE -ne 0) {
    throw 'Could not save the current state, so nothing was restored.'
}

# /MIR also removes newer files. The exclusions keep these items untouched, including
# the database and uploaded files in .data.
robocopy $source $projectRoot /MIR /NFL /NDL /NJH /NJS /NP `
    /XD node_modules .next .git .vercel .temp coverage .data `
    /XF .env .env.local .env.development.local .env.production.local tsconfig.tsbuildinfo | Out-Null

if ($LASTEXITCODE -ge 8) {
    throw "Restore failed with robocopy code $LASTEXITCODE. The previous state is saved as $safetyName."
}

Write-Output "Restored $Name. The previous state is saved as $safetyName."
Write-Output 'Run npm install if dependencies changed. The database and files in .data were not changed.'
exit 0
