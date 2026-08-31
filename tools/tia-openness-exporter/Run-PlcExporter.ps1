[CmdletBinding()]
param(
  [ValidateSet('Auto','V16','V17')][string]$Version = 'Auto',
  [string]$ProjectPath = '',
  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-Message([string]$Text, [string]$Title, [System.Windows.Forms.MessageBoxIcon]$Icon) {
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $Icon) | Out-Null
}

try {
  if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $picker = [System.Windows.Forms.OpenFileDialog]::new()
    $picker.Title = '选择 TIA Portal 项目入口'
    $picker.Filter = 'TIA Portal 项目入口 (*.ap16;*.ap17)|*.ap16;*.ap17|所有文件 (*.*)|*.*'
    $picker.Multiselect = $false
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
    $ProjectPath = $picker.FileName
  }

  $extension = [System.IO.Path]::GetExtension($ProjectPath).ToLowerInvariant()
  $detectedVersion = if ($extension -eq '.ap16') { 'V16' } elseif ($extension -eq '.ap17') { 'V17' } else { '' }
  if (-not $detectedVersion) { throw '请选择 .ap16 或 .ap17 项目入口文件。归档 .zap16/.zap17 请先在对应版本 TIA Portal 中解包。' }
  if ($Version -ne 'Auto' -and $Version -ne $detectedVersion) { throw "当前启动器是 $Version，但所选项目属于 $detectedVersion。请使用对应版本解析助手。" }
  $Version = $detectedVersion

  if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $folder = [System.Windows.Forms.FolderBrowserDialog]::new()
    $folder.Description = '选择 .plcai 输出目录'
    $folder.ShowNewFolderButton = $true
    if ($folder.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
    $OutputDirectory = $folder.SelectedPath
  }

  $exporter = Join-Path $PSScriptRoot "bin\$Version\Zhitong.PlcExporter.exe"
  if (-not (Test-Path -LiteralPath $exporter -PathType Leaf)) {
    throw "未安装 $Version 解析器。请先运行 Install-PlcAnalysisHelper.ps1 -Version $Version。"
  }

  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  & $exporter $ProjectPath $OutputDirectory
  if ($LASTEXITCODE -ne 0) { throw "解析失败，退出码 $LASTEXITCODE。请检查 TIA 项目一致性、Openness 用户组和对应版本是否正确。" }

  $result = Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.plcai' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $result) { throw '解析器未生成 .plcai 文件。' }
  Show-Message "导出完成：`r`n$($result.FullName)`r`n`r`n现在可将该文件上传到网站的“程序智能分析”。" 'PLC 解析助手' ([System.Windows.Forms.MessageBoxIcon]::Information)
  Start-Process explorer.exe -ArgumentList @('/select,', $result.FullName)
} catch {
  Show-Message $_.Exception.Message 'PLC 解析助手' ([System.Windows.Forms.MessageBoxIcon]::Error)
  exit 1
}
