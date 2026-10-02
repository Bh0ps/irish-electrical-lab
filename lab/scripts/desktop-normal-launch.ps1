# Verify the installed app through its real Windows desktop shortcut.
# This uses the application's own retention workflow, never browser automation.
param([string]$RecordSnapshot='desktop-1.1-original-records.json')
$ErrorActionPreference = 'Stop'
$labRoot = Split-Path $PSScriptRoot -Parent
$verificationRoot = Join-Path (Split-Path $labRoot -Parent) 'verification/desktop'
$profileVerification = Join-Path $env:APPDATA 'Irish Electrical Lab/verification'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Irish Electrical Lab.lnk'
$startShortcut = Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/Irish Electrical Lab.lnk'
$installedExe = Join-Path $env:LOCALAPPDATA 'Programs/Irish Electrical Lab/Irish Electrical Lab.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeRuntime = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodeRuntime)) { throw 'Node.js 22 or later is required for the desktop verification script.' }
$utf8Plain = New-Object System.Text.UTF8Encoding($false)
$normalProcess = $null
$seeded = $false
$appVersion = (Get-Content -LiteralPath (Join-Path $labRoot 'desktop/app/package.json') -Raw | ConvertFrom-Json).version
$report = [ordered]@{ version=$appVersion; passed=$false; launchedThrough='Windows desktop shortcut'; recordedAt=[DateTime]::UtcNow.ToString('o') }
try {
  if (-not (Test-Path -LiteralPath $desktopShortcut)) { throw 'Desktop shortcut is missing.' }
  $shortcutShell = New-Object -ComObject WScript.Shell
  $links = @($desktopShortcut,$startShortcut) | ForEach-Object {
    $link = $shortcutShell.CreateShortcut($_)
    [ordered]@{link=$_;exists=(Test-Path -LiteralPath $_);target=$link.TargetPath;arguments=$link.Arguments}
  }
  if (@($links | Where-Object { -not $_.exists -or $_.target -ne $installedExe -or $_.arguments }).Count) { throw 'Installed shortcuts do not target the normal app.' }
  [System.IO.File]::WriteAllText((Join-Path $verificationRoot 'shortcuts.json'),($links | ConvertTo-Json -Depth 5),$utf8Plain)
  Start-Process -FilePath $desktopShortcut -WindowStyle Hidden
  for($tries=0;$tries -lt 80;$tries++) {
    $normalProcess = Get-Process -Name 'Irish Electrical Lab' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Irish Electrical Lab' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($normalProcess) { break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $normalProcess) { throw 'Normal application window did not appear.' }
  $listener = Get-NetTCPConnection -LocalPort 4187 -State Listen -ErrorAction SilentlyContinue
  if (-not $listener -or $listener.OwningProcess -ne $normalProcess.Id) { throw 'The normal app does not own its stable local server.' }
  $report.processId=$normalProcess.Id
  $report.windowTitle=$normalProcess.MainWindowTitle
  $report.localPortListening=$true
  $report.shortcutTargetsVerified=$true
  Start-Sleep -Milliseconds 1800
  if (-not $normalProcess.CloseMainWindow()) { throw 'The normal window could not be closed cleanly.' }
  if (-not $normalProcess.WaitForExit(15000)) { throw 'The normal app failed to stop after window close.' }
  $normalProcess=$null
  $report.serverStopped= -not (Get-NetTCPConnection -LocalPort 4187 -State Listen -ErrorAction SilentlyContinue)
  if (-not $report.serverStopped) { throw 'Port 4187 remains bound after shutdown.' }
  # The existing app-owned seed/check pair snapshots and restores all real records.
  $seedProcess=Start-Process -FilePath $installedExe -ArgumentList '--verify-retention-seed' -PassThru -WindowStyle Hidden
  Wait-Process -Id $seedProcess.Id
  $seeded=$true
  $comparison = @'
const fs=require('node:fs'),crypto=require('node:crypto');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const original=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const hash=crypto.createHash('sha256').update(JSON.stringify(canonical([...actual].sort(([a],[b])=>String(a).localeCompare(String(b)))))).digest('hex');
console.log(JSON.stringify({matches:hash===original.digest,expectedDigest:original.digest,actualDigest:hash}));
'@
  $comparisonJson=& $nodeRuntime -e $comparison (Join-Path $profileVerification $RecordSnapshot) (Join-Path $profileVerification 'desktop-upgrade-retention-original.json')
  $profileComparison=$comparisonJson | ConvertFrom-Json
  $report.originalProfileUnchangedAfterNormalLaunch=$profileComparison.matches
  $report.expectedDigest=$profileComparison.expectedDigest
  $report.actualDigest=$profileComparison.actualDigest
  $checkProcess=Start-Process -FilePath $installedExe -ArgumentList '--verify-retention-check' -PassThru -WindowStyle Hidden
  Wait-Process -Id $checkProcess.Id
  $seeded=$false
  $retention=Get-Content -LiteralPath (Join-Path $profileVerification 'desktop-upgrade-retention-report.json') -Raw | ConvertFrom-Json
  $report.originalRecordsRestored=$retention.originalRecordsRestored
  $report.passed=$profileComparison.matches -and $retention.passed -and $retention.originalRecordsRestored -and $report.serverStopped
} catch {
  $report.error=$_.Exception.Message
} finally {
  if($normalProcess -and -not $normalProcess.HasExited) { $null=$normalProcess.CloseMainWindow();$null=$normalProcess.WaitForExit(15000) }
  if($seeded) { $recoveryProcess=Start-Process -FilePath $installedExe -ArgumentList '--verify-retention-check' -PassThru -WindowStyle Hidden;Wait-Process -Id $recoveryProcess.Id }
  [System.IO.File]::WriteAllText((Join-Path $verificationRoot 'normal-launch.json'),($report | ConvertTo-Json -Depth 7),$utf8Plain)
}
$report | ConvertTo-Json -Depth 7
if(-not $report.passed) { throw 'Installed normal launch/profile audit failed; see verification/desktop/normal-launch.json.' }
