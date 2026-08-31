[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('V16','V17')][string]$Version,
  [string]$InstallDirectory = "$env:LOCALAPPDATA\Zhitong\PLC解析助手"
)

$ErrorActionPreference = 'Stop'
$sourceRoot = $PSScriptRoot
$buildScript = Join-Path $sourceRoot ("build-{0}.ps1" -f $Version.ToLowerInvariant())
$sourceBinary = Join-Path $sourceRoot "bin\$Version\Zhitong.PlcExporter.exe"

if (-not (Test-Path -LiteralPath $sourceBinary -PathType Leaf)) {
  if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) { throw "缺少 $Version 构建脚本。" }
  & $buildScript
}

$targetRoot = Join-Path $InstallDirectory $Version
$targetBin = Join-Path $targetRoot "bin\$Version"
New-Item -ItemType Directory -Force -Path $targetBin | Out-Null
Copy-Item -Path (Join-Path $sourceRoot "bin\$Version\*") -Destination $targetBin -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Run-PlcExporter.ps1') -Destination $targetRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Start-ProgramAnalysisAgent.ps1') -Destination $targetRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'README.md') -Destination $targetRoot -Force

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "PLC解析助手 $Version.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $targetRoot 'Run-PlcExporter.ps1')`" -Version $Version"
$shortcut.WorkingDirectory = $targetRoot
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,70"
$shortcut.Description = "TIA Portal $Version 只读 PLC 程序解析助手"
$shortcut.Save()

Write-Host "安装完成：$targetRoot" -ForegroundColor Green
Write-Host "桌面快捷方式：$shortcutPath" -ForegroundColor Green
