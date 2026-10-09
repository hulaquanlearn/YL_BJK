$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$prefix = $root.TrimEnd('\') + '\'
function WorkspacePath([string]$relative) {
  $full = [IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "清理目标超出工作区：$full" }
  return $full
}
$version = (Get-Content -LiteralPath (WorkspacePath 'VERSION') -Raw).Trim()
if ($version -ne 'V1.9.10') { throw '本清理清单仅适用于已核验的 V1.9.10 交付' }
$archive = WorkspacePath 'output\spare-parts-v1.9.10-20261009-full.tar.gz'
if (-not (Test-Path -LiteralPath $archive)) { throw '先生成并核验当前部署包' }
node (WorkspacePath 'tools\verify-release.mjs') $archive
if ($LASTEXITCODE -ne 0) { throw '当前包未通过独立核验，停止清理' }

# Preserve one verified prior release. Never touch database backups or user uploads.
$previous = WorkspacePath 'output\spare-parts-v1.9.9-20260930-full-final'
$rollbackDir = WorkspacePath 'output\rollback'
New-Item -ItemType Directory -Force -Path $rollbackDir | Out-Null
$rollback = WorkspacePath 'output\rollback\spare-parts-v1.9.9-20260930-full-final.tar.gz'
if (Test-Path -LiteralPath $previous) {
  $previousPrefix = $previous.TrimEnd('\') + '\'
  $manifest = Join-Path $previous 'SHA256SUMS-V1.9.9.txt'
  foreach ($line in (Get-Content -LiteralPath $manifest)) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})\s+(.+)$') { throw '旧包校验清单格式错误' }
    $expected = $Matches[1]
    $file = [IO.Path]::GetFullPath((Join-Path $previous $Matches[2]))
    if (-not $file.StartsWith($previousPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '旧包清单路径越界' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $expected) { throw "旧包文件校验失败：$file" }
  }
  if (Test-Path -LiteralPath $rollback) { throw '回滚包已存在，先核查后再重复运行清理' }
  tar -czf $rollback -C (WorkspacePath 'output') 'spare-parts-v1.9.9-20260930-full-final'
  if ($LASTEXITCODE -ne 0) { throw '回滚压缩失败' }
  $entries = @(tar -tzf $rollback)
  if ($LASTEXITCODE -ne 0 -or $entries.Count -lt 385) { throw '回滚压缩包不完整' }
  $rollbackHash = (Get-FileHash -LiteralPath $rollback -Algorithm SHA256).Hash
  [IO.File]::WriteAllText((Join-Path $rollbackDir 'SHA256SUMS.txt'), "$rollbackHash  spare-parts-v1.9.9-20260930-full-final.tar.gz`n", [Text.UTF8Encoding]::new($false))
}
if (-not (Test-Path -LiteralPath $rollback) -or -not (Test-Path -LiteralPath (Join-Path $rollbackDir 'SHA256SUMS.txt'))) { throw '缺少上一版回滚包' }

$targets = @(
  'output\spare-parts-v1.9.9-20260930-full-final',
  'output\spare-parts-v1.9.10-20261009-full',
  '.local\release-archive-20260930', '.local\release-history', '.local\superseded-releases',
  '.local\audit-final-20260930', '.local\effects-20260930', '.local\inspection-qa',
  '.local\portal-qa', '.local\sites-preview-20260930', '.local\ui-audit-20260930',
  '.local\user-experience-audit-20260930', '.local\work-qa', '.local\work-redesign', '.local\work-settings-qa',
  '.local\api-audit-final-20260930.json', '.local\api-tests-final-20260930.log',
  '.local\web-audit-final-20260930.json', '.local\web-build-final-20260930.log', '.local\web-tests-final-20260930.log',
  '.local\targeted-audit-tests.log', '.local\web-tests-20261009.log',
  '.local\cleanup-record-20260930.json', '.local\shutdown-final-20260930.json', '.local\shutdown-final-20260930.ps1',
  'server\.local\release-20261009'
)
$deleted = @()
foreach ($relative in $targets) {
  $target = WorkspacePath $relative
  if (-not (Test-Path -LiteralPath $target)) { continue }
  $item = Get-Item -LiteralPath $target -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "不清理重解析点：$target" }
  if ($item.PSIsContainer) {
    $children = @(Get-ChildItem -LiteralPath $target -Force -Recurse)
    if ($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw "目录含重解析点：$target" }
    $bytes = ($children | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
  } else { $bytes = $item.Length }
  # Every resolved absolute target above is checked against this exact workspace.
  Remove-Item -LiteralPath $target -Force -Recurse
  $deleted += [pscustomobject]@{ path = $relative; bytes = [long]$bytes }
}
$report = [pscustomobject]@{ version=$version; deleted=$deleted; removedBytes=($deleted | Measure-Object bytes -Sum).Sum; rollback=$rollback; preserved=@('server/data', 'server/uploads', '.env', '.local/modeling', '.local/release-20261009') }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (WorkspacePath '.local\release-20261009\cleanup.json') -Encoding utf8
$report | Select-Object version,removedBytes,rollback | Format-List
