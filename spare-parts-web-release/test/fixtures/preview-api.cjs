// Local UI verification only. Synthetic in-memory data; never connects to MySQL.
const http = require('node:http');
const previewPlc = require('./preview-plc.cjs');
const modelMatching = process.env.PREVIEW_MODEL_MATCHING==='1' ? require('./preview-model-matching.cjs') : null;
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
if(process.env.PREVIEW_WAREHOUSE==='1')parts=Array.from({length:536},(_,index)=>{
  const shelf=1+Math.floor(index/96),side=1+Math.floor(index%96/48),layer=1+Math.floor(index%48/12),slot=1+index%12,m=catalog.models[index%7];
  return {_id:String(index+1),partId:index+1,materialCode:`TEST${index+1}`,materialDesc:m.name,spec:'合成测试数据',unit:index%5===0?'米':'个',price:index%11===0?null:120,partType:index%3===0?'质保件':'易损件',warehouseAreaName:index%2===0?'五粮货区':'输送货区',totalStock:index%3===0?1:5,safetyStock:2,workshopCode:'raw_grain',workshopName:'原粮车间',locationCode:`0${shelf}${side}${layer}${String(slot).padStart(2,'0')}`,shelf,position:side,layer,location:slot,categoryModelUrl:`/models/reference-20260904/${m.model}`,categoryModelName:m.name,categoryModelScale:1.6,categoryFrontRotationY:Number(m.frontRotationY)||0};
});
if(process.env.PREVIEW_LONG_DETAIL==='1') Object.assign(parts[0],{materialDesc:'界面测试：减速机（含联轴器），R77 AM112，速比33.47，输出扭矩820Nm，设备序号25.8191216501.0001.22.21',spec:'减速机（含联轴器），R77 AM112，速比33.47，输出扭矩820Nm，设备序号25.8191216501.0001.22.21',usageDescription:'破曲工段B117关风器、刹克龙关风器、输送线备用驱动装置，长文本布局检查。\n第二行用途说明，确认换行保留。',totalStock:1,unit:'台'});
http.createServer(async(req,res)=>{
  if(modelMatching)parts=modelMatching.library();
  const url=new URL(req.url,'http://127.0.0.1'); let body='';for await(const chunk of req)body+=chunk;
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
    && !['/api/auth/login','/api/auth/logout','/api/auth/change-password','/api/ai/chat'].includes(url.pathname)
    && !/^\/api\/plc\/projects\/\d+\/analyze$/.test(url.pathname)) return send({msg:'权限不足'},403);
  if(modelMatching?.handle(url,req.method,data,send))return;
  const selected=parts.filter(p=>['workshopCode','warehouseAreaName','partType'].every(key=>!url.searchParams.get(key)||p[key]===url.searchParams.get(key))&&(!url.searchParams.get('searchKeyword')||(p.materialCode+p.materialDesc).includes(url.searchParams.get('searchKeyword'))));
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
  if(['/api/replenishment','/api/stock-movements'].includes(url.pathname))return send({success:true,data:[],total:0});
  if(url.pathname==='/api/knowledge'){const rows=knowledge.filter(k=>(!url.searchParams.get('search')||k.title.includes(url.searchParams.get('search')))&&(!url.searchParams.get('type')||k.entryType===url.searchParams.get('type'))&&(!url.searchParams.get('category')||k.category===url.searchParams.get('category')));return send({success:true,data:rows,total:rows.length})}
  if(/^\/api\/knowledge\/\d+$/.test(url.pathname))return ok(knowledge.find(k=>k.id===Number(url.pathname.split('/').pop())));
  if(url.pathname==='/api/part-category-models')return ok(categoryModels);
  if(url.pathname==='/api/part-model-library')return ok(selected.map((p,i)=>({...p,id:p.partId,name:p.materialDesc,code:p.materialCode,partImageUrl:null,imageUrl:'/models/reference-20260904/'+catalog.models[i%7].image,imageSource:'category',categoryImageUrl:'/models/reference-20260904/'+catalog.models[i%7].image,categoryModelId:i%7+1,categoryModelName:catalog.models[i%7].name,categoryModelUrl:'/models/reference-20260904/'+catalog.models[i%7].model,categoryFrontRotationY:Number(catalog.models[i%7].frontRotationY)||0,workshopCodes:['raw_grain']})));
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
  if(url.pathname==='/api/parts/batch-delete'){
    const results=data.ids.map(id=>{const p=parts.find(p=>p._id===id);const reason=!p?'记录不存在':p.totalStock?'当前库存不为0':p.inventoryStatus==='待审批'?'盘点单PD008待审批':'';return {...p,id,canDelete:!reason,reason}});
    const eligibleIds=results.filter(p=>p.canDelete).map(p=>p.id);const info={results,eligibleIds,eligibleCount:eligibleIds.length,blockedCount:results.length-eligibleIds.length};
    if(!data.dryRun){if(info.blockedCount)return send({msg:'状态变化，本次未删除任何备件',details:info},409);parts=parts.filter(p=>!eligibleIds.includes(p._id))}
    return send({success:true,msg:data.dryRun?'已校验':`已删除${eligibleIds.length}条备件，历史流水已保留`,data:info});
  }
  if(/^\/api\/parts\/\d+$/.test(url.pathname)&&req.method==='PATCH'){const id=url.pathname.split('/').pop();parts=parts.map(p=>p._id===id?{...p,...data}:p);return ok(parts.find(p=>p._id===id))}
  if(url.pathname==='/api/parts'){const shelf=url.searchParams.get('shelf');const found=selected.filter(p=>(!shelf||Number(p.shelf)===Number(shelf))&&(!url.searchParams.get('lowStock')||p.totalStock<=p.safetyStock)&&(url.searchParams.get('stockStatus')!=='normal'||p.totalStock>p.safetyStock));const limit=Number(url.searchParams.get('pageSize'))||200,page=Number(url.searchParams.get('page'))||1;return send({success:true,data:found.slice((page-1)*limit,page*limit),total:found.length})}
  if(url.pathname==='/api/filters')return ok({workshops,areas:['五粮货区','输送货区'],partTypes:['易损件','质保件']});
  if(url.pathname==='/api/dashboard')return ok({dashboard:metrics()});
  if(url.pathname==='/api/movement-reasons')return ok({in:[{value:'other_in',label:'其他入库'}],out:[{value:'other_out',label:'其他出库'}]});
  const plcResponse=previewPlc(url.pathname,url.searchParams);if(plcResponse)return send(plcResponse);
  send({msg:'本地界面测试未模拟此接口'},404);
}).listen(Number(process.env.PREVIEW_API_PORT)||3099,'127.0.0.1',()=>console.log(`Synthetic UI fixture API: http://127.0.0.1:${Number(process.env.PREVIEW_API_PORT)||3099}`));
