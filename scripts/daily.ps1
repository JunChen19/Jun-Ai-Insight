# Local fallback for the daily fetch.
#
# GitHub Actions is the primary scheduler, but it runs from a datacenter IP and
# can be blocked or rate-limited by some sources. This script is the local
# backup: run it manually or wire it to Windows Task Scheduler.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\daily.ps1
#
# Register a daily task (run once, as your own user):
#   schtasks /Create /TN "AI Tech Insight daily" /SC DAILY /ST 08:30 ^
#     /TR "powershell -ExecutionPolicy Bypass -File D:\SpecialForce\CodeHub\Insight\scripts\daily.ps1"

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Corporate proxy lives in .npmrc; the pipeline reads HTTPS_PROXY directly.
$npmrc = Join-Path $env:USERPROFILE '.npmrc'
if (Test-Path $npmrc) {
    $proxyLine = Select-String -Path $npmrc -Pattern '^proxy=' | Select-Object -First 1
    if ($proxyLine) {
        $proxy = $proxyLine.Line -replace '^proxy=', ''
        $env:HTTPS_PROXY = $proxy
        $env:HTTP_PROXY = $proxy
        Write-Host "proxy: configured"
    }
}

# The corporate proxy re-signs TLS with an internal CA that Node does not trust.
if ($env:NODE_TLS_REJECT_UNAUTHORIZED -eq $null) {
    $env:NODE_TLS_REJECT_UNAUTHORIZED = '0'
    Write-Host "warning: TLS verification disabled for this run (internal CA)"
}

Write-Host "=== fetch ==="
node pipeline/build.mjs
$fetchExit = $LASTEXITCODE

Write-Host "=== build ==="
npm run build
$buildExit = $LASTEXITCODE

if ($fetchExit -ne 0) {
    Write-Host "pipeline exited $fetchExit - check src/data/health.json"
}
if ($buildExit -ne 0) {
    Write-Host "build failed"
    exit $buildExit
}

Write-Host "=== push ==="
git add src/data/live.json src/data/health.json
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "no data changes"
    exit 0
}

git -c user.name="daily-pipeline" -c user.email="pipeline@localhost" `
    commit -m "data: refresh for $(Get-Date -Format 'yyyy-MM-dd')"
if ($LASTEXITCODE -ne 0) {
    Write-Host "commit failed"
    exit 1
}

git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "push failed - data is committed locally but not published"
    exit 1
}
Write-Host "pushed"
