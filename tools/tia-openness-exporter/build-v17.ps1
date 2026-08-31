param(
    [string]$PublicApiPath = ''
)

$ErrorActionPreference = 'Stop'
$version = 'V17'

function Find-TiaPublicApi {
    param([string]$Version, [string]$ExplicitPath)

    $candidates = [System.Collections.Generic.List[string]]::new()
    if ($ExplicitPath) { $candidates.Add($ExplicitPath) }
    if ($env:TIA_PUBLIC_API) { $candidates.Add($env:TIA_PUBLIC_API) }

    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        foreach ($programFolder in @('Program Files', 'Program Files (x86)')) {
            $candidates.Add((Join-Path $drive.Root "$programFolder\Siemens\Automation\Portal $Version\PublicAPI\$Version"))
            $candidates.Add((Join-Path $drive.Root "$programFolder\Siemens\Automation\Portal $Version\PublicAPI"))
        }
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        $direct = Join-Path $candidate 'Siemens.Engineering.dll'
        if (Test-Path -LiteralPath $direct) { return (Split-Path -Parent $direct) }
        $assembly = Get-ChildItem -LiteralPath $candidate -Filter Siemens.Engineering.dll -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Directory.Name -eq $Version } |
            Select-Object -First 1
        if ($assembly) { return $assembly.DirectoryName }
    }

    throw "TIA Portal $Version PublicAPI was not found. Run .\build-v17.ps1 -PublicApiPath 'X:\custom\PublicAPI\$Version' to specify it."
}

$api = Find-TiaPublicApi -Version $version -ExplicitPath $PublicApiPath
$env:TIA_PUBLIC_API = $api
Write-Host "Using PublicAPI: $api" -ForegroundColor Cyan
dotnet build "$PSScriptRoot\Zhitong.PlcExporter.csproj" -c Release -o "$PSScriptRoot\bin\V17"
if ($LASTEXITCODE -ne 0) { throw "V17 exporter build failed with exit code $LASTEXITCODE." }
Copy-Item (Join-Path $api 'Siemens.Engineering.dll') "$PSScriptRoot\bin\V17" -Force
Write-Host "V17 exporter built at: $PSScriptRoot\bin\V17" -ForegroundColor Green
