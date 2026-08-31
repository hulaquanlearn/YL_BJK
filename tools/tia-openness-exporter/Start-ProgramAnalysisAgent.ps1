[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('V16','V17')][string]$Version,
  [string]$ServerUrl = 'https://czsdsg.cn',
  [string]$ExporterPath = "$(Join-Path $PSScriptRoot "bin\$Version\Zhitong.PlcExporter.exe")",
  [string[]]$SearchRoots,
  [int]$PollSeconds = 30,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$token = $env:PLC_AGENT_TOKEN
if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { throw '请先在当前用户环境变量 PLC_AGENT_TOKEN 中配置与服务器一致的至少32位令牌。' }
if (-not (Test-Path -LiteralPath $ExporterPath -PathType Leaf)) { throw "未找到 $Version 解析器：$ExporterPath" }
if (-not $SearchRoots -or $SearchRoots.Count -eq 0) {
  $SearchRoots = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -and (Test-Path $_.Root) } | Select-Object -ExpandProperty Root
}
$headers = @{ 'X-Program-Agent-Token' = $token }
$tempRoot = Join-Path $env:LOCALAPPDATA 'ZhitongProgramAgent'
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

function Find-ProjectEntry([string]$Name, [string]$ExpectedHash) {
  $matches = foreach ($root in $SearchRoots) {
    Get-ChildItem -LiteralPath $root -Filter $Name -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\(Windows|Program Files|ProgramData|\$Recycle\.Bin)\\' }
  }
  $verified = @($matches | Where-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq $ExpectedHash })
  if ($verified.Count -eq 1) { return $verified[0].FullName }
  if ($verified.Count -gt 1) { throw "找到多个同内容项目入口，请用 -SearchRoots 缩小范围：$($verified.FullName -join ', ')" }
  throw "各磁盘未找到与网页上传内容一致的 $Name。请确认 Windows 解析节点能够访问原项目目录。"
}

do {
  try {
    $jobUrl = "$($ServerUrl.TrimEnd('/'))/api/program-agent/jobs/next?version=$Version"
    $response = Invoke-RestMethod -Method Get -Uri $jobUrl -Headers $headers -TimeoutSec 30
    $job = $response.data
    if ($null -ne $job -and $job.entries.Count -gt 0) {
      $entry = $job.entries[0]
      Write-Host "收到解析任务 #$($job.id)：$($job.name)" -ForegroundColor Cyan
      $projectPath = Find-ProjectEntry $entry.originalFilename $entry.sha256.ToUpperInvariant()
      $outputDir = Join-Path $tempRoot "job-$($job.id)-$(Get-Date -Format yyyyMMddHHmmss)"
      New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
      & $ExporterPath $projectPath $outputDir --non-interactive
      if ($LASTEXITCODE -ne 0) { throw "TIA 解析器退出码：$LASTEXITCODE" }
      $result = Get-ChildItem -LiteralPath $outputDir -Filter '*.plcai' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if (-not $result) { throw '解析器未生成 .plcai 文件。' }
      $uploadUrl = "$($ServerUrl.TrimEnd('/'))/api/program-agent/jobs/$($job.id)/result"
      Add-Type -AssemblyName System.Net.Http
      $client = [System.Net.Http.HttpClient]::new()
      $client.DefaultRequestHeaders.Add('X-Program-Agent-Token', $token)
      $multipart = [System.Net.Http.MultipartFormDataContent]::new()
      $stream = [System.IO.File]::OpenRead($result.FullName)
      $fileContent = [System.Net.Http.StreamContent]::new($stream)
      $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/json')
      $multipart.Add($fileContent, 'result', $result.Name)
      try {
        $uploadResponse = $client.PostAsync($uploadUrl, $multipart).GetAwaiter().GetResult()
        $uploadBody = $uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $uploadResponse.IsSuccessStatusCode) { throw "上传解析结果失败（$([int]$uploadResponse.StatusCode)）：$uploadBody" }
      } finally {
        $multipart.Dispose(); $stream.Dispose(); $client.Dispose()
      }
      Write-Host "任务 #$($job.id) 已完成并回传。" -ForegroundColor Green
    } elseif ($Once) { Write-Host '当前没有待解析任务。' }
  } catch {
    Write-Warning $_.Exception.Message
  }
  if (-not $Once) { Start-Sleep -Seconds ([Math]::Max(10, $PollSeconds)) }
} while (-not $Once)
