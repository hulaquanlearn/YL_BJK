const D=require('./raw-duties');
const LIMIT=3;
function quotaWindow(now=new Date()){
 const date=new Date(now.getTime()+8*3600000).toISOString().slice(0,10),start=new Date(date+'T00:00:00+08:00');
 return {date,start:start.toISOString(),end:new Date(start.getTime()+86400000).toISOString(),now:now.toISOString()};
}
async function usage(db,user,window=quotaWindow()){
 if(user.role==='admin')return {date:window.date,limit:null,used:0,remaining:null,unlimited:true};
 const used=await db.summaryQuotaUsed(Number(user.id),window);
 return {date:window.date,limit:LIMIT,used,remaining:Math.max(0,LIMIT-used),unlimited:false};
}
async function reserve(db,user,reportId){
 await db.lockSummaryUser(Number(user.id));const window=quotaWindow(),quota=await usage(db,user,window);
 if(!quota.unlimited&&quota.remaining<=0)D.fail(429,'今日 AI 周总结已达3次上限，请明天再试；系统管理员不受次数限制');
 const detail={quotaDate:window.date,generatedAt:window.now,expiresAt:new Date(Date.now()+120000).toISOString()};
 return {id:await db.event(reportId,user.id,'ai_summary_reserved',detail),detail};
}
module.exports={LIMIT,quotaWindow,usage,reserve};
