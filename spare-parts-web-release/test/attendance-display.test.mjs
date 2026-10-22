import test from 'node:test'
import assert from 'node:assert/strict'
import {canReadFeature} from '../src/utils/feature-access.mjs'
import {duration,attendanceCsv,associatedExit,needsAttendanceReview,needsAttendanceReanalysis,attendancePeopleForKeyword,attendanceShiftOptions,attendanceResultOptions,attendanceResultGroups,filterAttendanceRows,attendanceEvidence} from '../src/utils/attendance-display.mjs'
test('attendance is raw-grain/admin only and storage is admin only',()=>{
  for(const role of ['admin','raw_grain','qu_making','brewing','viewer']){assert.equal(canReadFeature({role,staffWorkshopCode:'raw_grain'},'/attendance'),['admin','raw_grain'].includes(role));assert.equal(canReadFeature({role},'/work-storage'),role==='admin')}
})
test('CSV preserves timestamps and quotes, distinguishes unavailable seconds and prevents formula injection',()=>{
  assert.equal(duration(1308),'21分48秒');assert.equal(duration(1),'0分01秒');assert.equal(duration(null),'—')
  const row={name:'=CMD()',id:'G1',department:'原粮',date:'2026-09-17',shift:'24:00-8:00',start:'2026-09-17 00:00:00',end:'2026-09-17 08:00:00',key:'G1',status:'missing_exit',advanceSeconds:null,earlyCount:0,gpsTimes:['2026-09-17 08:00:05'],timeline:[{sourceRows:[2,3]}]};const csv=attendanceCsv([row],{G1:{note:'备注"含引号\n换行'}});assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=CMD\(\)/);assert.match(csv,/备注""含引号/);assert.match(csv,/有下班GPS，未见对应闸机出门/);assert.match(csv,/"2；3"/)
})

