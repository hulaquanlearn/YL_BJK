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
async function analyzeFiles(schedule,attendance,options) {
  const a=await readWorkbook(schedule,'排班表'),b=await readWorkbook(attendance,'考勤表');
  const result=analyzeAttendance(a.rows,b.rows,options);
  result.sources={schedule:{name:schedule.originalname,sheet:a.sheetName,bytes:schedule.buffer.length},attendance:{name:attendance.originalname,sheet:b.sheetName,bytes:attendance.buffer.length}};
  for(const [source,info] of [['排班表',a],['考勤表',b]])if(info.ignoredSheets.length)result.warnings.push({source,message:`仅分析 ${info.sheetName}，另有 ${info.ignoredSheets.length} 个工作表未纳入`});
  return result;
}
module.exports={readWorkbook,analyzeFiles,validateZip,LIMITS};
