const test=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {inferScheduleMonth,analyzeFiles}=require('../src/attendance-workbook');
const monthHeader=['工号','姓名','9月17号'];
const scheduleRows=[monthHeader,['G1','甲','8:00-16:00']];
const attendanceRows=[['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],['G1','甲','2026-09-17','07:30:00','ONECARD','进'],['G1','甲','2026-09-17','16:05:00','ONECARD','出'],['G1','甲','2026-09-17','18:05:00','GPS0999999','']];
async function file(rows,name){const workbook=new ExcelJS.Workbook();workbook.addWorksheet('Sheet1').addRows(rows);return {originalname:name,buffer:Buffer.from(await workbook.xlsx.writeBuffer())};}

test('month inference accepts explicit year and month in filenames and titles',()=>{
  assert.equal(inferScheduleMonth(scheduleRows,'酿造四部五区2026年9月排班表(2).xlsx'),'2026-09');
  assert.equal(inferScheduleMonth(scheduleRows,'排班2026-09.xlsx'),'2026-09');
  assert.equal(inferScheduleMonth([['2026年9月排班表'],...scheduleRows],'排班表.xlsx'),'2026-09');
  assert.equal(inferScheduleMonth([['2026年 9月排班表'],...scheduleRows],'排班2026-09.xlsx'),'2026-09');
});
test('month inference accepts ISO and Excel date headers with generic filenames',()=>{
  assert.equal(inferScheduleMonth([['工号','姓名','2026-09-17'],['G1','甲','8:00-16:00']],'排班表.xlsx'),'2026-09');
  assert.equal(inferScheduleMonth([['工号','姓名',new Date('2026-09-17T00:00:00Z')],['G1','甲','8:00-16:00']],'排班表.xlsx'),'2026-09');
});
test('month-only metadata asks the user instead of guessing a year',()=>{
  assert.throws(()=>inferScheduleMonth(scheduleRows,'9月份排班表.xlsx'),error=>error.status===400&&error.details[0].code==='month_required'&&error.details[0].message==='请选择排班月份');
  assert.throws(()=>inferScheduleMonth([['打印日期：2026-09-18'],...scheduleRows],'排班表.xlsx'),error=>error.details[0].code==='month_required');
});
test('conflicting inferred filename, title or date-header periods reject',()=>{
  for(const [rows,name] of [
    [[['2026年10月排班表'],...scheduleRows],'排班2026-09.xlsx'],
    [[['工号','姓名','2026-10-17'],['G1','甲','8:00-16:00']],'排班2026-09.xlsx'],
    [[['工号','姓名','2026-09-17','2026-10-01']],'排班表.xlsx'],
  ])assert.throws(()=>inferScheduleMonth(rows,name),error=>error.status===400&&error.details.every(detail=>detail.code==='month_conflict'));
});
test('analyzeFiles infers desktop-style filename period and retains supplied rule options',async()=>{
  const report=await analyzeFiles(await file(scheduleRows,'酿造四部五区2026年9月排班表(2).xlsx'),await file(attendanceRows,'考勤表.xlsx'),{normalExitHours:1});
  assert.equal(report.month,'2026-09');assert.equal(report.options.normalExitHours,1);assert.equal(report.results[0].status,'normal');
});
test('analyzeFiles infers ISO date headers and Excel date headers',async()=>{
  for(const header of ['2026-09-17',new Date('2026-09-17T00:00:00Z')]){
    const report=await analyzeFiles(await file([['工号','姓名',header],scheduleRows[1]],'排班表.xlsx'),await file(attendanceRows,'考勤表.xlsx'));
    assert.equal(report.month,'2026-09');
  }
});
test('explicit user month bypasses filename inference while existing header validation remains',async()=>{
  const report=await analyzeFiles(await file(scheduleRows,'排班2026-10.xlsx'),await file(attendanceRows,'考勤表.xlsx'),{month:'2026-09'});
  assert.equal(report.month,'2026-09');
  await assert.rejects(analyzeFiles(await file(scheduleRows,'排班2026-09.xlsx'),await file(attendanceRows,'考勤表.xlsx'),{month:'2026-10'}),{status:400});
});
test('analyzeFiles emits the month-required code when no reliable year is available',async()=>{
  await assert.rejects(analyzeFiles(await file(scheduleRows,'9月排班.xlsx'),await file(attendanceRows,'考勤表.xlsx')),error=>error.status===400&&error.details[0].code==='month_required');
});