function csvCells(csv) {
  const rows=[],row=[];let cell='',quoted=false
  for(let i=1;i<csv.length;i++){
    const c=csv[i]
    if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(c===','&&!quoted){row.push(cell);cell=''}
    else if(c==='\r'&&csv[i+1]==='\n'&&!quoted){row.push(cell);rows.push([...row]);row.length=0;cell='';i++}
    else cell+=c
  }
  row.push(cell);rows.push(row);return rows
}
test('normal final exit and later visits remain separate in exported review evidence',()=>{
  const normal={key:'G1',status:'normal',normalExit:'2026-09-30 00:21:00',finalExit:'2026-09-30 00:21:00',normalExitEnd:'2026-09-30 02:00:00',outingCount:2,returnedOutings:2,advanceSeconds:null,complete:true,gpsTimes:['2026-09-30 00:22:00'],outingEvents:[{time:'2026-09-29 18:00:00',type:'out'}],subsequentEvents:[{time:'2026-09-30 07:44:37',type:'out',scopeReason:'重新进门后的出门'}],timeline:[{sourceRows:[12]}],findings:[{code:'returned',text:'班内外出后返回'}]}
  const [header,cells]=csvCells(attendanceCsv([normal]))
  const value=name=>cells[header.indexOf(name)]
  assert.equal(value('本班关联出门'),'2026-09-30 00:21:00')
  assert.equal(value('正常下班窗口内出门'),'2026-09-30 00:21:00')
  assert.equal(value('提前时长（秒）'),'')
  assert.equal(value('班内返回次数'),'2')
  assert.equal(value('后续记录（不补算本班离场）'),'2026-09-30 07:44:37 出门（重新进门后的出门）')
  assert.equal(needsAttendanceReview(normal),false)
  assert.equal(attendanceEvidence(normal).find(e=>e.code==='outings').text,'班内出门 2 次 · 返回 2 次')
})
test('GPS-only shift cannot present next morning exit as its final exit, even for legacy data',()=>{
  const row={status:'missing_exit',finalExit:null,earlyExit:null,normalExit:null,afterExit:null,lateExit:'2026-09-30 07:44:37',gpsTimes:['2026-09-30 00:02:51'],subsequentEvents:[{time:'2026-09-30 07:44:37',type:'out'}]}
  assert.equal(associatedExit(row),null)
  const legacy={status:'late_exit',lateExit:row.lateExit}
  assert.equal(associatedExit(legacy),null)
  assert.equal(associatedExit({status:'returned',earlyExit:'2026-09-29 18:00:00'}),null)
  assert.equal(needsAttendanceReview(legacy),true)
  assert.equal(needsAttendanceReview({status:'no_signal'}),true)
  const [header,cells]=csvCells(attendanceCsv([row]))
  assert.equal(cells[header.indexOf('本班关联出门')],'')
  assert.match(cells[header.indexOf('后续记录（不补算本班离场）')],/07:44:37 出门/)
})
test('CSV protects untrusted evidence and notes from spreadsheet formulas',()=>{
  const row={key:'G1',name:'+SUM(1,1)',id:'@G1',status:'sequence_review',findings:[{text:'=HYPERLINK("https://example.com")'}],sequenceIssues:[{message:'"进门"记录重复'}]}
  const [header,cells]=csvCells(attendanceCsv([row],{G1:{note:'\t=1+1'}}))
  assert.equal(cells[header.indexOf('姓名')],"'+SUM(1,1)")
  assert.equal(cells[header.indexOf('工号')],"'@G1")
  assert.equal(cells[header.indexOf('核查备注')],"'\t=1+1")
  assert.equal(cells[header.indexOf('核查线索')],"'=HYPERLINK(\"https://example.com\")")
  assert.equal(needsAttendanceReview(row),true)
})
test('same-gate retry evidence keeps both raw scans and their source rows in export',()=>{
  const from='2026-09-03 16:05:34',to='2026-09-03 16:05:39'
  const row={status:'normal',finalExit:from,normalExit:from,retryScanCount:1,retryGroups:[{type:'out',gate:'员工出口4',from,to,scanCount:2,sourceRows:[501,502]}],timeline:[{time:from,type:'out',retryScan:true,retryGroupId:'retry-1',retryGroupSize:2,sourceRows:[501]},{time:to,type:'out',retryScan:true,retryGroupId:'retry-1',retryGroupSize:2,sourceRows:[502]}]}
  const [header,cells]=csvCells(attendanceCsv([row]))
  const value=name=>cells[header.indexOf(name)]
  assert.equal(value('重复刷脸次数'),'1')
  assert.equal(value('重复刷脸组（原始行）'),`${from} 至 ${to} 出门 员工出口4 2 条（原始行：501、502）`)
  assert.equal(value('考勤原始行'),'501；502')
  assert.equal(value('本班关联出门'),from)
  assert.equal(attendanceEvidence(row).find(e=>e.code==='retry').text,'重复刷脸 1 条（合并核查）')
  assert.equal(attendanceEvidence({retryScanCount:0}).some(e=>e.code==='retry'),false)
})
test('late filtering independently includes late+early and late+normal shifts, preserving search and export',()=>{
  const rows=[{key:'both',id:'G1',name:'甲',shift:'8:00-16:00',status:'early',arrival:{status:'late',lateSeconds:180}},
    {key:'late',id:'G1',name:'甲',shift:'8:00-16:00',status:'normal',arrival:{status:'late',lateSeconds:60}},
    {key:'early',id:'G2',name:'乙',shift:'8:00-16:00',status:'early',arrival:{status:'on_time',lateSeconds:0}},
    {key:'rest',id:'G1',name:'甲',rowType:'schedule',status:'rest'}];
  assert.deepEqual(filterAttendanceRows(rows,{tab:'late'}).map(r=>r.key),['both','late']);
  assert.deepEqual(filterAttendanceRows(rows,{tab:'early'}).map(r=>r.key),['both','early']);
  assert.equal(filterAttendanceRows(rows,{tab:'late',keyword:'乙'}).length,0);
  assert.equal(attendanceEvidence(rows[0]).find(e=>e.code==='arrival').text,'迟到 3分00秒');
  assert.match(attendanceCsv([rows[0]]),/"迟到"/);assert.match(attendanceCsv([rows[0]]),/"提前出门"/);
});

