const { ApiError } = require('./utils');
const { workshopForRole } = require('./workshop-scope');
const D = require('./work-duties');
const kinds = { duties: '日常履职', process: '工艺分析', inspection: '专项检查', block: '曲坯分析' };
const fail = message => { throw new ApiError(400, message); };
function date(value) {
  const d = new Date(value + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail('日期无效');
  return value;
}
function week(value) {
  const d = new Date(date(value) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function text(value, max = 2000) { return String(value || '').trim().slice(0, max); }
function num(value, min, max) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) fail('数值超出允许范围');
  return Number(value);
}
function rules(input) {
  if (!Array.isArray(input) || !input.length || input.length > 20) fail('请配置 1 至 20 项考评规则');
  const result = input.map((r, i) => {
    if (!text(r.title, 100) || !['manual', ...Object.keys(kinds)].includes(r.kind)) fail('规则名称或类型无效');
    const result = { id: String(i + 1), title: text(r.title, 100), kind: r.kind, max: num(r.max, 1, 100), standard: text(r.standard) };
    if (!result.standard) fail('请填写评判标准');
    if (r.kind !== 'manual') {
      Object.assign(result, { target: num(r.target, 1, 7), deduction: num(r.deduction, 0.1, 100) });
      if (!Number.isInteger(result.target)) fail('要求天数必须是 1 至 7 的整数');
    }
    return result;
  });
  if (Math.abs(result.reduce((s, r) => s + r.max, 0) - 100) > 0.001) fail('各项满分之和必须为 100 分');
  return result;
}
function record(input, complete = false) {
  const kind = input.kind;
  if (!kinds[kind]) fail('填报类型无效');
  const data = { note: text(input.note), theme: text(input.theme, 150), location: text(input.location, 150), noIssue: input.noIssue === true,
    action: text(input.action), floor: num(input.floor, 1, 5) };
  if (!Number.isInteger(data.floor)) fail('楼层无效');
  if (kind === 'duties') {
    const mode = String(input.mode || '');
    if (!['daily','weekly','continuous'].includes(mode)) fail('填报频次无效');
    const allowed = D.list(mode), source = Array.isArray(input.checks) ? input.checks : [];
    if (!source.length || source.length > allowed.length) fail('请选择需要填报的工作事项');
    const seen = new Set();
    data.mode = mode;
    data.checks = source.map(raw => {
      const duty = D.get(raw?.dutyId);
      if (!duty || D.cadence[duty.frequency] !== mode || seen.has(duty.id)) fail('工作事项无效或重复');
      seen.add(duty.id);
      const status = String(raw.status || '');
      if (complete && !duty.options.includes(status)) fail(`请选择“${duty.title}”的结果`);
      if (!complete && status && !duty.options.includes(status)) fail(`“${duty.title}”的状态选项无效`);
      const entry = { dutyId: duty.id, status, note: text(raw.note), action: text(raw.action), reference: text(raw.reference, 500) };
      if (duty.id === 'production_progress' && status === '异常') {
        const report = raw.productionReport || {};
        entry.productionReport = {
          startTime: text(report.startTime, 40), endTime: text(report.endTime, 40),
          agvCount: text(report.agvCount, 40), vehicleNo: text(report.vehicleNo, 120),
          repairProgress: text(report.repairProgress),
          issues: (Array.isArray(report.issues) ? report.issues : []).slice(0, 20).map(issue => ({
            category: text(issue.category, 30), description: text(issue.description, 1000), delay: text(issue.delay, 200),
          })).filter(issue => issue.category || issue.description || issue.delay),
          measures: (Array.isArray(report.measures) ? report.measures : []).slice(0, 20).map(x => text(x, 1000)).filter(Boolean),
        };
        if (complete && (!entry.productionReport.issues.length || entry.productionReport.issues.some(issue => !issue.category || !issue.description) || !entry.productionReport.measures.length)) {
          fail('请补全生产异常原因分析和改进措施');
        }
      }
      if (duty.abnormalOptions.includes(status) && !entry.note) fail(`“${duty.title}”发生异常或未完成，请填写情况说明`);
      return entry;
    });
    return data;
  }
  if (kind === 'process') {
    data.thickness = (Array.isArray(input.thickness) ? input.thickness : []).slice(0, 10).map(v => v === '' || v == null ? null : num(v, 0, 100));
    data.lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 4).map(v => ({ gap: text(v.gap, 40), crushing: v.crushing === '' || v.crushing == null ? null : num(v.crushing, 0, 100) }));
    if (complete && (!data.thickness.some(v => v !== null) && !data.lines.some(v => v.crushing !== null))) fail('请至少填写厚度或破碎度测量数据');
    if (complete && data.thickness.some(v => v !== null) && (data.thickness.length !== 10 || data.thickness.some(v => v === null))) fail('厚度记录请填写完整的 10 个测量值');
    if (complete && data.lines.some(v => v.crushing !== null) && (data.lines.length !== 4 || data.lines.some(v => v.crushing === null || !v.gap))) fail('破碎度记录请填写四条线的闸距和测量值');
  }
  if (complete && kind === 'inspection' && (!data.theme || (!data.noIssue && (!data.note || !data.location)))) fail('请填写主题、问题描述和位置，或选择未发现问题');
  if (complete && kind === 'block' && !data.note) fail('请填写曲坯分析说明');
  return data;
}
function evaluate(config, records, manual = {}) {
  const items = config.map(r => {
    if (r.kind === 'manual') {
      const m = manual[r.id];
      if (!m) return { ...r, score: null, reason: '待负责人结合履职证据复核', evidence: [] };
      const reason = text(m.reason);
      if (!reason) fail('人工评分必须填写依据');
      return { ...r, score: num(m.score, 0, r.max), reason, evidence: [] };
    }
    // Multiple entries on one day are evidence, not extra completed daily tasks.
    const evidence = records.filter(x => x.kind === r.kind && x.status === 'submitted' &&
      (r.kind !== 'duties' || x.payload?.mode === 'daily'));
    const count = new Set(evidence.map(x => String(x.record_date).slice(0, 10))).size;
    const autoScore = Math.round(Math.max(0, r.max - Math.max(0, r.target - count) * r.deduction) * 100) / 100;
    const autoReason = `目标 ${r.target} 个填报日，实际有填报 ${count} 日；每少一个填报日扣 ${r.deduction} 分。此项只统计有无提交，不能代表当天所有岗位事项已完成。`;
    const override = manual[r.id];
    if (!override) return { ...r, count, evidence: evidence.map(x => x.id), score: autoScore, reason: autoReason, autoScore, autoReason, overridden: false };
    const reason = text(override.reason);
    if (!reason) fail('修改自动评分必须填写理由');
    const score = num(override.score, 0, r.max);
    return { ...r, count, evidence: evidence.map(x => x.id), score, reason, autoScore, autoReason,
      overridden: score !== autoScore || reason !== autoReason };
  });
  return { items, total: items.some(x => x.score === null) ? null : Math.round(items.reduce((s, x) => s + x.score, 0) * 100) / 100 };
}
function submissionCoverage(records,photos=[]){
  const daily=records.filter(record=>record.kind==='duties'&&record.status==='submitted'&&record.payload?.mode==='daily');
  const photoKeys=new Set(photos.map(photo=>`${photo.record_id}:${photo.task_key}`));
  const completed=daily.flatMap(record=>(record.payload.checks||[]).map(check=>({record,check})));
  return {
    reportedDays:new Set(daily.map(record=>String(record.record_date).slice(0,10))).size,
    expectedItems:null, // Requires an approved shift/leave/production calendar.
    completedItems:completed.length,
    missingEvidenceItems:completed.filter(({record,check})=>D.get(check.dutyId)?.photoRequired&&!photoKeys.has(`${record.id}:${check.dutyId}`)).length,
    expectedItemsReason:'未配置排班、请假、代班和停产日口径，暂不推算应填事项'
  };
}
function manager(user, workshop) { return user.role === 'admin' || workshopForRole(user.role) === workshop; }
function readable(user, member) { return String(user.id) === String(member.user_id) || manager(user, member.workshop_code); }
function mutable(report) { if (report?.status === 'published') throw new ApiError(409, '本周成绩已发布，请负责人退回后再修改'); }
function ruleKey(config) { return require('crypto').createHash('sha256').update(JSON.stringify(config)).digest('hex'); }
function imageSize(b) {
  let width=0,height=0;
  if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16)==='IHDR') {
    width=b.readUInt32BE(16);height=b.readUInt32BE(20);
  } else if (b[0]===255 && b[1]===216) {
    let at=2;
    while(at+4<=b.length) {
      if(b[at]!==255) break;
      const marker=b[at+1]; if(marker===218||marker===217)break;
      const length=b.readUInt16BE(at+2);if(length<2||at+2+length>b.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=b.readUInt16BE(at+5);width=b.readUInt16BE(at+7);break;}at+=length+2;
    }
  }
  if(!width||!height||width*height>24000000) fail('照片无效或像素过大，请使用手机端压缩上传');
  return {width,height};
}
module.exports = { kinds, duties: D, date, week, text, num, rules, record, evaluate, submissionCoverage, manager, readable, mutable, imageSize, ruleKey };
