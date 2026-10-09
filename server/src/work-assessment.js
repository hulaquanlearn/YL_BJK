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
function rules(input, { requireDuty = false, catalog = D } = {}) {
  if (!Array.isArray(input) || !input.length || input.length > (requireDuty ? catalog.entries.length + 20 : 20)) fail('考评规则数量超出范围');
  const selectedDuties = new Set();
  const customIds = new Set();
  const result = input.map((r, i) => {
    const duty = r.dutyId ? catalog.get(r.dutyId) : null;
    const custom = r.custom === true;
    if (custom) {
      if (r.dutyId || r.kind !== 'manual' || r.bonusPerClosure || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.customId || '') || customIds.has(r.customId) || customIds.size >= 20) fail('新增工作事项无效或重复，仅支持人工复核');
      customIds.add(r.customId);
    }
    if (requireDuty && !duty && !custom) fail('请从已建工作事项中选择考评项目');
    if (duty && selectedDuties.has(duty.id)) fail('同一工作事项不能重复配置考评项目');
    if (duty) selectedDuties.add(duty.id);
    const title = duty?.title || text(r.title, 100);
    if (!title || !['manual', ...Object.keys(kinds)].includes(r.kind)) fail('规则名称或类型无效');
    if (duty && !['manual', 'duties'].includes(r.kind)) fail('关联工作事项只能选择人工复核或填报完整性计算');
    if (duty && r.kind === 'duties' && duty.frequency !== '每日') fail('只有每日事项可以按填报完整性计算');
    const result = { id: String(i + 1), title, kind: r.kind, max: num(r.max, requireDuty ? 0.1 : 1, 100), standard: text(r.standard) };
    if (duty) result.dutyId = duty.id;
    if (custom) Object.assign(result, { custom: true, customId: r.customId, category: text(r.category,40) || '其他事项' });
    result.bonusPerClosure=r.bonusPerClosure===0.5?0.5:0;
    if (!result.standard) fail('请填写评判标准');
    if (r.kind !== 'manual') {
      Object.assign(result, duty ? { target: 5, deduction: result.max } : { target: num(r.target, 1, 7), deduction: num(r.deduction, 0.1, 100) });
      if (!Number.isInteger(result.target)) fail('要求天数必须是 1 至 7 的整数');
      if(requireDuty&&result.target>5)fail('周一至周六休息一天，每周最多要求5个填报日');
    }
    return result;
  });
  const fullMark=requireDuty?25:100;
  if (Math.abs(result.reduce((s, r) => s + r.max, 0) - fullMark) > 0.001) fail(`各项满分之和必须为 ${fullMark} 分`);
  return result;
}
function record(input, complete = false, catalog = D) {
  const kind = input.kind;
  if (!kinds[kind]) fail('填报类型无效');
  const data = { note: text(input.note), theme: text(input.theme, 150), location: text(input.location, 150), noIssue: input.noIssue === true,
    action: text(input.action), floor: num(input.floor, 1, 5) };
  if (!Number.isInteger(data.floor)) fail('楼层无效');
  if (kind === 'duties') {
    const mode = String(input.mode || '');
    if (!['daily','weekly','continuous'].includes(mode)) fail('填报频次无效');
    const allowed = catalog.list(mode), source = Array.isArray(input.checks) ? input.checks : [];
    if (!source.length || source.length > allowed.length) fail('请选择需要填报的工作事项');
    const seen = new Set();
    data.mode = mode;
    data.checks = source.map(raw => {
      const duty = catalog.get(raw?.dutyId);
      if (!duty || D.cadence[duty.frequency] !== mode || seen.has(duty.id)) fail('工作事项无效或重复');
      seen.add(duty.id);
      const status = ['photo','document'].includes(duty.reportMode) ? '已提交材料' : String(raw.status || '');
      if (complete && !duty.options.includes(status)) fail(`请选择“${duty.title}”的结果`);
      if (!complete && status && !duty.options.includes(status)) fail(`“${duty.title}”的状态选项无效`);
      const entry = { dutyId: duty.id, status, note: text(raw.note), action: text(raw.action), reference: text(raw.reference, 1000), dutySnapshot: {...duty}, taskAssignmentIds: [...new Set((raw.taskAssignmentIds||[]).map(Number))].slice(0,20) };
      if (duty.documentUrl) entry.reference = duty.documentUrl;
      if ((duty.formType==='production'||duty.id === 'production_progress') && status === '异常') {
        const report = raw.productionReport || {};
        entry.productionReport = {
          startTime: text(report.startTime, 40), endTime: text(report.endTime, 40),
          agvCount: text(report.agvCount, 40), vehicleNo: text(report.vehicleNo, 120),
          repairProgress: text(report.repairProgress),
          issues: (Array.isArray(report.issues) ? report.issues : []).map(issue => ({
            category: text(issue.category, 30), factorType: ['设备','人员'].includes(issue.factorType) ? issue.factorType : '其他', description: text(issue.description, 1000), delay: text(issue.delay, 200),
          })).filter(issue => issue.category || issue.description || issue.delay),
          measures: (Array.isArray(report.measures) ? report.measures : []).slice(0, 20).map(x => text(x, 1000)).filter(Boolean),
        };
        if (complete && (!entry.productionReport.issues.length || entry.productionReport.issues.some(issue => !issue.category || ['其他','其它'].includes(issue.category) || !issue.description) || !entry.productionReport.measures.length)) {
          fail('请补全生产异常原因分析和改进措施');
        }
        if(complete&&(!entry.productionReport.startTime||!entry.productionReport.endTime||!/^\d+$/.test(entry.productionReport.agvCount)||!entry.productionReport.vehicleNo||!entry.productionReport.repairProgress||entry.productionReport.issues.some(issue=>!issue.delay)))fail('请补全开机、结束时间、AGV数量、下线车号、维修进度及耽误时长；无相关情况可填“无”或“0”');
      }
      if (complete && duty.abnormalOptions.includes(status) && !entry.note && !entry.productionReport) fail(`“${duty.title}”发生异常或未完成，请填写情况说明`);
      return entry;
    });
    return data;
  }
  if(input.format==='simple'){
    const result=String(input.result||'');if(complete&&!['正常','异常'].includes(result))fail('请选择正常或异常');
    if(complete&&result==='异常'&&!data.note)fail('请简要说明异常');
    return {...data,format:'simple',result,reference:text(input.reference,1000)};
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
function evaluateBase(config, records, manual = {}, calendar = null) {
  if(calendar)records=records.filter(r=>(r.kind==='duties'&&['weekly','continuous'].includes(r.payload?.mode))||calendar.workDates.includes(String(r.record_date).slice(0,10)));
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
      (r.kind !== 'duties' || (x.payload?.mode === 'daily' && (!r.dutyId || x.payload.checks?.some(check => check.dutyId === r.dutyId && check.status!=='未完成')))));
    const count = new Set(evidence.map(x => String(x.record_date).slice(0, 10))).size;
    const autoScore = Math.round(Math.max(0, r.max - Math.max(0, (calendar?Math.min(r.target,calendar.expectedDays):r.target) - count) * r.deduction) * 100) / 100;
    const autoReason = `目标 ${calendar?Math.min(r.target,calendar.expectedDays):r.target} 个${r.dutyId?'该事项':'记录'}填报日，实际有填报 ${count} 日；每少一个填报日扣 ${r.deduction} 分。此项只统计有无提交，不能代表当天所有岗位事项已完成。`;
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
function defaultRules(catalog=D) {
  const weights={production_progress:2,directive_tasks:2,team_feedback:1,standard_operation:2,process_adjustment:2,quality_issue:1,mes_maintenance:2,iot_equipment:2,energy_usage:1,six_s:2,preproduction_environment:2,onsite_patrol:1,traffic_safety:1,safety_activity:1,contractor_safety:1,safety_violation:1,staff_condition:1};
  const bonus=new Set(['team_feedback','quality_issue','energy_usage','contractor_safety','safety_violation','staff_condition']);
  return catalog.entries.filter(d=>d.active!==false && weights[d.id]).map((d,i)=>({id:String(i+1),dutyId:d.id,title:d.title,kind:d.frequency==='每日'?'duties':'manual',...(d.frequency==='每日'?{target:5,deduction:weights[d.id]}:{}),max:weights[d.id],bonusPerClosure:bonus.has(d.id)?0.5:0,standard:'依据本项工作结果、应填日期和验证材料复核；休息R不扣分。漏报、异常或未完成，每次扣本项分值，基础分最低0分。'+(bonus.has(d.id)?'有记录且经班长确认闭环，每次加0.5分；周总分不超过25分。':'')}));
}
function evaluate(config,records,manual={},calendar=null,options={}){
  const result=evaluateBase(config,records,manual,calendar);
  const audits=calendar ? require('./work-deduction').buildAudits(config,records,calendar,options) : [];
  for(const item of result.items){
    const audit=audits.find(a=>a.ruleId===String(item.id))?.audit;
    if(audit){
      item.deductionAudit=audit;
      if(audit.calendarConfirmed){
        const override=manual[item.id];
        if(item.kind==='duties'){
          item.autoScore=audit.scoreLimit;
          item.autoReason=audit.deductionReason||'已过应报日期无漏报、异常或未完成；休息日及未到填报期限不扣分。';
          if(!override){item.score=item.autoScore;item.reason=item.autoReason;}
        }
        if(audit.deduction){
          if(item.score===null){item.score=audit.scoreLimit;item.reason=audit.deductionReason;}
          else {
            item.score=Math.min(item.score,audit.scoreLimit);
            if(!item.reason?.includes(audit.deductionReason))item.reason=[item.reason,audit.deductionReason].filter(Boolean).join('；');
          }
        }
        if(item.kind==='duties')item.overridden=Boolean(override&&(item.score!==item.autoScore||item.reason!==item.autoReason));
      }
    }
    if(!item.bonusPerClosure)continue;
    const eligible=records.filter(r=>r.status==='submitted' && (!calendar||r.payload?.mode!=='daily'||calendar.workDates.includes(String(r.record_date).slice(0,10))) && r.payload?.checks?.some(c=>c.dutyId===item.dutyId&&String(c.action||'').trim())).map(r=>r.id);
    const confirmed=[...new Set((manual[item.id]?.closureRecordIds||[]).map(Number))];
    if(confirmed.some(id=>!eligible.includes(id)))fail('只能确认本项有效闭环记录');
    const count=confirmed.length;item.closureRecordIds=confirmed;
    if(!Number.isInteger(count)||count<0||count>eligible.length)fail('确认闭环次数不能超过有闭环处理记录的次数');
    item.baseScore=item.score;item.closureCount=count;item.bonus=count*item.bonusPerClosure;item.closureEvidence=eligible;
    if(item.score!==null)item.score=Math.round((item.score+item.bonus)*100)/100;
  }
  result.fullMark=config.reduce((sum,r)=>sum+Number(r.max),0);
  result.total=result.items.some(item=>item.score===null)?null:Math.min(result.fullMark,Math.round(result.items.reduce((sum,r)=>sum+r.score,0)*100)/100);
  return result;
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
module.exports = { kinds, duties: D, date, week, text, num, rules, defaultRules, record, evaluate, submissionCoverage, manager, readable, mutable, imageSize, ruleKey };