test('phone lateness remains visible beside departure and CSV preserves pairing evidence',()=>{
  const row={key:'G1|2026-09-17',status:'normal',arrival:{status:'late',basis:'gps',time:'2026-09-17 08:33:31',mobileTime:'2026-09-17 08:33:31',gateTime:'2026-09-17 11:05:56',gapSeconds:9145,paired:false,lateSeconds:2011}};
  assert.equal(attendanceEvidence(row).find(e=>e.code==='arrival').text,'迟到 33分31秒');
  const csv=attendanceCsv([row]).split('\r\n').map(line=>line.replace(/^\uFEFF/,'').slice(1,-1).split('\",\"'));
  const value=label=>csv[1][csv[0].indexOf(label)];
  assert.equal(value('上班核查依据'),'手机打卡');assert.equal(value('迟到时长（秒）'),'2011');
  assert.equal(value('手机与闸机间隔（秒）'),'9145');assert.equal(value('30分钟内配对'),'否');
  assert.equal(value('上班核查时间'),'2026-09-17 08:33:31');
});

test('reports saved before phone/gate arrival pairing require reanalysis',()=>{
  assert.equal(needsAttendanceReanalysis(null),false)
  assert.equal(needsAttendanceReanalysis({version:1}),true)
  assert.equal(needsAttendanceReanalysis({version:2}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:1}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:2}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:3}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:4}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:5}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:6}),true)
  assert.equal(needsAttendanceReanalysis({version:2,ruleRevision:7}),false)
})
test('shift options preserve source order and only expose the searched person’s actual shifts',()=>{
  const analysis={shiftOptions:['16:00-24:00','8:00-16:00','10:00-18:00','7:30-15:30'],people:[{id:'G101951',name:'王哲',totalDays:30,restDays:8,shiftCount:22,shiftCounts:{'8:00-16:00':11,'16:00-24:00':10,'10:00-18:00':1}},{id:'G2',name:'李刚',shiftCount:22,shiftCounts:{'7:30-15:30':22}}]}
  assert.deepEqual(attendanceShiftOptions(analysis),analysis.shiftOptions)
  assert.deepEqual(attendanceShiftOptions(analysis,' 王哲 '),['8:00-16:00','16:00-24:00','10:00-18:00'])
  assert.deepEqual(attendanceShiftOptions(analysis,'g101951'),['8:00-16:00','16:00-24:00','10:00-18:00'])
  assert.deepEqual(attendanceShiftOptions(analysis,'不存在'),[])
  const [wang]=attendancePeopleForKeyword(analysis,'王哲')
  assert.equal(wang.shiftCount,22);assert.equal(wang.restDays,8);assert.equal(wang.totalDays,30)
})
test('older reports derive shift options by schedule row and date rather than result severity',()=>{
  const analysis={results:[{scheduleRow:9,date:'2026-09-01',shift:'7:30-15:30',name:'李刚',id:'G2'},{scheduleRow:8,date:'2026-09-02',shift:'8:00-16:00',name:'王哲',id:'G1'},{scheduleRow:8,date:'2026-09-01',shift:'16:00-24:00',name:'王哲',id:'G1'}]}
  assert.deepEqual(attendanceShiftOptions(analysis),['16:00-24:00','8:00-16:00','7:30-15:30'])
  assert.deepEqual(attendanceShiftOptions(analysis,'王哲'),['16:00-24:00','8:00-16:00'])
  assert.deepEqual(attendancePeopleForKeyword(analysis,'王哲'),[])
})
test('result, shift, person and advance filters compose and exported rows match the filtered count',()=>{
  const rows=[{key:'early',name:'王哲',id:'G1',status:'early',shift:'8:00-16:00',advanceSeconds:400},{key:'gps',name:'王哲',id:'G1',status:'missing_exit',shift:'16:00-24:00',advanceSeconds:null},{key:'normal',name:'王哲',id:'G1',status:'normal',shift:'8:00-16:00',advanceSeconds:null},{key:'other',name:'李刚',id:'G2',status:'missing_exit',shift:'16:00-24:00',advanceSeconds:null}]
  const gps=filterAttendanceRows(rows,{tab:'early',status:'missing_exit',shift:'16:00-24:00',keyword:' g1 '})
  assert.deepEqual(gps.map(r=>r.key),['gps'])
  assert.equal(csvCells(attendanceCsv(gps)).length-1,gps.length)
  assert.deepEqual(filterAttendanceRows(rows,{tab:'early',keyword:'王哲',minAdvance:300}).map(r=>r.key),['early'])
  assert.deepEqual(filterAttendanceRows(rows,{tab:'signals',keyword:'王哲'}).map(r=>r.key),['gps'])
  assert.equal(['normal','early','signals'].reduce((n,tab)=>n+filterAttendanceRows(rows,{tab,keyword:'王哲'}).length,0),filterAttendanceRows(rows,{tab:'all',keyword:'王哲'}).length)
  assert.deepEqual(filterAttendanceRows(rows,{tab:'normal',keyword:'王哲'}).map(r=>r.key),['normal'])
  assert.deepEqual(attendanceResultOptions(rows).map(s=>s.value),['early','missing_exit','normal'])
  assert.equal(attendanceResultOptions(rows).find(s=>s.value==='missing_exit').label,'有下班GPS，未见对应闸机出门')
})

