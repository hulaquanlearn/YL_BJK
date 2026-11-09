
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import { getUser } from '../auth'
import { fireApi } from '../api-fire-inspection'
import { fireAssetQrLink, fireImportDefaults, fireSelectedImportWarnings, fireLabelHtml, firePage, firePointState, firePrintableAssets, resolveFireScan } from '../utils/fire-inspection.mjs'


export function useFireInspection(executionMode) {
const route=useRoute(),router=useRouter(),user=getUser()
const sections=ref([]),areas=ref([]),cycles=ref([]),users=ref([]),members=ref([]),pendingImports=ref([]),permissions=ref({canRead:false,canManage:false,areaIds:[]})
const query=reactive({cycleId:'',areaId:'',sectionName:'',type:'',q:'',status:''}),points=ref([]),stats=ref({total:0,pending:0,checked:0,abnormal:0}),loading=ref(false),pageError=ref(''),listError=ref(''),exporting=ref(false)
const webTab=ref('overview'),dashboard=ref(null),dashboardLoading=ref(false),dashboardError=ref('')
const photoRecognition=ref({enabled:false,reason:'正在读取识别服务状态…',periodMonth:''})
const recognitionBusy=ref(false),recognitionFile=ref(null),recognitionPreview=ref(''),recognitionResponse=ref(null),recognitionError=ref(''),recognitionContext=ref(null)
const recognitionViews=ref([]),recognitionChoosingAsset=ref(false)
const recognitionDraft=reactive({deviceCode:'',location:'',assetId:'',manualChecks:{}})
const recognitionPendingChecks=computed(()=>(recognitionResponse.value?.recognition?.checks||[]).filter(c=>c.requiresConfirmation||c.result==='unclear'))
const recognitionMissingChecks=computed(()=>recognitionPendingChecks.value.filter(c=>!['normal','abnormal'].includes(recognitionDraft.manualChecks[c.key])))
const recognitionCandidates=computed(()=>recognitionResponse.value?.candidates||[])
const recognitionMatches=computed(()=>{const code=String(recognitionDraft.deviceCode||'').normalize('NFKC').trim().toUpperCase();return (recognitionResponse.value?.candidates||[]).filter(c=>String(c.deviceCode||'').normalize('NFKC').trim().toUpperCase()===code)})
function recognitionCodeChanged(){const bound=recognitionCandidates.value.find(c=>recognitionContext.value?.assetId&&String(c.assetId)===String(recognitionContext.value.assetId));if(bound){recognitionDraft.assetId=bound.assetId;recognitionDraft.deviceCode=bound.deviceCode;recognitionDraft.location=bound.location;return}const confidence=recognitionResponse.value?.recognition?.evidence?.codeConfidence;const matches=confidence!==undefined&&!(confidence>=0.95)?[]:recognitionMatches.value;recognitionDraft.assetId=matches.length===1?matches[0].assetId:'';recognitionDraft.location=matches.length===1?matches[0].location:''}
function recognitionAssetChanged(){const selected=recognitionCandidates.value.find(c=>String(c.assetId)===String(recognitionDraft.assetId));recognitionDraft.deviceCode=selected?.deviceCode||'';recognitionDraft.location=selected?.location||'';recognitionChoosingAsset.value=false}
async function confirmRecognition(){if(recognitionMissingChecks.value.length){recognitionError.value='请人工确认：'+recognitionMissingChecks.value.map(c=>c.name).join('、');return}const selected=recognitionCandidates.value.find(c=>String(c.assetId)===String(recognitionDraft.assetId));if(!selected){recognitionError.value='请查找并选择本次点检对应的一件器材';return}recognitionDraft.deviceCode=selected.deviceCode;if(!recognitionDraft.location.trim()){recognitionError.value='请填写本次点检位置';return}await recognizePhoto(true)}
let recognitionRequestId='',recognitionAttempt=0
const recordRows=ref([]),recordTotal=ref(0),recordsLoading=ref(false),recordsError=ref(''),recordDates=ref([])
const recordPreview=ref(null),recordVisible=ref(false)
const recordQuery=reactive({page:1,pageSize:30,areaId:'',result:'',actorId:'',q:'',type:''})
const issueRows=ref([]),issueTotal=ref(null),issuesLoading=ref(false),issuesError=ref('')
const issueQuery=reactive({page:1,pageSize:30,areaId:'',status:'pending',q:'',type:''})
let dashboardRequest=0,recordsRequest=0,issuesRequest=0
const pointPage=ref(1),pageSize=24,displayedPoints=computed(()=>firePage(points.value,pointPage.value,pageSize))
const selectedCycle=computed(()=>cycles.value.find(c=>String(c.id)===String(query.cycleId)))
const detailVisible=ref(false),detail=ref(null),detailLoading=ref(false),detailError=ref(''),activePointId=ref(''),detailTab=ref('inspect'),busy=ref(false),photoUrls=ref({})
const activeAssetId=ref(''),targetAsset=computed(()=>detail.value?.targetAsset||(detail.value?.assets||[]).find(asset=>String(asset.id)===String(activeAssetId.value)))
const displayedAssets=computed(()=>activeAssetId.value?(targetAsset.value?[targetAsset.value]:[]):(detail.value?.assets||[]))
let listRequest=0,detailRequest=0,disposed=false
const settingsVisible=ref(false),managing=ref(false),manageError=ref(''),areaName=ref(''),memberUserId=ref(''),memberAreaIds=ref([]),pointEditorVisible=ref(false),pointForm=reactive({id:'',revision:undefined,spatial:null,areaId:'',sectionName:'',code:'',name:'',location:'',building:'',floor:'',room:'',assets:[]})
const importVisible=ref(false),importBusy=ref(false),importFile=ref(null),importPreview=ref(null),importError=ref(''),acknowledgeWarnings=ref(false),selectedSourceKeys=ref([])
const selectedImportWarnings=computed(()=>fireSelectedImportWarnings(importPreview.value,selectedSourceKeys.value))
const importRows=computed(()=>Array.isArray(importPreview.value?.rows)?importPreview.value.rows:[])
const importPage=ref(1),displayedImportRows=computed(()=>firePage(importRows.value,importPage.value,50))
const selectableImportRows=computed(()=>importRows.value.filter(row=>!row.alreadyImported))
const allImportSelected=computed(()=>selectableImportRows.value.length>0 && selectedSourceKeys.value.length===selectableImportRows.value.length)
const historyLimit=ref(10),filteredRecords=computed(()=>(detail.value?.records||[]).filter(record=>!activeAssetId.value||(record.items||[]).some(item=>String(item.assetId)===String(activeAssetId.value)))),visibleRecords=computed(()=>filteredRecords.value.slice(0,historyLimit.value))
const qrVisible=ref(false),qrData=ref(''),qrPoint=ref(null),qrAsset=ref(null),printing=ref(false)
const issueVisible=ref(false),issueBusy=ref(false),issueError=ref(''),issuePendingFile=ref(null),issueForm=reactive({id:'',action:'resolve',remark:'',photos:[]})
const issueDirty=computed(()=>issueVisible.value&&Boolean(issueForm.remark.trim()||issueForm.photos.length||issuePendingFile.value))
const nativeApp=/DigitalWorkbenchAndroid\//.test(navigator.userAgent)
function requestId(){return globalThis.crypto?.randomUUID?.() || `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`}

function state(point){return point?.outOfCycle?{label:'不在本期范围',tone:'neutral',checked:false}:firePointState(point,query.cycleId)}
function canInspect(point){return permissions.value.canManage || (permissions.value.areaIds||[]).some(id=>String(id)===String(point.areaId))}
function canRecord(point){if(!executionMode.value||!point||point.outOfCycle||!canInspect(point)||!query.cycleId||selectedCycle.value?.status==='closed')return false;if(detailVisible.value&&detail.value?.point===point&&detail.value.dispatchStatus==='unassigned')return false;return activeAssetId.value&&detail.value?.point===point?Boolean(targetAsset.value&&targetAsset.value.inspectionStatus!=='checked'):!state(point).checked}

function assetState(asset){return !query.cycleId||detail.value?.point?.outOfCycle||(activeAssetId.value&&detail.value?.dispatchStatus==='unassigned')?{label:'未点检',tone:'neutral'}:asset.inspectionStatus==='checked'?{label:'已点检',tone:'checked'}:{label:'未点检',tone:'pending'}}

function physicalAsset(asset){return Number(asset.quantity)===1&&!['unconfigured','retired'].includes(asset.status)}
function instanceLabel(asset){const source=asset.source||{};const index=source.instanceIndex||source.unitIndex;return index?`第${index}具/套`:''}
function assetTitle(asset){return [asset.name||typeName(asset.type),asset.code,instanceLabel(asset)].filter(Boolean).join(' · ')}
function typeName(type){return ({extinguisher:'灭火器',hydrant:'消防栓'})[type] || type || '器材'}
function assetStatus(status){return ({active:'在用',unconfigured:'未配置',repair:'维修中',retired:'退役'})[status] || status}
function resultName(result){return ({normal:'正常',abnormal:'异常',missing:'缺失'})[result] || result || '—'}
function issueStatus(status){return ({open:'待整改',resolved:'待复核',closed:'已关闭'})[status] || status}
function issueAction(action){return ({created:'发现异常',opened:'发现异常',open:'发现异常',resolve:'登记整改',close:'复核关闭',reopen:'重新打开'})[action] || action}
function location(point){return [point.building,point.floor,point.room,point.location].filter(Boolean).join(' · ')}
function time(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)}



