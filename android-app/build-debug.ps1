param([string]$SdkPath = $env:ANDROID_HOME, [string]$JdkPath = $env:JAVA_HOME, [switch]$Lint)
$ErrorActionPreference = 'Stop'
$taskProject = $PSScriptRoot
if (-not $JdkPath) {
    $taskLocalJdk = Get-ChildItem -LiteralPath (Join-Path $taskProject '.local/jdk21') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($taskLocalJdk) { $JdkPath = $taskLocalJdk.FullName }
}
if (-not $JdkPath -or -not (Test-Path -LiteralPath (Join-Path $JdkPath 'bin/java.exe'))) {
    throw 'Specify -JdkPath pointing to JDK 17 or 21 (not JDK 25).'
}
$taskJavaVersion = (& (Join-Path $JdkPath 'bin/java.exe') -version 2>&1 | Out-String)
if ($taskJavaVersion -notmatch 'version "(17|21)\.') {
    throw 'Gradle 8.11.1 requires a compatible runtime; select JDK 17 or 21 with -JdkPath.'
}
$taskOldJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $JdkPath
    if ($SdkPath) {
        if (-not (Test-Path -LiteralPath (Join-Path $SdkPath 'platforms/android-35/android.jar'))) {
            throw 'Install Android SDK Platform 35 with SDK Manager first.'
        }
        $taskSdkProperty = 'sdk.dir=' + ($SdkPath.Replace('\', '/').Replace(':', '\:'))
        Set-Content -LiteralPath (Join-Path $taskProject 'local.properties') -Value $taskSdkProperty -Encoding ascii
    }
    Push-Location $taskProject
    try {
        $taskGradleArgs = @(':app:assembleDebug', '--console=plain', '-Dorg.gradle.internal.http.connectionTimeout=15000', '-Dorg.gradle.internal.http.socketTimeout=15000')
        if ($Lint) { $taskGradleArgs += ':app:lintDebug' }
        # Gradle does not automatically inherit HTTP(S)_PROXY. Keep proxy settings local to this run.
        if ($env:HTTPS_PROXY) {
            $taskProxy = [Uri]$env:HTTPS_PROXY
            if ($taskProxy.Host -and -not $taskProxy.UserInfo) {
                $taskGradleArgs += @("-Dhttps.proxyHost=$($taskProxy.Host)", "-Dhttps.proxyPort=$($taskProxy.Port)",
                    "-Dhttp.proxyHost=$($taskProxy.Host)", "-Dhttp.proxyPort=$($taskProxy.Port)",
                    '-Dhttp.nonProxyHosts=repo.maven.apache.org', '-Dhttps.nonProxyHosts=repo.maven.apache.org')
            }
        }
        & .\gradlew.bat @taskGradleArgs
        if ($LASTEXITCODE -ne 0) { throw 'APK build failed; inspect the Gradle error above.' }
        Get-Item -LiteralPath 'app/build/outputs/apk/debug/app-debug.apk'
        Get-FileHash -LiteralPath 'app/build/outputs/apk/debug/app-debug.apk' -Algorithm SHA256
    } finally { Pop-Location }
} finally { $env:JAVA_HOME = $taskOldJavaHome }
