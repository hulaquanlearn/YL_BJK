import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as helpers from '../src/utils/fire-inspection.mjs'

const source=fs.readFileSync(new URL('../src/utils/fire-inspection-controller.mjs',import.meta.url),'utf8')
function subject({photo=async()=>({id:31,url:'/api/fire-inspection/photos/31'}),record=async()=>({id:1}),confirm=async()=>{},discard=async()=>({discarded:true}),getPoint,recognize=async()=>({status:'needs_review',message:'编码不清楚'}),getPoints,getIssues=async()=>({items:[],total:0}),getUser=()=>({id:12,role:'viewer',username:'tester'}),execution=true,bootstrapData}={}){
  const calls=[],storage=new Map(),events=new Map();let leave,mount,unmount
  const point={id:4,areaId:2,status:'pending',assets:[{id:7,name:'灭火器',type:'extinguisher',quantity:2,status:'active'}]}
  const context=vm.createContext({
    ...helpers,ref:value=>({value}),reactive:value=>value,computed:fn=>({get value(){return fn()}}),watch(){},onMounted:fn=>mount=fn,onBeforeUnmount:fn=>unmount=fn,onBeforeRouteLeave:fn=>leave=fn,
    useRoute:()=>({path:'/fire-inspection',query:{}}),useRouter:()=>({replace(){}}),getUser,
    navigator:{userAgent:'DigitalWorkbenchAndroid/1.9.10-android.7'},window:{location:{origin:'https://czsdsg.cn'},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    URL:{createObjectURL:()=>`blob:photo`,revokeObjectURL(){}},Blob,Set,Map,Intl,setTimeout,setInterval:()=>1,clearInterval(){},document:{visibilityState:"visible",addEventListener(){},removeEventListener(){}},QRCode:{},
    ElMessage:{success:message=>calls.push({success:message}),error:message=>calls.push({error:message})},ElMessageBox:{confirm},
    fireApi:{issues:async query=>{calls.push({issues:query});return getIssues(query)},bootstrap:async()=>bootstrapData?bootstrapData():({areas:[{id:2,name:'测试区域'}],cycles:[{id:3,status:'open',inspectionMonth:'2026-10'}],selectedCycleId:3,permissions:{canRead:true,canManage:false,areaIds:[2]},photoRecognition:{enabled:true,periodMonth:'2026-10'}}),photo:async(...args)=>{calls.push({photo:args});return photo(...args)},photoBlob:async()=>new Blob(['image']),record:async(...args)=>{calls.push({record:args});return record(...args)},discardPhoto:async id=>{calls.push({discard:id});return discard(id)},recognize:async(...args)=>{calls.push({recognize:args});return recognize(...args)},dashboard:async()=>({cycle:{id:3},overall:{totalAssets:2,checkedAssets:1,pendingAssets:1,progress:50},areas:[]}),points:async()=>getPoints?getPoints():({items:[point],stats:{total:1}}),point:async(...args)=>{calls.push({point:args});return getPoint?getPoint(...args):{point:{...point,status:'checked'},assets:point.assets,records:[],issues:[],draftPhotos:[]}}}
  })
  const script=source.replace(/^import .+$/gm,'').replace('export function useFireInspection','function useFireInspection')
  vm.runInContext(script+'\nthis.subjectState=useFireInspection({value:'+String(execution)+'});',context)
  const s=context.subjectState;s.permissions.value={canRead:true,canManage:false,areaIds:[2]};s.cycles.value=[{id:3,status:'open'}];s.query.cycleId=3;s.activePointId.value=4;s.detailVisible.value=true;s.detail.value={point,assets:point.assets,draftPhotos:[],records:[],issues:[]};s.photoRecognition.value={enabled:true,periodMonth:'2026-10'}

  return {s,calls,leave:()=>leave(),storage,mount:()=>mount(),unmount:()=>unmount(),events}
}













test('a reusable asset QR resolves its own latest open cycle instead of borrowing the globally selected cycle',async()=>{
  const asset={id:7,quantity:1,status:'active',inspectionStatus:'pending'}
  const response={point:{id:4,areaId:2,status:'pending'},assets:[asset],targetAsset:asset,cycleId:2,dispatchStatus:'assigned',workOrder:{cycleId:2,cycleName:'本件当前周期',assetId:7},records:[],issues:[],draftPhotos:[]}
  const scanned=subject({getPoint:async()=>response})
  await scanned.s.openPoint(4,undefined,7,true)
  assert.equal(scanned.calls.find(c=>c.point).point[1],undefined)
  assert.equal(scanned.calls.find(c=>c.point).point[2],7)
  assert.equal(scanned.s.query.cycleId,2)
  assert.equal(scanned.s.canRecord(scanned.s.detail.value.point),true)
  const selected=subject({getPoint:async()=>({...response,cycleId:3})})
  await selected.s.openPoint(4,undefined,7)
  assert.equal(selected.calls.find(c=>c.point).point[1],3,'an explicit period must stay explicit')
  assert.equal(selected.s.query.cycleId,3)
})

test('a retired item QR retains its real target and history without inventing a current work order',async()=>{
  const app=subject({getPoint:async()=>({point:{id:4,areaId:2,status:'pending'},assets:[],targetAsset:{id:7,name:'原灭火器',quantity:1,status:'retired'},dispatchStatus:'unassigned',workOrder:null,records:[],issues:[],draftPhotos:[]})})
  await app.s.openPoint(4,undefined,7,true)
  assert.equal(app.s.detailError.value,'')
  assert.equal(app.s.detail.value.targetAsset.id,7)
  assert.equal(app.s.canRecord(app.s.detail.value?.point),false)
  assert.equal(app.calls.filter(c=>c.record).length,0)
})

const savedRecord=(extra={})=>({id:91,cycleId:3,pointId:4,result:'normal',items:[{assetId:7,result:'normal'}],actorName:'点检员',actualCheckedAt:'2026-10-27T01:00:00Z',photos:[],...extra})
const card=()=>({name:'本月检查卡.jpg',type:'image/jpeg',size:1024})
function cameraEvent(file=card()){return {target:{files:[file],value:'selected'}}}

test('photo recognition completes one saved device automatically and never invokes the manual record endpoint',async()=>{
  const asset={id:7,quantity:1,status:'active',inspectionStatus:'pending'}
  const app=subject({getPoints:async()=>({items:[{id:4,areaId:2,assets:[asset]}]}),getPoint:async()=>({point:{id:4,areaId:2,status:'checked'},targetAsset:asset,assets:[asset],records:[],issues:[],draftPhotos:[]}),recognize:async(file,data)=>{assert.equal(file.name,'本月检查卡.jpg');assert.equal(data.assetId,7);asset.inspectionStatus='checked';return {status:'completed',pointId:4,assetId:7,record:savedRecord({result:'abnormal'}),recognition:{deviceCode:'005',result:'abnormal'}}}})
  app.s.activeAssetId.value=7;
  await app.s.chooseRecognition(cameraEvent(),4,7)
  assert.equal(app.s.recognitionResponse.value.status,'completed')
  assert.equal(app.s.points.value[0].assets[0].inspectionStatus,'checked')
  assert.equal(app.calls.filter(c=>c.recognize).length,1)
  assert.equal(app.calls.filter(c=>c.record).length,0)
  assert.equal(app.s.recognitionResponse.value.recognition.result,'abnormal','completion must retain abnormal result')
})

test('unclear or ambiguous recognition retains the photo for reshooting and never changes completion',async()=>{
  const app=subject({recognize:async()=>({status:'needs_review',message:'编码重复，请补拍位置',recognition:{deviceCode:'005',reasons:['编码重复']}})})
  app.s.detailVisible.value=false
  const event=cameraEvent();await app.s.chooseRecognition(event)
  assert.equal(event.target.value,'')
  assert.equal(app.s.recognitionResponse.value.status,'needs_review')
  assert.equal(app.s.recognitionFile.value.name,'本月检查卡.jpg')
  assert.equal(app.s.points.value[0].status,'pending')
  assert.equal(app.calls.filter(c=>c.record).length,0)
})

test('network retry keeps its photo, target and request ID without optimistic green state',async()=>{
  let attempt=0;const app=subject({recognize:async()=>{if(++attempt===1)throw Error('网络中断');return{status:'completed',pointId:4,assetId:7,record:savedRecord()}}})
  app.s.detailVisible.value=false
  const image=card();await app.s.chooseRecognition(cameraEvent(image),4,7)
  assert.match(app.s.recognitionError.value,/状态未改变/)
  assert.equal(app.s.recognitionFile.value,image)
  assert.equal(app.s.detail.value.point.status,'pending')
  await app.s.recognizePhoto()
  const requests=app.calls.filter(c=>c.recognize).map(c=>c.recognize)
  assert.equal(requests.length,2)
  assert.equal(requests[0][1].requestId,requests[1][1].requestId)
  assert.equal(requests[0][1].assetId,7)
  assert.equal(app.s.recognitionResponse.value.status,'completed')
})

test('incomplete saved response cannot mark a device completed and concurrent clicks cannot resubmit',async()=>{
  let finish;const app=subject({recognize:()=>new Promise(resolve=>finish=resolve)})
  app.s.detailVisible.value=false
  const request=app.s.chooseRecognition(cameraEvent(),4,7)
  await app.s.recognizePhoto()
  assert.equal(app.calls.filter(c=>c.recognize).length,1)
  assert.equal(await app.leave(),false)
  await app.s.openPoint(99,undefined,199)
  assert.equal(app.calls.filter(c=>c.point).length,0,'another device cannot open while recognition is running')
  finish({status:'completed',pointId:4,assetId:7});await request
  assert.equal(app.s.recognitionResponse.value,null)
  assert.match(app.s.recognitionError.value,/尚未确认保存/)
})

test('leaving the page invalidates late recognition responses and releases the local photo',async()=>{
  let finish;const app=subject({recognize:()=>new Promise(resolve=>finish=resolve)})
  app.s.detailVisible.value=false
  const request=app.s.chooseRecognition(cameraEvent(),4,7)
  app.unmount();finish({status:'completed',pointId:4,assetId:7,record:savedRecord()});await request
  assert.equal(app.s.recognitionResponse.value,null)
  assert.equal(app.calls.filter(c=>c.success).length,0)
})

test('account switching removes recognition evidence and ignores the outgoing account response',async()=>{
  let user={id:12,username:'first'},finish
  const app=subject({getUser:()=>user,recognize:()=>new Promise(resolve=>finish=resolve)})
  await app.mount();app.s.detailVisible.value=false
  const request=app.s.chooseRecognition(cameraEvent(),4,7)
  user={id:55,username:'second'};app.events.get('auth-changed')()
  assert.equal(app.s.recognitionFile.value,null)
  assert.equal(app.s.recognitionPreview.value,'')
  assert.equal(app.s.recognitionContext.value,null)
  finish({status:'completed',pointId:4,assetId:7,record:savedRecord()});await request
  assert.equal(app.s.recognitionResponse.value,null)
  assert.equal(app.calls.filter(c=>c.success).length,0)
})

test('account switching during completion refresh cannot reopen the old record or emit stale success',async()=>{
  let user={id:12},reads=0,releaseRefresh,refreshBegan
  const refreshing=new Promise(resolve=>refreshBegan=resolve)
  const app=subject({getUser:()=>user,getPoints:async()=>{if(++reads===1)return{items:[]};refreshBegan();return new Promise(resolve=>releaseRefresh=resolve)},recognize:async()=>({status:'completed',pointId:4,assetId:7,record:savedRecord()})})
  await app.mount();app.s.detailVisible.value=false
  const request=app.s.chooseRecognition(cameraEvent(),4,7)
  await refreshing;user={id:55};app.events.get('auth-changed')()
  releaseRefresh({items:[{id:4,assets:[{id:7,inspectionStatus:'checked'}]}]});await request
  assert.equal(app.s.points.value.length,0)
  assert.equal(app.s.detailVisible.value,false)
  assert.equal(app.s.recognitionResponse.value,null)
  assert.equal(app.calls.filter(c=>c.success).length,0)
})

test('desktop users cannot perform automatic or manual field inspection',async()=>{
  const app=subject({execution:false})
  await app.s.chooseRecognition(cameraEvent(),4,7)
  assert.equal(app.calls.filter(c=>c.recognize).length,0)
  assert.equal(app.s.recognitionFile.value,null)
  assert.equal(app.calls.filter(c=>c.record).length,0)
})

test('web and App issue views retain unclosed earlier-cycle issues when a new inspection cycle is selected',async()=>{
  const issues=[{id:71,cycleId:1,areaId:2,status:'open'},{id:72,cycleId:3,areaId:2,status:'resolved'},{id:73,cycleId:1,areaId:2,status:'closed'}]
  for(const execution of [false,true]){
    const app=subject({execution,getIssues:async query=>{const items=issues.filter(i=>(!query.cycleId||i.cycleId===query.cycleId)&&(!query.areaId||i.areaId===query.areaId)&&(query.status==='all'||i.status!=='closed'));return{items,total:items.length}}})
    app.s.query.cycleId=3;app.s.issueQuery.areaId=2
    if(execution)await app.s.setStatus('abnormal');else await app.s.changeWebTab('issues')
    const request=app.calls.find(c=>c.issues).issues
    assert.equal(Object.hasOwn(request,'cycleId'),false,'the selected current inspection cycle must not hide earlier unresolved issues')
    assert.equal(request.areaId,2)
    assert.equal(request.status,execution?'all':'pending')
    assert.deepEqual(Array.from(app.s.issueRows.value,i=>i.id),execution?[71,72,73]:[71,72])
    assert.equal(app.s.issueTotal.value,execution?3:2)
    app.s.issueQuery.status='all';await app.s.loadIssues(true)
    assert.deepEqual(Array.from(app.s.issueRows.value,i=>i.id),[71,72,73],'closed historical issues remain available through the explicit all-status filter')
  }
})

test('a confirmed saved record marks only its own device complete when list refresh fails',async()=>{
  const app=subject({getPoints:async()=>{throw Error('刷新网络中断')},recognize:async()=>({status:'completed',pointId:4,assetId:7,record:savedRecord({result:'abnormal'})})})
  const target={id:7,inspectionStatus:'pending'},neighbour={id:8,inspectionStatus:'pending'},otherPoint={id:99,assets:[{id:7,inspectionStatus:'pending'}],status:'pending'}
  app.s.points.value=[{id:4,assets:[target,neighbour],status:'pending'},otherPoint]
  app.s.activeAssetId.value=7;app.s.detail.value={point:{id:4,assets:[target,neighbour],status:'pending'},cycleId:3,assets:[target,neighbour],targetAsset:target,records:[],issues:[]}
  await app.s.chooseRecognition(cameraEvent(),4,7)
  assert.equal(app.s.recognitionResponse.value.status,'completed')
  assert.equal(app.s.points.value[0].assets[0].inspectionStatus,'checked')
  assert.equal(app.s.points.value[0].assets[1].inspectionStatus,'pending')
  assert.equal(app.s.points.value[0].status,'pending','a neighbour remains unchecked')
  assert.equal(app.s.points.value[1].assets[0].inspectionStatus,'pending','the same numeric asset key at another point cannot be changed')
  assert.equal(app.s.detail.value.targetAsset.inspectionStatus,'checked')
  assert.equal(app.s.detail.value.records[0].id,91)
  assert.match(app.s.listError.value,/刷新网络中断/)
  assert.match(app.calls.find(c=>c.success).success,/进度待刷新/)
})

test('a completed response with mismatched saved cycle, point or asset cannot turn any device green',async()=>{
  for(const record of [savedRecord({cycleId:9}),savedRecord({pointId:99}),savedRecord({items:[{assetId:8,result:'normal'}]}),savedRecord({id:0})]){
    const app=subject({recognize:async()=>({status:'completed',pointId:4,assetId:7,record})})
    app.s.detailVisible.value=false;app.s.points.value=[{id:4,assets:[{id:7,inspectionStatus:'pending'}]}]
    await app.s.chooseRecognition(cameraEvent(),4,7)
    assert.equal(app.s.points.value[0].assets[0].inspectionStatus,'pending')
    assert.equal(app.s.recognitionResponse.value,null)
    assert.match(app.s.recognitionError.value,/尚未确认保存或记录与当前器材不一致/)
  }
})

test('a failed device-detail refresh retains its confirmed green status and saved record',async()=>{
  const app=subject({getPoint:async()=>{throw Error('详情读取失败')},recognize:async()=>({status:'completed',pointId:4,assetId:7,record:savedRecord()})})
  const asset={id:7,inspectionStatus:'pending'}
  app.s.activeAssetId.value=7;app.s.detail.value={point:{id:4,assets:[asset],status:'pending'},cycleId:3,assets:[asset],targetAsset:asset,records:[],issues:[]}
  await app.s.chooseRecognition(cameraEvent(),4,7)
  assert.equal(app.s.detail.value.targetAsset.inspectionStatus,'checked')
  assert.equal(app.s.detail.value.records[0].id,91)
  assert.match(app.s.detailError.value,/点检记录已保存，详情待刷新/)
})

test('review waits for confirmation, rematches edited numbers and saves edited location with the original ticket',async()=>{
 let stage=0
 const candidates=[{assetId:7,pointId:4,deviceCode:'005',location:'台账东门'},{assetId:8,pointId:4,deviceCode:'006',location:'台账西门'}]
 const app=subject({recognize:async(_file,payload)=>{if(++stage===1)return{status:'awaiting_confirmation',confirmationToken:'signed-ticket',recognition:{deviceCode:'005',checks:[]},candidates};assert.equal(payload.confirmationToken,'signed-ticket');assert.equal(payload.deviceCode,'006');assert.equal(payload.confirmedAssetId,8);assert.equal(payload.location,'人工修正西侧通道');return{status:'completed',pointId:4,assetId:8,record:savedRecord({items:[{assetId:8,result:'normal'}]})}}})
 app.s.detailVisible.value=false
 await app.s.chooseRecognition(cameraEvent())
 assert.equal(app.s.recognitionResponse.value.status,'awaiting_confirmation');assert.equal(app.calls.filter(c=>c.recognize).length,1)
 assert.equal(app.s.recognitionDraft.location,'台账东门')
 app.s.recognitionDraft.deviceCode='006';app.s.recognitionCodeChanged();assert.equal(app.s.recognitionDraft.location,'台账西门')
 app.s.recognitionDraft.location='人工修正西侧通道';await app.s.confirmRecognition()
 assert.equal(app.s.recognitionResponse.value.status,'completed');assert.equal(app.calls.filter(c=>c.record).length,0)
})
test('ambiguous or unknown numbers cannot save and failed confirmation retains manual edits',async()=>{
 let stage=0
 const app=subject({recognize:async()=>{if(++stage===1)return{status:'awaiting_confirmation',confirmationToken:'ticket',recognition:{deviceCode:'005'},candidates:[{assetId:7,deviceCode:'005',location:'东门'},{assetId:8,deviceCode:'005',location:'西门'}]};throw Error('网络中断')}})
 app.s.detailVisible.value=false;await app.s.chooseRecognition(cameraEvent())
 assert.equal(app.s.recognitionDraft.assetId,'');await app.s.confirmRecognition();assert.equal(stage,1)
 app.s.recognitionDraft.assetId=8;app.s.recognitionAssetChanged();assert.equal(app.s.recognitionDraft.location,'西门')
 app.s.recognitionDraft.location='人工核对位置';await app.s.confirmRecognition()
 assert.equal(app.s.recognitionResponse.value.confirmationToken,'ticket');assert.equal(app.s.recognitionDraft.location,'人工核对位置');assert.match(app.s.recognitionError.value,/网络中断/)
 app.s.recognitionDraft.deviceCode='999';app.s.recognitionCodeChanged();assert.equal(app.s.recognitionDraft.location,'');assert.equal(app.s.recognitionDraft.assetId,'')
})

test('month rollover follows the current month in web and App while preserving an explicitly selected history month',async()=>{
 for(const execution of [false,true]){
  const app=subject({execution,bootstrapData:()=>({cycles:[{id:4,inspectionMonth:'2026-11'},{id:3,inspectionMonth:'2026-10'},{id:2,inspectionMonth:'2026-09'}],selectedCycleId:4,photoRecognition:{enabled:true,periodMonth:'2026-11'}})})
  app.s.cycles.value=[{id:3,inspectionMonth:'2026-10'}];app.s.query.cycleId=3;app.s.photoRecognition.value.periodMonth='2026-10'
  await app.s.bootstrap();assert.equal(app.s.query.cycleId,4);assert.equal(app.s.detailVisible.value,false)
  if(!execution){app.s.query.cycleId=2;await app.s.bootstrap();assert.equal(app.s.query.cycleId,2)}
 }
})

test('side capture retains original photo, retries all views, and invalidates prior confirmation',async()=>{
 const app=subject();app.s.detailVisible.value=false;
 await app.s.chooseRecognition(cameraEvent());const first=app.s.recognitionFile.value;
 await app.s.chooseRecognition(cameraEvent(),'', '',true);
 assert.equal(app.s.recognitionFile.value,first);assert.equal(app.s.recognitionViews.value.length,1);
 let latest=app.calls.filter(c=>c.recognize).at(-1);assert.equal(latest.recognize[0].length,2);assert.equal(latest.recognize[0][0],first);
 await app.s.recognizePhoto();latest=app.calls.filter(c=>c.recognize).at(-1);assert.equal(latest.recognize[0].length,2);
 await app.s.chooseRecognition(cameraEvent(),'', '',true);assert.equal(app.s.recognitionViews.value.length,2);
 await app.s.chooseRecognition(cameraEvent(),'', '',true);assert.equal(app.s.recognitionViews.value.length,2);assert.match(app.s.recognitionError.value,/最多/);
 app.s.clearRecognition();assert.equal(app.s.recognitionViews.value.length,0);assert.equal(app.s.recognitionFile.value,null);
});

test('missing OCR number allows choosing any returned authorized candidate and saves the selected ledger code',async()=>{
 let stage=0;const candidates=[{assetId:7,deviceCode:'005',areaName:'东区',location:'东门'},{assetId:8,deviceCode:'X006',areaName:'西区',location:'西门'}];
 const app=subject({recognize:async(_file,payload)=>{if(++stage===1)return{status:'awaiting_confirmation',confirmationToken:'manual-ticket',recognition:{deviceCode:'',evidence:{codeConfidence:null}},candidates};assert.equal(payload.deviceCode,'X006');assert.equal(payload.confirmedAssetId,8);return{status:'completed',pointId:4,assetId:8,record:savedRecord({items:[{assetId:8,result:'normal'}]})}}});
 await app.s.chooseRecognition({target:{files:[{name:'card.jpg',type:'image/jpeg',size:50}],value:''}});
 assert.equal(app.s.recognitionDraft.assetId,'');assert.equal(app.s.recognitionCandidates.value.length,2);
 app.s.recognitionDraft.assetId=8;app.s.recognitionAssetChanged();assert.equal(app.s.recognitionDraft.deviceCode,'X006');assert.equal(app.s.recognitionDraft.location,'西门');
 await app.s.confirmRecognition();assert.equal(stage,2);
});
test('a low-confidence guessed number does not preselect an asset',async()=>{
 const app=subject({recognize:async()=>({status:'awaiting_confirmation',confirmationToken:'ticket',recognition:{deviceCode:'005',evidence:{codeConfidence:0.1}},candidates:[{assetId:7,deviceCode:'005',location:'东门'}]})});
 await app.s.chooseRecognition({target:{files:[{name:'card.jpg',type:'image/jpeg',size:50}],value:''}});assert.equal(app.s.recognitionDraft.assetId,'');
 app.s.recognitionDraft.assetId=999;await app.s.confirmRecognition();assert.match(app.s.recognitionError.value,/选择/);
});

test('unrecognized result has no default and manual selections survive a failed save',async()=>{
 let saves=0;const app=subject({recognize:async(_file,payload)=>{if(!payload.confirmationToken)return{status:'awaiting_confirmation',confirmationToken:'manual-results-ticket',recognition:{deviceCode:'005',checks:[{key:'pressure',name:'压力表',standard:'压力是否正常',requiresConfirmation:true,result:'unclear'}]},candidates:[{assetId:7,deviceCode:'005',location:'东门'}]};assert.equal(JSON.parse(payload.manualChecks).pressure,'abnormal');saves++;throw Error('保存网络中断');}});
 await app.s.chooseRecognition({target:{files:[{name:'card.jpg',type:'image/jpeg',size:50}],value:''}});assert.equal(app.s.recognitionMissingChecks.value.length,1);assert.equal(app.s.recognitionDraft.manualChecks.pressure,undefined);
 await app.s.confirmRecognition();assert.match(app.s.recognitionError.value,/人工确认.*压力表/);assert.equal(saves,0);
 app.s.recognitionDraft.manualChecks.pressure='abnormal';await app.s.confirmRecognition();assert.equal(saves,1);assert.equal(app.s.recognitionDraft.manualChecks.pressure,'abnormal');assert.match(app.s.recognitionError.value,/网络中断/);assert.equal(app.s.recognitionResponse.value.confirmationToken,'manual-results-ticket');
 app.s.clearRecognition();assert.equal(Object.keys(app.s.recognitionDraft.manualChecks).length,0);
});

test('a known asset page binds its own device even when no number was recognized',async()=>{
 const app=subject({recognize:async()=>({status:'awaiting_confirmation',confirmationToken:'bound-ticket',recognition:{deviceCode:'',evidence:{codeConfidence:null},checks:[]},candidates:[{assetId:7,deviceCode:'011',location:'本件器材位置'}]})});
 await app.s.chooseRecognition(cameraEvent(),4,7);assert.equal(app.s.recognitionDraft.assetId,7);assert.equal(app.s.recognitionDraft.deviceCode,'011');assert.equal(app.s.recognitionDraft.location,'本件器材位置');assert.equal(app.s.recognitionChoosingAsset.value,false);
});
test('general photography automatically matches a confident unique code without manual selection',async()=>{
 const app=subject({recognize:async()=>({status:'awaiting_confirmation',confirmationToken:'auto-ticket',recognition:{deviceCode:'005',evidence:{codeConfidence:.99},checks:[]},candidates:[{assetId:7,deviceCode:'005',location:'东门'},{assetId:8,deviceCode:'006',location:'西门'}]})});
 await app.s.chooseRecognition(cameraEvent());assert.equal(app.s.recognitionDraft.assetId,7);assert.equal(app.s.recognitionDraft.location,'东门');assert.equal(app.s.recognitionChoosingAsset.value,false);
});
