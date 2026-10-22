const ExcelJS=require('exceljs');
const D=require('./raw-duties');
const {expectedChecks,cadenceSummary}=require('./raw-duty-cadence-summary');
async function workbook(report,photos){
 const w=new ExcelJS.Workbook();w.creator='原粮周履职';
 const s=w.addWorksheet('周履职材料',{pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 s.columns=[7,16,48,12,23,18,48,34,40].map(width=>({width}));
 s.mergeCells('A1:I1');s.getCell('A1').value='原粮车间岗位周履职材料';
 const p=D.period(String(report.week_start).slice(0,10));
 s.mergeCells('A2:I2');s.getCell('A2').value=`${report.identity.name} · ${report.identity.position} · ${report.identity.team||'未分班组'} · ${p.start} 至 ${p.end}`;
 s.mergeCells('A3:I3');s.getCell('A3').value=`材料状态：${D.statuses[report.status]}${['draft','returned'].includes(report.status)?'（草稿）':''}；负责人：${report.identity.reviewerName||'见系统人员分配'}；导出时间：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}；模板：${report.template.title}`;s.getRow(3).height=36;
 s.addRow(['序号','工作事项','工作内容','频次','输出要求','本周结果','本周履职情况','处理进展','验证材料']);
 const detail=w.addWorksheet('验证材料',{pageSetup:{paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
 detail.columns=[12,38,80].map(width=>({width}));detail.addRow(['材料编号','关联事项','图片']);
 const refs=new Map();
 report.template.entries.forEach((e,i)=>{
  const parent=report.checks.find(c=>c.dutyId===e.id)||{},expected=expectedChecks(e,parent,report.cadence,report.week_start);
  const slots=expected.length?expected:[{result:Object.keys(report.cadence?.calendar||{}).length<7?'待确认上班情况':'本周休息',photoIds:[]}];
  slots.forEach((c,index)=>{
   const ids=c.photoIds||[];for(const id of ids){if(!refs.has(id))refs.set(id,[]);refs.get(id).push(`${i+1}. ${e.category}${c.date?' · '+c.date:''}${c.month?' · '+c.month:''}`)}
   const period=c.date||c.month||'',note=[c.recordDate||c.date,c.originWeek?'沿用'+c.originWeek+'周月度记录':'',c.recordedAt?'记录时间：'+c.recordedAt:'',c.firstRecordedAt?'首次记录：'+c.firstRecordedAt:'',c.note].filter(Boolean).join('\n');
   const row=s.addRow([slots.length>1?`${i+1}.${index+1}`:i+1,e.category,e.title,e.frequency+(period?' · '+period:''),e.evidence,report.cadence?.version&&e.frequency==='每班'?(c.result==='未完成'?'未履职':c.result||((c.date||'')<D.today()?'未履职（未记录）':'待填写')):c.result||'未填写',note,c.action||'',ids.map(id=>`材料${id}（见验证材料页）`).join('\n')]);row.height=80;
  });
 });
 if(report.cadence?.version){
  const calendar=w.addWorksheet('日履职概况');calendar.addRow(['日期','上班情况','应填项','已填项','已完成','异常','进行中（历史）','未履职（含未记录）','待补材料']);
  const stats=cadenceSummary(report.template.entries,report.checks,report.cadence,report.week_start,D.today());
  for(const day of stats.dailyOverview)calendar.addRow([day.date,day.state==='work'?'上班':day.state==='rest'?'休息':'待确认',day.state==='work'?day.total:0,day.state==='work'?day.filled:0,day.state==='work'?day.done:0,day.state==='work'?day.abnormal:0,day.state==='work'?day.working:0,day.state==='work'?day.notPerformed:0,day.state==='work'?day.evidence:0]);
  calendar.columns=[16,16,12,12,12,12,12,14].map(width=>({width}));
 }
 for(const [id,labels] of refs){const photo=photos.find(p=>Number(p.id)===id);if(!photo)throw new Error('验证材料缺失，请联系管理员核查');
  const row=detail.addRow([`材料${id}`,labels.join('\n'),'']);row.height=240;
  const size=await require('sharp')(photo.image).metadata();const scale=Math.min(540/size.width,300/size.height);
  detail.addImage(w.addImage({buffer:photo.image,extension:photo.mime==='image/png'?'png':'jpeg'}),{tl:{col:2.1,row:row.number-0.95},ext:{width:size.width*scale,height:size.height*scale}});
 }
 if(!refs.size)detail.addRow(['','本周未关联图片，履职说明见主表']);
 s.addRow(['本周总结','','','','','',report.summary]);s.mergeCells(s.rowCount,1,s.rowCount,6);s.mergeCells(s.rowCount,7,s.rowCount,9);s.lastRow.height=75;
 s.addRow(['负责人意见','','','','','',report.feedback]);s.mergeCells(s.rowCount,1,s.rowCount,6);s.mergeCells(s.rowCount,7,s.rowCount,9);s.lastRow.height=60;
 for(const sheet of w.worksheets){sheet.views=[{state:'frozen',ySplit:sheet===s?4:1}];sheet.eachRow(row=>row.eachCell({includeEmpty:true},c=>{c.font={name:'宋体',size:11};c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'thin',color:{argb:'FFE2E8F0'}}};if(row.number===(sheet===s?4:1)){c.font.bold=true;c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFECEEF8'}}}}))}
 return Buffer.from(await w.xlsx.writeBuffer());
}
async function batch(items){
 const archiver=require('archiver');const archive=archiver('zip',{zlib:{level:6}}),chunks=[];
 const done=new Promise((resolve,reject)=>{archive.on('data',b=>chunks.push(b));archive.on('end',()=>resolve(Buffer.concat(chunks)));archive.on('error',reject)});
 const summary=new ExcelJS.Workbook(),sheet=summary.addWorksheet('周材料汇总');sheet.addRow(['姓名','岗位','班组','周起始','状态','已填项','总项数']);
 for(const {report,photos} of items){const clean=String(report.identity.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');archive.append(await workbook(report,photos),{name:`${report.week_start}-${clean}-${report.user_id}.xlsx`});sheet.addRow([report.identity.name,report.identity.position,report.identity.team,report.week_start,D.statuses[report.status],cadenceSummary(report.template.entries,report.checks,report.cadence,report.week_start,D.today()).progress.filled,cadenceSummary(report.template.entries,report.checks,report.cadence,report.week_start,D.today()).progress.total])}
 sheet.columns=[18,18,20,16,16,12,12].map(width=>({width}));archive.append(Buffer.from(await summary.xlsx.writeBuffer()),{name:'周材料汇总.xlsx'});await archive.finalize();return done;
}
module.exports={workbook,batch};
