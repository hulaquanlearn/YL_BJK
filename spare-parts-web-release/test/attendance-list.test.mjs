import test from 'node:test'
import assert from 'node:assert/strict'
import {attendanceListRows,sortAttendanceRows} from '../src/utils/attendance-list.mjs'
import {filterAttendanceRows,needsAttendanceReview,attendanceCsv} from '../src/utils/attendance-display.mjs'

function csvCells(csv) {
  const rows=[],row=[];let cell='',quoted=false
  for(let index=1;index<csv.length;index++){
    const character=csv[index]
    if(character==='"'){if(quoted&&csv[index+1]==='"'){cell+='"';index++}else quoted=!quoted}
    else if(character===','&&!quoted){row.push(cell);cell=''}
    else if(character==='\r'&&csv[index+1]==='\n'&&!quoted){row.push(cell);rows.push([...row]);row.length=0;cell='';index++}
    else cell+=character
  }
  row.push(cell);rows.push(row);return rows
}

test('declared rest days complete the chronological month without changing real work results or counts',()=>{
  const days=Array.from({length:30},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`,type:index<22?'work':'rest',...(index<22?{shift:'8:00-16:00',label:'8:00-16:00'}:{label:'休息'})}))
  const results=days.filter(day=>day.type==='work').map((day,index)=>({key:`G1|${day.date}|8:00-16:00`,id:'G1',name:'王哲',date:day.date,shift:day.shift,department:'原粮',scheduleRow:4,status:index<13?'normal':index<15?'early':'missing_exit',advanceSeconds:index>=13&&index<15?300:null})).reverse()
  const analysis={month:'2026-09',people:[{id:'G1',name:'王哲',scheduleRow:4,shiftCount:22,restDays:8,days}],results},before=JSON.stringify(analysis)
  const rows=attendanceListRows(analysis),sorted=sortAttendanceRows(rows)
  assert.equal(rows.length,30);assert.equal(rows.filter(row=>row.rowType==='schedule').length,8);assert.deepEqual(rows.slice(0,22),results);assert.ok(results.every(result=>rows.includes(result)))
  assert.deepEqual({work:rows.filter(row=>row.rowType!=='schedule').length,normal:rows.filter(row=>row.status==='normal').length,early:rows.filter(row=>row.status==='early').length,review:rows.filter(row=>row.status==='missing_exit').length},{work:22,normal:13,early:2,review:7})
  assert.deepEqual(sorted.map(row=>row.date),days.map(day=>day.date));assert.equal(new Set(rows.map(row=>row.key)).size,30);assert.equal(JSON.stringify(analysis),before)
  const rest=rows.find(row=>row.status==='rest');assert.equal(rest.key,'G1|2026-09-23|@rest');assert.equal(rest.shift,'休息');assert.equal(rest.scheduleType,'rest');assert.equal(rest.scheduleRow,4);assert.equal(rest.department,'原粮');assert.equal(rest.finalExit,null);assert.equal(rest.advanceSeconds,null);assert.deepEqual(rest.timeline,[]);assert.deepEqual(rest.findings,[])
  for(const field of ['complete','start','end','gpsTimes','normalExit','normalExitEnd','observationEnd'])assert.equal(Object.hasOwn(rest,field),false,`${field} must not be invented for a rest day`)
})

test('leave and blank labels remain source information while missing work and missing metadata create no fabricated rows',()=>{
  const result={key:'work',id:'G1',name:'甲',date:'2026-09-01',shift:'8:00-16:00',status:'normal'}
  const analysis={results:[result],people:[{id:'G1',name:'甲',row:7,days:[{date:'2026-09-01',type:'work',shift:'8:00-16:00'},{date:'2026-09-02',type:'leave',label:'年休假'},{date:'2026-09-03',type:'blank',label:''},{date:'2026-09-04',type:'work',shift:'8:00-16:00'},{date:'2026-09-05',type:'unavailable'},{date:'2026-09-02',type:'leave',label:'年休假'}]}]}
  const rows=attendanceListRows(analysis)
  assert.equal(rows.length,3);assert.equal(rows[0],result);assert.deepEqual(rows.slice(1).map(row=>[row.date,row.shift,row.status]),[['2026-09-02','年休假','leave'],['2026-09-03','空排班','blank']]);assert.equal(rows[1].scheduleRow,7);assert.equal(rows[1].department,'')
  assert.ok(!rows.some(row=>row.date==='2026-09-04'||row.status==='missing_exit'||row.status==='no_records'))
  assert.deepEqual(attendanceListRows({results:[result]}),[result]);assert.deepEqual(attendanceListRows(null),[])
})

test('an existing real result wins over a duplicate schedule-only declaration for the same person and date',()=>{
  const result={key:'work',id:'G1',name:'甲',date:'2026-09-01',shift:'8:00-16:00',status:'normal'}
  const rows=attendanceListRows({results:[result],people:[{id:'G1',name:'甲',days:[{date:'2026-09-01',type:'rest',label:'休息'}]}]})
  assert.deepEqual(rows,[result]);assert.equal(rows[0],result)
})

test('default date sorting uses deterministic source-person, shift and key ties without mutating input',()=>{
  const rows=[{key:'later',date:'2026-09-02',scheduleRow:4,id:'G1'},{key:'person-b',date:'2026-09-01',scheduleRow:4,id:'G2'},{key:'source-later',date:'2026-09-01',scheduleRow:8,id:'G0'},{key:'b',date:'2026-09-01',scheduleRow:4,id:'G1',shift:'8:00-16:00'},{key:'a',date:'2026-09-01',scheduleRow:4,id:'G1',shift:'8:00-16:00'},{key:'earlier-shift',date:'2026-09-01',scheduleRow:4,id:'G1',shift:'16:00-24:00'}],before=[...rows]
  const sorted=sortAttendanceRows(rows)
  assert.deepEqual(sorted.map(row=>row.key),['earlier-shift','a','b','person-b','source-later','later']);assert.deepEqual(rows,before);assert.notEqual(sorted,rows);assert.ok(sorted.every(row=>rows.includes(row)))
})

test('advance sorting keeps unavailable durations last in both directions and resolves equal durations by date',()=>{
  const rows=[{key:'null',date:'2026-09-01',advanceSeconds:null},{key:'large',date:'2026-09-03',advanceSeconds:300},{key:'zero',date:'2026-09-02',advanceSeconds:0},{key:'tie-later',date:'2026-09-06',advanceSeconds:60},{key:'undefined',date:'2026-09-04'},{key:'small',date:'2026-09-05',advanceSeconds:60},{key:'empty',date:'2026-09-07',advanceSeconds:''},{key:'text',date:'2026-09-08',advanceSeconds:'invalid'},{key:'nan',date:'2026-09-09',advanceSeconds:NaN},{key:'infinite',date:'2026-09-10',advanceSeconds:Infinity}],before=[...rows]
  const unavailable=['null','undefined','empty','text','nan','infinite']
  assert.deepEqual(sortAttendanceRows(rows,{field:'advance',order:'asc'}).map(row=>row.key),['zero','small','tie-later','large',...unavailable])
  assert.deepEqual(sortAttendanceRows(rows,{field:'advance',order:'desc'}).map(row=>row.key),['large','small','tie-later','zero',...unavailable])
  assert.deepEqual(rows,before)
})

test('work filters exclude schedule-only days and CSV exports their source labels without invented gate or coverage values',()=>{
  const results=[{key:'normal',id:'G1',name:'甲',date:'2026-09-01',shift:'8:00-16:00',status:'normal',start:'2026-09-01 08:00:00',end:'2026-09-01 16:00:00',normalExit:'2026-09-01 16:05:00',finalExit:'2026-09-01 16:05:00',advanceSeconds:null,complete:true},{key:'early',id:'G1',name:'甲',date:'2026-09-03',shift:'8:00-16:00',status:'early',advanceSeconds:300},{key:'review',id:'G1',name:'甲',date:'2026-09-05',shift:'8:00-16:00',status:'missing_exit',advanceSeconds:null},{key:'other',id:'G2',name:'乙',date:'2026-09-01',shift:'8:00-16:00',status:'normal'}]
  const days=[{date:'2026-09-01',type:'work',shift:'8:00-16:00'},{date:'2026-09-02',type:'rest',label:'休息'},{date:'2026-09-03',type:'work',shift:'8:00-16:00'},{date:'2026-09-04',type:'leave',label:'年休假'},{date:'2026-09-05',type:'work',shift:'8:00-16:00'},{date:'2026-09-06',type:'blank',label:''}]
  const rows=attendanceListRows({results,people:[{id:'G1',name:'甲',row:7,days}]}),scoped=sortAttendanceRows(filterAttendanceRows(rows,{keyword:'G1'}))
  assert.equal(scoped.length,6);assert.deepEqual(filterAttendanceRows(rows,{keyword:'G1',tab:'normal'}).map(row=>row.key),['normal']);assert.deepEqual(filterAttendanceRows(rows,{keyword:'G1',tab:'early'}).map(row=>row.key),['early']);assert.deepEqual(filterAttendanceRows(rows,{keyword:'G1',tab:'signals'}).map(row=>row.key),['review']);assert.equal(filterAttendanceRows(rows,{keyword:'G1',shift:'8:00-16:00'}).length,3);assert.ok(scoped.filter(row=>row.rowType==='schedule').every(row=>!needsAttendanceReview(row)))
  const [header,...records]=csvCells(attendanceCsv(scoped)),value=(record,name)=>record[header.indexOf(name)],rest=records.find(record=>value(record,'排班日期')==='2026-09-02'),leave=records.find(record=>value(record,'排班日期')==='2026-09-04')
  assert.equal(records.length,scoped.length);assert.equal(value(rest,'班次'),'休息');assert.equal(value(rest,'核查类型'),'休息');assert.equal(value(rest,'排班原始行'),'7');assert.equal(value(leave,'班次'),'年休假')
  for(const field of ['应上班','应下班','本班关联出门','正常下班窗口内出门','提前时长（秒）','班内出门次数','班内返回次数','下班时段GPS','正常下班窗口截止','补充观察截止','文件时间范围覆盖','考勤原始行'])assert.equal(value(rest,field),'',`${field} has no attendance value for a declared rest day`)
})
