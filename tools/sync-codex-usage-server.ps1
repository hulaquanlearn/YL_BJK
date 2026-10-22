$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$snapshotDir = Join-Path $projectRoot '.local/codex-usage-sync'
New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null
$snapshotPath = Join-Path $snapshotDir 'codex-usage.json'
# The collector emits only numeric usage and collection time, never credentials.
& node (Join-Path $PSScriptRoot 'sync-codex-usage.cjs') $snapshotPath
if ($LASTEXITCODE -ne 0) { throw '本机采集失败，服务器原快照保留。' }
$snapshot = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
if (!$snapshot.checkedAt -or (!$snapshot.windows.Count -and $null -eq $snapshot.summary.lifetimeTokens)) { throw '采集结果为空，服务器原快照保留。' }
$sshArgs = @('-i','C:/Users/Lenovo/.ssh/id_rsa_navicat','-p','22222','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','StrictHostKeyChecking=yes','root@49.234.185.199')
$remoteTemp = '/opt/spare-parts/server-private-usage/.codex-usage-' + [guid]::NewGuid().ToString() + '.json'
& scp -i C:/Users/Lenovo/.ssh/id_rsa_navicat -P 22222 -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes $snapshotPath ('root@49.234.185.199:' + $remoteTemp)
if ($LASTEXITCODE -ne 0) { throw '快照上传失败，服务器原快照保留。' }
$expectedHash = (Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash.ToLowerInvariant()
$remoteCommand = "set -e; test -d /opt/spare-parts/server-private-usage; test " + '$' + "(sha256sum $remoteTemp | cut -d' ' -f1) = '$expectedHash'; chmod 600 $remoteTemp; mv -f $remoteTemp /opt/spare-parts/server-private-usage/codex-usage.json"
& ssh @sshArgs $remoteCommand
if ($LASTEXITCODE -ne 0) { throw '快照校验或替换失败，服务器原快照保留。' }
Write-Output ('已同步 Codex 快照，采集时间：' + $snapshot.checkedAt)
