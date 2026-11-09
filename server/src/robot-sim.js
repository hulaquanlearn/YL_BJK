'use strict';
// 离线 ABB 程序仿真（限定子集）：按真实源码执行控制流，I/O 由用户模拟，运动目标交查看器 FK/IK 求解。
// 不连接控制器、不写存储、不调用 AI。契约见 docs/ABB_DIGITAL_TWIN_COLLABORATION_20261104.md。
const {codePart}=require('./robot-code');
const {createCell,seedCell,updateCell,consumeCellMotion,consumeCellPause,cellBucketEmpty}=require('./robot-cell-sim');
const {followSurface,readSurfaceFeedback,potShell,potToolClearance,potFrameOf,potRimSweep,CLEAN_BRUSH_PROXY}=require('./robot-deposit-state');
const {splitTopLevel,parsePose}=require('./robot-motion');
const {axisLimits}=require('./robot-axis-limits');
const SIM_SCHEMA='abb-motion-sim@1';
const MAX_STATE_BYTES=1024*1024;
const MAX_STEPS=2000;
const MAX_EVENTS=500;
const MAX_SOLVE_CACHE=600;
const MAX_LOOP=10000;
const REFERENCE_JOINTS=[0,0,0,0,90,0];
const ROBOT_AXIS_LIMITS=[[-170,170],[-65,85],[-180,70],[-300,300],[-130,130],[-360,360]];
// Resolve equivalent turns only for joint-interpolated Cartesian MoveJ targets.
// Keep MoveAbsJ absolute source turns and MoveL continuous branch unchanged.
function normalizeJointTurns(joints,seed,limits=ROBOT_AXIS_LIMITS){
 const next=joints.slice(),previous=seed||REFERENCE_JOINTS;
 for(const axis of [0,3,5]){
  if(!Number.isFinite(next[axis])||!Number.isFinite(previous[axis]))continue;
  let best=next[axis],bestDistance=Math.abs(next[axis]-previous[axis]);
  for(const turn of [-720,-360,360,720]){
   const value=next[axis]+turn;if(value<limits[axis][0]||value>limits[axis][1])continue;
   const distance=Math.abs(value-previous[axis]);if(distance+1e-9<bestDistance){best=value;bestDistance=distance}
  }
  next[axis]=best;
 }
 return next;
}
// Routines whose motion is part of the pot exit / rim-cleanup path. Only these
// carry the (pot-derived) whole-tool telemetry, to keep ordinary motion events
// compact and to avoid flagging the pouring passes, which are intentionally
// inside the pot.
function potPathKind(routineName,file){
 const name=String(routineName||'').toLowerCase();
 if(name==='qs')return 'clean';
 if(name==='guodu'||name==='guodu_safe')return 'transition';
 if(name.startsWith('__cell_guodu'))return 'transition';
 if(['kaishi_saliao','main','gohome','rrungohome','gogorrungohome','guodu_movel'].includes(name))return 'exit';
 if(/模拟过渡/.test(String(file||'')))return 'transition';
 return null;
}
function potContextFor(state){
 const cell=state.cell;if(!cell)return null;
 const barrel=cell.barrel==='right'?'right':'left';
 const frame=potFrameOf(state,barrel);if(!frame)return null;
 const shell=potShell(cell);
 return {barrel,frame,shell,pot:{barrel,heightMm:+shell.heightMm.toFixed(1),innerBottomMm:+shell.lowerMm.toFixed(1),innerTopMm:+shell.upperMm.toFixed(1),rimTopMm:+shell.rimTopMm.toFixed(1),rimInnerMm:+shell.rimInnerMm.toFixed(1),rimOuterMm:+shell.rimOuterMm.toFixed(1),rimWidthMm:+shell.rimWidthMm.toFixed(2),brush:CLEAN_BRUSH_PROXY}};
}
// Attach compact pot geometry + whole-tool clearance to exit/cleanup motions.
// The tool envelope is the conservative CAD union because the mounted 640/700
// head is not identifiable from the RAPID tool name alone.
function attachPotTelemetry(state,event,tag){
 if(!tag)return;
 const context=potContextFor(state);if(!context)return;
 const {barrel,frame,shell,pot}=context;
 event.pot={...pot,toolType:state.toolType};
 event.potFrame={pos:frame.pos.map(value=>+value.toFixed(2)),quat:frame.quat.slice()};
 event.potPath=tag;
 if(event.flange&&event.tcpBase){
  const inverse=poseInv(frame),local=poseMul(inverse,{pos:event.tcpBase.pos,quat:[1,0,0,0]}).pos;
  event.tcpLocal=local.map(value=>+value.toFixed(1));
  const result=potToolClearance(shell,frame,event.flange,state.toolType);
  event.potCheck={clearance:result.clearance,part:result.part,region:result.region,local:result.local};
  if(tag==='clean'){
   const sweep=potRimSweep(state.cell,{tcpLocal:local,steps:1,stepDeg:barrel==='right'?-5:5,direction:barrel==='right'?-1:1});
   event.potClean={radiusMm:sweep.radiusMm,heightMm:sweep.heightMm,belowRimMm:sweep.belowRimMm,distanceInnerMm:sweep.distanceInnerMm,distanceOuterMm:sweep.distanceOuterMm,insideRimBand:sweep.insideRimBand,insideWall:sweep.insideWall,requiredRadiusMm:sweep.requiredRadiusMm,requiredBristleMm:sweep.requiredBristleMm};
  }
 }
}
function jointReport(from,to,instruction){
 if(!/^(MoveJ|MoveAbsJ|TriggJ)$/i.test(instruction))return null;
 const delta=to.map((value,index)=>+(value-(from?.[index]??value)).toFixed(2));
 const warning=Math.abs(delta[3])>150||Math.abs(delta[5])>170?('关节翻转换向：J4 '+delta[3]+'°，J6 '+delta[5]+'°'):null;
 return {delta,warning};
}

const RT=(pos,quat,conf,extax)=>({kind:'robtarget',pos:pos.slice(0,3),quat:quat.slice(0,4),conf:(conf||[9e9,9e9,9e9,9e9]).slice(0,4),extax:(extax||[9e9,9e9,9e9,9e9,9e9,9e9]).slice(0,6)});
const JT=(joints,extax)=>({kind:'jointtarget',joints:joints.slice(0,6),extax:(extax||[9e9,9e9,9e9,9e9,9e9,9e9]).slice(0,6)});
const isRT=value=>!!value&&value.kind==='robtarget';
const isJT=value=>!!value&&value.kind==='jointtarget';
const num=value=>{
  if(typeof value==='number')return value;
  if(typeof value==='boolean')return value?1:0;
  if(value&&value.kind==='array')return value.items.length;
  return NaN;
};
const bool=value=>typeof value==='boolean'?value:num(value)!==0;
const boolValue=value=>typeof value==='boolean'?value:num(value)!==0;

function arrayToPoseValue(value,type){
  if(!value||value.kind!=='array')return value;
  const items=value.items;
  if(type==='robtarget'&&items.length>=3){
    const vec=item=>item&&item.kind==='array'?item.items.map(Number):[];
    const pos=vec(items[0]),quat=vec(items[1]),conf=vec(items[2]),extax=items[3]?vec(items[3]):null;
    if(pos.length>=3&&quat.length>=4)return RT(pos,quat,conf,extax);
  }
  if(type==='jointtarget'&&items.length>=1){
    const joints=items[0]&&items[0].kind==='array'?items[0].items.map(Number):[];
    const extax=items[1]&&items[1].kind==='array'?items[1].items.map(Number):null;
    if(joints.length>=6)return JT(joints,extax);
  }
  return value;
}
function poseValueFor(target,instruction){
  if(!target||target.kind!=='array')return target;
  return arrayToPoseValue(target,/moveabsj/i.test(instruction)?'jointtarget':'robtarget');
}
function quatMul(a,b){
  const [a1,a2,a3,a4]=a,[b1,b2,b3,b4]=b;
  return [a1*b1-a2*b2-a3*b3-a4*b4,a1*b2+a2*b1+a3*b4-a4*b3,a1*b3-a2*b4+a3*b1+a4*b2,a1*b4+a2*b3-a3*b2+a4*b1];
}
function quatConj(q){return [q[0],-q[1],-q[2],-q[3]]}
function quatNormalize(q){const length=Math.hypot(...q)||1;return q.map(value=>value/length)}
function quatToMat(q){
  const [w,x,y,z]=quatNormalize(q);
  return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
}
function matToQuat(m){
  const trace=m[0][0]+m[1][1]+m[2][2];
  let w,x,y,z;
  if(trace>0){const s=Math.sqrt(trace+1)*2;w=.25*s;x=(m[2][1]-m[1][2])/s;y=(m[0][2]-m[2][0])/s;z=(m[1][0]-m[0][1])/s}
  else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){const s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;w=(m[2][1]-m[1][2])/s;x=.25*s;y=(m[0][1]+m[1][0])/s;z=(m[0][2]+m[2][0])/s}
  else if(m[1][1]>m[2][2]){const s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;w=(m[0][2]-m[2][0])/s;x=(m[0][1]+m[1][0])/s;y=.25*s;z=(m[1][2]+m[2][1])/s}
  else{const s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;w=(m[1][0]-m[0][1])/s;x=(m[0][2]+m[2][0])/s;y=(m[1][2]+m[2][1])/s;z=.25*s}
  return quatNormalize([w,x,y,z]);
}
function quatRotate(q,v){const m=quatToMat(q);return [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]]}
function poseMul(a,b){const rotated=quatRotate(a.quat,b.pos);return {pos:[a.pos[0]+rotated[0],a.pos[1]+rotated[1],a.pos[2]+rotated[2]],quat:quatMul(a.quat,b.quat)}}
function poseInv(a){const inv=quatConj(a.quat);const neg=quatRotate(inv,a.pos).map(value=>-value);return {pos:neg,quat:inv}}
function poseOfFrame(value){
  if(!value)return {pos:[0,0,0],quat:[1,0,0,0]};
  if(value.kind==='robtarget')return {pos:value.pos,quat:value.quat};
  if(value.kind==='tooldata')return {pos:value.tcp||[0,0,0],quat:value.quat||[1,0,0,0]};
  if(value.kind==='wobjdata')return poseMul({pos:value.uframe?.pos||[0,0,0],quat:value.uframe?.quat||[1,0,0,0]},{pos:value.oframe?.pos||[0,0,0],quat:value.oframe?.quat||[1,0,0,0]});
  if(value.kind==='orient')return {pos:[0,0,0],quat:value.quat};
  return {pos:[0,0,0],quat:[1,0,0,0]};
}
function objectToFrame(value,kind){
  if(!value)return null;
  if(kind==='tooldata')return {kind:'tooldata',robhold:value.robhold!==false,tcp:value.tcp||[0,0,0],quat:value.quat||[1,0,0,0],mass:value.mass,cog:value.cog};
  return {kind:'wobjdata',robhold:!!value.robhold,ufprog:value.ufprog!==false,uframe:value.uframe||{pos:[0,0,0],quat:[1,0,0,0]},oframe:value.oframe||{pos:[0,0,0],quat:[1,0,0,0]}};
}
function rotToEulerZYX(quat){
  const m=quatToMat(quat),sy=-m[2][0],cy=Math.hypot(m[2][1],m[2][2]);
  return {z:cy>1e-9?Math.atan2(m[1][0],m[0][0]):0,y:Math.atan2(sy,cy),x:cy>1e-9?Math.atan2(m[2][1],m[2][2]):Math.atan2(-m[1][2],m[1][1])};
}
function eulerZYXToQuat(z,y,x){
  const cz=Math.cos(z/2),sz=Math.sin(z/2),cy=Math.cos(y/2),sy=Math.sin(y/2),cx=Math.cos(x/2),sx=Math.sin(x/2);
  return [cz*cy*cx+sz*sy*sx,cz*cy*sx-sz*sy*cx,cz*sy*cx+sz*cy*sx,sz*cy*cx-cz*sy*sx];
}
function vecView(arr){return {__vec:arr,get x(){return arr[0]},set x(value){arr[0]=Number(value)},get y(){return arr[1]},set y(value){arr[1]=Number(value)},get z(){return arr[2]},set z(value){arr[2]=Number(value)}}}
function quatView(arr){return {__quat:arr,get q1(){return arr[0]},set q1(value){arr[0]=Number(value)},get q2(){return arr[1]},set q2(value){arr[1]=Number(value)},get q3(){return arr[2]},set q3(value){arr[2]=Number(value)},get q4(){return arr[3]},set q4(value){arr[3]=Number(value)}}}
function getMember(value,name){
  if(value==null)throw new Blocked('member-null','对空值访问 .'+name);
  const lname=String(name).toLowerCase();
  if(value.__vec){
    const axis=lname.match(/^rax_(\d)$/);
    return axis?value.__vec[Number(axis[1])-1]:value[lname];
  }
  if(value.__quat)return value[lname];
  if(value.kind==='confdata'){const index={cf1:0,cf4:1,cf6:2,cfx:3}[lname];if(index!==undefined)return value.values[index]}
  if(value.kind==='robtarget'){
    if(lname==='trans')return vecView(value.pos);
    if(lname==='rot')return quatView(value.quat);
    if(lname==='conf')return value.conf;
    if(lname==='robconf')return {kind:'confdata',values:value.conf};
    if(lname==='extax')return value.extax;
  }
  if(value.kind==='jointtarget'){
    if(lname==='robax')return vecView(value.joints);
    if(lname==='extax')return value.extax;
  }
  if(value.kind==='tooldata'&&lname==='tframe')return {pos:value.tcp||[0,0,0],quat:value.quat||[1,0,0,0]};
  if(value.kind==='wobjdata'&&(lname==='uframe'||lname==='oframe'))return value[lname];
  if(Array.isArray(value.pos)&&Array.isArray(value.quat)){if(lname==='trans')return vecView(value.pos);if(lname==='rot')return quatView(value.quat)}
  if(value.kind==='orient'){const index=['q1','q2','q3','q4'].indexOf(lname);if(index>=0)return value.quat[index]}
  if(value.kind==='array'){const index=Number(lname);if(!Number.isInteger(index))throw new Blocked('member-array','数组只支持数字下标');return value.items[index-1]}
  if(typeof value==='object'&&lname in value)return value[lname];
  if(typeof value==='object'&&name in value)return value[name];
  throw new Blocked('member-unknown','未知成员 .'+name);
}
function setMember(value,name,memberValue){
  const lname=String(name).toLowerCase();
  if(value.__vec){
    const axis=lname.match(/^rax_(\d)$/);
    if(axis)value.__vec[Number(axis[1])-1]=Number(memberValue);else value[lname]=memberValue;
    return;
  }
  if(value.__quat){value[lname]=memberValue;return}
  if(value.kind==='confdata'){const index={cf1:0,cf4:1,cf6:2,cfx:3}[lname];if(index!==undefined){value.values[index]=Number(memberValue);return}}
  if(value.kind==='robtarget'){
    if(lname==='trans'){value.pos=[0,1,2].map(index=>Number(memberValue[index]??memberValue[['x','y','z'][index]]));return}
    if(lname==='rot'){value.quat=(memberValue.quat||memberValue).map(Number).slice(0,4);return}
    if(lname==='robconf'){value.conf=(memberValue?.values||memberValue).slice(0,4);return}
    throw new Blocked('member-write','不支持写入 .'+name);
  }
  if(Array.isArray(value?.pos)&&Array.isArray(value?.quat)){if(lname==='rot'){value.quat=(memberValue?.__quat||memberValue?.quat||memberValue).slice();return}if(lname==='trans'){value.pos=(memberValue?.__vec||memberValue?.pos||memberValue).slice();return}}
  if(value&&typeof value==='object'&&lname in value){value[lname]=memberValue?.kind==='orient'?memberValue.quat:memberValue;return}
  if(value&&typeof value==='object'&&name in value){value[name]=memberValue?.kind==='orient'?memberValue.quat:memberValue;return}
  throw new Blocked('member-write','不支持写入 .'+name);
}
class Blocked extends Error{constructor(code,message,detail){super(message);this.code=code;this.detail=detail||null}}
class SolveNeeded extends Error{constructor(request,key){super('需要机器人求解');this.request=request;this.key=key||JSON.stringify(request)}}

