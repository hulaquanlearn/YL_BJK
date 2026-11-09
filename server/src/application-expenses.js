// Official Flash price bounds as checked 2026-11-03. Peak is twice off-peak;
// use bounds rather than guess holiday/peak classification or exchange rates.
const PRICE_SOURCE='https://api-docs.deepseek.com/quick_start/pricing/';
const featureIds={knowledge_chat:'knowledge',raw_summary:'rawSummary',fire_photo_recognition:'firePhoto',robot_question:'robot',robot_modify:'robot',robot_annotations:'robot',robot_annotation_start:'robot',robot_connection:'robot'};
function summarizeExpenses(rows){
 const byFeature={};for(const id of new Set(Object.values(featureIds)))byFeature[id]={currency:'USD',min:0,max:0,estimatedCalls:0,unknownCalls:0,totalTokens:0};
 for(const row of rows){const out=byFeature[featureIds[row.feature]];if(!out||!Number.isSafeInteger(row.modelCalls)||row.modelCalls<1)continue;
  const valid=n=>Number.isSafeInteger(n)&&n>=0,prompt=row.promptTokens,completion=row.completionTokens;
  if(row.provider!=='deepseek'||!/^deepseek-(?:flash|v4(?:\.1)?-flash(?:-vision-exp|-1017)?)$/i.test(row.model||'')||row.modelCalls!==1||!valid(prompt)||!valid(completion)){out.unknownCalls+=row.modelCalls;continue}
  const hit=valid(row.cachedTokens)&&row.cachedTokens<=prompt?row.cachedTokens:null;
  out.min+=((hit===null?prompt*.003:hit*.003+(prompt-hit)*.15)+completion*.6)/1e6;
  out.max+=((hit===null?prompt*.3:hit*.006+(prompt-hit)*.3)+completion*1.2)/1e6;
  out.estimatedCalls++;out.totalTokens+=prompt+completion;
 }
 return {byFeature,pricingAsOf:'2026-11-03',priceSource:PRICE_SOURCE,kind:'token_price_range'};
}
function createExpenseReader({store=require('./ai-call-audit').defaultStore,now=()=>new Date()}={}){
 return async()=>{const day=new Date(new Date(now()).getTime()+8*3600000).toISOString().slice(0,10),from=day.slice(0,8)+'01';const data=await store.list({from,to:day},{includeAll:true});return {from,to:day,...summarizeExpenses(data.items)}};
}
module.exports={summarizeExpenses,createExpenseReader};
