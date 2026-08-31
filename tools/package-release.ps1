$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$output = (Resolve-Path -LiteralPath (Join-Path $root 'output')).Path
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if ($version -notmatch '^V\d+\.\d+\.\d+$') { throw "VERSION 必须使用 V主版本.次版本.修订号：$version" }
$date = Get-Date -Format 'yyyyMMdd'
$versionSlug = $version.Substring(1)
$packageName = "spare-parts-v$versionSlug-$date"
$package = Join-Path $output $packageName
$archive = Join-Path $output "$packageName.tar.gz"
$checksumName = "SHA256SUMS-$version.txt"
$outerChecksums = Join-Path $output $checksumName
$deployDoc = Join-Path $output "DEPLOY_$version.md"
$guideDoc = Join-Path $output "USER_GUIDE_$version.md"

foreach ($required in @($deployDoc, $guideDoc, (Join-Path $root 'spare-parts-web-release\dist\index.html'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "缺少发布文件：$required" }
}
if (Test-Path -LiteralPath $package) { throw "发布目录已存在，请先人工核对：$package" }
if (Test-Path -LiteralPath $archive) { throw "发布压缩包已存在，请先人工核对：$archive" }

New-Item -ItemType Directory -Path $package, (Join-Path $package 'server'), (Join-Path $package 'web-dist'), (Join-Path $package 'miniprogram') | Out-Null
foreach ($directory in @('src', 'scripts', 'sql', 'nginx')) {
  Copy-Item -LiteralPath (Join-Path $root "server\$directory") -Destination (Join-Path $package 'server') -Recurse
}
foreach ($file in @('.env.example', 'package.json', 'package-lock.json', 'README.md')) {
  Copy-Item -LiteralPath (Join-Path $root "server\$file") -Destination (Join-Path $package 'server')
}
Copy-Item -Path (Join-Path $root 'spare-parts-web-release\dist\*') -Destination (Join-Path $package 'web-dist') -Recurse
Copy-Item -Path (Join-Path $root 'miniprogram\*') -Destination (Join-Path $package 'miniprogram') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'project.config.json') -Destination $package
Copy-Item -LiteralPath (Join-Path $root 'spare-parts-web-release\RELEASE_NOTES.md') -Destination $package
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $package 'PROJECT_README.md')
Copy-Item -LiteralPath (Join-Path $root 'VERSION') -Destination $package
Copy-Item -LiteralPath $deployDoc -Destination $package
Copy-Item -LiteralPath $guideDoc -Destination $package

$checksumLines = foreach ($file in (Get-ChildItem -LiteralPath $package -Recurse -File | Sort-Object FullName)) {
  $relative = $file.FullName.Substring($package.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  "$hash  $relative"
}
$checksumLines | Set-Content -LiteralPath (Join-Path $package $checksumName) -Encoding utf8
tar -czf $archive -C $output $packageName
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
"$archiveHash  $packageName.tar.gz" | Set-Content -LiteralPath $outerChecksums -Encoding utf8

Write-Output $archive
Write-Output $archiveHash