// ---------- 表达式 ----------
function tokenize(text){
  const tokens=[];let i=0;
  while(i<text.length){
    const c=text[i];
    if(/\s/.test(c)){i++;continue}
    if(c==='"'){let value='',j=i+1;for(;j<text.length;j++){if(text[j]==='"'){if(text[j+1]==='"'){value+='"';j++;continue}break}value+=text[j]}tokens.push({type:'string',value});i=j+1;continue}
    if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(text[i+1]||''))){const match=text.slice(i).match(/^\d+(?:\.\d*)?(?:E[-+]?\d+)?|^\.\d+(?:E[-+]?\d+)?/i);tokens.push({type:'number',value:Number(match[0])});i+=match[0].length;continue}
    if(/[A-Za-z_]/.test(c)){const match=text.slice(i).match(/^[A-Za-z_]\w*/);tokens.push({type:'ident',value:match[0]});i+=match[0].length;continue}
    const two=text.slice(i,i+2);
    if(['<>','<=','>=',':='].includes(two)){tokens.push({type:'op',value:two});i+=2;continue}
    if('+-*/=<>(),[]{}.:\\'.includes(c)){tokens.push({type:'op',value:c});i++;continue}
    throw new Blocked('expression','无法识别的字符 '+c);
  }
  return tokens;
}
function Parser(text){this.tokens=tokenize(text);this.index=0}
Parser.prototype.peek=function(){return this.tokens[this.index]||null};
Parser.prototype.next=function(){return this.tokens[this.index++]||null};
Parser.prototype.match=function(value){const token=this.peek();if(token&&token.value===value){this.index++;return true}return false};
Parser.prototype.expect=function(value){if(!this.match(value))throw new Blocked('expression','缺少 '+value)};
Parser.prototype.parse=function(){const node=this.parseOr();if(this.peek())throw new Blocked('expression','表达式尾部多余内容');return node};
// RW6 kernel grammar: [NOT] logical-term {(OR | XOR) logical-term}.
// AND binds before NOT; OR and XOR share precedence and associate left.
Parser.prototype.parseOr=function(){const negate=this.peek()&&/^NOT$/i.test(this.peek().value);if(negate)this.next();let node=this.parseAnd();if(negate)node={type:'unary',op:'NOT',value:node};while(this.peek()&&/^(OR|XOR)$/i.test(this.peek().value)){const op=this.next().value.toUpperCase();node={type:'binary',op,left:node,right:this.parseAnd()}}return node};
Parser.prototype.parseAnd=function(){let node=this.parseCompare();while(this.peek()&&/^AND$/i.test(this.peek().value)){this.next();node={type:'binary',op:'AND',left:node,right:this.parseCompare()}}return node};
Parser.prototype.parseCompare=function(){let node=this.parseAdd();const token=this.peek();if(token&&['=','<>','<','>','<=','>='].includes(token.value)){this.next();node={type:'binary',op:token.value,left:node,right:this.parseAdd()}}return node};
Parser.prototype.parseAdd=function(){let node=this.parseMul();while(this.peek()&&['+','-'].includes(this.peek().value)){const op=this.next().value;node={type:'binary',op,left:node,right:this.parseMul()}}return node};
Parser.prototype.parseMul=function(){let node=this.parseUnary();while(this.peek()&&(['*','/'].includes(this.peek().value)||/^(DIV|MOD)$/i.test(this.peek().value))){const op=this.next().value.toUpperCase();node={type:'binary',op,left:node,right:this.parseUnary()}}return node};
Parser.prototype.parseUnary=function(){const token=this.peek();if(token&&token.value==='-'){this.next();return {type:'unary',op:'-',value:this.parseUnary()}}if(token&&token.value==='+'){this.next();return this.parseUnary()}return this.parsePrimary()};
Parser.prototype.parsePrimary=function(){
  const token=this.next();
  if(!token)throw new Blocked('expression','表达式不完整');
  if(token.type==='number')return {type:'number',value:token.value};
  if(token.type==='string')return {type:'string',value:token.value};
  if(token.type==='ident'){
    const upper=token.value.toUpperCase();
    if(upper==='TRUE')return {type:'bool',value:true};
    if(upper==='FALSE')return {type:'bool',value:false};
    const node={type:'var',name:token.value,segments:[]};
    while(true){
      if(this.match('{')){
        const indices=[];
        if(!this.match('}')){while(true){indices.push(this.parseOr());if(this.match('}'))break;this.expect(',')}}
        for(const index of indices)node.segments.push({type:'index',expr:index});
        continue;
      }
      if(this.match('.')){const member=this.next();if(!member||member.type!=='ident')throw new Blocked('expression','成员名无效');node.segments.push({type:'member',name:member.value});continue}
      break;
    }
    if(this.match('(')){
      const args=[],named=[];
      const readNamed=()=>{
        this.match('\\');
        const nameToken=this.next();if(!nameToken||nameToken.type!=='ident')throw new Blocked('expression','命名参数无效');
        let value={type:'bool',value:true};if(this.match(':='))value=this.parseOr();
        named.push({name:nameToken.value,value});
      };
      if(!this.match(')')){
        while(true){
          if(this.peek()&&(this.peek().value==='\\'||this.tokens[this.index+1]?.value===':='))readNamed();
          else{args.push(this.parseOr());while(this.peek()&&this.peek().value==='\\')readNamed()}
          if(this.match(')'))break;
          if(this.peek()&&this.peek().value==='\\')continue;
          this.expect(',');
        }
      }
      return {type:'call',name:node.name,args,named};
    }
    return node;
  }
  if(token.value==='['){
    const items=[];
    if(!this.match(']')){while(true){items.push(this.parseOr());if(this.match(']'))break;this.expect(',')}}
    return {type:'array',items};
  }
  if(token.value==='('){const node=this.parseOr();this.expect(')');return node}
  throw new Blocked('expression','无法解析的表达式起始符号 '+token.value);
};
function parseExpression(text){try{return new Parser(String(text||'')).parse()}catch(error){if(error instanceof Blocked)throw new Blocked(error.code,error.message+' @expr line '+parsingLine+' '+String(text).slice(0,120));throw error}}