async function bootstrap(preserve=true){if(disposed)return;const oldMonth=photoRecognition.value.periodMonth,followCurrent=selectedCycle.value?.inspectionMonth===oldMonth,oldCycle=query.cycleId;const data=await fireApi.bootstrap().catch(error=>{if(!disposed)photoRecognition.value={enabled:false,reason:'识别服务状态读取失败，请刷新后重试',periodMonth:oldMonth};throw error});if(disposed)return;areas.value=data.areas||[];sections.value=data.sections||[];cycles.value=data.cycles||[];users.value=data.users||[];members.value=data.members||[];pendingImports.value=data.pendingImports||[];photoRecognition.value=data.photoRecognition||{enabled:false,reason:'拍照识别服务暂未配置',periodMonth:''};permissions.value=data.permissions||permissions.value;if(executionMode.value || followCurrent || !preserve || !cycles.value.some(c=>String(c.id)===String(query.cycleId)))query.cycleId=data.selectedCycleId||'';if(oldCycle&&String(oldCycle)!==String(query.cycleId)){detailVisible.value=false;detailRequest++;if(recognitionFile.value)recognitionError.value='已切换到新的点检月份，请重新拍摄本月检查卡'}}
async function reload(){if(disposed)return;pageError.value='';try{await bootstrap();await refreshCurrent()}catch(e){pageError.value=e.message}}
async function refreshCurrent(){if(executionMode.value){await Promise.all([loadPoints(),loadDashboard(),loadIssues()]);return}if(webTab.value==='overview')await Promise.all([loadDashboard(),loadPoints()]);else if(webTab.value==='records')await loadRecords();else if(webTab.value==='issues')await loadIssues();else if(webTab.value==='ledger')await loadPoints()}
async function loadDashboard(){const current=++dashboardRequest;dashboardLoading.value=true;dashboardError.value='';try{const data=await fireApi.dashboard({cycleId:query.cycleId||undefined,sectionName:query.sectionName||undefined});if(current!==dashboardRequest||disposed)return;dashboard.value=data}catch(e){if(current===dashboardRequest)dashboardError.value=e.message}finally{if(current===dashboardRequest)dashboardLoading.value=false}}
async function loadRecords(reset=false){if(reset)recordQuery.page=1;const current=++recordsRequest;recordsLoading.value=true;recordsError.value='';try{const data=await fireApi.records({...recordQuery,sectionName:query.sectionName||undefined,cycleId:query.cycleId||undefined,from:recordDates.value?.[0]||undefined,to:recordDates.value?.[1]||undefined});if(current!==recordsRequest||disposed)return;recordRows.value=data.items||[];recordTotal.value=data.total||0}catch(e){if(current===recordsRequest)recordsError.value=e.message}finally{if(current===recordsRequest)recordsLoading.value=false}}
async function openRecord(record){recordPreview.value=record;recordVisible.value=true;let index=0,photos=record.photos||[];await Promise.allSettled(Array.from({length:Math.min(4,photos.length)},async()=>{while(index<photos.length)await loadPhoto(photos[index++])}))}
async function loadIssues(reset=false){if(reset)issueQuery.page=1;const current=++issuesRequest;issuesLoading.value=true;issuesError.value='';try{const data=await fireApi.issues({...issueQuery,status:executionMode.value?'all':issueQuery.status,sectionName:query.sectionName||undefined});if(current!==issuesRequest||disposed)return;issueRows.value=data.items||[];issueTotal.value=data.total||0}catch(e){if(current===issuesRequest)issuesError.value=e.message}finally{if(current===issuesRequest)issuesLoading.value=false}}
async function changeWebTab(value){if(!['overview','records','issues','ledger','park'].includes(value))return;webTab.value=value;await refreshCurrent()}
async function viewAreaRecords(area){recordQuery.areaId=area.areaId;recordQuery.page=1;await changeWebTab('records')}
async function loadPoints(){const current=++listRequest;loading.value=true;listError.value='';try{const data=await fireApi.points({...query,cycleId:executionMode.value||webTab.value==='overview'?query.cycleId||undefined:undefined,status:undefined,areaId:query.areaId||undefined});if(current!==listRequest||disposed)return;points.value=data.items||[];stats.value=data.stats||{};pointPage.value=1}catch(e){if(current===listRequest)listError.value=e.message}finally{if(current===listRequest)loading.value=false}}
async function sectionChanged(){pointPage.value=1;recordQuery.page=1;issueQuery.page=1;await refreshCurrent()}
function cycleChanged(){if(recognitionBusy.value)return;detailVisible.value=false;clearRecognition();query.status=executionMode.value?'pending':'';recordQuery.page=1;issueQuery.page=1;refreshCurrent()}
function setStatus(value){query.status=value;if(value==='abnormal'&&!issuesLoading.value)return loadIssues(true)}
const photoLoading=new Set()
async function loadPhoto(photo){if(!photo?.id || photoUrls.value[photo.id]||!photo.url||photoLoading.has(photo.id))return;photoLoading.add(photo.id);try{const blob=await fireApi.photoBlob(photo.url);if(disposed)return;photoUrls.value[photo.id]=URL.createObjectURL(blob)}catch(e){if(detailVisible.value)detailError.value='部分照片读取失败：'+e.message}finally{photoLoading.delete(photo.id)}}
async function loadVisiblePhotos(){const photos=detailTab.value==='history'?visibleRecords.value.flatMap(r=>r.photos||[]):detailTab.value==='issues'?(detail.value?.issues||[]).flatMap(i=>[...(i.photos||[]),...(i.events||[]).flatMap(e=>e.photos||[])]):[];let index=0;await Promise.allSettled(Array.from({length:Math.min(4,photos.length)},async()=>{while(index<photos.length)await loadPhoto(photos[index++])}))}
watch([detailTab,historyLimit],loadVisiblePhotos)
async function openPoint(id,tab,assetId='',autoDispatch=false,recognitionRefresh=false){
  if(disposed||busy.value||recognitionBusy.value&&!recognitionRefresh)return
  if(detailVisible.value&&hasUnsubmitted.value&&(String(id)!==String(activePointId.value)||String(assetId)!==String(activeAssetId.value))&&!await confirmLeaving())return
  if(String(id)!==String(activePointId.value)||String(assetId)!==String(activeAssetId.value))issueVisible.value=false
  const current=++detailRequest;activePointId.value=id;activeAssetId.value=assetId||'';detailVisible.value=true;detail.value=null;detailError.value='';detailLoading.value=true;detailTab.value=executionMode.value?(tab||'inspect'):(['history','assets','issues'].includes(tab)?tab:'history');historyLimit.value=10;
  try{let data;try{data=await fireApi.point(id,autoDispatch?undefined:query.cycleId||undefined,assetId)}catch(e){if(e.status!==404||!query.cycleId||autoDispatch)throw e;data=await fireApi.point(id,undefined,assetId);data.point.outOfCycle=true}if(current!==detailRequest||disposed)return;if(assetId&&String(data.targetAsset?.id||'')!==String(assetId)&&!(data.assets||[]).some(asset=>String(asset.id)===String(assetId)))throw new Error('器材不属于此点位或没有访问权限');if(autoDispatch&&data.workOrder&&data.cycleId){query.cycleId=data.cycleId;if(!cycles.value.some(c=>String(c.id)===String(data.cycleId)))cycles.value.push({id:data.cycleId,name:data.workOrder.cycleName,status:'open',deadline:data.workOrder.deadline,inspectionMonth:data.workOrder.inspectionMonth});loadPoints()}detail.value=data;if(!tab&&((assetId&&targetAsset.value?.inspectionStatus==='checked')||(!assetId&&state(data.point).checked)))detailTab.value='history';await loadVisiblePhotos()}catch(e){if(current===detailRequest)detailError.value=e.message}finally{if(current===detailRequest)detailLoading.value=false}
}
function detailClosed(){detailRequest++;if(route.query.point)router.replace({path:route.path,query:{...route.query,point:undefined,asset:undefined}})}
function checkFile(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 照片');if(file.size>8*1024*1024)throw new Error('每张照片不能超过 8MB')}
function clearRecognition(){if(recognitionBusy.value)return;recognitionAttempt++;recognitionFile.value=null;recognitionViews.value.forEach(view=>URL.revokeObjectURL(view.url));recognitionViews.value=[];recognitionResponse.value=null;recognitionError.value='';recognitionRequestId='';recognitionContext.value=null;recognitionChoosingAsset.value=false;Object.assign(recognitionDraft,{deviceCode:'',location:'',assetId:'',manualChecks:{}});if(recognitionPreview.value)URL.revokeObjectURL(recognitionPreview.value);recognitionPreview.value=''}
async function chooseRecognition(event,pointId='',assetId='',append=false){
 const file=event.target.files?.[0];event.target.value='';if(!file||recognitionBusy.value||disposed||!executionMode.value)return
 const adding=append&&recognitionFile.value&&recognitionResponse.value?.status!=='completed'&&String(recognitionContext.value?.pointId||'')===String(pointId)&&String(recognitionContext.value?.assetId||'')===String(assetId)
 if(!adding)clearRecognition()
 try{
  checkFile(file)
  if(adding){
   if(recognitionViews.value.length>=2)throw new Error('最多保留正面和两侧共3张；请重新拍摄替换本组照片')
   if([recognitionFile.value,...recognitionViews.value.map(v=>v.file),file].reduce((n,f)=>n+f.size,0)>8*1024*1024)throw new Error('同一张检查卡的照片总大小不能超过8MB')
   recognitionViews.value.push({file,url:URL.createObjectURL(file)})
  }else{recognitionFile.value=file;recognitionPreview.value=URL.createObjectURL(file)}
  recognitionResponse.value=null;recognitionRequestId=requestId()
  if(!query.cycleId)await bootstrap(false)
  recognitionContext.value={cycleId:query.cycleId,...(pointId?{pointId}:{}),...(assetId?{assetId}:{})}
  if(!photoRecognition.value.enabled)throw new Error(photoRecognition.value.reason||'识别服务暂不可用，照片已保留，可稍后重试')
  await recognizePhoto()
 }catch(e){recognitionError.value=e.message}
}

function confirmedRecognition(result){
 const saved=result.record,context=recognitionContext.value,validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
 if(!saved||![saved.id,saved.cycleId,saved.pointId,result.pointId,result.assetId].every(validId)||String(saved.cycleId)!==String(context?.cycleId)||String(saved.cycleId)!==String(query.cycleId)||String(saved.pointId)!==String(result.pointId)||context?.pointId&&String(context.pointId)!==String(result.pointId)||context?.assetId&&String(context.assetId)!==String(result.assetId)||saved.items?.length!==1||String(saved.items[0].assetId)!==String(result.assetId))throw new Error('点检结果尚未确认保存或记录与当前器材不一致，请重试核对')
 return saved
}
function applySavedRecognition(result){
 const saved=result.record,applyAsset=asset=>String(asset.id)===String(result.assetId)?{...asset,inspectionStatus:'checked',inspectionResult:saved.items?.find(i=>String(i.assetId)===String(asset.id))?.result||saved.result,lastRecordId:saved.id}:asset
 function applyPoint(point){if(!point||String(point.id)!==String(result.pointId)||point.outOfCycle||!(point.assets||[]).some(a=>String(a.id)===String(result.assetId)))return point;const assets=point.assets.map(applyAsset),checked=assets.filter(a=>a.inspectionStatus==='checked').length;return{...point,assets,checkedAssetCount:checked,assetCount:assets.length,status:checked===assets.length?'checked':'pending',recordId:saved.id,lastCheckedAt:saved.actualCheckedAt||saved.submittedAt,lastCheckedBy:saved.actorName||'',...(saved.result==='abnormal'?{hasIssue:true}:{})}}
 points.value=points.value.map(applyPoint)
 if(detail.value&&String(detail.value.point?.id)===String(result.pointId)&&(!detail.value.cycleId||String(detail.value.cycleId)===String(saved.cycleId))){const next={...detail.value,point:applyPoint(detail.value.point),assets:(detail.value.assets||[]).map(applyAsset)};if(next.targetAsset&&String(next.targetAsset.id)===String(result.assetId))next.targetAsset=applyAsset(next.targetAsset);next.records=[saved,...(next.records||[]).filter(r=>String(r.id)!==String(saved.id))];detail.value=next}
}
async function recognizePhoto(confirm=false){
 if(recognitionBusy.value||busy.value||disposed||!recognitionFile.value)return
 confirm=confirm===true
 const previous=recognitionResponse.value
 if(confirm&&!previous?.confirmationToken)return
 recognitionBusy.value=true;recognitionError.value='';if(!confirm)recognitionResponse.value=null;const attempt=++recognitionAttempt
 try{
  if(!executionMode.value||!photoRecognition.value.enabled)throw new Error('拍照识别服务暂不可用')
  if(String(recognitionContext.value?.cycleId)!==String(query.cycleId))throw new Error('统计月份已变化，请重新拍摄')
  const result=await fireApi.recognize(recognitionViews.value.length?[recognitionFile.value,...recognitionViews.value.map(v=>v.file)]:recognitionFile.value,{...recognitionContext.value,requestId:recognitionRequestId,...(confirm?{confirmationToken:previous.confirmationToken,deviceCode:recognitionDraft.deviceCode,location:recognitionDraft.location,confirmedAssetId:recognitionDraft.assetId,...(Object.keys(recognitionDraft.manualChecks).length?{manualChecks:JSON.stringify(recognitionDraft.manualChecks)}:{})}:{})})
  if(disposed||attempt!==recognitionAttempt)return
  if(result.status==='completed')confirmedRecognition(result)
  if(confirm&&result.status==='needs_review'){recognitionError.value=result.message;return}
  recognitionResponse.value=result
  if(result.status==='awaiting_confirmation'){recognitionChoosingAsset.value=false;recognitionDraft.manualChecks={};recognitionDraft.deviceCode=result.recognition?.deviceCode||'';recognitionCodeChanged();return}
  if(result.status==='completed'){
   applySavedRecognition(result)
   
   await Promise.all([loadPoints(),loadDashboard()]);if(disposed||attempt!==recognitionAttempt)return
   if(listError.value)applySavedRecognition(result)
   const refreshFailed=Boolean(listError.value||dashboardError.value)
   ElMessage.success(refreshFailed?'点检记录已保存，本件已完成；进度待刷新':'点检已保存，设备状态已变绿')
   if(detailVisible.value&&!refreshFailed){const savedDetail=detail.value;await openPoint(result.pointId,'history',result.assetId,false,true);if(!disposed&&attempt===recognitionAttempt&&detailError.value&&savedDetail&&String(savedDetail.point?.id)===String(result.pointId)){detail.value=savedDetail;detailTab.value='history';detailError.value='点检记录已保存，详情待刷新：'+detailError.value;await loadVisiblePhotos()}}
   else if(detailVisible.value){detailTab.value='history';await loadVisiblePhotos()}
  }else if(result.status==='needs_review')await Promise.all([loadPoints(),loadDashboard()]);else throw new Error('识别服务没有返回有效结果，请重试')
 }catch(e){if(!disposed&&attempt===recognitionAttempt)recognitionError.value='识别未完成，设备状态未改变。'+e.message}finally{if(attempt===recognitionAttempt)recognitionBusy.value=false}
}





function historicalAssetName(record,item){const assets=record.pointSnapshot?.assets||detail.value?.assets||[];const asset=item.assetSnapshot||assets.find(a=>String(a.id)===String(item.assetId));return item.name||asset?.name||typeName(asset?.type)}
function newAsset(asset={}){return {id:asset.id,localKey:requestId(),type:asset.type||'extinguisher',code:asset.code||'',name:asset.name||'',spec:asset.spec||'',quantity:asset.id?asset.quantity:1,status:asset.status||'active',notes:asset.notes||'',manufacturedDate:asset.manufacturedDate||'',manufacturer:asset.manufacturer||'',source:asset.source||null}}
function addAsset(){pointForm.assets.push(newAsset())}
async function editPoint(point){manageError.value='';try{let data=point;if(point?.id){const result=await fireApi.point(point.id);data={...result.point,assets:result.assets}}Object.assign(pointForm,{id:data?.id||'',revision:data?.revision,spatial:data?.spatial||null,areaId:data?.areaId||areas.value[0]?.id||'',sectionName:data?.sectionName||'',code:data?.code||'',name:data?.name||'',location:data?.location||'',building:data?.building||'',floor:data?.floor||'',room:data?.room||'',assets:(data?.assets||[{}]).map(newAsset)});pointEditorVisible.value=true}catch(e){listError.value=e.message}}
async function manage(action){if(managing.value)return;managing.value=true;manageError.value='';try{await action()}catch(e){manageError.value=e.message}finally{managing.value=false}}
async function savePoint(){await manage(async()=>{if(!pointForm.location.trim())throw new Error('请填写具体位置');if(!pointForm.assets.length)throw new Error('请添加器材');if(pointForm.assets.some(a=>!a.code.trim()))throw new Error('请填写每件器材的编码');if(!pointForm.areaId){try{const area=await fireApi.area({name:'园区'});pointForm.areaId=area.id}catch(e){await bootstrap(false);const area=areas.value.find(a=>a.name==='园区')||areas.value[0];if(!area)throw e;pointForm.areaId=area.id}}const {id,...data}=pointForm;data.code=data.code||`P-${requestId()}`;data.name=data.name||data.location;data.assets=pointForm.assets.map(({localKey,...a})=>({...a,quantity:a.quantity===''?null:a.quantity}));await fireApi.savePoint(id,data);pointEditorVisible.value=false;ElMessage.success('器材已保存');await Promise.all([bootstrap(false),loadPoints()])})}
async function createArea(){await manage(async()=>{if(!areaName.value.trim())throw new Error('请填写区域名称');await fireApi.area({name:areaName.value.trim()});areaName.value='';await bootstrap();ElMessage.success('区域已新增')})}
function selectMember(){memberAreaIds.value=[...(members.value.find(m=>String(m.userId)===String(memberUserId.value))?.areaIds||[])]}
async function saveMember(){await manage(async()=>{await fireApi.member(memberUserId.value,{areaIds:memberAreaIds.value});await bootstrap();ElMessage.success('消防区域授权已保存')})}
async function listAction(action){if(action==='labels'){await printLabels();return}if(action==='import'){importPreview.value=null;importFile.value=null;selectedSourceKeys.value=[];acknowledgeWarnings.value=false;importError.value='';importVisible.value=true;return}if(action==='export'){exporting.value=true;try{const blob=await fireApi.export({...recordQuery,cycleId:query.cycleId||undefined,sectionName:query.sectionName||undefined,from:recordDates.value?.[0]||undefined,to:recordDates.value?.[1]||undefined});download(blob,`消防点检记录-${new Date().toISOString().slice(0,10)}.xlsx`)}catch(e){listError.value=e.message}finally{exporting.value=false}}}
function chooseImport(event){importFile.value=event.target.files?.[0]||null;importPreview.value=null;importError.value='';acknowledgeWarnings.value=false}
function acceptImport(data){importPreview.value=data;selectedSourceKeys.value=fireImportDefaults(data);importPage.value=1;acknowledgeWarnings.value=false}
function toggleImport(key){acknowledgeWarnings.value=false;if(importRows.value.find(row=>row.sourceKey===key)?.alreadyImported)return;selectedSourceKeys.value=selectedSourceKeys.value.includes(key)?selectedSourceKeys.value.filter(value=>value!==key):[...selectedSourceKeys.value,key]}
function toggleAllImport(){acknowledgeWarnings.value=false;selectedSourceKeys.value=allImportSelected.value?[]:selectableImportRows.value.map(row=>row.sourceKey)}
async function previewImport(){if(importBusy.value)return;importBusy.value=true;importError.value='';importPreview.value=null;acknowledgeWarnings.value=false;try{acceptImport(await fireApi.preview(importFile.value))}catch(e){importError.value=e.message}finally{importBusy.value=false}}
async function resumeImport(id){importFile.value=null;selectedSourceKeys.value=[];acknowledgeWarnings.value=false;importVisible.value=true;importBusy.value=true;importError.value='';importPreview.value=null;try{const data=await fireApi.importPreview(id);if(data.status==='committed')throw new Error('此台账已导入，请刷新列表');acceptImport(data)}catch(e){importError.value=e.message}finally{importBusy.value=false}}
async function commitImport(){if(importBusy.value)return;if(!importPreview.value || !selectedSourceKeys.value.length || (selectedImportWarnings.value.length&&!acknowledgeWarnings.value))return;importBusy.value=true;importError.value='';try{const result=await fireApi.commit({previewId:importPreview.value.previewId,acknowledgeWarnings:acknowledgeWarnings.value,selectedSourceKeys:selectedSourceKeys.value});importVisible.value=false;importPreview.value=null;importFile.value=null;await reload();ElMessage.success(`台账导入完成：${result.pointsCreated||0} 个点位，${result.assetsCreated||0} 条器材，跳过 ${result.skipped||0} 行`)}catch(e){importError.value=e.message}finally{importBusy.value=false}}
function qrLink(point=qrPoint.value,asset=qrAsset.value){return fireAssetQrLink(window.location.origin,point.id,asset?.id)}
async function showQr(point,asset=null){try{qrPoint.value=point;qrAsset.value=asset;qrData.value=await QRCode.toDataURL(qrLink(point,asset),{width:360,margin:2});qrVisible.value=true}catch(e){listError.value=e.message}}
async function copyQrLink(){try{await navigator.clipboard.writeText(qrLink());ElMessage.success('链接已复制')}catch{ElMessage.error('复制失败，请下载二维码')}}
async function downloadQr(){try{const blob=await(await fetch(qrData.value)).blob(),name=qrAsset.value?`消防器材-${qrAsset.value.code||qrAsset.value.name}${instanceLabel(qrAsset.value)?'-'+instanceLabel(qrAsset.value):''}.png`:`消防点位-${qrPoint.value.code}.png`;download(blob,name)}catch(e){ElMessage.error('二维码保存失败：'+e.message)}}
async function printLabels(){if(printing.value)return;if(nativeApp){ElMessage.info('批量标签请在电脑网页生成并打印；App可查看、保存每件器材二维码。');return}const preview=window.open('','_blank');if(!preview){ElMessage.error('打印窗口被浏览器拦截，请允许本网站弹出窗口');return}preview.document.write('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在准备器材标签</title><body>正在生成消防器材二维码，请稍候…</body></html>');preview.document.close();printing.value=true;try{const result=await fireApi.points({areaId:query.areaId||undefined,sectionName:query.sectionName||undefined,q:query.q||undefined,type:query.type||undefined});const entries=firePrintableAssets(result.items,query.type);if(!entries.length)throw new Error('当前区域和器材筛选下没有可打印的实物器材；数量待核或未配置条目不生成实物标签');const labels=new Array(entries.length);let index=0;await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(index<entries.length){const current=index++,{point,asset}=entries[current];labels[current]={name:[typeName(asset.type),instanceLabel(asset)].filter(Boolean).join(' · '),code:asset.code||asset.name||'未编业务号',location:[point.areaName,location(point)||point.name].filter(Boolean).join(' · '),qr:await QRCode.toDataURL(qrLink(point,asset),{width:240,margin:1})}}}));if(preview.closed)return;preview.document.open();preview.document.write(fireLabelHtml(labels));preview.document.close();preview.document.getElementById('print-labels').onclick=()=>preview.print();preview.focus()}catch(e){if(!preview.closed)preview.document.body.textContent='标签生成失败：'+e.message;listError.value=e.message}finally{printing.value=false}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function openIssue(issue,action){if(busy.value||issueBusy.value)return;Object.assign(issueForm,{id:issue.id,action,remark:'',photos:[]});issueError.value='';issuePendingFile.value=null;issueVisible.value=true}
async function chooseIssuePhoto(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{checkFile(file);issuePendingFile.value=file;await uploadIssuePhoto()}catch(e){issueError.value=e.message}}
async function uploadIssuePhoto(){if(issueBusy.value||!issuePendingFile.value)return;issueBusy.value=true;issueError.value='';try{const photo=await fireApi.photo(activePointId.value,issuePendingFile.value);issueForm.photos.push(photo);issuePendingFile.value=null;await loadPhoto(photo)}catch(e){issueError.value=e.message}finally{issueBusy.value=false}}
async function saveIssue(){if(issueBusy.value)return;issueError.value='';try{if(!issueForm.remark.trim())throw new Error('请填写处理情况或复核意见');if(issuePendingFile.value)throw new Error('整改照片尚未上传成功，请重试');if(issueForm.action==='resolve'&&!issueForm.photos.length)throw new Error('请至少上传一张整改照片');issueBusy.value=true;await fireApi.issue(issueForm.id,{action:issueForm.action,remark:issueForm.remark.trim(),photoIds:issueForm.photos.map(p=>p.id)});issueVisible.value=false;await Promise.all([refreshCurrent(),openPoint(activePointId.value,'issues',activeAssetId.value)]);ElMessage.success('处理记录已保存')}catch(e){issueError.value=e.message}finally{issueBusy.value=false}}
const hasUnsubmitted=computed(()=>issueDirty.value||Boolean(recognitionFile.value&&recognitionResponse.value?.status!=='completed'))
async function confirmIssueLeaving(){if(issueBusy.value||disposed)return false;if(!issueDirty.value)return true;try{await ElMessageBox.confirm('整改处理尚未保存。放弃会丢失本次填写和照片关联，未上传成功的照片需要重新拍摄。','保留整改填写',{confirmButtonText:'放弃填写',cancelButtonText:'继续填写',type:'warning'});return !issueBusy.value&&!disposed}catch{return false}}
async function closeIssue(done){if(!await confirmIssueLeaving())return;issueVisible.value=false;if(typeof done==='function')done()}
async function confirmLeaving(){if(busy.value||issueBusy.value||recognitionBusy.value)return false;if(issueDirty.value)return confirmIssueLeaving();if(!hasUnsubmitted.value)return true;try{await ElMessageBox.confirm('照片及识别结果尚未保存，离开将放弃本次拍照与确认内容。','离开点检',{confirmButtonText:'放弃并离开',cancelButtonText:'继续点检',type:'warning'});return true}catch{return false}}
async function closeDetail(done){if(await confirmLeaving()){issueVisible.value=false;done()}}
function beforeUnload(event){if(hasUnsubmitted.value||busy.value||issueBusy.value||recognitionBusy.value){event.preventDefault();event.returnValue=''}}
function sessionChanged(){const next=getUser(),key=String(user?.id||user?._id||user?.username),nextKey=String(next?.id||next?._id||next?.username);if(nextKey===key)return;disposed=true;listRequest++;detailRequest++;dashboardRequest++;recordsRequest++;issuesRequest++;recognitionAttempt++;recognitionBusy.value=false;clearRecognition();const prefix=`fire-inspection:draft:${encodeURIComponent(key)}:`;try{for(let index=localStorage.length-1;index>=0;index--){const name=localStorage.key(index);if(name?.startsWith(prefix))localStorage.removeItem(name)}}catch{}Object.values(photoUrls.value).forEach(url=>URL.revokeObjectURL(url));photoUrls.value={};detailVisible.value=false;detail.value=null;recordVisible.value=false;recordPreview.value=null;points.value=[];areas.value=[];cycles.value=[];users.value=[];members.value=[];pendingImports.value=[];recordRows.value=[];issueRows.value=[];dashboard.value=null;permissions.value={canRead:false,canManage:false,areaIds:[]};photoRecognition.value={enabled:false,reason:'账号已切换，请重新进入消防点检',periodMonth:''};busy.value=false;issueBusy.value=false;settingsVisible.value=false;importVisible.value=false;pointEditorVisible.value=false;qrVisible.value=false;issueVisible.value=false;router.replace('/portal')}
onBeforeRouteLeave(confirmLeaving)
watch(()=>[route.query.point,route.query.asset],([pointId,assetId])=>{if(pointId&&(String(pointId)!==String(activePointId.value)||String(assetId||'')!==String(activeAssetId.value)))openPoint(String(pointId),undefined,assetId?String(assetId):'',true)})
function periodVisibility(){if(document.visibilityState==='visible'&&!disposed&&!busy.value&&!recognitionBusy.value&&!hasUnsubmitted.value)reload()}
const periodTimer=setInterval(()=>{const month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);if(!disposed&&!busy.value&&!recognitionBusy.value&&!hasUnsubmitted.value&&photoRecognition.value.periodMonth&&month!==photoRecognition.value.periodMonth)reload()},60000)
onMounted(async()=>{document.addEventListener('visibilitychange',periodVisibility);window.addEventListener('beforeunload',beforeUnload);window.addEventListener('auth-changed',sessionChanged);query.status=executionMode.value?'pending':'';await reload();if(route.query.point&&!pageError.value){try{const target=resolveFireScan(window.location.href,window.location.origin);await openPoint(target.pointId,undefined,target.assetId,true)}catch(e){pageError.value=e.message}}})
onBeforeUnmount(()=>{clearInterval(periodTimer);document.removeEventListener('visibilitychange',periodVisibility);disposed=true;listRequest++;detailRequest++;dashboardRequest++;recordsRequest++;issuesRequest++;recognitionAttempt++;if(recognitionPreview.value)URL.revokeObjectURL(recognitionPreview.value);recognitionViews.value.forEach(view=>URL.revokeObjectURL(view.url));window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('auth-changed',sessionChanged);Object.values(photoUrls.value).forEach(url=>URL.revokeObjectURL(url))})

