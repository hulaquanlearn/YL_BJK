param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../branding'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskSource = Join-Path $PSScriptRoot '../app/src/main/res/drawable/ic_workbench.xml'
[xml]$taskVector = Get-Content -LiteralPath $taskSource -Raw
$taskAndroidNamespace = 'http://schemas.android.com/apk/res/android'
$taskViewport = [double]$taskVector.vector.GetAttribute('viewportWidth', $taskAndroidNamespace)
if ($taskViewport -ne 48 -or $taskVector.vector.GetAttribute('viewportHeight', $taskAndroidNamespace) -ne '48') {
    throw 'Icon viewport changed; update the exporter before exporting.'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$taskSvgPaths = @()
foreach ($taskNode in $taskVector.vector.path) {
    $taskColor = $taskNode.GetAttribute('fillColor', $taskAndroidNamespace)
    $taskData = $taskNode.GetAttribute('pathData', $taskAndroidNamespace)
    $taskSvgPaths += ('  <path fill="' + $taskColor + '" d="' + $taskData + '"/>')
}
$taskSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 48 48">' + "`n" + ($taskSvgPaths -join "`n") + "`n</svg>"
Set-Content -LiteralPath (Join-Path $OutputDirectory 'digital-workbench-icon.svg') -Value $taskSvg -Encoding utf8
foreach ($taskSize in @(512, 1024)) {
    $taskBitmap = New-Object System.Drawing.Bitmap($taskSize, $taskSize)
    $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
    try {
        $taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $taskGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $taskScale = $taskSize / $taskViewport
        foreach ($taskNode in $taskVector.vector.path) {
            $taskData = $taskNode.GetAttribute('pathData', $taskAndroidNamespace)
            $taskPattern = 'M(\d+),(\d+)h(\d+)v(\d+)h-(\d+)z'
            if ([regex]::Replace($taskData, $taskPattern, '') -ne '') { throw 'Unsupported vector path; update exporter.' }
            $taskBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($taskNode.GetAttribute('fillColor', $taskAndroidNamespace)))
            try {
                foreach ($taskMatch in [regex]::Matches($taskData, $taskPattern)) {
                    if ($taskMatch.Groups[3].Value -ne $taskMatch.Groups[5].Value) { throw 'Unsupported path closure.' }
                    $taskGraphics.FillRectangle($taskBrush,
                        [single]([double]$taskMatch.Groups[1].Value * $taskScale),
                        [single]([double]$taskMatch.Groups[2].Value * $taskScale),
                        [single]([double]$taskMatch.Groups[3].Value * $taskScale),
                        [single]([double]$taskMatch.Groups[4].Value * $taskScale))
                }
            } finally { $taskBrush.Dispose() }
        }
        $taskBitmap.Save((Join-Path $OutputDirectory "digital-workbench-icon-$taskSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $taskGraphics.Dispose(); $taskBitmap.Dispose() }
}
Get-ChildItem -LiteralPath $OutputDirectory | Select-Object Name, Length
