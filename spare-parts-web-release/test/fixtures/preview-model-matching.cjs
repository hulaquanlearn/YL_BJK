// Synthetic records only; no database or production access.
const {buildMatchPlan,modelFileAvailable}=require('../../../server/src/category-model-matching');
const models=[
  [1,'电机','motor','motor'],[2,'减速电机','gearmotor','reducer'],
  [3,'轴承','bearing','bearing'],[4,'深沟球轴承','轴承','bearing'],
  [5,'消声器','muffler,排气降噪','muffler'],[6,'电缆','钢丝绳','cable'],
  [7,'三角带/V带','三角带,V带','v-belt'],[8,'特殊装置','特殊装置','missing-fixture'],
  [9,'RGV部件','RGV','rgv-part'],[10,'PLC模块','PLC','plc-module']
].map(([id,name,keywords,file])=>({id,name,keywords,modelUrl:`/models/categories/${file}.glb`,imageUrl:`/models/categories/${id===5?'missing-fixture':file}.jpg`,modelScale:1,frontRotationY:0}));
const descriptions=['电机 380V','减速电机 220V','NSK,带座轴承,UCP213，立式座，','需要补充模型的定制总成','消声器 G1/4','人工选择的 RGV 部件','钢丝绳 6mm','特殊装置 X1','普通轴承 6205','三角带 A1000'];
const parts=descriptions.map((name,index)=>({_id:String(index+1),id:index+1,partId:index+1,name,materialDesc:name,code:`TEST${index+1}`,materialCode:`TEST${index+1}`,spec:index===2?'带座轴承,UCP213,立式座，':'',categoryModelId:index===5?9:null,workshopCode:'raw_grain',workshopCodes:['raw_grain'],workshopName:'原粮车间',unit:'个',totalStock:index%3?4:1,safetyStock:2,warehouseAreaName:'五粮货区',locationType:'shelf',shelf:1,position:2,layer:4,location:index+1,locationCode:`0124${String(index+1).padStart(2,'0')}`,partType:'易损件'}));
function library(){return parts.map(part=>{const m=models.find(m=>m.id===part.categoryModelId);return {...part,partImageUrl:part.id===1?'/models/categories/missing-fixture-photo.jpg':null,imageUrl:part.id===1?'/models/categories/missing-fixture-photo.jpg':m?.imageUrl,categoryImageUrl:m?.imageUrl,categoryModelName:m?.name,categoryModelUrl:m?.modelUrl,categoryModelScale:1,categoryFrontRotationY:0}})}
const initialParts=structuredClone(parts);
function handle(url,method,data,send){
  const ok=data=>send({success:true,data});
  if(url.pathname==='/api/fixture/reset'&&method==='POST'){parts.splice(0,parts.length,...structuredClone(initialParts));ok({reset:true});return true}
  if(url.pathname==='/api/part-category-models'){ok(models.map(m=>({...m,associatedParts:parts.filter(p=>p.categoryModelId===m.id).length})));return true}
  if(url.pathname==='/api/part-model-library'){const search=url.searchParams.get('search')||'';ok(library().filter(p=>(p.name+p.code).includes(search)));return true}
  if(url.pathname==='/api/part-category-model-matches/preview'){ok(buildMatchPlan(parts.filter(p=>data.partIds.includes(p.id)),models));return true}
  if(url.pathname==='/api/part-category-model-matches/apply'){
    const plans=buildMatchPlan(parts,models);
    if(data.items.some(item=>{const plan=plans.find(p=>p.partId===item.partId);return !plan||plan.fingerprint!==item.fingerprint||!['ready','review'].includes(plan.status)||!plan.candidates.some(c=>c.id===item.categoryModelId&&modelFileAvailable(c.modelUrl))})){send({msg:'匹配已变化，请重新预览'},409);return true}
    for(const item of data.items)parts.find(p=>p.id===item.partId).categoryModelId=item.categoryModelId;
    ok({affected:data.items.length});return true
  }
  return false;
}
module.exports={parts,library,handle};
