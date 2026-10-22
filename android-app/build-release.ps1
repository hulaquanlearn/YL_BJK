param(
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$JdkPath = $env:JAVA_HOME,
    [string]$SigningSettings = (Join-Path $env:USERPROFILE '.android/workbench-release-signing/signing.local.json'),
    [int]$VersionCode = 0,
    [string]$VersionName = '',
    [switch]$Instrumentation
)
$ErrorActionPreference = 'Stop'
if (-not $JdkPath) {
    $taskJdk = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.local/jdk21') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($taskJdk) { $JdkPath = $taskJdk.FullName }
}
if (-not $JdkPath -or -not (Test-Path -LiteralPath (Join-Path $JdkPath 'bin/java.exe'))) { throw 'Specify JDK 17 or 21 with -JdkPath.' }
$taskJavaVersion = (& (Join-Path $JdkPath 'bin/java.exe') -version 2>&1 | Out-String)
if ($taskJavaVersion -notmatch 'version "(17|21)\.') { throw 'Use JDK 17 or 21 for Gradle 8.11.1.' }
if (-not (Test-Path -LiteralPath $SigningSettings)) { throw 'Release signing settings are missing. Do not use the debug key for release.' }
$taskSigning = Get-Content -LiteralPath $SigningSettings -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $taskSigning.keystore)) { throw 'Release keystore is missing. Restore it; do not replace an existing release identity.' }
$taskNames = @('JAVA_HOME','WORKBENCH_KEYSTORE','WORKBENCH_STORE_PASSWORD','WORKBENCH_KEY_ALIAS','WORKBENCH_KEY_PASSWORD')
$taskPrevious = @{}
foreach ($taskName in $taskNames) { $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process') }
try {
    $env:JAVA_HOME = $JdkPath
    $env:WORKBENCH_KEYSTORE = $taskSigning.keystore
    $env:WORKBENCH_STORE_PASSWORD = $taskSigning.storePassword
    $env:WORKBENCH_KEY_ALIAS = $taskSigning.alias
    $env:WORKBENCH_KEY_PASSWORD = $taskSigning.keyPassword
    if ($SdkPath) {
        if (-not (Test-Path -LiteralPath (Join-Path $SdkPath 'platforms/android-35/android.jar'))) { throw 'Android SDK Platform 35 is required.' }
        Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local.properties') -Value ('sdk.dir=' + $SdkPath.Replace('\','/').Replace(':','\:')) -Encoding ascii
    }
    Push-Location $PSScriptRoot
    try {
        $taskVersionArgs = @()
        if ($VersionCode -gt 0) { $taskVersionArgs += "-PappVersionCode=$VersionCode" }
        if ($VersionName) { $taskVersionArgs += "-PappVersionName=$VersionName" }
        $taskBuildTasks = @(':app:assembleRelease', ':app:lintRelease')
        if ($Instrumentation) { $taskBuildTasks += ':app:assembleReleaseAndroidTest' }
        & .\gradlew.bat @taskBuildTasks --offline --no-daemon --console=plain @taskVersionArgs
        if ($LASTEXITCODE -ne 0) { throw 'Release build failed; no verified package is delivered.' }
        & (Join-Path $JdkPath 'bin/java.exe') tools/ExportAppIdentity.java $taskSigning.keystore $taskSigning.alias 'cn.digitalworkbench.mobile' filing
        if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed.' }
        Get-FileHash -LiteralPath 'app/build/outputs/apk/release/app-release.apk' -Algorithm SHA256
    } finally { Pop-Location }
} finally {
    foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName, $taskPrevious[$taskName], 'Process') }
    $taskSigning = $null
}
