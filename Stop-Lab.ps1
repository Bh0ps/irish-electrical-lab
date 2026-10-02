$ErrorActionPreference = 'Stop'
$labRoot = Join-Path $PSScriptRoot 'lab'
$labPidFile = Join-Path $labRoot '.local-runtime\server.pid'
$labServerScript = Join-Path $labRoot 'scripts\serve-local.mjs'
if (-not (Test-Path -LiteralPath $labPidFile)) { Write-Output 'The app is already stopped.'; exit 0 }
$labProcessId = [int](Get-Content -LiteralPath $labPidFile)
$labProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $labProcessId"
if ($labProcess -and $labProcess.Name -eq 'node.exe' -and $labProcess.CommandLine.Contains($labServerScript)) {
  Stop-Process -Id $labProcessId
  Write-Output 'Irish Electrical Lab stopped. Saved work remains on this PC.'
} else { Write-Output 'No matching Electrical Lab server is running.' }
