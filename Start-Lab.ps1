param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$labRoot = Join-Path $PSScriptRoot 'lab'
$labServerScript = Join-Path $labRoot 'scripts\serve-local.mjs'
$labRuntime = Join-Path $labRoot '.local-runtime'
$labAddress = 'http://127.0.0.1:4173'
$labNodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$labNodePath = if ($labNodeCommand) { $labNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $labNodePath)) { throw 'Node.js 22 or later is needed. See README.md.' }
New-Item -ItemType Directory -Path $labRuntime -Force | Out-Null
$labReady = $false
try { $labHealth = Invoke-RestMethod -Uri "$labAddress/__electrical_lab_health" -TimeoutSec 2; $labReady = $labHealth.app -eq 'irish-electrical-lab' } catch {}
if (-not $labReady) {
  $labProcess = Start-Process -FilePath $labNodePath -ArgumentList @(('"' + $labServerScript + '"')) -WorkingDirectory $labRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $labRuntime 'server.log') -RedirectStandardError (Join-Path $labRuntime 'server-errors.log')
  Set-Content -LiteralPath (Join-Path $labRuntime 'server.pid') -Value $labProcess.Id
  for ($labAttempt = 0; $labAttempt -lt 40; $labAttempt++) {
    Start-Sleep -Milliseconds 150
    try { $labHealth = Invoke-RestMethod -Uri "$labAddress/__electrical_lab_health" -TimeoutSec 1; if ($labHealth.app -eq 'irish-electrical-lab') { $labReady = $true; break } } catch {}
    if ($labProcess.HasExited) { break }
  }
}
if (-not $labReady) { throw ('The local app did not start. Check ' + (Join-Path $labRuntime 'server-errors.log')) }
Write-Output "Irish Electrical Lab is running at $labAddress"
if (-not $NoBrowser) { Start-Process $labAddress }