test('result groups use concise labels, stable business order and exact counts',()=>{
  const rows=['unmatched','missing_no_gps','normal','sequence_review','no_records','missing_exit','early','partial','normal','missing_exit'].map(status=>({status}))
  const groups=attendanceResultGroups(rows)
  assert.deepEqual(groups,[
    {label:'正常',options:[{value:'normal',label:'正常下班',count:2}]},
    {label:'待核查',options:[{value:'early',label:'提前出门',count:1},{value:'missing_exit',label:'GPS下班待核查',count:2},{value:'sequence_review',label:'进出待核查',count:1},{value:'missing_no_gps',label:'缺下班记录',count:1}]},
    {label:'数据不足',options:[{value:'partial',label:'文件覆盖不足',count:1},{value:'unmatched',label:'人员未匹配',count:1},{value:'no_records',label:'班次无记录',count:1}]}
  ])
  assert.equal(groups.flatMap(group=>group.options).reduce((sum,option)=>sum+option.count,0),rows.length)
  assert.deepEqual(attendanceResultGroups([...rows].reverse()),groups,'input severity or date order does not change the menu')
  assert.equal(attendanceResultOptions(rows).find(option=>option.value==='normal').label,'正常下班出门','table and CSV labels remain complete')
})

test('result groups omit absent categories and retain legacy and unknown results',()=>{
  assert.deepEqual(attendanceResultGroups([]),[])
  assert.deepEqual(attendanceResultGroups([{status:'normal'},{status:'normal'}]),[{label:'正常',options:[{value:'normal',label:'正常下班',count:2}]}])
  assert.deepEqual(attendanceResultGroups([{status:'sequence_review'}]),[{label:'待核查',options:[{value:'sequence_review',label:'进出待核查',count:1}]}])
  const rows=['no_signal','manual_pending','late_exit','returned','manual_pending'].map(status=>({status}))
  assert.deepEqual(attendanceResultGroups(rows),[
    {label:'待核查',options:[{value:'manual_pending',label:'待核查',count:2}]},
    {label:'旧版结果',options:[{value:'returned',label:'旧规则：出门后班内返回',count:1},{value:'late_exit',label:'旧规则：观察窗后有出门',count:1},{value:'no_signal',label:'旧规则：未见所查异常',count:1}]}
  ])
})

test('result groups scoped to Wang reconcile his twenty-two shifts and exclude other people',()=>{
  const counts={normal:13,early:2,missing_exit:3,sequence_review:2,missing_no_gps:1,partial:1}
  const wang=Object.entries(counts).flatMap(([status,count])=>Array.from({length:count},(_,index)=>({key:`${status}-${index}`,name:'王哲',id:'G101951',status})))
  const rows=[{name:'李刚',id:'G2',status:'unmatched'},...wang,{name:'李刚',id:'G2',status:'no_records'},{name:'李刚',id:'G2',status:'normal'}]
  const scoped=filterAttendanceRows(rows,{keyword:' 王哲 '}),groups=attendanceResultGroups(scoped),options=groups.flatMap(group=>group.options)
  assert.equal(scoped.length,22);assert.equal(options.reduce((sum,option)=>sum+option.count,0),22);assert.equal(options.find(option=>option.value==='normal').count,13)
  assert.deepEqual(Object.fromEntries(options.map(option=>[option.value,option.count])),counts)
  assert.ok(!options.some(option=>['unmatched','no_records'].includes(option.value)),'other people do not add status options to Wang’s filter')
})
