// Local UI verification only. Synthetic in-memory data; never connects to MySQL.
const http = require('node:http');
const {makePartsTemplate,makeModelBindingsTemplate}=require('../../../server/src/import-workbook');
const {buildReplenishmentItem}=require('../../../server/src/replenishment');
const user = { id: 1, role: 'admin', displayName: '本地界面测试', username: 'preview' };
const workshops = [{ code:'raw_grain', name:'原粮车间' },{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}];
let parts = [
  { _id:'1',materialCode:'505019280',materialDesc:'FAG 调心滚子轴承 22315E1-K',spec:'22315E1-K',partType:'易损件',totalStock:0 },
  { _id:'2',materialCode:'505019415',materialDesc:'FESTO 电磁阀 VUVS-LK30-M52-AD-G38',spec:'VUVS-LK30-M52',partType:'易损件',totalStock:2 },
  { _id:'3',materialCode:'505019297',materialDesc:'NSK 带座轴承 UCP213 立式座',spec:'UCP213',partType:'易损件',totalStock:0 },
  { _id:'4',materialCode:'502005123',materialDesc:'南京汉德电子 失速传感器 ISS12-P',spec:'ISS12-P',partType:'质保件',totalStock:0 }
].map((p,index)=>({...p,partId:index+10,workshopCode:'raw_grain',workshopName:'原粮车间',unit:'个',warehouseAreaName:'五粮货区',locationType:'shelf',locationCode:`01240${index+1}`,shelf:1,position:2,layer:4,location:index+1,reorderPoint:2,maxStock:6,price:120,inventoryStatus:index===2?'待审批':'未盘点'}));
let equipment=[{id:'1',equipmentName:'斗式提升机 NE30',workshopCode:'raw_grain',workshopGroup:'输送工段',notes:'驱动、传动及检测部件',partCount:2},{id:'2',equipmentName:'双仓平筛 FSFG',workshopCode:'raw_grain',workshopGroup:'五粮工段',partCount:1},{id:'3',equipmentName:'背负式 AGV',workshopCode:'brewing',workshopGroup:'转运工段',partCount:0}];
const relation={1:[{...parts[0],id:'11',quantityPerEquipment:2},{...parts[1],id:'12',quantityPerEquipment:1}],2:[{...parts[3],id:'13',quantityPerEquipment:1}],3:[]};
const catalog=require('../../public/models/reference-20260904/manifest.json');
const {summarizeInventory,summarizeInventoryScopes}=require('../../../server/src/inventory-metrics');
const knowledge=Array.from({length:19},(_,i)=>({id:i+1,entryType:i%5===0?'fault':'document',title:['背负式AGV电路图（新车）','翻曲车电路图','平衡重电路图','交叉码垛电机编码器异常','背负式AGV说明书（简化版）'][i%5],summary:i%5===0?'设备旋转后造成线缆拉扯停机，伺服驱动器报警F7453。':'',faultSymptom:i%5===0?'设备旋转后造成线缆拉扯停机，伺服驱动器报警F7453。':'',category:i%5===0?'故障经验':'设备资料',equipmentName:'AGV',tags:['背负式AGV'],uploadedByName:'本地测试',createdAt:'2026-09-01',viewCount:i,hasFile:i%5!==0,solution:'检查线缆固定情况。',uploadedBy:1}));
const categoryModels=catalog.models.map((m,i)=>({id:i+1,name:m.name,modelUrl:'/models/reference-20260904/'+m.model,imageUrl:'/models/reference-20260904/'+m.image,frontRotationY:Number(m.frontRotationY)||0,modelScale:1,associatedParts:3}));
if(process.env.PREVIEW_NEW_MODELS==='1') {
  const models=require('../../../server/data/ledger-model-catalog.json').supplements.flatMap(batch=>batch.models);
  models.forEach((m,index)=>{
    const id=2000+index;
    categoryModels.push({...m,id,frontRotationY:0,modelScale:1,associatedParts:1});
    parts.push({...parts[0],_id:String(100+index),partId:100+index,materialCode:m.materialCode,materialDesc:m.name,spec:'示意模型，尺寸待核对',locationCode:`0111${String(index+1).padStart(2,'0')}`,categoryModelId:id,categoryModelName:m.name,categoryModelUrl:m.modelUrl,categoryModelDescription:m.description,categoryFrontRotationY:0});
  });
}
if(process.env.PREVIEW_WAREHOUSE==='1')parts=Array.from({length:536},(_,index)=>{
  const shelf=1+Math.floor(index/96),side=1+Math.floor(index%96/48),layer=1+Math.floor(index%48/12),slot=1+index%12,m=catalog.models[index%7];
  return {_id:String(index+1),partId:index+1,materialCode:`TEST${index+1}`,materialDesc:m.name,spec:'合成测试数据',unit:index%5===0?'米':'个',price:index%11===0?null:120,partType:index%3===0?'质保件':'易损件',warehouseAreaName:index%2===0?'五粮货区':'输送货区',totalStock:index%3===0?1:5,safetyStock:2,reorderPoint:2,maxStock:6,workshopCode:'raw_grain',workshopName:'原粮车间',locationCode:`0${shelf}${side}${layer}${String(slot).padStart(2,'0')}`,shelf,position:side,layer,location:slot,categoryModelUrl:`/models/reference-20260904/${m.model}`,categoryModelName:m.name,categoryModelScale:1.6,categoryFrontRotationY:Number(m.frontRotationY)||0};
});
if(process.env.PREVIEW_LONG_DETAIL==='1') Object.assign(parts[0],{materialDesc:'界面测试：减速机（含联轴器），R77 AM112，速比33.47，输出扭矩820Nm，设备序号25.8191216501.0001.22.21',spec:'减速机（含联轴器），R77 AM112，速比33.47，输出扭矩820Nm，设备序号25.8191216501.0001.22.21',usageDescription:'破曲工段B117关风器、刹克龙关风器、输送线备用驱动装置，长文本布局检查。\n第二行用途说明，确认换行保留。',totalStock:1,unit:'台'});
const warehouseAreas=[{code:'RAW_GRAIN_MAIN',name:'原粮车间备件库',workshopCode:'raw_grain'},{code:'FIVE',name:'五粮货区',workshopCode:'raw_grain'},{code:'TRANSFER',name:'输送货区',workshopCode:'raw_grain'},{code:'BREWING_MAIN',name:'酿酒车间备件库',workshopCode:'brewing'}];
async function handler(req,res){
  const url=new URL(req.originalUrl||req.url,'http://127.0.0.1'); let body=req.body?JSON.stringify(req.body):'';if(!req.body)for await(const chunk of req)body+=chunk;
  let data={};try{data=JSON.parse(body||'{}')}catch{}
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
  const ok=data=>send({success:true,data});
  if (url.pathname.startsWith('/models/')) {
    const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../../public/models');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname.slice('/models'.length)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
    res.writeHead(200,{'Content-Type':file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.png')?'image/png':'application/json'});return fs.createReadStream(file).pipe(res);
  }
  if (String(req.headers.authorization).endsWith('-viewer') && !['GET','HEAD','OPTIONS'].includes(req.method)
    && !['/api/auth/login','/api/auth/logout','/api/auth/change-password','/api/ai/chat'].includes(url.pathname)) return send({msg:'权限不足'},403);
  const selected=parts.filter(p=>['workshopCode','warehouseAreaName','partType'].every(key=>!url.searchParams.get(key)||p[key]===url.searchParams.get(key))&&(!(url.searchParams.get('searchKeyword')||url.searchParams.get('search'))||(p.materialCode+p.materialDesc).includes(url.searchParams.get('searchKeyword')||url.searchParams.get('search'))));
  const metricRows=()=>selected.map(p=>({...p,quantity:p.totalStock,safetyStock:p.safetyStock??p.reorderPoint}));
  const metrics=()=>({...summarizeInventory(metricRows()),scopeBreakdown:summarizeInventoryScopes(metricRows(),Object.fromEntries(workshops.map(w=>[w.code,w.name])))});
  if(url.pathname==='/api/knowledge/stats')return ok({total:19,documents:15,faults:4,views:40,categories:[{category:'设备资料',total:15},{category:'故障经验',total:4}],tags:['背负式AGV']});
  if(url.pathname==='/api/knowledge/process-stages')return ok([{id:1,name:'合成测试工序',sortOrder:100,status:'active',usageCount:1}]);
  if(url.pathname==='/api/knowledge/tags')return ok([{id:1,name:'合成测试标签',status:'active'}]);
  if(/^\/api\/knowledge\/\d+\/revisions$/.test(url.pathname))return ok([{revisionNo:1,title:'合成历史版本',createdAt:'2026-09-01'}]);
  const order={_id:'1',inventoryNo:'PREVIEW001',inventoryDate:'2026-09-09',workshopCode:'raw_grain',inventoryUser:'测试人员',approveStatus:'待审批',inventoryAllList:[{...parts[0],partId:parts[0]._id}],abnormalList:[],createTime:'2026-09-09T00:00:00Z'};
  if(url.pathname==='/api/inventory-orders')return send({success:true,data:[order],total:1,summary:{total:1,pending:1,approved:0,rejected:0}});
  if(url.pathname==='/api/inventory-orders/1')return ok(order);
  if(url.pathname==='/api/data-quality')return send({success:true,data:[{...parts[0],issueDetails:[{key:'missing_price',label:'缺少单价',severity:'high'}]}],total:1,summary:{qualityRate:90,healthy:9,affected:1,total:10,issueGroups:[{key:'missing_price',label:'缺少单价',severity:'high',count:1,rate:10}]}});
  if(url.pathname==='/api/replenishment') {
    const rows=selected.filter(p=>p.reorderPoint!=null && p.totalStock<=p.reorderPoint).map(p=>buildReplenishmentItem({...p,quantity:p.totalStock,inventoryId:p._id}));
    return send({success:true,data:rows.slice(((Number(url.searchParams.get('page'))||1)-1)*(Number(url.searchParams.get('pageSize'))||100),(Number(url.searchParams.get('page'))||1)*(Number(url.searchParams.get('pageSize'))||100)),total:rows.length,summary:{total:rows.length,zeroStock:rows.filter(p=>!p.currentStock).length,missingTarget:rows.filter(p=>p.suggestedQuantity==null).length,estimatedAmount:rows.reduce((s,p)=>s+(p.estimatedAmount||0),0),stockAmount:rows.reduce((s,p)=>s+p.currentStock*(p.price||0),0)}});
  }
  if(url.pathname==='/api/stock-movements')return send({success:true,data:[],total:0});
  if(url.pathname==='/api/knowledge'){const rows=knowledge.filter(k=>(!url.searchParams.get('search')||k.title.includes(url.searchParams.get('search')))&&(!url.searchParams.get('type')||k.entryType===url.searchParams.get('type'))&&(!url.searchParams.get('category')||k.category===url.searchParams.get('category')));return send({success:true,data:rows,total:rows.length})}
  if(/^\/api\/knowledge\/\d+$/.test(url.pathname))return ok(knowledge.find(k=>k.id===Number(url.pathname.split('/').pop())));
  if(url.pathname==='/api/part-models')return ok(categoryModels);
  if(url.pathname==='/api/part-category-models')return ok(categoryModels);
  if(url.pathname==='/api/part-model-library')return ok(selected.map((p,i)=>({...p,id:p.partId,name:p.materialDesc,code:p.materialCode,partImageUrl:null,imageUrl:null,imageSource:'category',categoryImageUrl:null,categoryModelId:p.categoryModelId||i%7+1,categoryModelName:p.categoryModelName||catalog.models[i%7].name,categoryModelUrl:p.categoryModelUrl||'/models/reference-20260904/'+catalog.models[i%7].model,categoryFrontRotationY:Number(p.categoryFrontRotationY ?? catalog.models[i%7].frontRotationY)||0,workshopCodes:['raw_grain']})));
  if(/^\/api\/parts\/\d+$/.test(url.pathname)&&req.method==='GET')return ok(parts.find(p=>p._id===url.pathname.split('/').pop()));
  if(url.pathname==='/api/stats'){const m=metrics();return ok({summary:m,typeSummaries:m.typeSummaries,scopeBreakdown:m.scopeBreakdown,unitTotals:m.unitTotals,areaOverview:[],lowStockParts:selected.filter(p=>p.totalStock<=2).slice(0,6),movementSummary:{total:0},movementTrend:[],topMovingParts:[],generatedAt:new Date().toISOString()})}
  if(url.pathname==='/api/health')return send({success:true,database:'connected'});
  if(url.pathname==='/api/auth/login')return ['preview','viewer'].includes(data.username)&&data.password==='preview'?ok({token:'local-ui-fixture-'+data.username,user:data.username==='viewer'?{...user,role:'viewer',displayName:'只读验收账号'}:user}):send({msg:'本地测试账号为 preview / preview'},401);
  if(url.pathname==='/api/auth/me')return ok(String(req.headers.authorization).endsWith('-viewer')?{...user,role:'viewer',displayName:'只读验收账号'}:user);
  if(url.pathname==='/api/ai/chat')return ok({answer:'合成验收答复：检查线缆固定情况。[知识#1]',evidence:[{sourceType:'knowledge',sourceId:'1',title:'旋转机构异常',citation:'知识#1'}]});
  if(url.pathname==='/api/warehouse-layout')return ok({workshops,room:{name:'本地布局验收',width:18,depth:32,height:4.2,eastDirection:'+z',entranceWall:'east',entranceOffset:11.8,entranceWidth:2.4},shelves:Array.from({length:20},(_,i)=>({id:i+1,shelfNo:i+1,layoutKey:`shelf-${String(i+1).padStart(2,'0')}`,displayName:`${i+1}号货架`,workshopCode:'raw_grain',workshopGroup:i%2?'破曲工段':'五粮工段',position:{x:0,z:0,rotationY:0},size:{width:4.9,depth:.9,height:3.2},levels:4,partsCount:i<2?96:0,lowStockCount:i<2?32:0,slotCapacity:{1:{1:12,2:12,3:12,4:12},2:{1:12,2:12,3:12,4:12}}}))});
  if(url.pathname==='/api/staging-points')return ok([]);
  if(url.pathname==='/api/equipment'&&req.method==='POST'){const item={...data,id:String(equipment.length+1),partCount:0};equipment.push(item);return ok(item)}
  if(url.pathname==='/api/equipment')return ok(equipment.filter(e=>!url.searchParams.get('workshopCode')||e.workshopCode===url.searchParams.get('workshopCode')).map(e=>({...e,status:'active'})));
  if(/^\/api\/equipment\/\d+$/.test(url.pathname)){const e=equipment.find(e=>e.id===url.pathname.split('/').pop());return ok({...e,parts:relation[e.id]||[]})}
  if(url.pathname==='/api/parts/import-template' || url.pathname==='/api/parts/model-bindings/template') {
    const buffer=url.pathname.endsWith('import-template')?await makePartsTemplate(url.searchParams.get('workshopCode')||'raw_grain'):await makeModelBindingsTemplate(categoryModels);
    res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="template.xlsx"'});return res.end(Buffer.from(buffer));
  }
  if(url.pathname==='/api/parts/batch-delete'){
    const results=data.ids.map(id=>{const p=parts.find(p=>p._id===id);const reason=!p?'记录不存在':p.totalStock?'当前库存不为0':p.inventoryStatus==='待审批'?'盘点单PD008待审批':'';return {...p,id,canDelete:!reason,reason}});
    const eligibleIds=results.filter(p=>p.canDelete).map(p=>p.id);const info={results,eligibleIds,eligibleCount:eligibleIds.length,blockedCount:results.length-eligibleIds.length};
    if(!data.dryRun){if(info.blockedCount)return send({msg:'状态变化，本次未删除任何备件',details:info},409);parts=parts.filter(p=>!eligibleIds.includes(p._id))}
    return send({success:true,msg:data.dryRun?'已校验':`已删除${eligibleIds.length}条备件，历史流水已保留`,data:info});
  }
  if(/^\/api\/parts\/\d+$/.test(url.pathname)&&req.method==='PATCH'){const id=url.pathname.split('/').pop();parts=parts.map(p=>p._id===id?{...p,...data}:p);return ok(parts.find(p=>p._id===id))}
  if(url.pathname==='/api/parts'&&req.method==='POST'){const part={...data,_id:String(10000+parts.length),partId:10000+parts.length,workshopName:workshops.find(w=>w.code===data.workshopCode)?.name};parts.push(part);return ok(part)}
  if(url.pathname==='/api/parts'){const shelf=url.searchParams.get('shelf');const found=selected.filter(p=>(!shelf||Number(p.shelf)===Number(shelf))&&(!url.searchParams.get('lowStock')||p.totalStock<=p.safetyStock)&&(url.searchParams.get('stockStatus')!=='normal'||p.totalStock>p.safetyStock));const limit=Number(url.searchParams.get('pageSize'))||200,page=Number(url.searchParams.get('page'))||1;return send({success:true,data:found.slice((page-1)*limit,page*limit),total:found.length})}
  if(url.pathname==='/api/warehouse-areas') {
    const code=data.workshopCode||url.searchParams.get('workshopCode');
    if(req.method==='POST') { let area=warehouseAreas.find(a=>a.workshopCode===code&&a.name===data.name);if(!area){area={code:'PREVIEW_'+warehouseAreas.length,name:data.name,workshopCode:code};warehouseAreas.push(area)}return ok(area) }
    return ok(warehouseAreas.filter(a=>a.workshopCode===code));
  }
  if(url.pathname==='/api/filters'){
    const shelfMap={'五粮货区':['1号','2号'],'输送货区':['3号']},layerMap={'五粮货区':{'1号':['1层','2层','3层','4层'],'2号':['1层','2层']},'输送货区':{'3号':['1层','2层']}};
    selected.filter(p=>p.shelf&&p.layer).forEach(p=>{const a=p.warehouseAreaName,s=`${p.shelf}号`,l=`${p.layer}层`;shelfMap[a]||=[];if(!shelfMap[a].includes(s))shelfMap[a].push(s);layerMap[a]||={};layerMap[a][s]||=[];if(!layerMap[a][s].includes(l))layerMap[a][s].push(l)});
    return ok({workshops,areas:['五粮货区','输送货区'],partTypes:['易损件','质保件'],shelfMap,layerMap});
  }
  if(url.pathname==='/api/dashboard')return ok({dashboard:metrics()});
  if(url.pathname==='/api/movement-reasons')return ok({in:[{value:'other_in',label:'其他入库'}],out:[{value:'other_out',label:'其他出库'}]});
  send({msg:'本地界面测试未模拟此接口'},404);
}
module.exports={handler,getKnowledgeFixture:id=>knowledge.find(k=>k.id===Number(id))};
if(require.main===module)http.createServer(handler).listen(Number(process.env.PREVIEW_API_PORT)||3099,'127.0.0.1',()=>console.log(`Synthetic UI fixture API: http://127.0.0.1:${Number(process.env.PREVIEW_API_PORT)||3099}`));