// ---------- 编译 ----------
function parseParams(line){
  const match=codePart(String(line||'')).match(/\(([^)]*)\)/);
  if(!match||!match[1].trim())return [];
  return [...match[1].matchAll(/(^|[,\\|])\s*(?:(VAR|INOUT|PERS)\s+)?(\w+)\s+(\w+)(?:\{[^}]*\})?/gi)].map(([,separator,mode,type,name])=>({name,type:type.toLowerCase(),var:/^(VAR|INOUT|PERS)$/i.test(mode||''),...(/[\\|]/.test(separator)?{optional:true}:{})}));
}
function defaultValue(type,init,dims){
  if(dims){const sizes=(dims.match(/\d+/g)||[]).map(Number);if(init){try{return literalValue(parseExpression(init))}catch{}}return makeArray(sizes)}
  if(type==='num'||type==='dnum'||type==='intnum'){const value=Number(init);return Number.isFinite(value)?value:0}
  if(type==='bool')return /true/i.test(init||'');
  if(type==='string'){const match=String(init||'').match(/^"(.*)"$/);return match?match[1]:''}
  if(type==='robtarget')return init?RT(...poseParts(init,'robtarget')):null;
  if(type==='jointtarget')return init?JT(...poseParts(init,'jointtarget')):null;
  if(type==='clock')return {kind:'clock',elapsed:0,running:false,started:0};
  if(type==='speeddata'){const a=(String(init||'').match(/[-+]?[0-9.]+(?:E[-+]?\d+)?/gi)||[]).map(Number);return {kind:'speeddata',v_tcp:a[0]||100,v_ori:a[1]||100,v_leax:a[2]||1000,v_reax:a[3]||1000}}
  if(type==='zonedata')return null;
  return 0;
}
function literalValue(node){if(['number','string','bool'].includes(node.type))return node.value;if(node.type==='array')return {kind:'array',items:node.items.map(literalValue)};if(node.type==='unary'&&node.op==='-')return -literalValue(node.value);throw Error('nonliteral')}
function makeArray(sizes){const [first,...rest]=sizes;return {kind:'array',items:Array.from({length:first},()=>rest.length?makeArray(rest):0)}}
function poseParts(init,type){
  const pose=parsePose(init,type);
  if(!pose)return [[0,0,0],[1,0,0,0],[9e9,9e9,9e9,9e9],[9e9,9e9,9e9,9e9,9e9,9e9]];
  return type==='robtarget'?[pose.pos,pose.quat,pose.conf,pose.extax]:[pose.joints,pose.extax];
}
function parseFrameValue(init,type){
  if(!init)return null;
  const parts=splitTopLevel(String(init).trim().replace(/^\[/,'').replace(/\]$/,''));
  const poseInner=text=>{const p=splitTopLevel(String(text||'[]').replace(/^\[/,'').replace(/\]$/,''));return {pos:(p[0].match(/[-+]?[\d.E+-]+/gi)||[]).slice(0,3).map(Number),quat:(p[1].match(/[-+]?[\d.E+-]+/gi)||[]).slice(0,4).map(Number)}};
  if(type==='tooldata'){
    const tcp=poseInner(parts[1]),load=(parts[2]||'').match(/[-+]?[\d.E+-]+/gi)||[];
    return objectToFrame({robhold:/true/i.test(parts[0]||''),tcp:tcp.pos,quat:tcp.quat,mass:Number(load[0]),cog:load.slice(1,4).map(Number)},'tooldata');
  }
  return objectToFrame({robhold:/true/i.test(parts[0]||''),ufprog:/true/i.test(parts[1]||''),uframe:poseInner(parts[3]),oframe:poseInner(parts[4])},'wobjdata');
}
let parsingLine=0;
function readStatement(lines,index,end){
  let text=codePart(lines[index-1]||''),line=index,guard=0;
  while(guard++<20&&index<end){
    const opens=(text.match(/[({\[]/g)||[]).length,closes=(text.match(/[)}\]]/g)||[]).length;
    if(opens<=closes)break;
    index++;text+=' '+codePart(lines[index-1]||'');
  }
  parsingLine=line;
  return {text:text.trim(),line,next:index+1};
}
function compileBlock(lines,index,end,stopWords){
  const body=[];
  while(index<=end){
    const statement=readStatement(lines,index,end);index=statement.next;
    const text=statement.text;
    if(!text)continue;
    const keyword=((text.match(/^([A-Za-z_]\w*)/)||[])[1]||'').toUpperCase();
    if(['PROC','FUNC','TRAP','ENDPROC','ENDFUNC','ENDTRAP','MODULE','ENDMODULE'].includes(keyword))continue;
    if(/^LOCAL\s+(PROC|FUNC|TRAP)/i.test(text))continue;
    if(stopWords.has(keyword))return {body,index:index-1};
    if(keyword==='IF'&&!/THEN\s*;?\s*$/i.test(text)){
      // RAPID 单行 IF：IF <条件> <单条指令>;
      const rest=text.replace(/^IF\s+/i,'').replace(/;\s*$/,'');
      const parser=new Parser(rest);
      let condition;try{condition=parser.parseOr()}catch(error){body.push({t:'unsupported',line:statement.line,code:'inline-if',detail:text.slice(0,160)});continue}
      const remaining=parser.tokens.slice(parser.index).map(token=>token.type==='string'?'"'+token.value+'"':String(token.value)).join(' ');
      const branchBody=remaining?[compileSimple(remaining,statement.line)]:[];
      body.push({t:'if',line:statement.line,branches:[{cond:condition,body:branchBody}],elseBody:null});continue;
    }
    if(keyword==='IF'){
      const branches=[];let elseBody=null;
      let condition=parseExpression(conditionOf(text,'IF'));
      let inner=compileBlock(lines,index,end,new Set(['ELSEIF','ELSE','ENDIF']));
      branches.push({cond:condition,body:inner.body});index=inner.index;
      while(index<=end){
        const token=readStatement(lines,index,end);const kw=((token.text.match(/^([A-Za-z_]\w*)/)||[])[1]||'').toUpperCase();
        if(kw==='ELSEIF'){index=token.next;condition=parseExpression(conditionOf(token.text,'ELSEIF'));const nested=compileBlock(lines,index,end,new Set(['ELSEIF','ELSE','ENDIF']));branches.push({cond:condition,body:nested.body});index=nested.index;continue}
        if(kw==='ELSE'){index=token.next;const nested=compileBlock(lines,index,end,new Set(['ENDIF']));elseBody=nested.body;index=nested.index;continue}
        if(kw==='ENDIF'){index=token.next;break}
        body.push({t:'unsupported',line:statement.line,code:'if-structure',detail:'IF 结构不完整'});return {body,index}
      }
      body.push({t:'if',line:statement.line,branches,elseBody});continue;
    }
    if(keyword==='WHILE'){
      const condition=parseExpression(conditionOf(text,'WHILE'));
      const inner=compileBlock(lines,index,end,new Set(['ENDWHILE']));
      body.push({t:'while',line:statement.line,condition,body:inner.body});index=inner.index+1;continue;
    }
    if(keyword==='FOR'){
      const match=text.match(/^\s*FOR\s+([A-Za-z_]\w*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\s*;?\s*$/i);
      if(!match){body.push({t:'unsupported',line:statement.line,code:'for-structure',detail:'FOR 语法无法识别'});continue}
      const inner=compileBlock(lines,index,end,new Set(['ENDFOR']));
      body.push({t:'for',line:statement.line,varName:match[1],from:parseExpression(match[2]),to:parseExpression(match[3]),step:match[4]?parseExpression(match[4]):{type:'number',value:1},body:inner.body});index=inner.index+1;continue;
    }
    if(keyword==='TEST'){
      const expression=parseExpression(conditionOf(text,'TEST'));
      const cases=[];let defaultBody=null;
      while(index<=end){
        const token=readStatement(lines,index,end);const kw=((token.text.match(/^([A-Za-z_]\w*)/)||[])[1]||'').toUpperCase();
        if(!token.text.trim()){index=token.next;continue}
        if(kw==='CASE'){
          const caseText=token.text.replace(/^\s*CASE\s+/i,'');
          const colon=caseText.indexOf(':');
          const valueText=(colon>=0?caseText.slice(0,colon):caseText).trim();
          const inline=colon>=0?caseText.slice(colon+1).trim():'';
          const caseBody=[];
          if(inline)caseBody.push(compileSimple(inline,token.line));
          const nested=compileBlock(lines,index=token.next,end,new Set(['CASE','DEFAULT','ENDTEST']));
          cases.push({values:splitTopLevel(valueText).map(parseExpression),body:caseBody.concat(nested.body)});index=nested.index;continue;
        }
        if(kw==='DEFAULT'){
          const defaultText=token.text.replace(/^\s*DEFAULT\s*/i,'').replace(/^:/,'').trim();
          const defaultStatements=[];
          if(defaultText)defaultStatements.push(compileSimple(defaultText,token.line));
          const nested=compileBlock(lines,index=token.next,end,new Set(['CASE','ENDTEST']));
          defaultBody=defaultStatements.concat(nested.body);index=nested.index;continue;
        }
        if(kw==='ENDTEST'){index=token.next;break}
        body.push({t:'unsupported',line:token.line,code:'test-structure',detail:'TEST 结构不完整'});break;
      }
      body.push({t:'test',line:statement.line,expression,cases,defaultBody});continue;
    }
    try{body.push(compileSimple(text,statement.line))}catch(error){if(error instanceof Blocked){body.push({t:'unsupported',line:statement.line,code:'unparsed-statement',detail:(error.message+' | '+text).slice(0,200)})}else throw error}
  }
  return {body,index};
}
function conditionOf(text,keyword){return text.replace(new RegExp('^\\s*'+keyword+'\\s+','i'),'').replace(/\s*(THEN|DO)\s*;?\s*$/i,'').trim()}
function stripArgumentSwitches(text){
 let depth=0,quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"')quoted=!quoted;if(quoted)continue;if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;else if(c==='\\'&&depth===0)return text.slice(0,i)}
 return text;
}
function parseArgs(text){
  if(!text)return [];
  return splitTopLevel(text).map(raw=>{
    const item=raw.trim();
    if(item.startsWith('\\')){
      const match=item.match(/^\\([A-Za-z_]\w*)\s*(?::=\s*([\s\S]+))?$/);
      return {named:match?match[1]:null,expr:match&&match[2]?parseExpression(match[2]):null,raw:item};
    }
    const wobjMatch=item.match(/\\WObj:=([A-Za-z_]\w*)/i);
    return {expr:parseExpression(stripArgumentSwitches(item).trim()),raw:item,wobjName:wobjMatch?wobjMatch[1]:null};
  });
}
function parsePath(text){
  const root=(text.match(/^([A-Za-z_]\w*)/)||[])[1];
  const segments=[];const rest=text.slice(root.length);const regex=/\{([^}]*)\}|\.([A-Za-z_]\w*)/g;let match;
  while((match=regex.exec(rest))){if(match[1]!==undefined){for(const part of splitTopLevel(match[1]))segments.push({type:'index',expr:parseExpression(part)})}else segments.push({type:'member',name:match[2]})}
  return {name:root,segments};
}
function parseRoutineArgs(text){
  if(!text.trim())return [];
  const call=parseExpression('__routine_args('+text+')');
  return [...call.args.map(expr=>({expr})),...call.named.map(item=>({named:item.name,expr:item.value}))];
}
function compileSimple(text,line){
  const body=text.replace(/;\s*$/,'').trim();
  let match=body.match(/^([A-Za-z_]\w*(?:\{[^}]*\}|\.\w+(?:\{[^}]*\})*)*)\s*:=\s*([\s\S]+)$/);
  if(match)return {t:'assign',line,target:parsePath(match[1]),expr:parseExpression(match[2])};
  match=body.match(/^(MoveAbsJ|MoveL|MoveJ|MoveC|TriggL|TriggJ|SearchL|SearchC)\b([\s\S]*)$/i);
  if(match)return {t:'motion',line,instruction:match[1],args:parseArgs(match[2].trim())};
  match=body.match(/^(Set|Reset|SetGO|SetDO|SetAO|SetAI|ResetDO)\s+([\s\S]+)$/i);
  if(match){const parts=splitTopLevel(match[2]);return {t:'io',line,action:match[1].toLowerCase(),name:parts[0].trim(),value:parts[1]?parseExpression(parts[1]):null}}
  match=body.match(/^PulseDO\s*(?:\\PLength\s*:=\s*([^,]+),)?\s*([A-Za-z_]\w*)$/i);
  if(match)return {t:'pulse',line,name:match[2],seconds:match[1]?parseExpression(match[1]):{type:'number',value:.2}};
  match=body.match(/^(WaitDI|WaitDO|WaitGI|WaitGO|WaitAI|WaitAO|WaitUntil)\b([\s\S]*)$/i);
  if(match){
    const timeout=match[2].match(/\\MaxTime\s*:=\s*([^\\,]+)/i),flag=match[2].match(/\\TimeFlag\s*:=\s*(\w+)/i),options={...(timeout?{timeout:parseExpression(timeout[1].trim())}:{}),...(flag?{timeFlag:flag[1]}:{})};
    if(/waituntil/i.test(match[1]))return {t:'wait',line,kind:'until',expr:parseExpression(stripArgumentSwitches(match[2]).trim()),...options};
    const parts=splitTopLevel(match[2]);
    return {t:'wait',line,kind:match[1].toLowerCase(),signal:(parts[0]||'').replace(/\\\w+/g,'').trim(),value:parts[1]?parseExpression(stripArgumentSwitches(parts[1])):{type:'number',value:1},...options};
  }
  match=body.match(/^WaitTime\b([\s\S]*)$/i);
  if(match){const parts=splitTopLevel(match[1].replace(/\\InPos/gi,'').trim()).filter(Boolean);return {t:'wait',line,kind:'time',seconds:parts.length?parseExpression(parts.at(-1)):{type:'number',value:0}}}
  match=body.match(/^TriggIO\b([\s\S]*)$/i);
  if(match)return {t:'trigger',line,name:match[1].trim().slice(0,160)};
  if(/^GOTO\s+/i.test(body))return {t:'goto',line,label:body.replace(/^GOTO\s+/i,'').trim()};
  if(/^[A-Za-z_]\w*\s*:$/.test(body))return {t:'label',line,name:body.replace(/\s*:$/,'')};
  if(/^RETURN\b/i.test(body)){const rest=body.replace(/^RETURN\s*/i,'').trim();return {t:'return',line,expr:rest?parseExpression(rest):null}}
  if(/^ExitCycle\b/i.test(body))return {t:'exit',line};
  if(/^Incr\s+([A-Za-z_]\w*)\s*;?\s*$/i.test(body)){const name=body.replace(/^Incr\s+/i,'').trim();return {t:'assign',line,target:{name,segments:[]},expr:{type:'binary',op:'+',left:{type:'var',name,segments:[]},right:{type:'number',value:1}}}}
  match=body.match(/^CONNECT\s+([A-Za-z_]\w*)\s+WITH\s+([A-Za-z_]\w*)\s*$/i);
  if(match)return {t:'trapConnect',line,trap:match[1],routine:match[2]};
  match=body.match(/^ISignal(DI|DO)\s+([A-Za-z_]\w*)\s*,\s*([^,]+)\s*,\s*([A-Za-z_]\w*)\s*$/i);
  if(match)return {t:'trapSignal',line,kind:match[1].toLowerCase(),signal:match[2],value:parseExpression(match[3]),trap:match[4]};
  match=body.match(/^IWatch\s+([A-Za-z_]\w*)\s*$/i);if(match)return {t:'trapWatch',line,trap:match[1]};
  match=body.match(/^ISleep\s+([A-Za-z_]\w*)\s*$/i);if(match)return {t:'trapSleep',line,trap:match[1]};
  match=body.match(/^IDelete\s+([A-Za-z_]\w*)\s*$/i);if(match)return {t:'trapDelete',line,trap:match[1]};
  match=body.match(/^(ClkReset|ClkStart|ClkStop|Clear|Add)\s+([\s\S]+)$/i);
  if(match)return {t:'builtin',line,instruction:match[1],args:parseArgs(match[2])};
  if(/^Stop$/i.test(body))return {t:'pause',line};
  if(/^EXIT$/i.test(body))return {t:'exit',line};
  match=body.match(/^(VelSet|AccSet)\s+([\s\S]+)$/i);
  if(match)return {t:'motionSetting',line,instruction:match[1],args:parseArgs(match[2])};
  if(/^(StopMove|StartMove|AccSet|ConfL|ConfJ|SingArea|PathResolv|VelSet|StorePath|RestoPath|ClearPath|TPWrite|TPErase|CornerPathWarning|PathAccLim)\b/i.test(body))return {t:'nop',line,instruction:body.split(/\s+/)[0]};
  if(/^(IError|ISignalGI|ISignalGO|ISignalAI|ISignalAO|ISignalEq|GetTrapData|ReadErrData|TPReadNum|TPReadFK|GetTime|ClkRead|Rand|fRandomGenerator|PackRawBytes|UnPackRawBytes|ClearRawBytes|GetRawBytes)\b/i.test(body))return {t:'blocked',line,code:'unsupported-instruction',detail:body.split(/\s+/)[0]};
  match=body.match(/^(?:LOCAL\s+)?(VAR|PERS|CONST)\s+[A-Za-z_]\w*\s+([A-Za-z_]\w*)/);
  if(match)return {t:'nop',line,instruction:'DECL'};
  match=body.match(/^([A-Za-z_]\w*)\s*(?:\(([\s\S]*)\))?\s*$/);
  if(match)return {t:'call',line,name:match[1],args:match[2]?parseRoutineArgs(match[2]):[]};
  // RAPID 允许无括号调用：DaDi_Move i; / PingPu i+1;
  match=body.match(/^([A-Za-z_]\w*)(?:\s+|(?=\\))([\s\S]+)$/);
  if(match&&!/^(IF|ELSEIF|ELSE|ENDIF|WHILE|ENDWHILE|FOR|ENDFOR|TEST|CASE|DEFAULT|ENDTEST|RETURN|GOTO|RAISE|EXIT|BREAK|CONTINUE)$/i.test(match[1]))return {t:'call',line,name:match[1],args:parseRoutineArgs(match[2])};
  return {t:'unsupported',line,code:'unparsed-statement',detail:body.slice(0,160)};
}
function flattenNodes(nodes,routine,code){
  for(const node of nodes){
    if(node.t==='if'){
      const endJumps=[],branchJumps=[];
      for(let index=0;index<node.branches.length;index++){
        const branch=node.branches[index];
        branchJumps.push(code.length);
        code.push({op:'jumpIfNot',expr:branch.cond,line:node.line,target:null});
        flattenNodes(branch.body,routine,code);
        if(index<node.branches.length-1||node.elseBody){const jump={op:'jump',line:node.line,target:null};code.push(jump);endJumps.push(jump)}
      }
      const elseStart=code.length;
      if(node.elseBody)flattenNodes(node.elseBody,routine,code);
      const end=code.length;
      for(let index=0;index<branchJumps.length;index++){
        const target=index<branchJumps.length-1?branchJumps[index+1]:(node.elseBody?elseStart:end);
        code[branchJumps[index]].target=target;
      }
      for(const jump of endJumps)jump.target=end;
      continue;
    }
    if(node.t==='while'){
      const start=code.length;const jf={op:'jumpIfNot',expr:node.condition,line:node.line,target:null};
      code.push(jf);flattenNodes(node.body,routine,code);code.push({op:'jump',line:node.line,target:start});jf.target=code.length;continue;
    }
    if(node.t==='for'){
      const id='for:'+routine.id+':'+node.line;
      const init={op:'forInit',id,varName:node.varName,from:node.from,to:node.to,step:node.step,line:node.line,target:null};
      code.push(init);const start=code.length;flattenNodes(node.body,routine,code);code.push({op:'forNext',id,varName:node.varName,line:node.line,target:start});init.target=code.length;continue;
    }
    if(node.t==='test'){
      const id='test:'+routine.id+':'+node.line;
      code.push({op:'testInit',id,expr:node.expression,line:node.line});
      const caseJumps=[],endJumps=[];
      for(const caseItem of node.cases){
        const jump={op:'jumpIfNotCase',id,values:caseItem.values,line:node.line,target:null};
        code.push(jump);caseJumps.push(jump);flattenNodes(caseItem.body,routine,code);
        const endJump={op:'jump',line:node.line,target:null};code.push(endJump);endJumps.push(endJump);
        jump.target=code.length;
      }
      if(node.defaultBody)flattenNodes(node.defaultBody,routine,code);
      const end=code.length;for(const jump of endJumps)jump.target=end;continue;
    }
    if(node.t==='label'){routine.labels[node.name.toLowerCase()]=code.length;code.push({op:'label',name:node.name,line:node.line});continue}
    code.push({op:node.t,node,line:node.line});
  }
}
function compileProgram(report){
  const files=report.files.filter(file=>file.kind==='program'&&file.readable&&typeof file.text==='string');
  const routines=new Map(),globals={},frames={tools:{},wobjs:{}},signalTypes={};
  for(const signal of report.signals||[])signalTypes[String(signal.name||'').toLowerCase()]=String(signal.type||'').toUpperCase();
  const compileFile=(file,onlyRoutines=null)=>{
    const lines=file.text.split(/\r\n|\n|\r/),task=file.task||'T_ROB1';
    globals[task]=globals[task]||{};
    const routineRanges=file.routines||[];
    lines.forEach((raw,index)=>{
      const line=codePart(raw);
      const declaration=line.match(/^\s*(?:LOCAL\s+)?(CONST|PERS|VAR)\s+(robtarget|jointtarget|tooldata|wobjdata|speeddata|zonedata|num|bool|string|intnum|byte|rawbytes|dnum|clock)\s+([A-Za-z_]\w*)\s*(\{[^}]*\})?\s*(?::=\s*(.+?))?\s*;\s*$/i);
      if(!declaration)return;
      if(routineRanges.some(routine=>index+1>=routine.startLine&&index+1<=routine.endLine))return;
      const name=declaration[3],key=name.toLowerCase(),type=declaration[2].toLowerCase(),init=declaration[5]?declaration[5].trim():null;
      let value=defaultValue(type,init,declaration[4]);
      if(type==='tooldata'||type==='wobjdata'){const frame=parseFrameValue(init,type);if(frame){frames[type==='tooldata'?'tools':'wobjs'][key]=frame;value=frame}}
      globals[task][key]={name,type,kind:declaration[1].toUpperCase(),value};
    });
    for(const definition of routineRanges){
      if(onlyRoutines&&!onlyRoutines.has(definition.name))continue;
      const routine={id:file.id+':'+definition.name,fileId:file.id,file:file.name,name:definition.name,kind:String(definition.kind||'PROC').toUpperCase(),task,startLine:definition.startLine,endLine:definition.endLine,parameters:parseParams(lines[definition.startLine-1]),tree:[],instructions:[],labels:{},localDefaults:collectLocalDefaults(lines,definition),legacy:definition.legacy||null};
      let compiled;try{compiled=compileBlock(lines,definition.startLine,(()=>{for(let n=definition.startLine;n<definition.endLine;n++)if(/^\s*ERROR\s*$/i.test(codePart(lines[n-1])))return n-1;return definition.endLine})(),new Set())}catch(error){if(error instanceof Blocked)throw new Blocked(error.code,error.message+' @'+file.name+' '+definition.name);throw error}
      routine.tree=compiled.body;routine.instructions=[];flattenNodes(compiled.body,routine,routine.instructions);
      routines.set(routine.id,routine);routines.set('name:'+task+':'+routine.name.toLowerCase(),routine);
    }
  };
  for(const file of files)compileFile(file);
  // BaseMod 在 2026 备份中受保护。只有当可读模块里确实缺少 guodu / guodu_SAFE /
  // MidPosCal 时，才注册 2025-09-29 包中的同名可读源码（逐行复制，见
  // robot-basemod-legacy.js 与 docs/ABB_GUODU_SAFE_RESTORE_20261106.md）。
  let legacyBaseMod=null;
  // Source arrives only in an authenticated backup report; never embed private
  // RAPID text in the publicly downloadable browser worker.
  const compatibility=report.simulationCompatibility;
  const protectedBase=report.sha256==='01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad'&&report.files.some(file=>!file.readable&&file.sha256==='9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377'&&/^BaseMod\.mod$/i.test(file.name));
  if(protectedBase&&compatibility?.file&&compatibility.provenance?.assembledSourceSha256==='450ee3d483c388c14b340f13b89a2ac668a6d94b46b687d4f0dfe857ac15eb8c'){
    const missing=['MidPosCal','guodu','guodu_SAFE'].filter(name=>!routines.has('name:T_ROB1:'+name.toLowerCase()));
    if(missing.length){
      const legacyFile=compatibility.file;
      compileFile(legacyFile,new Set(missing));
      legacyBaseMod={applied:missing,fileId:legacyFile.id,file:legacyFile.name,provenance:compatibility.provenance};
    }
  }
  return {routines,globals,frames,signalTypes,sourceHash:report.sha256,legacyBaseMod};
}
function collectLocalDefaults(lines,definition){
  const defaults={};
  for(let index=definition.startLine;index<=definition.endLine;index++){
    const line=codePart(lines[index-1]||'');
    const match=line.match(/^\s*(?:LOCAL\s+)?(VAR|PERS|CONST)\s+(robtarget|jointtarget|tooldata|wobjdata|speeddata|zonedata|num|bool|string|intnum|byte|rawbytes|dnum|clock)\s+([A-Za-z_]\w*)\s*(\{[^}]*\})?\s*(?::=\s*(.+?))?\s*;\s*$/i);
    if(!match)continue;
    // RAPID 局部 VAR 未给初值时按类型零值初始化；模块级 PERS 保持“待显式输入”
    // 的既有语义（运动目标为 0 会返回 motion-target，由界面收集真实值）。
    let value=defaultValue(match[2].toLowerCase(),match[5]?match[5].trim():null,match[4]);
    if(value==null&&match[2].toLowerCase()==='jointtarget')value=JT([0,0,0,0,0,0]);
    if(value==null&&match[2].toLowerCase()==='robtarget')value=RT([0,0,0],[1,0,0,0]);
    defaults[match[3].toLowerCase()]={type:match[2].toLowerCase(),value};
  }
  return defaults;
}
const compileCache=new Map();
function programFor(report){
  const key=String(report.sha256||'')+':'+(report.simulationCompatibility?.provenance?.assembledSourceSha256||'native');
  if(compileCache.has(key))return compileCache.get(key);
  const program=compileProgram(report);compileCache.set(key,program);
  if(compileCache.size>6)compileCache.delete(compileCache.keys().next().value);
  return program;
}
function findRoutine(program,query){
  if(!query)return null;
  const value=String(query);
  const exact=program.routines.get(value);if(exact)return exact;
  const matches=[];for(const routine of new Set(program.routines.values()))if(routine.name.toLowerCase()===value.toLowerCase())matches.push(routine);
  if(matches.length===1)return matches[0];
  if(matches.length>1){
    const preferred=matches.filter(routine=>/^T_ROB1$/i.test(routine.task));
    if(preferred.length===1)return preferred[0];
  }
  return null;
}

