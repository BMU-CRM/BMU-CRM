# Saves a snapshot of the project as TaskName_VersionNumber.
# Usage: powershell -File scripts/saveVersion.ps1 -Name ProjectSetup_1
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = 'Stop'

if ($Name -notmatch '^[A-Za-z][A-Za-z0-9]*_\d+$' -and $Name -notmatch '^BeforeRevert_\d+_\d+$') {
    throw "Version name must look like TaskName_1. Got: $Name"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$versionsRoot = 'C:\Users\dhanu\.claude\projects\e--CRM-2-0\versions'
$target = Join-Path $versionsRoot $Name

if (Test-Path -LiteralPath $target) {
    throw "Version $Name already exists. Use the next version number."
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

# Git history, secrets, installed packages, build output and the local database and
# files in .data are never copied.
robocopy $projectRoot $target /E /NFL /NDL /NJH /NJS /NP `
    /XD node_modules .next .git .vercel .temp coverage .data `
    /XF .env .env.local .env.development.local .env.production.local tsconfig.tsbuildinfo | Out-Null

if ($LASTEXITCODE -ge 8) {
    throw "Copy failed with robocopy code $LASTEXITCODE"
}

$fileCount = (Get-ChildItem -LiteralPath $target -Recurse -File | Measure-Object).Count
Write-Output "Saved $Name ($fileCount files) to $target"
exit 0
