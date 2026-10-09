const W=require('./work-assessment');
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function periods(month){
 if(!/^\d{4}-\d{2}$/.test(month))throw new Error('月份无效');
 const start=W.date(month+'-01'),end=add(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10),-1);
 const firstEnd=add(W.week(start),6);
 return Array.from({length:4},(_,i)=>({index:i+1,start:i===0?start:add(firstEnd,1+(i-1)*7),end:i===3?end:add(firstEnd,i*7),fullMark:25}));
}
function summarize(month,reports,records,schedules){
 const rows=periods(month).map(period=>{
   const dates=[];for(let d=period.start;d<=period.end;d=add(d,1))if(new Date(d+'T00:00:00Z').getUTCDay()!==0)dates.push(d);
   const weeks=[...new Set(dates.map(W.week))];const relevant=weeks.map(start=>({start,report:reports.find(r=>String(r.week_start).slice(0,10)===start),schedule:schedules.find(s=>String(s.week_start).slice(0,10)===start)}));
   const missing=relevant.filter(w=>!w.schedule?.rest_date||w.report?.status!=='published');
   if(missing.length)return {...period,status:'pending',score:null,weeks:weeks,pendingWeeks:missing.map(w=>w.start)};
   let weighted=0,weight=0,bonus=0;const closures=new Set();
   for(const w of relevant){
     const result=w.report.result_json,items=result?.items||[];
     const fullMark=items.reduce((n,r)=>n+Number(r.max),0);
     if(!items.length||!fullMark||items.some(r=>r.score==null))return {...period,status:'pending',score:null,weeks,pendingWeeks:[w.start]};
     const days=dates.filter(d=>W.week(d)===w.start&&d!==String(w.schedule.rest_date).slice(0,10)).length;
     const base=items.reduce((n,r)=>n+Number(r.baseScore??r.score),0)*25/fullMark;
     weighted+=base*days;weight+=days;
     for(const item of items)for(const id of item.closureRecordIds||[]){
       const key=item.dutyId+':'+id,record=records.find(r=>Number(r.id)===Number(id)),day=record&&String(record.record_date).slice(0,10);
       if(day>=period.start&&day<=period.end&&!closures.has(key)){closures.add(key);bonus+=Number(item.bonusPerClosure||0);}
     }
   }
   const base=weight?weighted/weight:0;
   return {...period,status:'published',baseScore:Math.round(base*100)/100,bonus:Math.round(bonus*100)/100,score:Math.round(Math.min(25,base+bonus)*100)/100,weeks};
 });
 return {month,fullMark:100,periods:rows,total:rows.some(p=>p.score===null)?null:Math.round(rows.reduce((n,p)=>n+p.score,0)*100)/100,method:'每月固定4个自然周，第4周延续到月底。跨周部分按本月有效工作日加权基础分，闭环加分按记录日期归属，单期封顶25分。只汇总班长已发布成绩。'};
}
module.exports={periods,summarize};