// ---------- 变量/表达式求值 ----------
function lookupVariable(env,name){
  const key=name.toLowerCase();const frame=env.frames[env.frames.length-1];
  if(frame?.optionalArguments?.[key]===false)throw new Blocked('optional-absent','未提供可选参数 '+name+'，请先用 Present 检查');
  if(frame&&Object.prototype.hasOwnProperty.call(frame.locals,key))return frame.locals[key];
  if(env.globals&&Object.prototype.hasOwnProperty.call(env.globals,key))return env.globals[key];
  if(env.program.signalTypes[key]!==undefined)return env.signals[key]!==undefined?env.signals[key]:0;
  if(Object.prototype.hasOwnProperty.call(env.signals,key))return env.signals[key];
  const mode={op_undef:0,op_auto:1,op_man_prog:2,op_man_test:3};if(Object.prototype.hasOwnProperty.call(mode,key))return mode[key];
  throw new Blocked('unknown-variable','未声明变量 '+name);
}
function assignVariable(env,name,value){
  const key=name.toLowerCase();const frame=env.frames[env.frames.length-1];
  if(frame&&Object.prototype.hasOwnProperty.call(frame.locals,key)){frame.locals[key]=value;return}
  if(env.globals&&Object.prototype.hasOwnProperty.call(env.globals,key)){if(env.globalMeta?.[key]?.kind==='CONST')throw new Blocked('const-assign','不能修改常量 '+name);env.globals[key]=value;return}
  if(env.program.signalTypes[key]!==undefined)throw new Blocked('signal-assign','不能直接赋值给信号 '+name);
  frame.locals[key]=value;
}
function evalExpression(node,env){
  switch(node.type){
    case 'number':case 'string':case 'bool':return node.value;
    case 'array':return {kind:'array',items:node.items.map(item=>evalExpression(item,env))};
    case 'var':{
      let value=lookupVariable(env,node.name);
      for(const segment of node.segments)value=segment.type==='member'?getMember(value,segment.name):getIndex(value,evalExpression(segment.expr,env));
      return value;
    }
    case 'unary':{
      const value=evalExpression(node.value,env);
      return node.op==='-'?-num(value):!boolValue(value);
    }
    case 'binary':return evalBinary(node,env);
    case 'call':return evalCall(node,env);
  }
  throw new Blocked('expression','未知表达式节点 '+node.type);
}
function evalBinary(node,env){
  if(node.op==='AND')return boolValue(evalExpression(node.left,env))&&boolValue(evalExpression(node.right,env));
  if(node.op==='OR')return boolValue(evalExpression(node.left,env))||boolValue(evalExpression(node.right,env));
  const left=evalExpression(node.left,env),right=evalExpression(node.right,env);
  switch(node.op){
    case 'XOR':return boolValue(left)!==boolValue(right);
    case '+':return typeof left==='string'||typeof right==='string'?String(left)+String(right):num(left)+num(right);
    case '-':return num(left)-num(right);
    case '*':return num(left)*num(right);
    case '/':return num(left)/num(right);
    case 'DIV':return Math.trunc(num(left)/num(right));
    case 'MOD':return num(left)%num(right);
    case '=':return typeof left==='string'||typeof right==='string'?left===right:num(left)===num(right);
    case '<>':return typeof left==='string'||typeof right==='string'?left!==right:num(left)!==num(right);
    case '<':return num(left)<num(right);
    case '>':return num(left)>num(right);
    case '<=':return num(left)<=num(right);
    case '>=':return num(left)>=num(right);
  }
  throw new Blocked('expression','不支持的运算符 '+node.op);
}
function getIndex(value,index){
  if(!value||value.kind!=='array')throw new Blocked('index','对非数组使用下标');
  const at=Math.trunc(num(index))-1;
  if(at<0||at>=value.items.length)throw new Blocked('index','数组下标越界');
  return value.items[at];
}
function frameValue(env,name,kind){
  const key=String(name||'').toLowerCase();
  if(kind==='tool'&&(key==='tool0'||!key))return {kind:'tooldata',robhold:true,tcp:[0,0,0],quat:[1,0,0,0]};
  if(kind==='wobj'&&(key==='wobj0'||!key))return {kind:'wobjdata',robhold:false,ufprog:true,uframe:{pos:[0,0,0],quat:[1,0,0,0]},oframe:{pos:[0,0,0],quat:[1,0,0,0]}};
  try{const current=lookupVariable(env,name);if(current?.kind==='tooldata'||current?.kind==='wobjdata')return current}catch{}
  const map=env.program.frames[kind==='tool'?'tools':'wobjs']||{};
  if(map[key])return map[key];
  try{const value=lookupVariable(env,name);if(value&&(value.kind==='tooldata'||value.kind==='wobjdata'))return value}catch{}
  throw new Blocked('unknown-frame','未找到'+(kind==='tool'?'工具':'工件')+' '+name);
}
function frameArgValue(node,args,position,named,key,env){
  if(named[key]!==undefined){
    const value=named[key];
    if(typeof value==='string')return frameValue(env,value,key);
    return value;
  }
  const argNode=node.args[position];
  if(argNode&&argNode.wobjName&&key==='wobj')return frameValue(env,argNode.wobjName,'wobj');
  if(position<args.length&&typeof args[position]==='string')return frameValue(env,args[position],key);
  if(position<args.length&&args[position]&&(args[position].kind==='tooldata'||args[position].kind==='wobjdata'))return args[position];
  return frameValue(env,key==='tool'?'tool0':'wobj0',key);
}
function evalArgument(item,env){
  if(item==null)return undefined;
  if(item.type)return evalExpression(item,env);
  if(item.expr)return evalExpression(item.expr,env);
  return undefined;
}
function evalCall(node,env){
  const args=[];const named={};
  const callName=node.name.toUpperCase();
  // Present inspects the argument binding, not its value (0/FALSE are present).
  // It must not evaluate an absent parameter or infer presence from globals.
  if(callName==='PRESENT'){
    const argument=node.args[0],frame=env.frames.at(-1),key=argument?.name?.toLowerCase();
    if(node.args.length!==1||node.named.length||argument?.type!=='var'||argument.segments.length||!Object.prototype.hasOwnProperty.call(frame?.optionalArguments||{},key))throw new Blocked('present-parameter','Present 需要当前例程的可选参数名');
    return frame.optionalArguments[key];
  }
  const framePositions=callName==='CALCROBT'||callName==='CALCJOINTT'?[1,2]:callName==='CROBT'?[0,1]:callName==='RELTOOL'?[3]:[];
  for(let position=0;position<node.args.length;position++){
    const item=node.args[position];
    if(item&&typeof item.named==='string')continue;
    if(item&&item.type){
      try{args.push(evalExpression(item,env))}
      catch(error){
        if(framePositions.includes(position)&&error instanceof Blocked&&error.code==='unknown-variable'&&item.type==='var'&&!item.segments.length)args.push(item.name);
        else throw error;
      }
    }else if(item&&item.expr)args.push(evalExpression(item.expr,env));
  }
  for(const item of node.named){
    const key=item.name.toLowerCase();
    if(key==='tool'||key==='wobj'){
      // \Tool:=tool0 / \WObj:=wobj0 中的名字是数据类型名，不是普通变量。
      try{named[key]=evalExpression(item.value,env)}catch(error){
        if(error instanceof Blocked&&error.code==='unknown-variable'&&item.value&&item.value.type==='var'&&!item.value.segments.length)named[key]=item.value.name;
        else throw error;
      }
    }else named[key]=item.value?evalExpression(item.value,env):true;
  }
  // 位置参数中的工具/工件名（如 CalcRobT(p,tool1\WObj:=My_wobj)）
  for(const item of node.args){
    if(typeof item.named==='string')continue;
    if(item.wobjName)named.wobj=frameValue(env,item.wobjName,'wobj');
  }
  const upper=node.name.toUpperCase();
  if(upper==='CTIME')return new Date((env.state?.epochMs||Date.now())+(env.state?.virtualTime||0)*1000).toISOString().slice(11,19);
  if(upper==='OPMODE'){
    if(args.length||node.named.length)throw new Blocked('opmode-arguments','OpMode 不接受参数');
    return env.state?.operatingMode??(env.state?.cell?1:2);
  }
  if(upper==='CDATE')return new Date(env.state?.epochMs||Date.now()).toISOString().slice(0,10);
  if(upper==='DIM'){let v=args[0];for(let i=1;i<num(args[1]);i++)v=v?.items?.[0];return v?.items?.length||0}
  if(upper==='DUQU1'&&env.state?.cell){const raw=num(args[0]),signed=raw>32767?raw-65536:raw;env.events.push({type:'substitution',routine:'duqu1',message:'受保护配方转换：离线有符号模拟值 '+signed});return signed}
  if(upper==='NUMTOSTR')return num(args[0]).toFixed(Math.max(0,Math.min(15,num(args[1])||0)));
  if(upper==='VALTOSTR')return String(args[0]);
  if(upper==='CLKREAD'){const c=args[0];return (c?.elapsed||0)+(c?.running?(env.state?.virtualTime||0)-c.started:0)}
  if(upper==='ABS')return Math.abs(num(args[0]));
  if(upper==='SQRT')return Math.sqrt(num(args[0]));
  if(upper==='SIN')return Math.sin(num(args[0])*Math.PI/180);
  if(upper==='COS')return Math.cos(num(args[0])*Math.PI/180);
  if(upper==='TAN')return Math.tan(num(args[0])*Math.PI/180);
  if(upper==='ATAN2')return Math.atan2(num(args[0]),num(args[1]))*180/Math.PI;
  if(upper==='ROUND')return Math.round(num(args[0]));
  if(upper==='TRUNC')return Math.trunc(num(args[0]));
  if(upper==='FLOOR')return Math.floor(num(args[0]));
  if(upper==='CEIL')return Math.ceil(num(args[0]));
  if(upper==='ORIENTZYX')return {kind:'orient',quat:eulerZYXToQuat(...args.slice(0,3).map(v=>num(v)*Math.PI/180))};
  if(upper==='EULERZYX'){
    const orient=args[0];const quat=orient&&orient.__quat?orient.__quat:orient&&orient.quat?orient.quat:[1,0,0,0];const angles=rotToEulerZYX(quat);
    const flag=node.named.find(item=>item.name&&['x','y','z'].includes(item.name.toLowerCase()));
    return angles[flag?flag.name.toLowerCase():'x']*180/Math.PI;
  }
  if(upper==='OFFS')return RT([posOf(args[0])[0]+num(args[1]),posOf(args[0])[1]+num(args[2]),posOf(args[0])[2]+num(args[3])],args[0].quat||[1,0,0,0],args[0].conf,args[0].extax);
  if(upper==='RELTOOL'){
    const target=args[0];
    const offset=quatRotate(target.quat,[num(args[1]),num(args[2]),num(args[3])]);
    const rotation=eulerZYXToQuat(...['rz','ry','rx'].map(k=>num(named[k]??0)*Math.PI/180));
    return RT(posOf(target).map((v,i)=>v+offset[i]),quatMul(target.quat,rotation),target.conf,target.extax);
  }
  if(upper==='CALCROBT'){
    // ABB RW6 3HAC050917-001：CalcRobT 输入 jointtarget，输出相对指定 wobj 的 robtarget（无 ProgDisp）。
    const target=args[0];if(!isJT(target))throw new Blocked('calc-rob-target','CalcRobT 需要 jointtarget');
    const tool=frameArgValue(node,args,1,named,'tool',env),wobj=frameArgValue(node,args,2,named,'wobj',env);
    const flange=solveFk(env,target.joints);
    const tcpWobj=poseMul(poseInv(poseOfFrame(wobj)),poseMul(flange,poseOfFrame(tool)));
    return RT(tcpWobj.pos,tcpWobj.quat,null,target.extax);
  }
  if(upper==='CROBT'){
    const tool=frameArgValue(node,args,0,named,'tool',env),wobj=frameArgValue(node,args,1,named,'wobj',env);
    const flange=solveFk(env);const target=poseMul(poseInv(poseOfFrame(wobj)),poseMul(flange,poseOfFrame(tool)));
    return RT(target.pos,target.quat);
  }
  if(upper==='CALCJOINTT'){
    const target=args[0];if(!isRT(target))throw new Blocked('calc-joint-target','CalcJointT 需要 robtarget');
    const tool=frameArgValue(node,args,1,named,'tool',env),wobj=frameArgValue(node,args,2,named,'wobj',env);
    const flange=poseMul(poseMul(poseOfFrame(wobj),{pos:target.pos,quat:target.quat}),poseInv(poseOfFrame(tool)));
    return JT(solveIk(env,{pos:flange.pos,quat:flange.quat},target.conf,tool,wobj,target,true));
  }
  if(upper==='CJOINTT')return JT(env.frames[env.frames.length-1].robotJoints||REFERENCE_JOINTS);
  if(upper==='DISTANCE')return Math.hypot(posOf(args[0])[0]-posOf(args[1])[0],posOf(args[0])[1]-posOf(args[1])[1],posOf(args[0])[2]-posOf(args[1])[2]);
  if(upper==='NUM')return num(args[0]);
  const user=env.program.routines.get('name:'+env.task+':'+node.name.toLowerCase());
  if(user)return evalFunction(user,args,named,env,node.args,node.named);
  throw new Blocked('unsupported-function','未实现的函数 '+node.name);
}
function posOf(value){return value&&Array.isArray(value.pos)?value.pos:[0,0,0]}
function frameArgValueLegacy(){return null}
function bindRoutine(routine,args,named,env,argNodes=[],namedNodes=[]){
  const locals={},varBindings=[],optionalArguments={};let position=0;
  for(const parameter of routine.parameters){
    const key=parameter.name.toLowerCase(),hasNamed=Object.prototype.hasOwnProperty.call(named,key),index=parameter.optional?-1:position++;
    const supplied=hasNamed||index>=0&&index<args.length;
    if(parameter.optional)optionalArguments[key]=supplied;
    if(!supplied&&!parameter.optional)throw new Blocked('parameter-required','缺少例程参数 '+parameter.name);
    locals[key]=supplied?(hasNamed?named[key]:args[index]):defaultValue(parameter.type,null);
    if(parameter.var&&supplied){
      const node=hasNamed?namedNodes.find(n=>String(n.name||n.named).toLowerCase()===key)?.value:argNodes[index];
      if(node?.type!=='var'||node.segments.length)throw new Blocked('var-parameter','引用参数需要变量 '+parameter.name);
      varBindings.push({localKey:key,frameIndex:env.frames.length-1,name:node.name.toLowerCase()});
    }
  }
  return {locals,varBindings,optionalArguments};
}
function routineCallArguments(items,env){
 const positional=items.filter(item=>!item.named),options=items.filter(item=>item.named);
 return {args:positional.map(item=>evalArgument(item,env)),named:Object.fromEntries(options.map(item=>[item.named.toLowerCase(),item.expr?evalExpression(item.expr,env):true])),argNodes:positional.map(item=>item.expr),namedNodes:options.map(item=>({name:item.named,value:item.expr}))};
}
function evalFunction(routine,args,named,env,argNodes=[],namedNodes=[]){
  const {locals,varBindings,optionalArguments}=bindRoutine(routine,args,named,env,argNodes,namedNodes);
  for(const [key,item] of Object.entries(routine.localDefaults||{}))if(!(key in locals))locals[key]=cloneValue(item.value);
  const frame={routineId:routine.id,pc:0,locals,optionalArguments,robotJoints:(env.frames[env.frames.length-1].robotJoints||REFERENCE_JOINTS).slice()};
  const childEnv={...env,frames:[...env.frames,frame]};
  const result=execNodes(routine.tree,childEnv);
  // VAR 参数按引用写回调用方（取函数返回时的最终值）。
  for(const binding of varBindings){writeBack(env,binding.frameIndex,binding.name,frame.locals[binding.localKey])}
  return result===undefined?null:result;
}
function writeBack(env,frameIndex,name,value){
  const frame=env.frames[frameIndex];if(!frame)return;
  const key=name.toLowerCase();
  if(frame&&Object.prototype.hasOwnProperty.call(frame.locals,key)){frame.locals[key]=value;return}
  if(env.globals&&Object.prototype.hasOwnProperty.call(env.globals,key)&&env.globalMeta?.[key]?.kind!=='CONST')env.globals[key]=value;
}
function execNodes(nodes,env){
  for(const node of nodes){
    if(node.t==='return')return node.expr?evalExpression(node.expr,env):null;
    if(node.t==='assign'){assignPath(env,node.target,evalExpression(node.expr,env));continue}
    if(node.t==='if'){
      let matched=false;for(const branch of node.branches){if(boolValue(evalExpression(branch.cond,env))){matched=true;const result=execNodes(branch.body,env);if(result!==undefined)return result;break}}
      if(!matched&&node.elseBody){const result=execNodes(node.elseBody,env);if(result!==undefined)return result}
      continue;
    }
    if(node.t==='while'){
      let guard=0;while(boolValue(evalExpression(node.condition,env))){if(guard++>MAX_LOOP)throw new Blocked('loop-limit','循环超过上限');const result=execNodes(node.body,env);if(result!==undefined)return result}
      continue;
    }
    if(node.t==='for'){
      const from=num(evalExpression(node.from,env)),to=num(evalExpression(node.to,env)),step=num(evalExpression(node.step,env))||1;
      let value=from,guard=0;
      while(step>0?value<=to:value>=to){if(guard++>MAX_LOOP)throw new Blocked('loop-limit','循环超过上限');assignVariable(env,node.varName,value);const result=execNodes(node.body,env);if(result!==undefined)return result;value+=step}
      continue;
    }
    if(node.t==='test'){
      const value=evalExpression(node.expression,env);
      for(const caseItem of node.cases){if(num(value)===num(evalExpression(caseItem.value,env))){const result=execNodes(caseItem.body,env);if(result!==undefined)return result;break}}
      if(node.defaultBody){const result=execNodes(node.defaultBody,env);if(result!==undefined)return result}
      continue;
    }
    if(node.t==='call'){const a=routineCallArguments(node.args,env),user=env.program.routines.get('name:'+env.task+':'+node.name.toLowerCase());if(!user)throw new Blocked('unknown-routine','未找到函数 '+node.name);if(user.kind!=='FUNC')throw new Blocked('function-proc','函数中不能调用 '+user.kind+' '+node.name);const result=evalFunction(user,a.args,a.named,env,a.argNodes,a.namedNodes);if(result!==undefined)return result;continue}
    if(node.t==='io'){applyIo(env,node);continue}
    if(node.t==='nop'||node.t==='trigger')continue;
    if(node.t==='blocked')throw new Blocked(node.code||'unsupported-instruction',node.detail||'不支持的指令');
    throw new Blocked('function-control','函数中包含不允许的语句 '+node.t);
  }
  return undefined;
}
function assignPath(env,target,value){
  if(!target.segments.length){
    const key=target.name.toLowerCase();
    const globals=env.globalMeta||{};
    const declared=globals[key]?globals[key].type:null;
    let type=declared;
    if(!type){const frame=env.frames[env.frames.length-1];const routine=env.program.routines.get(frame.routineId);type=routine?.localDefaults?.[key]?.type||null}
    if(type)value=arrayToPoseValue(value,type);
    assignVariable(env,target.name,cloneValue(value));return;
  }
  let current=lookupVariable(env,target.name);
  for(let index=0;index<target.segments.length-1;index++){
    const segment=target.segments[index];
    current=segment.type==='member'?getMember(current,segment.name):getIndex(current,evalExpression(segment.expr,env));
  }
  const last=target.segments[target.segments.length-1];
  if(last.type==='member')setMember(current,last.name,value);
  else{
    if(!current||current.kind!=='array')throw new Blocked('assign-index','数组赋值目标无效');
    const index=Math.trunc(num(evalExpression(last.expr,env)))-1;
    if(index<0||index>=current.items.length)throw new Blocked('assign-index','数组下标越界');
    current.items[index]=value;
  }
}
function applyIo(env,node){
  const name=node.name.toLowerCase();const value=node.value?num(evalExpression(node.value,env)):1;
  if(!(name in env.signals))env.signals[name]=0;
  if(/^(set|setdo|setgo|setao|setai)$/.test(node.action))env.signals[name]=value;else env.signals[name]=0;
  env.events.push({type:'io',line:node.line,signal:node.name,value:env.signals[name]});
}
function triggeredTrap(state){
  if(!state.traps)return null;
  for(const [name,trap] of Object.entries(state.traps)){
    if(!trap||!trap.active||!trap.signal)continue;
    const value=Number(state.signals[trap.signal]??0);
    if(value===Number(trap.value))return {name,line:trap.line||trap.connectLine||0};
  }
  return null;
}
function solveFk(env,requestedJoints){
  const frame=env.frames[env.frames.length-1];const joints=(requestedJoints||frame.robotJoints||REFERENCE_JOINTS).slice();
  const request={kind:'fk',joints,jointLimits:env.jointLimits};const key=JSON.stringify(request);
  if(env.solveCache[key])return env.solveCache[key];
  throw new SolveNeeded(request,key);
}
function solveIk(env,flange,conf,tool,wobj,target,calculation=false){
  const frame=env.frames[env.frames.length-1];
  const request={normalizeTurns:!calculation&&!!env.jointMotion,continuous:!calculation&&!env.jointMotion,jointLimits:env.jointLimits||ROBOT_AXIS_LIMITS,kind:'ik',frame:'flange',pose:{pos:flange.pos,quat:flange.quat},seed:(frame.robotJoints||REFERENCE_JOINTS).slice(),conf:conf||[],tool:poseOfFrame(tool),wobj:poseOfFrame(wobj),target:target?{pos:target.pos,quat:target.quat}:null};
  const key=JSON.stringify(request);
  if(env.solveCache[key])return env.solveCache[key].joints;
  throw new SolveNeeded(request,key);
}