return {recognitionViews,recognitionChoosingAsset,recognitionPendingChecks,recognitionMissingChecks,recognitionDraft,recognitionCandidates,recognitionMatches,recognitionCodeChanged,recognitionAssetChanged,confirmRecognition,photoRecognition,recognitionBusy,recognitionFile,recognitionPreview,recognitionResponse,recognitionError,recognitionContext,chooseRecognition,recognizePhoto,clearRecognition,sections,sectionChanged,areas,cycles,users,members,pendingImports,selectedImportWarnings,permissions,query,points,stats,loading,pageError,listError,exporting,pointPage,pageSize,displayedPoints,selectedCycle,detailVisible,detail,detailLoading,detailError,activePointId,detailTab,busy,photoUrls,activeAssetId,targetAsset,displayedAssets,settingsVisible,managing,manageError,areaName,memberUserId,memberAreaIds,pointEditorVisible,pointForm,importVisible,importBusy,importFile,importPreview,importError,acknowledgeWarnings,selectedSourceKeys,importRows,importPage,displayedImportRows,selectableImportRows,allImportSelected,historyLimit,filteredRecords,visibleRecords,qrVisible,qrData,qrPoint,qrAsset,printing,issueVisible,issueBusy,issueError,issuePendingFile,issueForm,nativeApp,state,canInspect,canRecord,assetState,physicalAsset,instanceLabel,assetTitle,typeName,assetStatus,resultName,issueStatus,issueAction,location,time,bootstrap,reload,loadPoints,cycleChanged,setStatus,loadPhoto,loadVisiblePhotos,openPoint,detailClosed,historicalAssetName,addAsset,editPoint,savePoint,createArea,selectMember,saveMember,listAction,chooseImport,acceptImport,toggleImport,toggleAllImport,previewImport,resumeImport,commitImport,qrLink,showQr,copyQrLink,downloadQr,printLabels,openIssue,closeIssue,chooseIssuePhoto,uploadIssuePhoto,saveIssue,hasUnsubmitted,confirmLeaving,closeDetail,executionMode,webTab,dashboard,dashboardLoading,dashboardError,recordRows,recordTotal,recordsLoading,recordsError,recordDates,recordQuery,recordPreview,recordVisible,openRecord,issueRows,issueTotal,issuesLoading,issuesError,issueQuery,refreshCurrent,loadDashboard,loadRecords,loadIssues,changeWebTab,viewAreaRecords}
}
