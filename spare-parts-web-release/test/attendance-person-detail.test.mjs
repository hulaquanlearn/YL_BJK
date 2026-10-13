import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAttendanceMonth} from '../src/utils/attendance-person-detail.mjs'

function septemberFixture() {
  const days=Array.from({length:30},(_,index)=>{
    const day=index+1,date=`2026-09-${String(day).padStart(2,'0')}`
    if(day>22)return {date,type:'rest',label:'休息'}
    const shift=day<=11?'8:00-16:00':day<=21?'16:00-24:00':'10:00-18:00'
    return {date,type:'work',shift,label:shift}
  })
  const person={id:'G101951',name:'王哲',totalDays:30,shiftCount:22,restDays:8,leaveDays:0,blankDays:0,shiftCounts:{'8:00-16:00':11,'16:00-24:00':10,'10:00-18:00':1},days}
  const results=days.filter(day=>day.type==='work').map(day=>{
    const number=Number(day.date.slice(-2)),status=[1,3].includes(number)?'early':number<=15?'normal':'missing_exit'
    return {key:`${person.id}|${day.date}|${day.shift}`,id:person.id,name:person.name,date:day.date,shift:day.shift,status,advanceSeconds:status==='early'?120:null}
  })
  return {month:'2026-09',people:[person],results:[...results,{id:'G2',name:'李刚',date:'2026-09-01',shift:'8:00-16:00',status:'normal'}]}
}

test('person month reconciles thirty source days, twenty-two shifts and their review results',()=>{
  const analysis=septemberFixture(),before=JSON.stringify(analysis),detail=buildAttendanceMonth(analysis,'G101951')
  assert.equal(detail.month,'2026-09');assert.equal(detail.person.id,'G101951');assert.equal(detail.person.name,'王哲')
  assert.deepEqual(detail.person.shiftCounts,{'8:00-16:00':11,'16:00-24:00':10,'10:00-18:00':1})
  assert.equal(detail.person.totalDays,30);assert.equal(detail.person.shiftCount,22);assert.equal(detail.person.restDays,8)
  assert.deepEqual(detail.summary,{workDays:22,restDays:8,leaveDays:0,blankDays:0,normalShifts:13,earlyShifts:2,reviewShifts:7,unavailableDays:0})
  assert.equal(detail.summary.normalShifts+detail.summary.earlyShifts+detail.summary.reviewShifts,detail.summary.workDays)
  assert.equal(detail.summary.workDays+detail.summary.restDays+detail.summary.leaveDays+detail.summary.blankDays,detail.days.length)
  assert.deepEqual(detail.earlyDays.map(day=>day.date),['2026-09-01','2026-09-03'])
  for(const day of detail.earlyDays){assert.equal(day.statusCategory,'early');assert.equal(day.result.advanceSeconds,120);assert.equal(day.result.id,'G101951')}
  assert.equal(detail.days[21].shift,'10:00-18:00');assert.equal(detail.days[22].type,'rest');assert.equal(detail.days[22].statusCategory,'rest');assert.ok(!detail.days[22].result)
  assert.equal(JSON.stringify(analysis),before,'building a calendar must preserve source metadata and results')
})

test('September 2026 uses a Monday-first calendar with one leading empty cell and unchanged dates',()=>{
  const detail=buildAttendanceMonth(septemberFixture(),'G101951')
  assert.equal(detail.days.length,30);assert.equal(detail.weeks.length,5);assert.ok(detail.weeks.every(week=>week.length===7))
  assert.equal(detail.weeks[0][0],null);assert.equal(detail.weeks[0][1].date,'2026-09-01');assert.equal(detail.weeks[0][1].dayNumber,1)
  assert.equal(detail.weeks[4][2].date,'2026-09-30');assert.equal(detail.weeks[4][2].dayNumber,30);assert.deepEqual(detail.weeks[4].slice(3),[null,null,null,null])
  assert.deepEqual(detail.weeks.flat().filter(Boolean).map(day=>day.date),Array.from({length:30},(_,index)=>`2026-09-${String(index+1).padStart(2,'0')}`))
})

test('February calendars use the actual leap-year month length without generating invalid dates',()=>{
  for(const [month,length] of [['2028-02',29],['2027-02',28]]){
    const lastDate=`${month}-${length}`,person={id:'G1',name:'甲',totalDays:1,shiftCount:0,restDays:1,leaveDays:0,blankDays:0,shiftCounts:{},days:[{date:lastDate,type:'rest',label:'休息'}]}
    const detail=buildAttendanceMonth({month,people:[person],results:[]},'G1')
    assert.equal(detail.days.length,length);assert.equal(detail.days.at(-1).date,lastDate);assert.equal(detail.days.at(-1).type,'rest');assert.equal(detail.summary.restDays,1);assert.equal(detail.summary.unavailableDays,length-1);assert.equal(detail.summary.blankDays,0)
    assert.equal(detail.weeks.flat().filter(Boolean).length,length);assert.ok(!detail.days.some(day=>day.date.endsWith('-30')))
  }
})

test('declared blanks, missing dates and work without results remain distinct from rest and normal',()=>{
  const person={id:'G1',name:'甲',totalDays:3,shiftCount:1,restDays:0,leaveDays:1,blankDays:1,shiftCounts:{'8:00-16:00':1},days:[{date:'2026-09-01',type:'blank',label:''},{date:'2026-09-02',type:'leave',label:'年休假'},{date:'2026-09-03',type:'work',shift:'8:00-16:00',label:'8:00-16:00'}]}
  const detail=buildAttendanceMonth({month:'2026-09',people:[person],results:[{id:'G2',date:'2026-09-03',status:'normal'}]},'G1')
  assert.deepEqual(detail.summary,{workDays:1,restDays:0,leaveDays:1,blankDays:1,normalShifts:0,earlyShifts:0,reviewShifts:1,unavailableDays:27})
  assert.equal(detail.days[0].type,'blank');assert.equal(detail.days[0].available,true);assert.equal(detail.days[0].statusCategory,'blank');assert.equal(detail.days[0].label,'')
  assert.equal(detail.days[1].type,'leave');assert.equal(detail.days[1].statusCategory,'leave');assert.equal(detail.days[1].label,'年休假')
  assert.equal(detail.days[2].type,'work');assert.equal(detail.days[2].statusCategory,'review');assert.ok(!detail.days[2].result,'another person’s result cannot supply a normal shift')
  assert.equal(detail.days[3].type,'blank');assert.equal(detail.days[3].available,false);assert.equal(detail.days[3].statusCategory,'blank');assert.equal(detail.days[3].label,'排班数据未提供')
})

test('unknown people and unavailable authoritative month metadata do not create a fabricated calendar',()=>{
  assert.equal(buildAttendanceMonth(septemberFixture(),'G404'),null)
  assert.equal(buildAttendanceMonth({month:'2026-09',results:[{id:'G1',date:'2026-09-01',status:'normal'}]},'G1'),null)
  assert.equal(buildAttendanceMonth({...septemberFixture(),month:'2026-13'},'G101951'),null)
  assert.equal(buildAttendanceMonth(null,'G101951'),null)
})