// ---------- 仿真入口 ----------
function normalizeSignals(signals){
  const out={};
  for(const [name,value] of Object.entries(signals||{})){
    if(typeof name!=='string'||name.length>80)continue;
    if(typeof value==='boolean')out[name.toLowerCase()]=value?1:0;
    else if(Number.isFinite(Number(value)))out[name.toLowerCase()]=Number(value);
  }
  return out;
}
function normalizeJoints(value){
  if(!Array.isArray(value)||value.length!==6)return null;
  const joints=value.map(Number);
  return joints.every(item=>Number.isFinite(item))?joints:null;
}
function toArrayValue(value){if(Array.isArray(value))return {kind:'array',items:value.map(toArrayValue)};return value}
function coerceVariableValue(type,value){
  if(value===undefined)return undefined;
  if(type==='num'||type==='dnum'||type==='intnum'){const number=Number(value);return Number.isFinite(number)?number:undefined}
  if(type==='bool')return typeof value==='boolean'?value:(Number.isFinite(Number(value))?Number(value)!==0:undefined);
  if(type==='string')return typeof value==='string'?value.slice(0,2000):undefined;
  if(type==='robtarget'||type==='jointtarget'){const pose=arrayToPoseValue(toArrayValue(value),type);return pose&&pose.kind===type?pose:undefined}
  if(Array.isArray(value)){const numbers=value.map(Number);if(numbers.every(Number.isFinite))return {kind:'array',items:numbers}}
  return undefined;
}
function createSimulation(report,{routine='',signals={},parameters={},joints=null,variables={},automation=null,toolType='tool-640',operatingMode=automation?1:2}={}){
  let program;try{program=programFor(report)}catch(error){return {error:{code:error instanceof Blocked?error.code:'compile',message:error.message}}}
  const entry=findRoutine(program,routine);
  if(!entry)return {error:{code:'unknown-routine',message:'未找到指定例程'}};
  if(entry.kind!=='PROC')return {error:{code:'not-proc',message:'只能从 PROC 开始仿真'}};
  if(![0,1,2,3].includes(operatingMode))return {error:{code:'operating-mode-invalid',message:'离线操作模式应为 0–3'}};
  const suppliedParameters=Object.fromEntries(Object.entries(parameters||{}).map(([key,value])=>[key.toLowerCase(),value]));
  if(entry.parameters.some(p=>!p.optional&&!Object.prototype.hasOwnProperty.call(suppliedParameters,p.name.toLowerCase())))return {error:{code:'parameters-required',message:'该例程需要参数',parameters:entry.parameters.filter(p=>!p.optional)}};
  const initialJoints=joints==null?REFERENCE_JOINTS.slice():normalizeJoints(joints);
  if(!initialJoints)return {error:{code:'joints-invalid',message:'初始 joints 必须是 6 个有限数值'}};
  const limits=axisLimits(report);if(initialJoints.some((q,i)=>q<limits[i][0]||q>limits[i][1]))return {error:{code:'joints-invalid',message:'初始关节超出当前备份/型号的轴限位'}};
  const task=entry.task,globals=program.globals[task]||{};
  const stateGlobals={};for(const [key,item] of Object.entries(globals))stateGlobals[key]=cloneValue(item.value);
  if(variables&&typeof variables==='object'&&!Array.isArray(variables)){
    for(const [name,value] of Object.entries(variables)){
      const key=String(name).toLowerCase();
      if(!Object.prototype.hasOwnProperty.call(stateGlobals,key))return {error:{code:'variables-invalid',message:'未声明的全局变量 '+name}};
      const coerced=coerceVariableValue(globals[key].type,value);
      if(coerced===undefined)return {error:{code:'variables-invalid',message:'变量 '+name+' 的输入值无效'}};
      stateGlobals[key]=coerced;
    }
  }else if(variables!=null&&typeof variables!=='object')return {error:{code:'variables-invalid',message:'variables 必须是对象'}};
  const locals={},optionalArguments={};for(const parameter of entry.parameters){const key=parameter.name.toLowerCase(),present=Object.prototype.hasOwnProperty.call(suppliedParameters,key);locals[key]=present?suppliedParameters[key]:defaultValue(parameter.type,null);if(parameter.optional)optionalArguments[key]=present}
  for(const [key,item] of Object.entries(entry.localDefaults||{}))if(!(key in locals))locals[key]=cloneValue(item.value);
  const state={epochMs:Date.now(),virtualTime:0,schema:SIM_SCHEMA,sourceHash:report.sha256,task,entryId:entry.id,robotJoints:initialJoints.slice(),stack:[{routineId:entry.id,pc:0,locals,optionalArguments,robotJoints:initialJoints.slice()}],globals:stateGlobals,signals:normalizeSignals(signals),solveCache:{},pendingSolve:null,wait:null,forState:{},testState:{},traps:{},toolType:toolType==='tool-700'?'tool-700':'tool-640',operatingMode};
  if(program.legacyBaseMod)state.legacyBaseMod={applied:program.legacyBaseMod.applied,fileId:program.legacyBaseMod.fileId,sources:program.legacyBaseMod.provenance.routines.map(item=>({name:item.name,file:item.file,lineStart:item.moduleLineStart,lineEnd:item.moduleLineEnd,sha256:item.textSha256})),sourcePackageSha256:program.legacyBaseMod.provenance.packageSha256,note:'BaseMod 受保护；guodu/guodu_SAFE/MidPosCal 按 2025-09-29 同程序未加密源码执行，逐字节一致性未确认'};
  try{state.cell=createCell(report,automation);if(state.cell)seedCell(state)}catch(error){return {error:{code:'automation-invalid',message:error.message}}}
  return {state,stop:{type:'ready',line:entry.startLine,routine:entry.name},legacyBaseMod:program.legacyBaseMod||null};
}
function cloneValue(value){return value==null?value:JSON.parse(JSON.stringify(value))}
// Offline automation-only empty-bucket return. The real controller does not execute this injection;
// it only calls a routine that already exists in the backup (GoFeedCnv2), preserving source and ZIP.
function requestCellAutoFeed(state,env,routine){
  const cell=state.cell;
  if(!cell||cell.complete||cell.receiving||cell.autoFeedInjected)return false;
  if(!state.signals.do22_boji_zz_dk||!cellBucketEmpty(cell))return false;
  if(!/^JS_pd1$/i.test(String(routine?.name||'')))return false;
  if(env.frames.some(frame=>frame.autoFeedRoutine))return false;
  const feed=[...env.program.routines.values()].find(item=>/^gofeedcnv2$/i.test(item.name));
  if(!feed)return false;
  const locals={};
  for(const [key,item] of Object.entries(feed.localDefaults||{}))locals[key]=cloneValue(item.value);
  const frame={routineId:feed.id,pc:0,locals,robotJoints:(env.frames.at(-1)?.robotJoints||REFERENCE_JOINTS).slice(),autoFeedRoutine:feed.id};
  env.frames.push(frame);
  cell.autoFeedInjected=true;
  env.events.push({type:'cell',stage:'空斗自动返回接料',autoFeed:true,line:frame.pc});
  return true;
}

