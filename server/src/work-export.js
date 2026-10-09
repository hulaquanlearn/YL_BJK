const ExcelJS = require('exceljs');
const { imageSize, duties } = require('./work-assessment');
function createWorkbook(records, photos, report, name, calendar=null, catalog=duties) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '数字工作台';
  const floors = ['一楼', '二楼', '三楼', '四楼', '五楼'];
  function sheet(name, widths) {
    const s = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    s.columns = widths.map(width => ({ width })); return s;
  }
  function pictures(s, row, col, recordId, height = 130, taskKey = null) {
    const images = photos.filter(p => String(p.record_id) === String(recordId) && (taskKey ? p.task_key === taskKey : !p.task_key));
    if (!images.length) { s.getCell(row, col).value = '未上传照片'; return; }
    s.getRow(row).height = Math.max(height, Math.ceil(images.length / 2) * 100);
    images.forEach((p, i) => {
      const imageId = wb.addImage({ buffer: p.image, extension: p.mime === 'image/png' ? 'png' : 'jpeg' });
      const {width,height:ih}=imageSize(p.image), columns=images.length===1?1:2;
      const slotWidth=(s.getColumn(col).width*7+5)/columns-10,slotHeight=s.getRow(row).height*4/3/Math.ceil(images.length/columns)-10;
      const scale=Math.min(slotWidth/width,slotHeight/ih);
      s.addImage(imageId, { tl: { col: col - 1 + (i % columns) / columns + .02, row: row - 1 + Math.floor(i / columns) / Math.ceil(images.length / columns) }, ext:{width:width*scale,height:ih*scale}, editAs: 'oneCell' });
    });
    s.getRow(row).height = Math.max(height, Math.ceil(images.length / 2) * 100);
  }
  const productionSheetName=(record,check)=>{const siblings=(record.payload.checks||[]).filter(c=>c.productionReport);return `生产异常-${record.id}${siblings.length>1?'-'+(siblings.indexOf(check)+1):''}`;};
  const start=calendar?.weekStart||report?.week_start||records[0]?.week_start;
  if(start){
    const dates=Array.from({length:6},(_,i)=>require('./work-flow').addDays(start,i));
    const matrix=sheet('每周工作记录',[16,52,10,24,...Array(12).fill(22)]);
    matrix.mergeCells(1,1,1,16);matrix.getCell(1,1).value=`${name} · 每周工作记录（${start} 至 ${dates[5]}）`;
    matrix.addRow(['工作事项','工作内容','频次','输出依据',...dates.flatMap((day,i)=>[`周${'一二三四五六'[i]} ${day.slice(5)}`,'验证材料'])]);
    const entries=new Map(catalog.entries.map(d=>[d.id,d]));for(const r of records)for(const c of r.payload.checks||[])if(c.dutySnapshot)entries.set(c.dutyId,c.dutySnapshot);
    for(const duty of entries.values()){
      const row=matrix.addRow([duty.category,duty.title,duty.frequency,duty.evidence]);row.height=65;
      const checks=records.filter(r=>r.kind==='duties'&&r.status==='submitted'&&r.payload.checks?.some(c=>c.dutyId===duty.id));
      const cells=duty.frequency==='每日'?dates:[null];
      for(const [i,day] of cells.entries()){
        const col=5+i*2,list=checks.filter(r=>!day||r.record_date===day);
        if(day&&day===calendar?.restDate){matrix.getCell(row.number,col).value='R 休息';continue;}
        if(!day){matrix.mergeCells(row.number,5,row.number,9);matrix.mergeCells(row.number,10,row.number,16);}
        const materialCol=day?col+1:10;
        matrix.getCell(row.number,col).value=list.map(r=>r.payload.checks.find(c=>c.dutyId===duty.id).status).join('\n')||(duty.frequency==='持续'?'暂无记录':'未填报');
        const notes=list.map(r=>{const c=r.payload.checks.find(c=>c.dutyId===duty.id);return [day?'':r.record_date,c.note,c.action,c.reference,c.productionReport?`详见 ${productionSheetName(r,c)}`:'',...(c.taskEvidence||[]).map(t=>`任务：${t.title}；${t.result}；${t.note||''}；${t.reference||''}`)].filter(Boolean).join('\n')});
        matrix.getCell(row.number,materialCol).value=notes.filter(Boolean).join('\n');
        // A daily item has one record; weekly/continuous items keep every image in the detail sheet.
        if(list.length===1&&photos.some(p=>String(p.record_id)===String(list[0].id)&&p.task_key===duty.id))pictures(matrix,row.number,materialCol,list[0].id,130,duty.id);
      }
    }
    matrix.addRow(['R 休息不计漏报或扣分；持续事项按实际发生记录。']);
  }
  for(const r of records)for(const check of r.payload.checks||[]){
    if(!check.productionReport)continue;const p=check.productionReport,s=sheet(productionSheetName(r,check),[18,42,18,42]);
    s.mergeCells('A1:D1');s.getCell('A1').value='生产异常跟踪表';s.addRow(['日期',r.record_date,'组长',name]);s.addRow(['开机时间',p.startTime,'结束时间',p.endTime]);s.addRow(['AGV数量',p.agvCount,'下线车号',p.vehicleNo]);
    const merged=(label,value)=>{const row=s.addRow([label,value]);s.mergeCells(row.number,2,row.number,4);row.height=40;};
    const section=title=>{const row=s.addRow([title]);s.mergeCells(row.number,1,row.number,4);row.height=28;};merged('维修进度',p.repairProgress);section('问题分析(设备/人员/其他)');for(const issue of p.issues||[]){merged(issue.category,issue.description);merged('耽误总时长',issue.delay)}section('改进措施');merged('',(p.measures||[]).map((v,i)=>`${i+1}. ${v}`).join('\n'));s.lastRow.height=Math.max(80,(p.measures||[]).length*35);
  }
  const simple=records.filter(r=>r.payload.format==='simple');
  if(simple.length){const s=sheet('专项记录',[15,16,14,45,48,28]);s.addRow(['日期','事项','结果','异常说明','在线文档链接','验证截图']);for(const r of simple){const row=s.addRow([r.record_date,require('./work-assessment').kinds[r.kind],r.payload.result,r.payload.note,r.payload.reference]);if(photos.some(p=>String(p.record_id)===String(r.id)))pictures(s,row.number,6,r.id);}}
  const legacy=records.filter(r=>r.payload.format!=='simple');
  const thick = sheet('曲块厚度记录表', [15, 10, ...Array(10).fill(10), 18]);
  const crushing = sheet('破碎度记录表', [15, 10, ...Array(16).fill(8), 18]);
  const processDays=[...new Set(legacy.filter(r=>r.kind==='process').map(r=>r.record_date))];
  for (const day of processDays) {
    const list=legacy.filter(r=>r.kind==='process'&&r.record_date===day);
    const repeats=Math.max(...floors.map((_,i)=>list.filter(r=>r.payload.floor===i+1).length));
    for(let repeat=0;repeat<repeats;repeat++) {
      const tr=thick.addRow(['日期','楼层','曲块厚度（cm；合格范围待确认）']).number;
      thick.mergeCells(tr,3,tr,13);thick.addRow(['','',...Array.from({length:10},(_,i)=>'数据'+(i+1)),'不合格数量']);
      const cr=crushing.addRow(['日期','楼层','闸距']).number;
      crushing.mergeCells(cr,3,cr,10);crushing.mergeCells(cr,11,cr,19);crushing.getCell(cr,11).value='破碎度（%；合格范围待确认）';
      crushing.addRow([]);
      for(let line=0;line<4;line++)for(const first of [3,11]){const c=first+line*2;crushing.mergeCells(cr+1,c,cr+1,c+1);crushing.getCell(cr+1,c).value=(line+1)+'线';}
      crushing.getCell(cr+1,19).value='不合格数量';
      for(let f=1;f<=5;f++) {
        const r=list.filter(r=>r.payload.floor===f)[repeat],d=r?.payload;
        const ts=thick.addRow([day,floors[f-1],...(d?.thickness||Array(10).fill(null))]).number;
        thick.getCell(ts,13).value=d?.thickness?.some(v=>v!==null)?'待判定':'';
        const cs=crushing.addRow([day,floors[f-1]]).number;
        for(let i=0;i<4;i++){
          crushing.mergeCells(cs,3+i*2,cs,4+i*2);crushing.getCell(cs,3+i*2).value=d?.lines?.[i]?.gap||'';
          crushing.mergeCells(cs,11+i*2,cs,12+i*2);crushing.getCell(cs,11+i*2).value=d?.lines?.[i]?.crushing??'';
        }
        crushing.getCell(cs,19).value=d?.lines?.some(v=>v.crushing!==null)?'待判定':'';
      }
    }
  }
  if(!processDays.length){thick.addRow(['本周暂无已提交厚度记录']);crushing.addRow(['本周暂无已提交破碎度记录']);}
  const dutySheet=sheet('日常履职记录',[14,10,58,14,40,40,42,24]);
  dutySheet.addRow(['日期','频次','工作事项','填报状态','验证记录 / 情况说明','处理 / 闭环情况','相关记录链接','照片凭证']);
  const dutyRecords=records.filter(r=>r.kind==='duties'&&r.status==='submitted');
  for(const r of dutyRecords)for(const check of r.payload.checks||[]){
    const duty=check.dutySnapshot||catalog.get(check.dutyId);
    const row=dutySheet.addRow([r.record_date,duty?.frequency||r.payload.mode,duty?.category+' · '+(duty?.title||check.dutyId),check.status,check.note,check.action,check.reference,'']);
    const key=duty?.id||check.dutyId;
    pictures(dutySheet,row.number,8,r.id,130,key);
  }
  if(!dutyRecords.length)dutySheet.addRow(['本周暂无已提交的日常履职记录']);
  for (let f = 1; f <= 5; f++) {
    const list = legacy.filter(r => r.kind === 'inspection' && r.payload.floor === f);
    if (!list.length) continue;
    const s = sheet('专项检查-' + floors[f - 1], [8, 16, 50, 22, 48]);
    s.mergeCells('A1:E1'); s.getCell('A1').value = '专项检查表';
    let index = 0;
    for (const r of list) {
      const d = r.payload;
      s.addRow(['时段', r.week_start, '专项主题', d.theme]);
      s.mergeCells(s.rowCount, 4, s.rowCount, 5);
      s.addRow(['序号', '日期', '问题描述', '位置', '问题照片']);
      const row = s.addRow([++index, r.record_date, d.noIssue ? '已检查，未发现问题' : d.note, d.location]);
      pictures(s, row.number, 5, r.id);
    }
  }
  const block = sheet('曲坯分析记录', [15, ...Array(5).fill(35)]);
  block.addRow(['日期', ...floors]);
  const groups = new Map();
  for (const r of legacy.filter(r => r.kind === 'block')) {
    const key = String(r.record_date).slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [day, list] of groups) {
    // Preserve all records, including multiple entries on the same floor/day.
    const count = Math.max(...floors.map((_, i) => list.filter(r => r.payload.floor === i + 1).length));
    for (let i = 0; i < count; i++) {
      const row = block.addRow([day]); block.addRow([]); block.mergeCells(row.number, 1, row.number + 1, 1);
      for (let f = 1; f <= 5; f++) {
        const r = list.filter(r => r.payload.floor === f)[i]; if (!r) continue;
        pictures(block, row.number, f + 1, r.id);
        block.getCell(row.number + 1, f + 1).value = r.payload.note + (r.payload.action ? '\n处理：' + r.payload.action : '');
        block.getRow(row.number + 1).height = 100;
      }
    }
  }
  if(!processDays.length){wb.removeWorksheet(thick.id);wb.removeWorksheet(crushing.id);}
  if(!legacy.some(r=>r.kind==='block'))wb.removeWorksheet(block.id);
  const summary = sheet('周履职考评', [24, 18, 16, 65, 25]);
  summary.addRow(['组长', name, '周次', report?.week_start || records[0]?.week_start || '']);
  summary.addRow(['状态', report?.status === 'published' ? '已发布' : '未发布', '总分', report?.status === 'published' ? report.result_json?.total : '待复核']);
  summary.addRow(['项目', '满分', '得分', '依据', '记录编号']);
  for (const item of report?.result_json?.items || []) summary.addRow([item.title, item.max, item.score ?? '待复核', item.reason, item.evidence?.join(',') || '']);
  summary.addRow(['本周总结', report?.summary || '']); summary.addRow(['复核意见', report?.feedback || '']);
  for (const s of wb.worksheets) {
    s.views = [{ state: 'frozen', ySplit: 1 }];
    s.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: '宋体', size: 11 }; cell.alignment = { vertical: 'middle', wrapText: true, ...(['问题分析(设备/人员/其他)','改进措施'].includes(cell.value)?{horizontal:'center'}:{}) };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE1E5EB' } } };
      if (row.number === 1) { cell.font.bold = true; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F4F8' } }; }
    }));
  }
  return wb;
}
module.exports = { createWorkbook };
