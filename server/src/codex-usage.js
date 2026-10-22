// Only read the signed-in local Codex account; never start a thread or a model turn.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function sanitize(rate, usage) {
  const buckets = rate?.rateLimitsByLimitId && Object.keys(rate.rateLimitsByLimitId).length ? Object.values(rate.rateLimitsByLimitId) : rate?.rateLimits ? [rate.rateLimits] : [];
  const windows = buckets.flatMap(bucket => ['primary', 'secondary'].flatMap(key => {
    const window = bucket?.[key];
    return window ? [{ limit: String(bucket.limitId || 'codex').slice(0,60), usedPercent: numeric(window.usedPercent), windowDurationMins: numeric(window.windowDurationMins), resetsAt: numeric(window.resetsAt) }] : [];
  }));
  const summary = {};
  for (const key of ['lifetimeTokens','peakDailyTokens','currentStreakDays','longestStreakDays']) summary[key] = numeric(usage?.summary?.[key]);
  return { windows, summary };
}
function readLocal({ spawnImpl = spawn, executable = process.env.CODEX_CLI_PATH || 'codex', timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(executable, ['app-server'], { stdio: ['pipe','pipe','ignore'], windowsHide: true, shell: false });
    let buffer = '', bytes = 0, done = false, rate, usage, rateFailed=false, usageFailed=false;
    const timer = setTimeout(() => finish(new Error('Codex usage timeout')), timeoutMs);
    function finish(error) { if (done) return; done = true; clearTimeout(timer); child.stdin.end(); child.kill(); error ? reject(new Error('Codex usage unavailable')) : resolve(sanitize(rate,usage)); }
    function send(message) { child.stdin.write(JSON.stringify(message)+'\n'); }
    child.on('error', finish); child.stdin.on('error', finish);
    child.on('exit', () => { if (!done) finish(new Error('Codex exited')); });
    child.stdout.on('data', chunk => {
      bytes += chunk.length; if (bytes > 2*1024*1024) return finish(new Error('Response too large'));
      buffer += chunk.toString(); let end;
      while ((end = buffer.indexOf('\n')) >= 0 && !done) {
        const line = buffer.slice(0,end); buffer = buffer.slice(end+1); let message; try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) { if (message.error) return finish(new Error('Initialize failed')); send({method:'initialized',params:{}}); send({id:2,method:'account/rateLimits/read'}); send({id:3,method:'account/usage/read'}); }
        if (message.id === 2 || message.id === 3) {
          // The two reads can fail independently; never discard the valid one.
          if (message.id === 2) {rateFailed=Boolean(message.error);rate=rateFailed?{}:message.result;}
          else {usageFailed=Boolean(message.error);usage=usageFailed?{}:message.result;}
          if (rate !== undefined && usage !== undefined) finish(rateFailed&&usageFailed?new Error('Read failed'):undefined);
        }
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'digital_workbench_usage',version:'1.0.0'}}});
  });
}
async function readCodexUsage() {
  if (process.env.CODEX_USAGE_LOCAL_ENABLED === 'true' && process.env.NODE_ENV !== 'production') {
    return {status:'ok',source:'本机 Codex 账户',checkedAt:new Date().toISOString(),...await readLocal()};
  }
  if (process.env.CODEX_USAGE_SNAPSHOT_FILE) {
    const stat = await fs.stat(process.env.CODEX_USAGE_SNAPSHOT_FILE); if (stat.size > 65536) throw Error('Invalid snapshot');
    const snapshot = JSON.parse(await fs.readFile(process.env.CODEX_USAGE_SNAPSHOT_FILE,'utf8'));
    if (!Number.isFinite(Date.parse(snapshot.checkedAt))) throw Error('Invalid snapshot');
    // Re-sanitize even locally generated snapshots: no account identity or credentials.
    const windows = (Array.isArray(snapshot.windows)?snapshot.windows:[]).slice(0,20);
    const rate = {rateLimitsByLimitId:Object.fromEntries(windows.map((w,i)=>[i,{limitId:w.limit,primary:w}]))};
    return {status:'snapshot',source:'本机同步快照',checkedAt:snapshot.checkedAt,...sanitize(rate,{summary:snapshot.summary})};
  }
  return {status:'unconfigured',message:'未接入本机 Codex 用量同步。云服务器不会读取或保存 Codex 登录凭据。'};
}
module.exports = { readLocal, readCodexUsage, sanitize };