function validateState(state,sourceHash){
  if(!state||typeof state!=='object'||state.schema!==SIM_SCHEMA)throw new Blocked('state-invalid','仿真状态格式无效');
  if(state.sourceHash!==sourceHash)throw new Blocked('state-stale','仿真状态与当前备份不一致，请重新开始');
  const json=JSON.stringify(state),bytes=typeof Buffer==='undefined'?new TextEncoder().encode(json).byteLength:Buffer.byteLength(json);
  if(bytes>MAX_STATE_BYTES)throw new Blocked('state-too-large','仿真状态过大');
  if(!Array.isArray(state.stack)||!state.stack.length||state.stack.length>40)throw new Blocked('state-invalid','调用栈无效');
  for(const frame of state.stack){
    if(!frame||typeof frame!=='object'||typeof frame.routineId!=='string'||!Number.isInteger(frame.pc))throw new Blocked('state-invalid','调用栈帧无效');
    if(frame.robotJoints!==undefined&&!normalizeJoints(frame.robotJoints))throw new Blocked('state-invalid','调用栈关节值无效');
  }
  if(state.robotJoints!==undefined&&!normalizeJoints(state.robotJoints))throw new Blocked('state-invalid','仿真关节值无效');
  if(state.pendingSolve&&(!state.pendingSolve.key||!state.pendingSolve.request))throw new Blocked('state-invalid','待求解状态无效');
  return state;
}
function stopWith(stop,routine){return routine?{fileId:routine.fileId,routine:routine.name,...stop}:stop}
function needsFor(error){
  const message=String(error.message||'');
  if(error.code==='unknown-variable'){const name=(message.match(/未声明变量\s*(\S+)/)||[])[1]||'';return [{kind:'input',name,type:'variable',reason:message}]}
  if(error.code==='motion-target')return [{kind:'input',name:'target',type:'robtarget',reason:message}];
  if(error.code==='unknown-frame'){const name=(message.match(/未找到\S*\s+(\S+)/)||[])[1]||'';return [{kind:'input',name,type:'tool/wobj',reason:message}]}
  if(error.code==='var-parameter')return [{kind:'input',name:'VAR',type:'parameter',reason:message}];
  return null;
}
function advanceSimulation(report,{state,signals={},solve=null,solveResult=null,maxSteps=MAX_STEPS,stopOnMotion=true,elapsed=0}={}){
  solveResult=solveResult??solve;
  if(!state||typeof state!=='object')throw new Blocked('state-invalid','缺少仿真状态');
  const limit=maxSteps===undefined||maxSteps===null?MAX_STEPS:Number(maxSteps);
  if(!Number.isInteger(limit)||limit<1||limit>MAX_STEPS)throw new Blocked('max-steps-invalid','maxSteps 必须是 1 到 '+MAX_STEPS+' 的整数');
  stopOnMotion=stopOnMotion!==false;
  const program=programFor(report);
  validateState(state,report.sha256);
  if(Object.keys(state.syntheticRoutines||{}).length)throw new Blocked('state-stale','模拟过渡已停用，请重新开始以读取原程序');
  if(!Number.isFinite(Number(elapsed))||Number(elapsed)<0||Number(elapsed)>60)throw new Blocked('time-invalid','模拟时间增量应为 0–60 秒');
  state.virtualTime=(state.virtualTime||0)+Number(elapsed);
  if(state.cell){try{createCell(report,{profile:state.cell.profile,targetHeight:state.cell.targetHeight,barrel:state.cell.barrel})}catch(error){throw new Blocked('automation-invalid',error.message)}}
  const env={state,program,task:state.task,frames:state.stack,signals:state.signals,solveCache:state.solveCache,events:[],forState:state.forState,testState:state.testState,globals:state.globals,globalMeta:program.globals[state.task]||{},motionConfig:report.motionConfig,jointLimits:axisLimits(report)};
  const topRoutine=()=>program.routines.get(state.stack[state.stack.length-1].routineId);
  if(state.pendingSolve){
    if(!solveResult)return {state,events:[],stop:stopWith({type:'robot-solve',request:state.pendingSolve.request,line:state.pendingSolve.line,instruction:state.pendingSolve.instruction||null},topRoutine())};
    const pending=state.pendingSolve;
    if(solveResult.error&&typeof solveResult.error==='object'){
      const code=String(solveResult.error.code||'solve-failed').slice(0,60)||'solve-failed';
      const message=String(solveResult.error.message||'机器人求解失败').slice(0,240);
      return {state,events:[],stop:stopWith({type:'blocked',code,message,line:pending.line,instruction:pending.instruction||null},topRoutine())};
    }
    if(solveResult.joints!==undefined){
      const joints=normalizeJoints(solveResult.joints);
      if(!joints)return {state,events:[],stop:stopWith({type:'blocked',code:'solve-invalid',message:'机器人求解返回的关节值无效',line:pending.line,instruction:pending.instruction||null},topRoutine())};
      if(joints.some((q,i)=>q<env.jointLimits[i][0]||q>env.jointLimits[i][1]))return {state,events:[],stop:stopWith({type:'blocked',code:'solve-limit',message:'机器人求解超出当前备份/型号轴限位',line:pending.line},topRoutine())};
      state.solveCache[pending.key]={joints};
    }else if(solveResult.pose!==undefined){
      const pose=solveResult.pose,pos=pose&&pose.pos,quat=pose&&pose.quat;
      const validPos=Array.isArray(pos)&&pos.length===3&&pos.every(value=>Number.isFinite(Number(value)));
      const validQuat=Array.isArray(quat)&&quat.length===4&&quat.every(value=>Number.isFinite(Number(value)));
      if(!validPos||!validQuat)return {state,events:[],stop:stopWith({type:'blocked',code:'solve-invalid',message:'机器人求解返回的位姿无效',line:pending.line,instruction:pending.instruction||null},topRoutine())};
      state.solveCache[pending.key]={pos:pos.map(Number),quat:quat.map(Number)};
    }else{
      return {state,events:[],stop:stopWith({type:'blocked',code:'solve-invalid',message:'缺少机器人求解结果',line:pending.line,instruction:pending.instruction||null},topRoutine())};
    }
    const keys=Object.keys(state.solveCache);if(keys.length>MAX_SOLVE_CACHE)for(const key of keys.slice(0,keys.length-MAX_SOLVE_CACHE))delete state.solveCache[key];
    state.pendingSolve=null;
  }
  Object.assign(state.signals,normalizeSignals(signals));
  let steps=0,motions=0;
  while(steps++<limit){
    if(env.events.length>=MAX_EVENTS)return {state,events:env.events,stop:stopWith({type:'limit',code:'events-limit',message:'单次返回事件过多，可继续'},topRoutine())};
    const frame=env.frames[env.frames.length-1];
    const routine=program.routines.get(frame.routineId);
    if(!routine)throw new Blocked('state-invalid','调用栈例程不存在');
    const triggered=triggeredTrap(state);
    if(triggered)return {state,events:env.events,stop:stopWith({type:'blocked',code:'trap-triggered',message:'模拟触发 TRAP '+triggered.name+'，未执行 TRAP 例程',line:triggered.line},routine)};
    if(frame.pc>=routine.instructions.length){
      if(env.frames.length===1)return {state,events:env.events,stop:stopWith({type:'end',reason:'end',line:routine.endLine},routine)};
      for(const binding of frame.varBindings||[])writeBack(env,binding.frameIndex,binding.name,frame.locals[binding.localKey]);
      env.frames.pop();continue;
    }
    updateCell(state,env.events);
    // 离线自动模式：空斗仍在铺料路径中时，及时调用程序已有的 GoFeedCnv2 安全接料例程。
    // 只用于 automation 仿真；不修改 ZIP/程序源码，也不代表现场 PLC 已有此调度。
    if(requestCellAutoFeed(state,env,routine))continue;
    const instruction=routine.instructions[frame.pc];
    const instructionName=instruction.node&&instruction.node.instruction?instruction.node.instruction:instruction.op;
    // 每次最多执行一段运动：下一条运动必须先返回给前端，避免 pc 越过前端未处理的运动。
    if(instruction.op==='motion'&&motions>=1)return {state,events:env.events,stop:stopWith({type:'yield',reason:'next-motion',line:instruction.line,instruction:instructionName},routine)};
    let result;
    try{result=executeInstruction(instruction,env,frame,routine,state)}
    catch(error){
      if(error instanceof SolveNeeded){state.pendingSolve={request:error.request,key:error.key,line:instruction.line,routine:routine.name,fileId:routine.fileId,instruction:instructionName};return {state,events:env.events,stop:stopWith({type:'robot-solve',request:error.request,line:instruction.line},routine)}}
      if(error instanceof Blocked){const needs=needsFor(error);return {state,events:env.events,stop:stopWith({type:'blocked',code:error.code,message:error.message,line:instruction.line,...(needs?{needs}:{})},routine)}}
      throw error;
    }
    if(result==='stop')return {state,events:env.events,stop:stopWith(state.stop,routine)};
    if(result==='jumped')continue;
    if(result==='pop'){
      if(env.frames.length===1)return {state,events:env.events,stop:stopWith({type:'end',reason:'return',line:instruction.line},routine)};
      for(const binding of frame.varBindings||[])writeBack(env,binding.frameIndex,binding.name,frame.locals[binding.localKey]);
      env.frames.pop();continue;
    }
    frame.pc++;
    if(instruction.op==='motion'){
      const event=env.events.findLast(event=>event.type==='motion');if(event)event.jointLimits=env.jointLimits;
      motions++;
      // Retain recent solutions, but stop carrying hundreds of old CAD poses
      // through every short motion request. Never evict during a solve retry.
      const completedKeys=Object.keys(state.solveCache);
      for(const key of completedKeys.slice(0,-16))delete state.solveCache[key];
      if(stopOnMotion)return {state,events:env.events,stop:stopWith({type:'yield',reason:'motion',line:instruction.line,instruction:instructionName},routine)};
    }
  }
  return {state,events:env.events,stop:stopWith({type:'limit',code:'step-limit',message:'单次执行步数达到上限，可继续'},topRoutine())};
}
function executeInstruction(instruction,env,frame,routine,state){
  const node=instruction.node||{};
  switch(instruction.op){
    case 'motionSetting':{
      const values=node.args.map(arg=>num(evalArgument(arg,env)));
      if(values.length!==2||values.some(value=>!Number.isFinite(value)||value<=0))throw new Blocked('motion-setting','运动参数必须为两个正数');
      state.motionSettings=state.motionSettings||{};
      if(node.instruction.toLowerCase()==='velset')Object.assign(state.motionSettings,{override:values[0],maxTcp:values[1]});
      else Object.assign(state.motionSettings,{acceleration:values[0],ramp:values[1]});
      env.events.push({type:'marker',fileId:routine.fileId,routine:routine.name,line:node.line,instruction:node.instruction,values});return null;
    }
    case 'pause':frame.pc++;state.stop={type:'pause',line:node.line,message:'源程序 Stop 暂停，可继续'};return 'stop';
    case 'builtin':{
      const target=node.args[0]?.expr;if(target?.type!=='var')throw new Blocked('builtin-target','指令目标必须是变量');
      const path={name:target.name,segments:target.segments};const name=node.instruction.toLowerCase();
      if(name==='clear'){assignPath(env,path,0);return null}
      if(name==='add'){assignPath(env,path,num(evalExpression(target,env))+num(evalArgument(node.args[1],env)));return null}
      const c=lookupVariable(env,target.name);if(c?.kind!=='clock')throw new Blocked('clock-type','需要 clock 变量');
      const now=state.virtualTime||0;if(name==='clkreset'){c.elapsed=0;c.started=now}else if(name==='clkstart'){if(!c.running)c.started=now;c.running=true}else{if(c.running)c.elapsed+=now-c.started;c.running=false}return null;
    }
    case 'assign':assignPath(env,node.target,evalExpression(node.expr,env));return null;
    case 'motion':return executeMotion(node,env,frame,state,routine);
    case 'io':applyIo(env,node);return null;
    case 'wait':return executeWait(node,env,frame,state);
    case 'pulse':env.events.push({type:'io',signal:node.name,value:1,pulse:num(evalExpression(node.seconds,env)),line:node.line});state.signals[node.name.toLowerCase()]=0;return null;
    case 'trigger':env.events.push({type:'trigger',fileId:routine.fileId,routine:routine.name,line:node.line,name:node.name});return null;
    case 'trapConnect':{
      const key=node.trap.toLowerCase();
      state.traps=state.traps||{};
      state.traps[key]={...(state.traps[key]||{}),routine:node.routine,connectLine:node.line,active:false};
      env.events.push({type:'marker',fileId:routine.fileId,routine:routine.name,line:node.line,instruction:'CONNECT '+node.trap});
      return null;
    }
    case 'trapSignal':{
      const key=node.trap.toLowerCase();
      state.traps=state.traps||{};
      state.traps[key]={...(state.traps[key]||{}),signal:node.signal.toLowerCase(),value:num(evalExpression(node.value,env)),kind:node.kind,line:node.line,active:state.traps[key]?.active||false};
      return null;
    }
    case 'trapWatch':{const key=node.trap.toLowerCase();state.traps=state.traps||{};state.traps[key]={...(state.traps[key]||{}),active:true,line:node.line};return null}
    case 'trapSleep':{const key=node.trap.toLowerCase();if(state.traps&&state.traps[key])state.traps[key].active=false;return null}
    case 'trapDelete':{const key=node.trap.toLowerCase();if(state.traps)delete state.traps[key];env.events.push({type:'marker',fileId:routine.fileId,routine:routine.name,line:node.line,instruction:'IDelete '+node.trap});return null}
    case 'nop':{
      const control=node.instruction;
      if(control&&control!=='DECL'&&/^(StopMove|StartMove|AccSet|ConfL|ConfJ|SingArea|PathResolv|VelSet|StorePath|RestoPath|ClearPath|ClkReset|ClkStart|ClkStop)$/.test(control))env.events.push({type:'marker',fileId:routine.fileId,routine:routine.name,line:instruction.line,instruction:control});
      return null;
    }
    case 'label':return null;
    case 'call':return executeCall(node,env,frame,state);
    case 'return':frame.pc=Number.MAX_SAFE_INTEGER;return 'pop';
    case 'goto':{const target=routine.labels[String(node.label||'').toLowerCase()];if(target===undefined)throw new Blocked('unknown-label','未找到标签 '+node.label);frame.pc=target;return 'jumped'}
    case 'exit':state.stop={type:'end',reason:'exit',line:node.line,routine:routine.name};return 'stop';
    case 'blocked':throw new Blocked(node.code||'unsupported-instruction',node.detail||'不支持的指令');
    case 'unsupported':throw new Blocked(node.code||'unparsed-statement',node.detail||'无法解析的语句');
    case 'jump':frame.pc=instruction.target;return 'jumped';
    case 'jumpIfNot':if(!boolValue(evalExpression(instruction.expr,env))){frame.pc=instruction.target;return 'jumped'}return null;
    case 'forInit':{
      const from=num(evalExpression(instruction.from,env)),to=num(evalExpression(instruction.to,env)),step=num(evalExpression(instruction.step,env))||1;
      assignVariable(env,instruction.varName,from);env.forState[instruction.id]={to,step};
      if(!(step>=0?from<=to:from>=to)){frame.pc=instruction.target;return 'jumped'}
      return null;
    }
    case 'forNext':{
      const info=env.forState[instruction.id]||{to:Infinity,step:1};const current=num(lookupVariable(env,instruction.varName));const next=current+info.step;
      assignVariable(env,instruction.varName,next);
      if(info.step>=0?next<=info.to:next>=info.to){frame.pc=instruction.target;return 'jumped'}
      return null;
    }
    case 'testInit':env.testState[instruction.id]=evalExpression(instruction.expr,env);return null;
    case 'jumpIfNotCase':{const value=env.testState[instruction.id],matched=instruction.values.some(item=>{const expected=evalExpression(item,env);return typeof value==='string'||typeof expected==='string'?value===expected:num(value)===num(expected)});if(!matched){frame.pc=instruction.target;return 'jumped'}return null}
  }
  throw new Blocked('unsupported-command','未支持的指令 '+instruction.op);
}
function syncRobotJoints(env,state,joints){
  const values=joints.slice();
  for(const item of env.frames)item.robotJoints=values.slice();
  state.robotJoints=values.slice();
}
function executeMotion(node,env,frame,state,routine){
  const instruction=node.instruction,args=node.args;
  const targetArg=args[0];
  if(!targetArg||!targetArg.expr)throw new Blocked('motion-target','运动指令缺少目标');
  const target=poseValueFor(evalExpression(targetArg.expr,env),instruction);
  const trigger=/^Trigg/i.test(instruction);
  const toolArg=args[trigger?4:3];
  const toolName=toolArg&&toolArg.raw?((toolArg.raw.match(/^([A-Za-z_]\w*)/)||[])[1]||'tool0'):'tool0';
  const wobjName=toolArg&&toolArg.wobjName?toolArg.wobjName:'wobj0';
  const tool=frameValue(env,toolName,'tool'),wobj=frameValue(env,wobjName,'wobj');
  let speed=args[1]?describeArg(args[1]):'';
  try{const value=evalExpression(args[1].expr,env);if(value?.kind==='speeddata')speed={ref:speed,tcp:value.v_tcp,orientation:value.v_ori}}catch{}
  speed={...(typeof speed==='object'?speed:{ref:speed}),...state.motionSettings};
  const zone=describeArg(args[trigger?3:2]),code=(instruction+' '+args.map(arg=>String(arg.raw||describeArg(arg))).join(',')+';').slice(0,4000);
  const flags=String(targetArg.raw||'');
  if(/\\PDispOn|\\PDispOff|\\EOffsOn|\\CorrCon|\\CorrDiscon/i.test(flags))throw new Blocked('unsupported-flag','本版本不支持 ProgDisp/EOffs/Corr 标志');
  if(/^(MoveC|SearchL|SearchC)/i.test(instruction))throw new Blocked('unsupported-motion','本版本不预演 '+instruction);
  if(/^MoveAbsJ/i.test(instruction)){
    if(!isJT(target))throw new Blocked('motion-target','MoveAbsJ 需要 jointtarget');
    if((target.extax||[]).some(value=>Number.isFinite(value)&&Math.abs(value)<1e9))throw new Blocked('external-axes','不支持外部轴');
    // MoveAbsJ specifies absolute axis values, including the turn count.
    // Rewrapping the source jointtarget can strand a later MoveL at ±360°.
    const from=(frame.robotJoints||REFERENCE_JOINTS).slice(),to=target.joints.slice();
    if(to.some((q,i)=>q<env.jointLimits[i][0]||q>env.jointLimits[i][1]))throw new Blocked('joint-limit','MoveAbsJ 超出当前备份/型号轴限位');
    syncRobotJoints(env,state,to);
    const tag=potPathKind(routine.name,routine.file);
    const event={type:'motion',fileId:routine.fileId,file:routine.file,code,routine:routine.name,line:node.line,instruction:'MoveAbsJ',trigger:trigger?describeArg(args[2]):null,from,to,joints:to,pose:null,speed,zone,tool:toolName,wobj:wobjName};
    if(routine.legacy){event.sourceFile=routine.legacy.sourceFile;event.sourceLine=routine.legacy.sourceLineStart+(node.line-routine.startLine);}
    const report=jointReport(from,to,'MoveAbsJ');if(report){event.jointDelta=report.delta;if(report.warning)event.branchWarning=report.warning}
    attachPotTelemetry(state,event,tag);
    state.lastTcp=null;
    env.events.push(event);
    return null;
  }
  if(!isRT(target))throw new Blocked('motion-target',instruction+' 需要 robtarget');
  const wobjPose=poseOfFrame(wobj),toolPose=poseOfFrame(tool);
  const tcpBase=poseMul(wobjPose,{pos:target.pos,quat:target.quat});let surfaceFollow=null;
  if(state.cell&&/^MoveL|^MoveJ/i.test(instruction)){
    const raw=String(targetArg.raw||''),approach=/pBarrelAppr_[LR]\b/i.test(raw);
    if(/nDisZOffs\b/i.test(raw)||approach){
      const pot=state.globals[state.cell.barrel==='right'?'wobjbarrelr':'wobjbarrell'];
      if(pot){const following=followSurface(state.cell,tcpBase.pos,pot,Number(state.globals.ndiszoffs)||0,{approach});if(following){surfaceFollow={...following,point:undefined};tcpBase.pos=following.point}}
    }
  }
  const flange=poseMul(tcpBase,poseInv(toolPose));
  env.jointMotion=/^(MoveJ|TriggJ)$/i.test(instruction);
  const solvedJoints=solveIk(env,{pos:flange.pos,quat:flange.quat},target.conf,tool,wobj,target);
  const from=(frame.robotJoints||REFERENCE_JOINTS).slice();
  // Only joint-interpolated moves need turn normalisation: for MoveL/TriggL the
  // viewer follows the prepared linear path, so the final joints must keep the
  // IK branch the path used (never re-wrap a straight-move endpoint).
  const joints=/^(MoveJ|TriggJ)$/i.test(instruction)?normalizeJointTurns(solvedJoints,from,env.jointLimits):solvedJoints;
  syncRobotJoints(env,state,joints);
  const tag=potPathKind(routine.name,routine.file);
  const event={type:'motion',fileId:routine.fileId,file:routine.file,code,routine:routine.name,line:node.line,instruction,trigger:trigger?describeArg(args[2]):null,from,to:joints,joints,pose:{pos:target.pos,quat:target.quat},flange:{pos:flange.pos,quat:flange.quat},toolPose:{pos:toolPose.pos,quat:toolPose.quat},wobjPose:{pos:wobjPose.pos,quat:wobjPose.quat},straight:/^MoveL|^TriggL/i.test(instruction),tcpBase,surfaceFollow, target:{pos:target.pos,quat:target.quat},speed,zone,tool:toolName,wobj:wobjName};
  if(routine.legacy){event.sourceFile=routine.legacy.sourceFile;event.sourceLine=routine.legacy.sourceLineStart+(node.line-routine.startLine);}
  const report=jointReport(from,joints,instruction);if(report){event.jointDelta=report.delta;if(report.warning)event.branchWarning=report.warning}
  attachPotTelemetry(state,event,tag);
  state.lastTcp={pos:tcpBase.pos.slice(),quat:tcpBase.quat.slice(),tool:toolName,wobj:wobjName};
  env.events.push(event);
  consumeCellMotion(state,env.events.at(-1));
  return null;
}
function describeArg(arg){
  if(!arg)return '';
  if(arg.named)return '\\'+arg.named;
  const raw=String(arg.raw||'').trim();
  const parsed=arg.expr;if(parsed&&parsed.type==='var'&&!parsed.segments.length)return parsed.name;
  return raw.slice(0,60);
}
function executeWait(node,env,frame,state){
  if(node.timeout){const now=state.virtualTime||0;if(state.wait?.line===node.line&&state.wait.since!==undefined&&now-state.wait.since>=num(evalExpression(node.timeout,env))){state.wait=null;if(node.timeFlag){assignVariable(env,node.timeFlag,true);return null}throw new Blocked('wait-timeout','等待超时')}if(node.timeFlag)assignVariable(env,node.timeFlag,false)}
  if(node.kind==='time'){
    if(state.wait&&state.wait.kind==='time'&&state.wait.line===node.line){consumeCellPause(state,state.wait.seconds);state.virtualTime=(state.virtualTime||0)+state.wait.seconds;state.wait=null;return null}
    const seconds=num(evalExpression(node.seconds,env));
    state.wait={kind:'time',line:node.line,seconds};
    state.stop={type:'wait',kind:'time',line:node.line,seconds,message:'等待 '+seconds+' 秒（模拟时间）'};
    return 'stop';
  }
  if(node.kind==='until'){
    if(boolValue(evalExpression(node.expr,env))){state.wait=null;return null}
    state.wait={kind:'until',line:node.line,since:state.wait?.line===node.line?state.wait.since:(state.virtualTime||0)};
    const cameraWait=Math.min(...[state.cell?.infrared?.moveReadyAt,state.cell?.sensors?.height?.readyAt,state.cell?.sensors?.temperature?.readyAt].map(t=>t-(state.virtualTime||0)).filter(t=>t>0),Infinity);
    state.stop={type:'wait',kind:'until',line:node.line,...(state.cell?.receiving&&!state.signals.di103_boqi_liao_man?{autoSeconds:Math.max(.01,state.cell.readyAt-(state.virtualTime||0))}:Number.isFinite(cameraWait)?{autoSeconds:cameraWait}:{}),message:'等待条件成立'};
    return 'stop';
  }
  const name=node.signal,expected=num(evalExpression(node.value,env)),current=Number(state.signals[name.toLowerCase()]??0);
  if(current===expected){state.wait=null;return null}
  state.wait={kind:node.kind,line:node.line,signal:name,expected,since:state.wait?.line===node.line?state.wait.since:(state.virtualTime||0)};
  state.stop={type:'wait',kind:node.kind,line:node.line,signal:name,expected,current,message:'等待 '+name+' = '+expected};
  return 'stop';
}
function describeLegacyArguments(routine,a){
  const describeNode=node=>{
    if(!node)return null;
    if(node.type==='var')return node.name;
    if(node.type==='string')return '"'+node.value+'"';
    return null;
  };
  return routine.parameters.map((parameter,index)=>{
    const value=a.args[index],item={parameter:parameter.name,type:parameter.type,source:describeNode(a.argNodes[index])};
    if(typeof value==='number')item.value=+value.toFixed(6);
    else if(typeof value==='string')item.value=value;
    else if(value&&value.kind==='robtarget')item.value={pos:value.pos,conf:value.conf,extax:value.extax};
    else if(value&&value.kind==='jointtarget')item.value={joints:value.joints};
    else if(value&&(value.kind==='tooldata'||value.kind==='wobjdata'))item.value={frame:value.kind};
    return item;
  });
}
function executeCall(node,env,frame,state){
  const routine=env.program.routines.get('name:'+env.task+':'+node.name.toLowerCase());
  if(!routine){
    if(state.cell)return executeCellExternal(node,env,frame,state);
    throw new Blocked('unknown-routine','未找到例程 '+node.name);
  }
  const a=routineCallArguments(node.args,env);
  if(routine.kind!=='PROC'){evalFunction(routine,a.args,a.named,env,a.argNodes,a.namedNodes);return null}
  const {locals,varBindings,optionalArguments}=bindRoutine(routine,a.args,a.named,env,a.argNodes,a.namedNodes);
  for(const [key,item] of Object.entries(routine.localDefaults||{}))if(!(key in locals))locals[key]=cloneValue(item.value);
  env.frames.push({routineId:routine.id,pc:0,locals,varBindings,optionalArguments,robotJoints:(frame.robotJoints||REFERENCE_JOINTS).slice()});
  env.events.push({type:'call',line:node.line,routine:routine.name});
  if(routine.legacy)env.events.push({type:'provenance',routine:routine.name,line:node.line,instruction:'可读源码回退',fileId:routine.fileId,file:routine.file,parameters:describeLegacyArguments(routine,a),sourceFile:routine.legacy.sourceFile,sourceLineStart:routine.legacy.sourceLineStart,sourceLineEnd:routine.legacy.sourceLineEnd,message:'BaseMod 受保护；本段按 2025-09-29 作者可读源码还原：'+routine.legacy.sourceFile+' 第'+routine.legacy.sourceLineStart+'-'+routine.legacy.sourceLineEnd+' 行'});
  return null;
}

