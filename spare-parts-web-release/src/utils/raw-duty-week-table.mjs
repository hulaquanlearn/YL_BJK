import {weekDays,checkFor} from './raw-duty-cadence-summary.mjs'
function weekTable(entries,checks,calendar,start,today,legacy=false){
 const days=weekDays(start),names=['周一','周二','周三','周四','周五','周六','周日'];
 const rows=entries.map((e,index)=>{
  const parent=checks.find(c=>c.dutyId===e.id)||{},cells=[];
  const cell=(date,span=1)=>{
   const daily=e.frequency==='每班',monthly=e.frequency==='每月';
   const c=legacy?(daily?(parent.recordDate===date?parent:{}):monthly?(parent.recordDate?.slice(0,7)===date.slice(0,7)?parent:{}):parent):checkFor(e,parent,date);
   let text=c.result||'待填写',tone=c.result==='已完成'?'done':['未完成','异常'].includes(c.result)?'bad':c.result?'pending':'missing',detail='';
   if(daily&&legacy){
    if(!c.result){text=date>today?'未到日期':'未按日记录';tone=date>today?'muted':'pending';detail=date>today?'':'上班/休息待确认'}
    else {text=c.result==='未完成'?'未履职':c.result;detail='原材料记录日期'}
   }else if(daily){
    if(date>today){text='未到日期';tone='muted'}
    else if(calendar[date]==='rest'){text='休息';tone='muted'}
    else if(calendar[date]!=='work'){text='待确认';tone='pending'}
    else if(!c.result&&date<today){text='未履职';detail='未记录';tone='bad'}
    else if(c.result==='未完成')text='未履职';
    if(c.firstRecordedAt&&new Date(Date.parse(c.firstRecordedAt)+8*3600000).toISOString().slice(0,10)>date)detail='补录';
   }else if(monthly){text=c.result==='已完成'?'本月已完成':c.result?'本月'+c.result:'本月待填写';detail=c.recordDate?c.recordDate+' 执行':date.slice(0,7)+' · 当月完成一次'}
   else if(c.result&&c.recordDate&&c.recordDate!==date){text='—';tone='muted'}
   else if(c.result){detail=c.recordDate?'实际执行':'待补执行日期'}
   else if(date>today){text='未到日期';tone='muted'}
   return {date,span,text,tone,detail,result:c.result||'',note:c.note||'',action:c.action||'',photoCount:c.photoIds?.length||0,recordDate:c.recordDate||'',shared:!!c.shared};
  };
  if(legacy&&e.frequency!=='每班'&&!parent.recordDate){cells.push({date:days[0],span:7,text:parent.result?parent.result+' · 待补日期':'待填写',tone:parent.result==='异常'?'bad':parent.result?'pending':'missing',detail:parent.result?'原周材料，未记录执行日期':'本期尚无记录',result:parent.result||'',note:parent.note||'',action:parent.action||'',photoCount:parent.photoIds?.length||0,recordDate:'',shared:false})}
  else if(e.frequency==='每月'){for(const date of days){const last=cells.at(-1);if(last&&last.date.slice(0,7)===date.slice(0,7))last.span++;else cells.push(cell(date))}}
  else for(const date of days)cells.push(cell(date));
  const totalMissing=e.frequency==='每班'?cells.filter(c=>c.text==='未履职').length:0;
  return {...e,index,cells,totalMissing,legacySummary:legacy&&parent.result&&e.frequency==='每班'?'原周记录：'+parent.result:'',periodDate:e.frequency!=='每班'&&e.frequency!=='每月'?parent.recordDate||'':''};
 });
 return {days:days.map((date,i)=>({date,shortDate:date.slice(5),name:names[i]})),rows};
}
export {weekTable};
