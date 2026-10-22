param(
  [ValidatePattern('^[a-z0-9-]*$')][string]$Suffix = '',
  [ValidatePattern('^\d+\.\d+\.\d+-android\.\d+$')][string]$AndroidRelease
)
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$output = (Resolve-Path -LiteralPath (Join-Path $root 'output')).Path
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if ($version -notmatch '^V\d+\.\d+\.\d+$') { throw "VERSION 必须使用 V主版本.次版本.修订号：$version" }
$date = Get-Date -Format 'yyyyMMdd'
$versionSlug = $version.Substring(1)
$packageName = "spare-parts-v$versionSlug-$date"
if ($Suffix) { $packageName += "-$Suffix" }
$package = Join-Path $output $packageName
$archive = Join-Path $output "$packageName.tar.gz"
$checksumName = "SHA256SUMS-$version.txt"
$outerChecksums = Join-Path $output $checksumName
$deployDoc = Join-Path $output "DEPLOY_$version.md"
$guideDoc = Join-Path $output "USER_GUIDE_$version.md"

foreach ($required in @($deployDoc, $guideDoc, (Join-Path $output "QA_$version.md"), (Join-Path $root 'README.md'), (Join-Path $root 'spare-parts-web-release\dist\index.html'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "缺少发布文件：$required" }
}
if (Test-Path -LiteralPath $package) { throw "发布目录已存在，请先人工核对：$package" }
if (Test-Path -LiteralPath $archive) { throw "发布压缩包已存在，请先人工核对：$archive" }

if ($AndroidRelease) {
  $androidDir = Join-Path $root "android-app\releases\$AndroidRelease"
  $androidManifest = Get-Content -LiteralPath (Join-Path $androidDir 'latest.json') -Raw | ConvertFrom-Json
  if ($androidManifest.versionName -ne $AndroidRelease -or $androidManifest.packageName -ne 'cn.digitalworkbench.mobile') { throw '安卓发布标识不匹配' }
  $androidApkName = "digital-workbench-$AndroidRelease.apk"
  $androidApk = Join-Path $androidDir $androidApkName
  if ((Get-Item -LiteralPath $androidApk).Length -ne $androidManifest.size -or (Get-FileHash -LiteralPath $androidApk -Algorithm SHA256).Hash -ne $androidManifest.sha256) { throw '安卓APK与更新清单不一致' }
}

New-Item -ItemType Directory -Path $package, (Join-Path $package 'server'), (Join-Path $package 'web-dist'), (Join-Path $package 'web-runtime'), (Join-Path $package 'miniprogram') | Out-Null
foreach ($directory in @('src', 'scripts', 'sql', 'nginx')) {
  Copy-Item -LiteralPath (Join-Path $root "server\$directory") -Destination (Join-Path $package 'server') -Recurse
}
foreach ($file in @('.env.example', 'package.json', 'package-lock.json', 'README.md')) {
  Copy-Item -LiteralPath (Join-Path $root "server\$file") -Destination (Join-Path $package 'server')
}
New-Item -ItemType Directory -Path (Join-Path $package 'server\data') | Out-Null
# Runtime seed catalog only; never ship inventory ledgers, uploads, or configured secrets.
Copy-Item -LiteralPath (Join-Path $root 'server\data\ledger-model-catalog.json') -Destination (Join-Path $package 'server\data')
Copy-Item -Path (Join-Path $root 'spare-parts-web-release\dist\*') -Destination (Join-Path $package 'web-dist') -Recurse
foreach ($file in @('server.js', 'package.json', 'package-lock.json')) {
  Copy-Item -LiteralPath (Join-Path $root "spare-parts-web-release\$file") -Destination (Join-Path $package 'web-runtime')
}
if (Test-Path -LiteralPath (Join-Path $root 'docs')) {
  New-Item -ItemType Directory -Path (Join-Path $package 'docs') | Out-Null
  # Ship maintained operational references and this release's audit evidence; exclude unrelated ledgers.
  Get-ChildItem -LiteralPath (Join-Path $root 'docs') -File |
    Where-Object { $_.Name -in @('DOCUMENT_PREVIEW_V1.4.0.md', 'OPENCLAW_MODEL_MATCHING.md', 'LOCAL_AUDIT_REMEDIATION_20260924.md', 'PROJECT_REVIEW_SECURITY_20260930.md', 'PROJECT_DECISIONS.md', 'RELEASE_AUDIT_20261009.md', 'RELEASE_AUDIT_20261013.md', 'ATTENDANCE_REVIEW_20261009.md', 'ATTENDANCE_V2_LOCAL_20261013.md', 'ROBOT_PROGRAM_AGENT.md', 'CLEANUP_20261016.md', 'RETIRED_FEATURES_20261018.md', 'AI_CALL_RECORDS_20261018.md', 'UI_SIMPLIFICATION_20261018.md', 'TOOLBAR_CLEANUP_REVIEW_20261018.md', 'ACCOUNT_STORAGE_REVIEW_20261018.md', 'KNOWLEDGE_AGENT_REVIEW_20261018.md', 'RELEASE_AUDIT_20261018.md') } |
    Copy-Item -Destination (Join-Path $package 'docs')
}
Copy-Item -Path (Join-Path $root 'miniprogram\*') -Destination (Join-Path $package 'miniprogram') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'project.config.json') -Destination $package
Copy-Item -LiteralPath (Join-Path $root 'spare-parts-web-release\RELEASE_NOTES.md') -Destination $package
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $package 'README.md')
if (Test-Path -LiteralPath (Join-Path $root 'AGENTS.md')) {
  Copy-Item -LiteralPath (Join-Path $root 'AGENTS.md') -Destination $package
}
Copy-Item -LiteralPath (Join-Path $root 'design-qa.md') -Destination (Join-Path $package 'design-qa.md')
Copy-Item -LiteralPath (Join-Path $root 'VERSION') -Destination $package
if ($AndroidRelease) {
  $androidTarget = Join-Path $package 'app-updates\android'
  New-Item -ItemType Directory -Path $androidTarget, (Join-Path $package 'android-app') | Out-Null
  foreach ($file in @($androidApkName, 'latest.json', 'SHA256SUMS.txt')) {
    Copy-Item -LiteralPath (Join-Path $androidDir $file) -Destination $androidTarget
  }
  foreach ($file in @('README.md', 'VALIDATION.md')) {
    Copy-Item -LiteralPath (Join-Path $root "android-app\$file") -Destination (Join-Path $package 'android-app')
  }
}
Copy-Item -LiteralPath $deployDoc -Destination $package
Copy-Item -LiteralPath $guideDoc -Destination $package
$qaDoc = Join-Path $output "QA_$version.md"
if (Test-Path -LiteralPath $qaDoc) { Copy-Item -LiteralPath $qaDoc -Destination $package }

$checksumLines = foreach ($file in (Get-ChildItem -LiteralPath $package -Recurse -File | Sort-Object FullName)) {
  $relative = $file.FullName.Substring($package.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  "$hash  $relative"
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines((Join-Path $package $checksumName), [string[]]$checksumLines, $utf8NoBom)
tar -czf $archive -C $output $packageName
if ($LASTEXITCODE -ne 0) { throw "部署包压缩失败：$archive" }
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
[System.IO.File]::WriteAllLines($outerChecksums, [string[]]@("$archiveHash  $packageName.tar.gz"), $utf8NoBom)

Write-Output $archive
Write-Output $archiveHash
