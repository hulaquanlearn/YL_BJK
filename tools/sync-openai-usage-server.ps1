$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$snapshotPath = Join-Path $projectRoot '.local/openai-usage-sync/openai-usage.json'
& node (Join-Path $PSScriptRoot 'sync-openai-usage.cjs') $snapshotPath
if ($LASTEXITCODE -ne 0) { throw '平台采集失败，服务器原快照保留。' }
$sshArgs = @('-i','C:/Users/Lenovo/.ssh/id_rsa_navicat','-p','22222','-o','BatchMode=yes','-o','ConnectTimeout=12','-o','StrictHostKeyChecking=yes','root@49.234.185.199')
$remoteTemp = '/opt/spare-parts/server-private-usage/.openai-usage-' + [guid]::NewGuid().ToString() + '.json'
& ssh @sshArgs 'mkdir -p /opt/spare-parts/server-private-usage && chmod 700 /opt/spare-parts/server-private-usage'
if ($LASTEXITCODE -ne 0) { throw '私有快照目录不可用。' }
& scp -i C:/Users/Lenovo/.ssh/id_rsa_navicat -P 22222 -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes $snapshotPath ('root@49.234.185.199:' + $remoteTemp)
if ($LASTEXITCODE -ne 0) { throw '快照上传失败，原快照保留。' }
$expectedHash = (Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash.ToLowerInvariant()
$remoteCommand = "set -e; test " + '$' + "(sha256sum $remoteTemp | cut -d' ' -f1) = '$expectedHash'; chmod 600 $remoteTemp; if test -f /opt/spare-parts/server-private-usage/openai-usage.json; then mkdir -p /opt/spare-parts/server-private-usage/history; chmod 700 /opt/spare-parts/server-private-usage/history; cp -p /opt/spare-parts/server-private-usage/openai-usage.json /opt/spare-parts/server-private-usage/history/openai-" + [guid]::NewGuid().ToString() + ".json; fi; mv -f $remoteTemp /opt/spare-parts/server-private-usage/openai-usage.json"
& ssh @sshArgs $remoteCommand
if ($LASTEXITCODE -ne 0) { throw '快照校验失败，原快照保留。' }
Write-Output '已同步GPT平台用量快照，未上传Admin密钥。'
