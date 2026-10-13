const ExcelJS = require('exceljs');
const path = require('node:path');
const { ApiError } = require('./utils');
const { analyzeAttendance } = require('./attendance-analysis');
const LIMITS = Object.freeze({ fileBytes:10*1024*1024, rows:100000, cells:1000000, expandedBytes:80*1024*1024 });
function validateZip(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length<22||buffer.readUInt32LE(0)!==0x04034b50)throw new ApiError(400,'文件不是有效的 XLSX 工作簿，请勿只修改扩展名');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new ApiError(400,'工作簿损坏或不是标准 XLSX 文件');
  const count=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16);
  if(count>500||offset>=end)throw new ApiError(400,'工作簿内容过多，请仅保留需要分析的工作表');
  let cursor=offset,total=0;
  for(let i=0;i<count;i++){
    if(cursor+46>end||buffer.readUInt32LE(cursor)!==0x02014b50)throw new ApiError(400,'工作簿目录损坏');
    total+=buffer.readUInt32LE(cursor+24);
    if(total>LIMITS.expandedBytes)throw new ApiError(400,'工作簿解压后过大，请拆分文件再导入');
    cursor+=46+buffer.readUInt16LE(cursor+28)+buffer.readUInt16LE(cursor+30)+buffer.readUInt16LE(cursor+32);
  }
}
const cellValue = v => v && typeof v==='object' && !(v instanceof Date)
  ? ('formula' in v || 'sharedFormula' in v ? v.result ?? '' : v.richText ? v.richText.map(x=>x.text).join('') : v.text ?? '') : v ?? '';
async function readWorkbook(file,label) {
  if(!file||path.extname(file.originalname||'').toLowerCase()!=='.xlsx')throw new ApiError(400,`${label}必须选择 .xlsx 文件`);
  if(file.buffer.length>LIMITS.fileBytes)throw new ApiError(400,`${label}不能超过10MB`);
  validateZip(file.buffer);
  const wb=new ExcelJS.Workbook();
  try{await wb.xlsx.load(file.buffer);}catch{throw new ApiError(400,`${label}读取失败，文件可能损坏、加密或格式不受支持`);}
  const sheets=wb.worksheets.filter(s=>s.rowCount>0);
  if(!sheets.length)throw new ApiError(400,`${label}没有有效工作表`);
  const sheet=sheets.find(s=>Array.from({length:Math.min(20,s.rowCount)},(_,i)=>s.getRow(i+1).values).some(r=>r.some(v=>String(cellValue(v)).trim()==='工号')));
  if(!sheet)throw new ApiError(400,`${label}没有找到含“工号”的表头`);
  if(sheet.rowCount>LIMITS.rows||sheet.rowCount*sheet.columnCount>LIMITS.cells)throw new ApiError(400,`${label}内容超出上限，请拆分后导入`);
  const rows=Array.from({length:sheet.rowCount},(_,i)=>Array.from({length:sheet.columnCount},(_,j)=>cellValue(sheet.getRow(i+1).getCell(j+1).value)));
  return {rows,sheetName:sheet.name,ignoredSheets:sheets.filter(s=>s!==sheet).map(s=>s.name)};
}
function inferScheduleMonth(rows,filename='') {
  const found=new Map();
  const add=(year,month,message)=>{
    const period=`${year}-${String(Number(month)).padStart(2,'0')}`;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||Number(year)<2000||Number(year)>2100)throw new ApiError(400,'排班表中的年月无效，请检查文件名和表头',[{source:'排班表',code:'month_invalid',message}]);
    if(!found.has(period))found.set(period,[]);
    found.get(period).push(message);
  };
  const yearMonth=(value,message)=>{
    for(const match of String(value??'').matchAll(/(?<!\d)(\d{4})\s*年\s*(\d{1,2})\s*月/g))add(match[1],match[2],message);
  };
  yearMonth(filename,'文件名中的年月');
  for(const match of String(filename).matchAll(/(?<!\d)(\d{4})-(\d{2})(?!\d)/g))add(match[1],match[2],'文件名中的年月');
  const opening=rows.slice(0,20);
  for(const [i,row] of opening.entries())for(const value of row)if(!(value instanceof Date))yearMonth(value,`第${i+1}行中的年月`);
  // Only schedule date headers supply date evidence. Unrelated dates in staff rows
  // or document metadata do not identify the schedule period.
  const headerIndex=opening.findIndex(row=>['工号','姓名'].every(key=>row.some(value=>String(value??'').replace(/\s/g,'')===key)));
  if(headerIndex>=0)for(const value of opening[headerIndex]){
    const text=value instanceof Date&&!Number.isNaN(value.getTime())?value.toISOString().slice(0,10):String(value??'').trim();
    const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match)add(match[1],match[2],`第${headerIndex+1}行日期表头`);
  }
  if(found.size>1)throw new ApiError(400,'排班表中的年月不一致，请核对文件名、标题和日期表头',[...found].map(([period,evidence])=>({source:'排班表',code:'month_conflict',message:`${period}：${[...new Set(evidence)].join('、')}`})));
  if(!found.size)throw new ApiError(400,'无法从排班表识别完整年月，请选择排班月份',[{source:'排班表',code:'month_required',message:'请选择排班月份'}]);
  return found.keys().next().value;
}
async function analyzeFiles(schedule,attendance,options={}) {
  const a=await readWorkbook(schedule,'排班表'),b=await readWorkbook(attendance,'考勤表');
  const result=analyzeAttendance(a.rows,b.rows,{...options,month:options.month||inferScheduleMonth(a.rows,schedule.originalname)});
  result.sources={schedule:{name:schedule.originalname,sheet:a.sheetName,bytes:schedule.buffer.length},attendance:{name:attendance.originalname,sheet:b.sheetName,bytes:attendance.buffer.length}};
  for(const [source,info] of [['排班表',a],['考勤表',b]])if(info.ignoredSheets.length)result.warnings.push({source,message:`仅分析 ${info.sheetName}，另有 ${info.ignoredSheets.length} 个工作表未纳入`});
  return result;
}
module.exports={readWorkbook,analyzeFiles,inferScheduleMonth,validateZip,LIMITS};
