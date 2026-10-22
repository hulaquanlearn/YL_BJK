const test=require('node:test'),assert=require('node:assert/strict');
const server=require('../src/raw-duty-progress');
test('材料齐备与实际完成分别统计，网页、小程序与API口径一致',async()=>{
 const web=await import('../../spare-parts-web-release/src/utils/raw-duty-progress.mjs');
 const mini=require('../../miniprogram/packages/work/services/raw-duty-progress');
 const entries=Array.from({length:8},(_,i)=>({id:String(i)}));
 const checks=[{dutyId:'1',result:'已完成',photoIds:[]},{dutyId:'2',result:'已完成',photoIds:[1]},
 {dutyId:'3',result:'进行中',note:'正在维修'},{dutyId:'4',result:'未完成',note:'待配件'},
 {dutyId:'5',result:'本周未发生',photoIds:[1]},{dutyId:'6',result:'本期不适用',note:'本月不适用'},
 {dutyId:'7',result:'已完成',note:'  '}];
 const expected={total:8,filled:7,ready:6,missing:1,evidence:1,done:3,abnormal:0,working:1,incomplete:1,exempt:2};
 for(const helper of [server,web,mini]){
  assert.deepEqual(helper.dutyProgress(entries,checks),expected);
  assert.equal(helper.dutyState({result:'进行中',photoIds:[1]}),'evidence');
  assert.equal(helper.dutyMatches({result:'未完成'},'incomplete'),true);
  assert.equal(helper.dutyMatches({result:'未完成'},'evidence'),true);
  assert.equal(helper.dutyMatches({},'missing'),true);
 }
});
