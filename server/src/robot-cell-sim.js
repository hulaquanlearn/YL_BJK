'use strict';
// Explicit offline plant model. Match source declarations; never modify the ZIP.
const {emptyDepositState,appendDeposit,depositPoint}=require('./robot-deposit-state');
const {updateInfrared,updateCameraMeasurements}=require('./robot-infrared-sim');
const PROFILE='brewing-cell@1';

// Bulk volume (m³), tapered inner pot measured in the backup (m).
function potVolume(heightMm){const h=Math.max(0,Math.min(.97,heightMm/1000)),r=1.09,k=.11/.97;return Math.PI*(r*r*h+r*k*h*h+k*k*h*h*h/3)}
function potHeight(volume){let lo=0,hi=970;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(potVolume(mid)<volume)lo=mid;else hi=mid}return (lo+hi)/2}
function cellBucketEmpty(cell){
 const volume=Number(cell.bucketVolume)||0,remaining=Number(cell.targetVolume)-Number(cell.depositedVolume);
 // Keep the final sub-litre dose executable so an exact target cannot deadlock.
 return volume<.001&&!(volume>1e-8&&remaining>0&&remaining<=.001);
}
function cellProfile(report){
 const text=report.files.filter(f=>f.readable).map(f=>f.text||'').join('\n');
 const names=['pFeedWork','WobjBarrelL','WobjBarrelR','tGripOutlet','GI112_127_ZaoYuan','di103_boqi_liao_man','do99_bopi_zhuangliao','do22_boji_zz_DK'];
 if(!names.every(n=>new RegExp('\\b'+n+'\\b','i').test(text)))return null;
 const main=report.files.flatMap(f=>(f.routines||[]).map(r=>({...r,fileId:f.id}))).find(r=>r.name.toLowerCase()==='main');
 if(!main)return null;
 return {id:PROFILE,entry:main.fileId+':'+main.name,label:'上甑工位自动模拟',defaultHeight:800,minHeight:40,maxHeight:900,source:'备份 RAPID 声明与 EIO 信号',bindings:[{name:'do99_bopi_zhuangliao → di103_boqi_liao_man',label:'链板、暂存斗气缸及料满反馈'},{name:'斗内料量 → di20_boqi_wuliao',label:'接满清除无料，铺料消耗后再补料'},{name:'di10/di11',label:'模拟清扫许可为 1'},{name:'do16_dakai_huzhao → di17/di16',label:'布料头护罩开合'},{name:'do22_boji_zz_DK',label:'打散轴、酒醅铺料'},{name:'nDisZOffs / di102_shangzhen_jieshu',label:'甑内高度与完成反馈'},{name:'Go320_336_sifu_weizhi → GI320_335xiangji_weizhi',label:'相机位置反馈'}],substitutions:report.files.some(f=>!f.readable&&/BaseMod/i.test(f.name))?['测高反馈为离线模拟；过渡源码版本见备份来源提示，缺少可读依据时停止']:[]};
}
function createCell(report,options){
 if(!options)return null;
 const profile=cellProfile(report);if(!profile||options.profile!==PROFILE)throw Error('当前备份未匹配上甑自动模拟配置');
 const targetHeight=Number(options.targetHeight??profile.defaultHeight);if(!Number.isFinite(targetHeight)||targetHeight<40||targetHeight>900)throw Error('预设装填高度应为 40–900 mm');
 const capacityLitres=Number(options.capacityLitres??90);if(!Number.isFinite(capacityLitres)||capacityLitres<10||capacityLitres>250)throw Error('估算斗容应为 10–250 L');
 // Offline material-model parameters, not field measurements.
 // The drawn upper/tapered hopper cavity is about 1.13 m³. This is an
 // offline geometric estimate, not a field calibration or PLC parameter.
 const hopperCapacityLitres=Number(options.hopperCapacityLitres??1130);if(!Number.isFinite(hopperCapacityLitres)||hopperCapacityLitres<capacityLitres||hopperCapacityLitres>10000)throw Error('暂存斗容量应不小于估算斗容且不超过 10000 L');
 const chainRateLitresPerSecond=Number(options.chainRateLitresPerSecond??capacityLitres);if(!Number.isFinite(chainRateLitresPerSecond)||chainRateLitresPerSecond<1||chainRateLitresPerSecond>1000)throw Error('链板补料流量应为 1–1000 L/s');
 const initialHopperLitres=Number(options.initialHopperLitres??hopperCapacityLitres);if(!Number.isFinite(initialHopperLitres)||initialHopperLitres<0||initialHopperLitres>hopperCapacityLitres)throw Error('暂存斗初始存量超出容量');
 const transferSeconds=Number(options.transferSeconds??.5);if(!Number.isFinite(transferSeconds)||transferSeconds<0||transferSeconds>30)throw Error('接料转移时间应为 0–30 秒');
 const barrel=options.barrel==='right'?'right':'left';
 return {profile:PROFILE,targetHeight,barrel,height:0,capacityLitres,hopperCapacityLitres,hopperLowFraction:.2,hopperHighFraction:.95,refillActive:false,chainRateLitresPerSecond,transferSeconds,bucketVolume:0,hopperVolume:initialHopperLitres/1000,depositedVolume:0,suppliedVolume:initialHopperLitres/1000,targetVolume:potVolume(targetHeight),loaded:false,bucketFraction:0,fillCount:0,stage:'初始化',complete:false,receiving:false,autoFeedInjected:false,emptySince:null,gateOpen:0,chainActive:0,lastUpdateTime:0,readyAt:0,transferAt:0,pendingBucketVolume:0,depositGrid:emptyDepositState(targetHeight,potVolume(targetHeight))};
}
function seedCell(state){
 const right=state.cell.barrel==='right';Object.assign(state.signals,{di08_robot_pn_jiaohu_ok:1,do02_robotathome:1,di100_robot_yunxing_ok:1,di96_zuozhen_shangliao:Number(!right),di97_youzhen_shangliao:Number(right),go320_336_sifu_weizhi:right?2:1,gi112_127_zaoyuan:7,di102_shangzhen_jieshu:0,di20_boqi_wuliao:1,di103_boqi_liao_man:0,di16_huzhao_guanbi_daowei:1,di17_huzhao_dakai_daowei:0});
 const g=state.globals,w=g[right?'wobjbarrelr':'wobjbarrell'];for(const name of ['wobjinuse','wobjjidian','wobjjidian_hy'])if(w&&name in g)g[name]=JSON.parse(JSON.stringify(w));
 if('bbarrellinuse' in g)g.bbarrellinuse=!right;if('bbarrelrinuse' in g)g.bbarrelrinuse=right;
}
function updateCell(state,events){
 const c=state.cell;if(!c)return;
 const s=state.signals,g=state.globals;c.layerThickness=Number(g.nlayerthick)||40;
 // Fill fields for callers/tests that constructed a legacy cell object directly.
 c.hopperCapacityLitres=Number(c.hopperCapacityLitres)||Math.max(Number(c.capacityLitres)||90,120);
 c.chainRateLitresPerSecond=Number(c.chainRateLitresPerSecond)||Number(c.capacityLitres)||90;
 c.transferSeconds=Number.isFinite(Number(c.transferSeconds))?Number(c.transferSeconds):.5;
 c.hopperVolume=Number(c.hopperVolume)||0;c.suppliedVolume=Number(c.suppliedVolume)||0;c.bucketVolume=Number(c.bucketVolume)||0;
 const high=c.hopperCapacityLitres/1000*(c.hopperHighFraction??.95),low=c.hopperCapacityLitres/1000*(c.hopperLowFraction??.2);
 const now=Number(state.virtualTime)||0,dt=Math.max(0,Math.min(60,now-(Number(c.lastUpdateTime)||0)));c.lastUpdateTime=now;
 const set=(name,value)=>{if(s[name]!==value){s[name]=value;events.push({type:'simulated-input',signal:name,value,reason:'工位模型反馈'})}};
 const cover=c.coverFeedback||(c.coverFeedback={simulated:true,source:'源Do105盖顶阶段握手；不映射实体液压锅盖',delaySeconds:.2,active:false});
 if(!!s.do105_gaiding!==cover.active){cover.active=!!s.do105_gaiding;cover.readyAt=now+cover.delaySeconds}
 set('di105_gaiding',Number(cover.active&&now>=cover.readyAt));
 updateInfrared(state,set,events);
 updateCameraMeasurements(state,set,events);
 if(c.complete){c.stage='装填完成';c.gateOpen=0;c.chainActive=0;c.clothGateClosed=1;if(c.toolDrive)c.toolDrive.active=false;return}
 set('di17_huzhao_dakai_daowei',Number(!!s.do16_dakai_huzhao));set('di16_huzhao_guanbi_daowei',Number(!s.do16_dakai_huzhao));
 set('di336_peifang_xieruok',Number(!!s.go352_367_hmi_zy_leixing&&!!s.go368_383_hmiquyuno));
 set('di10_left_qs',1);set('di11_right_qs',1);
 // DO22 is the source combined spreading enable; DO18/20/19/21 are not directly written in readable source.
 // Derive forward outputs from DO22 and the GO speeds for offline display; reverse bits stay as observed/source.
 const toolCombined=Number(!!s.do22_boji_zz_dk)===1,toolBeltSpeed=Number(s.go32_47_boqi_zhuansu)||0,toolRotorSpeed=Number(s.go48_63_dasan_zhuansu)||0
 if(!('do19_pidai_fanzhuan' in s))set('do19_pidai_fanzhuan',0)
 if(!('do21_dasan_fanzhuan' in s))set('do21_dasan_fanzhuan',0)
 c.bucketEmpty=cellBucketEmpty(c);
 const loading=!!s.do99_bopi_zhuangliao,spreading=toolCombined&&!loading&&!c.bucketEmpty
 set('do18_pidai_zhengzhuan',spreading&&toolBeltSpeed>0&&!Number(s.do19_pidai_fanzhuan)?1:0)
 set('do20_dasan_zhengzhuan',spreading&&toolRotorSpeed>0&&!Number(s.do21_dasan_fanzhuan)?1:0)
 // Offline actuator coordination is separate from the untouched source DO16/DO22 requests.
 c.toolDrive={combined:toolCombined,active:spreading,beltSpeed:toolBeltSpeed,rotorSpeed:toolRotorSpeed,derived:true};c.clothGateClosed=Number(!spreading);c.feedGateOpen=0;c.actuatorDerived=true;c.gateWarning=loading&&s.do16_dakai_huzhao?'源程序接料阶段仍请求打开挡料板；离线联动已关闭':'';
 set('di20_boqi_wuliao',Number(c.bucketEmpty));
 // Receiving drains stored material continuously. The chain runs only with
 // the hopper gate closed; a shortage is replenished before opening the gate.
 const starting=!!s.do99_bopi_zhuangliao&&!c.receiving;
 if(starting){
  c.receiving=true;c.fillCount++;c.loaded=false;c.stage='接料';c.pendingBucketVolume=Math.max(0,Math.min(c.capacityLitres/1000-c.bucketVolume,c.targetVolume-c.depositedVolume-c.bucketVolume));c.receivedBucketVolume=0;
  const shortage=Math.max(0,c.pendingBucketVolume-c.hopperVolume);c.refillTargetVolume=Math.min(c.hopperCapacityLitres/1000,Math.max(high,c.pendingBucketVolume));const refill=shortage>1e-12?Math.max(0,c.refillTargetVolume-c.hopperVolume):0;c.receivePhase=shortage>1e-12?'refill':'opening';c.receiveRateLitresPerSecond=c.capacityLitres/Math.max(.05,c.transferSeconds);c.gateReadyAt=now+refill/(c.chainRateLitresPerSecond/1000)+.4;c.transferStartAt=c.gateReadyAt;c.transferAt=c.transferStartAt+c.pendingBucketVolume/(c.receiveRateLitresPerSecond/1000);c.readyAt=c.transferAt;
  set('di103_boqi_liao_man',0);events.push({type:'cell',stage:shortage>0?'暂存斗补料':'接料',gate:Number(!shortage),chain:Number(!!shortage),hopperLitres:c.hopperVolume*1000,bucketTargetLitres:c.pendingBucketVolume*1000});
 }
 let remainingTime=starting?0:dt;
 if(c.receiving&&!c.loaded){
  // Migrate a paused legacy checkpoint without discarding its current masses.
  c.receivedBucketVolume=Number(c.receivedBucketVolume)||0;c.receiveRateLitresPerSecond=Number(c.receiveRateLitresPerSecond)||c.capacityLitres/Math.max(.05,c.transferSeconds);
  const needed=Math.max(0,(Number(c.pendingBucketVolume)||0)-c.receivedBucketVolume);
  if(!c.receivePhase){c.receivePhase=c.hopperVolume+1e-12>=needed?'transfer':'refill';c.gateReadyAt=now;}
  if(c.receivePhase==='refill'){
   const target=c.refillTargetVolume||needed,missing=Math.max(0,target-c.hopperVolume),rate=c.chainRateLitresPerSecond/1000,add=Math.min(missing,rate*remainingTime);c.hopperVolume+=add;c.suppliedVolume+=add;remainingTime-=add/rate;
   if(c.hopperVolume+1e-12>=target){c.refillActive=false;c.receivePhase='opening';c.gateReadyAt=now-remainingTime+.4;c.transferStartAt=c.gateReadyAt;c.transferAt=c.gateReadyAt+needed/(c.receiveRateLitresPerSecond/1000);c.readyAt=c.transferAt;}
  }
  if(c.receivePhase==='opening'&&now>=c.gateReadyAt)c.receivePhase='transfer';
  if(c.receivePhase==='transfer'){
   const flowStart=Math.max(now-remainingTime,Number(c.gateReadyAt)||0),flowTime=Math.max(0,now-flowStart);
   const amount=Math.min(needed,c.hopperVolume,(c.receiveRateLitresPerSecond/1000)*flowTime);c.hopperVolume-=amount;c.bucketVolume+=amount;c.receivedBucketVolume+=amount;c.bucketFraction=Math.min(1,c.bucketVolume/(c.capacityLitres/1000));
   if(c.receivedBucketVolume+1e-12>=c.pendingBucketVolume){c.loaded=true;c.previousDepositPoint=null;c.receivePhase='complete';c.gateClosedAt=flowStart+amount/(c.receiveRateLitresPerSecond/1000)+.4;set('di103_boqi_liao_man',1);events.push({type:'cell',stage:'接料完成',gate:0,chain:0,hopperLitres:c.hopperVolume*1000,bucketLitres:c.bucketVolume*1000})}
  }
 }
 if(!s.do99_bopi_zhuangliao&&c.receiving){c.receiving=false;c.stage='转运';c.gateOpen=0;c.receivePhase='';events.push({type:'cell',stage:'转运',gate:0,chain:0,hopperLitres:c.hopperVolume*1000,bucketLitres:c.bucketVolume*1000})}
 const empty=cellBucketEmpty(c);c.bucketEmpty=empty;c.gateOpen=Number(c.receiving&&!c.loaded&&c.receivePhase!=='refill');c.feedGateOpen=c.gateOpen;
 if(c.gateOpen)c.chainActive=0;
 else if(c.receiving&&!c.loaded)c.chainActive=Number(c.receivePhase==='refill');
 else {
  if(c.hopperVolume<=low+1e-12)c.refillActive=true;if(c.hopperVolume>=high-1e-12)c.refillActive=false;
  c.chainActive=Number(now>=(Number(c.gateClosedAt)||0)&&c.refillActive);
  // A completed transfer can close and refill on subsequent time ticks.
  const refillTime=Math.max(0,now-Math.max(now-dt,Number(c.gateClosedAt)||0));
  if(c.chainActive&&refillTime>0){const add=Math.min(high-c.hopperVolume,(c.chainRateLitresPerSecond/1000)*refillTime);c.hopperVolume+=add;c.suppliedVolume+=add;if(c.hopperVolume>=high-1e-12){c.chainActive=0;c.refillActive=false}}
 }
 if(!empty)c.autoFeedInjected=false;
 if(s.do22_boji_zz_dk&&!c.receiving){const wasEmpty=c.stage==='空斗返回';c.stage=empty?'空斗返回':'铺料';if(empty&&c.emptySince==null){c.emptySince=now;if(!wasEmpty)events.push({type:'cell',stage:'空斗返回',gate:0,chain:c.chainActive,hopperLitres:c.hopperVolume*1000})}}else if(c.bucketVolume>1e-8)c.emptySince=null;
 // Source layer offsets command the path; only deposited bulk raises the pot.
 c.height=Math.min(c.targetHeight,potHeight(c.depositedVolume));
 if(c.depositedVolume>=c.targetVolume-1e-9){set('di102_shangzhen_jieshu',1);c.stage='收尾'}
 if((s.do98_lshangzhen_wancheng||s.do102_rshangzhen_wancheng)&&c.height>=c.targetHeight-.01){c.complete=true;c.stage='装填完成';c.gateOpen=0;c.chainActive=0;set('di102_shangzhen_jieshu',0)}
}
function cellSpreadingDrive(state){
 const s=state.signals||{},on=key=>Number(s[key])===1,combined=on('do22_boji_zz_dk'),forward=(key,reverse)=>key in s?on(key):combined&&!on(reverse),speed=key=>!(key in s)||Number(s[key])>0;
 return combined&&forward('do18_pidai_zhengzhuan','do19_pidai_fanzhuan')&&!on('do19_pidai_fanzhuan')&&forward('do20_dasan_zhengzhuan','do21_dasan_fanzhuan')&&!on('do21_dasan_fanzhuan')&&speed('go32_47_boqi_zhuansu')&&speed('go48_63_dasan_zhuansu');
}
function consumeCellMotion(state,event){
 const c=state.cell;if(!c)return;
 if(!cellSpreadingDrive(state)||c.receiving||cellBucketEmpty(c)||event.instruction!=='MoveL'||!event.tcpBase){c.previousDepositPoint=null;c.spotPourPoint=null;return}
 const point=event.tcpBase.pos;
 const frame=state.globals[c.barrel==='right'?'wobjbarrelr':'wobjbarrell'];const origin=frame?.uframe?.pos;
 if(origin&&Math.hypot(point[0]-origin[0],point[1]-origin[1])>1350){c.previousDepositPoint=null;return}
 if(c.previousDepositPoint){const a=depositPoint(c.previousDepositPoint,frame),b=depositPoint(point,frame),distance=Math.hypot(b[0]-a[0],b[1]-a[1])/1000,thickness=Math.min(.04,(c.layerThickness||40)/1000);const deposited=Math.max(0,Math.min(c.bucketVolume,c.targetVolume-c.depositedVolume,distance*.30*thickness));if(deposited>0){const accepted=appendDeposit(c,c.previousDepositPoint,point,deposited,frame);c.bucketVolume-=accepted;c.depositedVolume+=accepted;c.height=Math.min(c.targetHeight,potHeight(c.depositedVolume))}}
 c.previousDepositPoint=point.slice();c.lastSurfacePoint=point.slice();c.spotPourPoint=Number(state.globals.hongwai)===41?point.slice():null;c.bucketFraction=c.bucketVolume/(c.capacityLitres/1000);c.loaded=!cellBucketEmpty(c);
}
function consumeCellPause(state,seconds){
 const c=state.cell;if(!c||c.complete||c.receiving||!c.spotPourPoint||Number(state.globals.hongwai)!==41||!cellSpreadingDrive(state)||cellBucketEmpty(c))return;
 const frame=state.globals[c.barrel==='right'?'wobjbarrelr':'wobjbarrell'],local=depositPoint(c.spotPourPoint,frame);if(Math.hypot(local[0],local[1])>1350)return;
 // Region 41 is a source point pour. Only completed WaitTime dwell deposits;
 // elapsed transport/vertical motion is never treated as material flow.
 const amount=Math.max(0,Math.min(c.bucketVolume,c.targetVolume-c.depositedVolume,Math.max(0,Number(seconds)||0)*(c.capacityLitres/1000)/8));
 if(amount>0){const accepted=appendDeposit(c,c.spotPourPoint,c.spotPourPoint,amount,frame);c.bucketVolume-=accepted;c.depositedVolume+=accepted;c.height=Math.min(c.targetHeight,potHeight(c.depositedVolume));c.bucketFraction=c.bucketVolume/(c.capacityLitres/1000);c.loaded=!cellBucketEmpty(c)}
}
module.exports={PROFILE,cellProfile,createCell,seedCell,updateCell,consumeCellMotion,consumeCellPause,potVolume,potHeight,cellBucketEmpty};
