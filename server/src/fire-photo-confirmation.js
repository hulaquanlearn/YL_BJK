const crypto = require('node:crypto');
const F = require('./fire-inspection');

// Short-lived, process-local signing key: no images or credentials in the ticket.
// A service restart invalidates pending tickets; clients can recognize again.
const signingKey = crypto.randomBytes(32), TTL = 15 * 60 * 1000;
const signature = value => crypto.createHmac('sha256', signingKey).update(value).digest();
function issue(user, target, recognition, now) {
 const payload = Buffer.from(JSON.stringify({ userId: Number(user.id), target, recognition, expires: now.getTime() + TTL })).toString('base64url');
 return payload + '.' + signature(payload).toString('base64url');
}
function read(token, user, target, photoHash, now) {
 try {
  if (typeof token !== 'string' || token.length > 20000) throw Error();
  const [payload, mac, extra] = token.split('.'), supplied = Buffer.from(mac || '', 'base64url');
  if (extra !== undefined || supplied.length !== 32 || !crypto.timingSafeEqual(signature(payload), supplied)) throw Error();
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.expires <= now.getTime() || data.expires > now.getTime() + TTL || data.userId !== Number(user.id) || JSON.stringify(data.target) !== JSON.stringify(target) || data.recognition?.photoHash !== photoHash || !data.recognition.contentReady) throw Error();
  return data.recognition;
 } catch { F.fail(409, '识别核对已过期或照片、账号已变化，请重新识别本张照片'); }
}
function corrections(body) {
 if (typeof body.deviceCode !== 'string' || !body.deviceCode.trim() || body.deviceCode.length > 100) F.fail(400, '请核对器材编号，最多100个字符');
 if (typeof body.location !== 'string' || !body.location.trim() || body.location.length > 500) F.fail(400, '请填写本次点检位置，最多500个字符');
 let manualChecks = body.manualChecks ?? {};
 try {
  if (typeof manualChecks === 'string') { if (manualChecks.length > 2000) throw Error(); manualChecks = JSON.parse(manualChecks); }
  if (!manualChecks || typeof manualChecks !== 'object' || Array.isArray(manualChecks) || Object.keys(manualChecks).length > 6) throw Error();
  const allowed = new Set(['appearance','box','pressure','seal','cylinder','handle','hose','coupling_handle','hydrant_coupling','pump_button']);
  if (Object.entries(manualChecks).some(([key, value]) => !allowed.has(key) || !['normal','abnormal'].includes(value))) throw Error();
 } catch { F.fail(400, '人工确认结果无效，请逐项选择√正常或×异常'); }
 const sorted = Object.fromEntries(Object.entries(manualChecks).sort(([a],[b]) => a.localeCompare(b)));
 return { deviceCode: body.deviceCode.trim(), location: body.location.trim(), assetId: F.id(body.confirmedAssetId), ...(Object.keys(sorted).length ? { manualChecks: sorted } : {}) };
}
function confirmChecks(recognition, correction) {
 const checks = recognition.checks || [], pending = checks.filter(c => c.requiresConfirmation || c.result === 'unclear'), choices = correction.manualChecks || {};
 if (Object.keys(choices).some(key => !pending.some(c => c.key === key))) F.fail(400, '仅可补充本次未识别清楚的检查项，请重新核对');
 const missing = pending.filter(c => !['normal','abnormal'].includes(choices[c.key]));
 if (missing.length) F.fail(400, '请人工确认：'+missing.map(c => c.name).join('、'));
 const changes = pending.map(c => ({ key: c.key, name: c.name, originalMark: c.recognizedMark || c.mark || '', originalResult: c.result, originalConfidence: c.confidence, result: choices[c.key], mark: choices[c.key] === 'normal' ? '√' : '×' }));
 for (const c of pending) { c.result = choices[c.key]; c.mark = c.result === 'normal' ? '√' : '×'; c.requiresConfirmation = false; c.source = 'manual_confirmation'; }
 if (checks.length !== 6 || checks.some(c => !['normal','abnormal'].includes(c.result))) F.fail(400, '请完整确认全部检查项目后保存');
 recognition.requiresManualConfirmation = false;
 recognition.result = checks.some(c => c.result === 'abnormal') ? 'abnormal' : 'normal';
 return changes;
}
module.exports = { issue, read, corrections, confirmChecks };
