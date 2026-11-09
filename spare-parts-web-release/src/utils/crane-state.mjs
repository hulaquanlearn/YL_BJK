// Normalized offline display coordinates. These are not controller limits or
// measured travel/speed values. The original program is audited separately.
// The assembly drawings show both trolleys sharing the bridge span. Preserve
// their displayed order and envelope; this is not a controller safety limit.
export const craneTrolleyGap=.14;
export const craneAxes=Object.freeze([
 {id:'travel',label:'大车行走',initial:.5,sourceSlides:[56,69]},
 {id:'trolley',label:'伸缩小车行走',initial:.2,sourceSlides:[95,110,120]},
 {id:'hoist',label:'伸缩提升',initial:0,sourceSlides:[77,85]},
 {id:'rotation',label:'抓斗换向（0° / 90°）',initial:0,sourceSlides:[137,138]},
 {id:'grip',label:'抓斗开合',initial:0,sourceSlides:[139,140]},
 {id:'transfer',label:'周转小车行走',initial:.8,sourceSlides:[94,109,143,145]},
 {id:'transferHoist',label:'周转提升',initial:0,sourceSlides:[144,145,158]},
 {id:'flip',label:'周转翻转（双向）',initial:0,min:-1,sourceSlides:[147,149]},
 {id:'scan',label:'2D 扫描云台',initial:0,sourceSlides:[148,155,165]}
]);
export function craneHomePose(){return Object.fromEntries(craneAxes.map(a=>[a.id,a.initial]))}
export function cranePose(input={}){
 const result=Object.fromEntries(craneAxes.map(a=>{const value=input[a.id];return [a.id,typeof value==='number'&&Number.isFinite(value)?Math.min(1,Math.max(a.min??0,value)):a.initial]}));
 // A raised grab may enter the lowered transfer fixture's centre passage.
 // All other poses preserve horizontal separation; this is a display envelope.
 const transferClear=result.hoist<=.001&&result.transferHoist>=.999&&Math.abs(result.flip)<=.001;
 if(!transferClear){result.trolley=Math.min(result.trolley,1-craneTrolleyGap);result.transfer=Math.max(result.transfer,result.trolley+craneTrolleyGap)}
 return result;
}
// Used by UI scrubbers and play/pause. No wall-clock catch-up after a pause:
// only caller-supplied active frame time advances an individual demonstration.
export function advanceCraneDemo(current,target,deltaSeconds,{running=true,rate=1}={}){
 const from=cranePose(current),to=cranePose(target);
 if(!running||!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return from;
 const step=Math.min(.1,deltaSeconds)*Math.max(0,Math.min(10,Number(rate)||0))*.2;
 for(const axis of craneAxes){const delta=to[axis.id]-from[axis.id];from[axis.id]+=Math.sign(delta)*Math.min(Math.abs(delta),step)}
 return from;
}
