param(
    [string]$ApkPath = (Join-Path $PSScriptRoot '../app/build/outputs/apk/release/app-release.apk'),
    [string]$Destination = (Join-Path $PSScriptRoot '../releases/1.9.10-android.5'),
    [string]$BaseUrl = 'https://czsdsg.cn',
    [string]$SdkPath = 'D:\Android\android-sdk',
    [string]$JdkPath = '',
    [string]$Notes = '支持在线检查、下载与覆盖升级；业务功能随服务器更新；支持手机文件导出及连续AI对话。'
)
$ErrorActionPreference = 'Stop'
if (-not $JdkPath) { $JdkPath = (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../.local/jdk21') -Directory | Select-Object -First 1).FullName }
$taskApk = (Resolve-Path -LiteralPath $ApkPath).Path
$taskTools = Join-Path $SdkPath 'build-tools/35.0.0'
$taskBadging = (& (Join-Path $taskTools 'aapt.exe') dump badging $taskApk | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'APK inspection failed.' }
$taskPackage = [regex]::Match($taskBadging,"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'")
if (-not $taskPackage.Success -or $taskPackage.Groups[1].Value -ne 'cn.digitalworkbench.mobile') { throw 'Unexpected application ID.' }
if ($taskBadging -match 'application-debuggable') { throw 'Only a release APK may be published.' }
$taskSignature = (& (Join-Path $JdkPath 'bin/java.exe') -jar (Join-Path $taskTools 'lib/apksigner.jar') verify --print-certs $taskApk | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$taskCertificate = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../filing/release-certificate.der') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($taskSignature -notmatch [regex]::Escape("certificate SHA-256 digest: $taskCertificate")) { throw 'Release signing identity mismatch.' }
$taskUri = [uri]$BaseUrl
if ($taskUri.Scheme -ne 'https' -or $taskUri.UserInfo -or $taskUri.Query -or $taskUri.Fragment -or $taskUri.AbsolutePath -ne '/') { throw 'BaseUrl must be an HTTPS origin.' }
$taskVersion = $taskPackage.Groups[3].Value
if ($taskVersion -notmatch '^[A-Za-z0-9._-]+$') { throw 'Invalid release version name.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$taskName = "digital-workbench-$taskVersion.apk"
$taskTarget = Join-Path $Destination $taskName
if ([IO.Path]::GetFullPath($taskTarget) -ne $taskApk) { Copy-Item -LiteralPath $taskApk -Destination $taskTarget -Force }
$taskHash = (Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash.ToLowerInvariant()
$taskManifest = [ordered]@{schema=1;packageName=$taskPackage.Groups[1].Value;versionCode=[long]$taskPackage.Groups[2].Value;versionName=$taskVersion;minSdk=26;url=$BaseUrl.TrimEnd('/')+"/app-updates/android/$taskName";size=(Get-Item -LiteralPath $taskTarget).Length;sha256=$taskHash;notes=$Notes;publishedAt=[DateTimeOffset]::Now.ToString('o')}
[IO.File]::WriteAllText((Join-Path $Destination 'latest.json'),($taskManifest|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$taskManifestHash = (Get-FileHash -LiteralPath (Join-Path $Destination 'latest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $Destination 'SHA256SUMS.txt'),"$taskHash  $taskName`n$taskManifestHash  latest.json`n",[Text.UTF8Encoding]::new($false))
Write-Output "Verified update prepared: $taskTarget"
Write-Output "Version code: $($taskManifest.versionCode); release certificate: $taskCertificate"
