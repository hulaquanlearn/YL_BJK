param([string]$CurrentArchive = '')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = [IO.Path]::GetFullPath((Join-Path $root 'output'))
$prefix = $output.TrimEnd('\') + '\'
function OutputPath([string]$relative) {
  $full = [IO.Path]::GetFullPath((Join-Path $output $relative))
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "清理目标超出 output：$full" }
  return $full
}
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if ($version -notmatch '^V\d+\.\d+\.\d+$') { throw 'VERSION 格式无效' }
if (-not $CurrentArchive) {
  $lines = @(Get-Content -LiteralPath (OutputPath "SHA256SUMS-$version.txt") | Where-Object { $_.Trim() })
  if ($lines.Count -ne 1 -or $lines[0] -notmatch '^([A-Fa-f0-9]{64})\s+\*?(spare-parts-v[\d.]+-\d{8}(?:-[a-z0-9-]+)?\.tar\.gz)$') { throw '外层校验文件必须指向唯一最新包' }
  $CurrentArchive = $Matches[2]
}
if ($CurrentArchive -notmatch '^spare-parts-v[\d.]+-\d{8}(?:-[a-z0-9-]+)?\.tar\.gz$') { throw '当前包名无效' }
$archive = OutputPath $CurrentArchive
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw '先生成当前部署包' }
node (Join-Path $root 'tools\verify-release.mjs') $archive
if ($LASTEXITCODE -ne 0) { throw '当前包未通过独立核验，停止清理' }

# Keep the existing prior-release rollback and verify it before any deletion.
$rollbackDir = OutputPath 'rollback'
$rollbackManifest = Join-Path $rollbackDir 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $rollbackManifest -PathType Leaf)) { throw '缺少上一版回滚包校验清单，请先保存回滚包' }
$rollbackPrefix = $rollbackDir.TrimEnd('\') + '\'
$rollbackLines = @(Get-Content -LiteralPath $rollbackManifest | Where-Object { $_.Trim() })
if (-not $rollbackLines.Count) { throw '回滚包校验清单为空' }
foreach ($line in $rollbackLines) {
  if ($line -notmatch '^([A-Fa-f0-9]{64})\s+\*?([^\\/]+\.tar\.gz)$') { throw '回滚包校验清单格式错误' }
  $expected = $Matches[1]
  $rollbackFile = [IO.Path]::GetFullPath((Join-Path $rollbackDir $Matches[2]))
  if (-not $rollbackFile.StartsWith($rollbackPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '回滚包路径越界' }
  if ((Get-FileHash -LiteralPath $rollbackFile -Algorithm SHA256).Hash -ne $expected) { throw '回滚包校验失败' }
}

# Enumerate release artifacts only; no business data or general-purpose directories.
$targets = @(Get-ChildItem -LiteralPath $output -Force | Where-Object {
  ($_.PSIsContainer -and $_.Name -match '^spare-parts-v[\d.]+-\d{8}(?:-[a-z0-9-]+)?$') -or
  (-not $_.PSIsContainer -and $_.Name -match '^spare-parts-v[\d.]+-\d{8}(?:-[a-z0-9-]+)?\.tar\.gz$' -and $_.Name -ne $CurrentArchive)
})
$deleted = @()
foreach ($item in $targets) {
  $target = OutputPath $item.Name
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "不清理重解析点：$target" }
  if ($item.PSIsContainer) {
    $children = @(Get-ChildItem -LiteralPath $target -Force -Recurse)
    if ($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw "目录含重解析点：$target" }
    $bytes = ($children | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
  } else { $bytes = $item.Length }
  Remove-Item -LiteralPath $target -Force -Recurse
  $deleted += [pscustomobject]@{ path=$item.Name; bytes=[long]$bytes }
}
$report = [pscustomobject]@{ version=$version; current=$CurrentArchive; deleted=$deleted; removedBytes=($deleted | Measure-Object bytes -Sum).Sum; rollback=$rollbackDir }
$localDir = Join-Path $root '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $localDir 'release-cleanup.json') -Encoding utf8
$report | Select-Object version,current,removedBytes,rollback | Format-List
