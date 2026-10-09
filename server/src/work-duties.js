const entries = [
  ['production_progress','基础工作','跟进生产进度，出现异常及时调度生产，完成当天生产任务','每日','生产进度异常表',['正常','异常'],false],
  ['directive_tasks','基础工作','处理指令性工作和突发问题。','每日','闭环记录',['已完成','未完成'],false],
  ['team_feedback','基础工作','了解线内员工工作开展情况，发现异常及时沟通并反馈。','每日','异常反馈记录',['无异常','有异常'],false],
  ['standard_operation','质量管理','检查生产工艺标准化作业执行情况；','每日','问题记录',['正常','异常'],false],
  ['process_adjustment','质量管理','及时对工艺参数进行调整；','每日','工艺数据清单',['已完成','未完成','无需调整'],false],
  ['quality_issue','质量管理','对产质量异常情况立即报备并进行原因分析、验证调整。','每日','问题分析表',['无异常','有异常'],false],
  ['mes_maintenance','设备管理','根据MES管理规定检查设备点检、保养工单执行情况；','每日','问题报备记录',['正常','异常'],false],
  ['iot_equipment','设备管理','通过工业物联网系统，检查生产设备状态和故障信息；','每日','问题反馈记录',['正常','异常'],false],
  ['energy_usage','设备管理','关注能耗使用情况，针对异常及时分析原因并制定措施','每周','分析记录',['无异常','有异常'],false],
  ['six_s','5S管理','根据酿造四部6S管理标准，检查现场5S执行情况。','每日','照片留痕',['正常','异常'],true],
  ['preproduction_environment','5S管理','生产前检查现场环境，消除影响生产、安全等因素；','每日','问题反馈记录',['正常','异常'],false],
  ['onsite_patrol','5S管理','班中现场巡检或通过中控室监控查看生产现场情况，发现问题及时处理。','每日','问题记录',['正常','异常'],false],
  ['traffic_safety','安全','班后抽查交通安全，组织员工到家报平安。','每周','照片留痕、群内聊天记录',['已完成','未完成'],true],
  ['safety_activity','安全','落实安排各项安全活动。（涵盖每周专项检查）','持续','记录留痕',['已完成','未完成'],false],
  ['contractor_safety','安全','核对第三方人员信息，检查第三方及外来单位人员施工作业安全规范；','持续','照片留痕',['正常','异常'],true],
  ['safety_violation','安全','检查员工及第三方“三违”行为及劳保用品佩戴情况；','持续','问题照片及处理通报记录',['未发现','发现问题'],true],
  ['staff_condition','安全','关注员工及第三方的精神状态，及时发现并处理疲劳、情绪不稳定等可能影响安全生产的因素。','每日','问题反馈记录',['正常','异常'],false],
].map(([id,category,title,frequency,evidence,options,photoRequired]) => ({
  id, category, title, frequency, evidence, options, photoRequired,
  abnormalOptions: options.filter(v => ['异常','有异常','未完成','发现问题'].includes(v)),
}));

// Match the supplied weekly worksheet: some rows are evidence, not a judgment.
const documentIds = new Set(['standard_operation','process_adjustment','safety_activity']);
for (const entry of entries) {
  entry.worksheetVersion = 2;
  entry.reportMode = documentIds.has(entry.id) ? 'document' : ['traffic_safety','six_s'].includes(entry.id) ? 'photo' : 'result';
  if (entry.reportMode !== 'result') { entry.options = ['已提交材料']; entry.abnormalOptions = []; entry.photoRequired = entry.reportMode === 'photo'; }
  else if (entry.id !== 'directive_tasks') { entry.options=['正常','异常']; entry.abnormalOptions=['异常']; }
  if (entry.id === 'quality_issue') entry.abnormalEvidence = true;
  if (['mes_maintenance','iot_equipment'].includes(entry.id)) entry.photoRequired = true;
  if (['mes_maintenance','iot_equipment','contractor_safety','safety_violation'].includes(entry.id)) entry.photoWhen = 'abnormal';
}
const byId = new Map(entries.map(entry => [entry.id, entry]));
const fixedDocuments = {
  standard_operation: { documentTitle: '2026年曲坯分析记录', documentUrl: 'https://www.kdocs.cn/l/cuvwtXifQI5l' },
  process_adjustment: { documentTitle: '四部制曲工艺分析表', documentUrl: 'https://www.kdocs.cn/l/cu8JE709DJFw' },
  safety_activity: { documentTitle: '专项检查表', documentUrl: 'https://www.kdocs.cn/l/cpTIwcP5eUkN' },
};
// Supply the agreed links for existing saved catalogs as well as the initial catalog.
// An explicitly configured document takes precedence over these defaults.
function withFixedDocument(duty) {
  if (!duty) return duty;
  const linked = duty.documentConfigured || duty.documentUrl || !fixedDocuments[duty.id] ? duty : { ...duty, ...fixedDocuments[duty.id] };
  // Sharing a URL is not evidence of this person's completed work. New submissions
  // require a screenshot; old record snapshots keep their original requirements.
  if (linked.reportMode === 'document') return { ...linked, documentScreenshotRequired: Boolean(linked.documentUrl), photoRequired: Boolean(linked.documentUrl) };
  return linked;
}
for (const duty of entries) Object.assign(duty, withFixedDocument(duty));
// Upgrade recognized built-in legacy forms on read; never rewrite record snapshots.
// Saving the catalog stamps version 2, so later deliberate admin changes are retained.
function withWorksheet(duty) {
  const current = byId.get(duty?.id);
  const legacyOptions = [['正常','异常'],['无异常','有异常'],['未发现','发现问题'],['已完成','未完成'],['已完成','未完成','无需调整'],['已提交材料']];
  if (!current || duty.worksheetVersion >= 2 || !legacyOptions.some(options => JSON.stringify(options) === JSON.stringify(duty.options))) return duty;
  return { ...duty, worksheetVersion: 2, reportMode: current.reportMode, options: [...current.options], abnormalOptions: [...current.abnormalOptions],
    photoRequired: current.photoRequired, photoWhen: current.photoWhen || 'always', abnormalEvidence: current.abnormalEvidence === true };
}
function materialRequirement(duty, status) {
  if (duty?.documentScreenshotRequired) return 'photo';
  if (duty?.abnormalEvidence && duty.abnormalOptions.includes(status)) return 'either';
  if (duty?.reportMode === 'document') return 'either';
  if (duty?.reportMode === 'photo') return 'photo';
  return duty?.photoRequired && (duty.photoWhen !== 'abnormal' || duty.abnormalOptions.includes(status)) ? 'photo' : 'optional';
}
function hasMaterial(duty, check, hasPhoto) {
  const requirement = materialRequirement(duty, check.status);
  const linkedPhoto = check.taskEvidence?.some(t => t.files?.length);
  const link = check.reference || check.taskEvidence?.some(t => t.reference);
  return requirement === 'optional' || hasPhoto || linkedPhoto || (requirement === 'either' && Boolean(link));
}
const cadence = { '每日': 'daily', '每周': 'weekly', '持续': 'continuous' };
function list(frequency) { return entries.filter(entry => !frequency || cadence[entry.frequency] === frequency); }
function get(id) { return byId.get(String(id)); }
module.exports = { entries, byId, cadence, list, get, materialRequirement, hasMaterial, withFixedDocument, withWorksheet };