// Substitutions for protected BaseMod are visible events, not silent skips.
function executeCellExternal(node,env,frame,state){
 const key=node.name.toLowerCase();const g=state.globals;
 if(key==='duqu_zaomian_gaodu'){
  if(!state.signals.do178_duqu_zaomian_gaodu){state.signals.do178_duqu_zaomian_gaodu=1;updateCell(state,env.events)}
  if(!state.signals.di177_zaomian_celiang_ok){state.stop={type:'wait',kind:'sensor',line:node.line,autoSeconds:Math.max(.01,(state.cell.sensors?.height?.readyAt||0)-(state.virtualTime||0)),message:'等待 DS77pro 模拟测高'};return 'stop'}
  const reading=readSurfaceFeedback(state);
  state.cell.sensors.height.valueMm=reading.measured;state.signals.do178_duqu_zaomian_gaodu=0;updateCell(state,env.events);
  env.events.push({type:'substitution',routine:node.name,line:node.line,message:'受保护读料面：虚拟局部测量 '+reading.measured.toFixed(1)+' mm，历史补偿 '+reading.compensation+' mm，nDisZOffs='+reading.offset.toFixed(1)+' mm（离线替代）'});return null;
 }
 if(['guodu','guodu_safe'].includes(key))throw new Blocked('protected-motion','BaseMod 中的 '+node.name+' 受保护，未读取到原过渡轨迹；已停止，保留当前姿态，不执行猜测的转圈/出入锅动作');
 throw new Blocked('unknown-routine','未找到例程 '+node.name);
}

module.exports={SIM_SCHEMA,createSimulation,advanceSimulation,Blocked,parseExpression,programFor,quatMul,poseMul,poseInv,quatToMat,matToQuat,requestCellAutoFeed};
