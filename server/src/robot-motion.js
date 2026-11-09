'use strict';
// 确定性 ABB 运动计划提取：只从备份源码推导点位、工具/工件坐标系、运动指令与诊断。
// 不调用 AI、不读写存储、不执行任何机器人动作。契约见 docs/ABB_DIGITAL_TWIN_COLLABORATION_20261104.md。
const {codePart}=require('./robot-code');
const {axisLimits}=require('./robot-axis-limits');
const SCHEMA='abb-motion-plan@1';
const MOTION={'moveabsj':'MoveAbsJ','movej':'MoveJ','movel':'MoveL','movec':'MoveC','movecsync':'MoveCSync','movejsync':'MoveJSync','movelsync':'MoveLSync','moveabsjsync':'MoveAbsJSync','searchl':'SearchL','searchc':'SearchC','triggl':'TriggL','triggj':'TriggJ','triggc':'TriggC'};
const UNSUPPORTED_MOTION=new Set(['movec','movecsync','movejsync','movelsync','moveabsjsync','searchl','searchc','triggc']);
const BUILTIN_ZONES=new Set(['fine','z0','z1','z5','z10','z15','z20','z30','z40','z50','z60','z80','z100','z150','z200']);
const CONTROL=new Set(['module','endmodule','proc','func','trap','endproc','endfunc','endtrap','if','elseif','else','endif','for','endfor','while','endwhile','test','case','default','endtest','goto','label','return','exit','raise','undo','backward','exitcycle','connect','idelete','ierror','isleep','iwatch','storepath','restopath','startmove','stopmove','deactmove','actmove','accset','clkreset','clkstart','clkstop','tpwrite','tperase','tpreadnum','tpreadfk']);
const TRIGGER_ONLY=new Set(['triggio','triggint','triggstop','triggequip']);
const IO_WRITE=new Set(['set','reset','setgo','setdo','setao','setai']);
const IO_WAIT=new Set(['waitdi','waitdo','waitgi','waitgo','waitai','waitao','waituntil','waittime']);
const MAX_LINE_CHARS=4000;
const MAX_CONTEXT_CHARS=240;

function splitTopLevel(text,sep=','){
  const out=[];let depth=0,cur='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){cur+=c;if(c==='"')quoted=false;continue}
    if(c==='"'){quoted=true;cur+=c;continue}
    if(c==='('||c==='['||c==='{')depth++;
    else if(c===')'||c===']'||c==='}')depth=Math.max(0,depth-1);
    if(c===sep&&depth===0){out.push(cur.trim());cur=''}else cur+=c;
  }
  if(cur.trim())out.push(cur.trim());
  return out;
}
function numbers(text){
  const matches=String(text||'').match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[-+]?\d+)?/gi);
  return matches?matches.map(Number):null;
}
function arrayNumbers(text){const nums=numbers(text);return nums&&nums.length?nums:null}
function unwrap(text){
  const value=String(text||'').trim();
  return value.startsWith('[')&&value.endsWith(']')?value.slice(1,-1).trim():value;
}
function parsePose(text,type){
  if(!text)return null;
  const body=unwrap(text);
  if(type==='robtarget'){
    const parts=splitTopLevel(body);
    if(parts.length<3)return null;
    const pos=arrayNumbers(parts[0]),quat=arrayNumbers(parts[1]),conf=arrayNumbers(parts[2]),extax=parts[3]?arrayNumbers(parts[3]):null;
    if(!pos||pos.length<3||!quat||quat.length<4)return null;
    return {pos:pos.slice(0,3),quat:quat.slice(0,4),conf:(conf||[]).slice(0,4),extax};
  }
  if(type==='jointtarget'){
    const parts=splitTopLevel(body);
    if(!parts.length)return null;
    const joints=arrayNumbers(parts[0]),extax=parts[1]?arrayNumbers(parts[1]):null;
    if(!joints||joints.length<6)return null;
    return {joints:joints.slice(0,6),extax};
  }
  return null;
}
function parsePoseInner(text){
  const parts=splitTopLevel(unwrap(text));
  if(parts.length<2)return null;
  const pos=arrayNumbers(parts[0]),quat=arrayNumbers(parts[1]);
  if(!pos||pos.length<3||!quat||quat.length<4)return null;
  return {pos:pos.slice(0,3),quat:quat.slice(0,4)};
}
function parseFrameData(text,type){
  const parts=splitTopLevel(unwrap(text));
  if(type==='tooldata'){
    if(parts.length<2)return null;
    const tcp=parsePoseInner(parts[1]),load=numbers(parts[2]||'');
    if(!tcp)return null;
    return {robhold:/true/i.test(parts[0]),tcp:tcp.pos,quat:tcp.quat,mass:load?load[0]:null,cog:load?load.slice(1,4):null};
  }
  if(type==='wobjdata'){
    if(parts.length<5)return null;
    const uframe=parsePoseInner(parts[3]),oframe=parsePoseInner(parts[4]);
    if(!uframe||!oframe)return null;
    return {robhold:/true/i.test(parts[0]),ufprog:/true/i.test(parts[1]),ufmec:unquote(parts[2]),uframe,oframe};
  }
  return null;
}
function unquote(text){const m=String(text||'').match(/^\s*"([^"]*)"\s*$/);return m?m[1]:String(text||'').trim().slice(0,80)}
function parseSpeed(text){const nums=arrayNumbers(text);return nums&&nums.length>=4?{tcp:nums[0],ori:nums[1],leax:nums[2],reax:nums[3]}:null}
function stripFlags(text){return String(text||'').replace(/\\(?:NoEOffs|Conc|T|P|PDispOn|PDispOff|CorrCon|CorrDiscon|Offs|RelTool)\b/gi,' ').replace(/\\[A-Za-z]+(?::=[^,]*)?/g,' ').trim()}
function flagsOf(text){const flags=[];for(const m of String(text||'').matchAll(/\\([A-Za-z]+)\b/g))flags.push(m[1]);return flags}
function targetKind(instruction){return /moveabsj/i.test(instruction)?'jointtarget':'robtarget'}

function declarationsOf(files){
  const map=new Map();
  for(const file of files){
    const lines=file.text.split(/\r\n|\n|\r/);
    lines.forEach((raw,index)=>{
      const line=codePart(raw);
      const m=line.match(/^\s*(?:LOCAL\s+)?(CONST|PERS|VAR)\s+(robtarget|jointtarget|tooldata|wobjdata|speeddata|zonedata)\s+([A-Za-z_]\w*)\s*(?::=\s*(.+?))?\s*;\s*$/i);
      if(!m)return;
      const key=m[3].toLowerCase(),type=m[2].toLowerCase(),kind=m[1].toUpperCase(),init=m[4]?m[4].trim():null;
      let value=null;
      if(init){if(type==='robtarget'||type==='jointtarget')value=parsePose(init,type);else if(type==='tooldata'||type==='wobjdata')value=parseFrameData(init,type);else if(type==='speeddata')value=parseSpeed(init)}
      const previous=map.get(key);
      if(!previous||(!previous.init&&init))map.set(key,{key,name:m[3],kind,type,init,value,fileId:file.id,file:file.name,task:file.task,line:index+1});
    });
  }
  return map;
}
function reassignedNames(files,declarations){
  const map=new Map();
  for(const file of files){
    const lines=file.text.split(/\r\n|\n|\r/);
    lines.forEach((raw,index)=>{
      const line=codePart(raw);
      const m=line.match(/^\s*([A-Za-z_]\w*)\s*:=/);
      if(!m)return;
      const key=m[1].toLowerCase();
      if(!declarations.has(key))return;
      const list=map.get(key)||[];
      list.push({fileId:file.id,file:file.name,line:index+1});
      map.set(key,list);
    });
  }
  return map;
}
function runtimeCandidates(files,declarations){
  const candidates=new Map();
  for(const file of files){
    const lines=file.text.split(/\r\n|\n|\r/);
    lines.forEach(raw=>{
      const line=codePart(raw);
      const m=line.match(/^\s*([A-Za-z_]\w*)\s*:=\s*([A-Za-z_]\w*)\s*;\s*$/);
      if(!m)return;
      const target=m[1].toLowerCase(),source=m[2].toLowerCase();
      const t=declarations.get(target),s=declarations.get(source);
      if(!t||!s||t.value||!s.value)return;
      const list=candidates.get(target)||[];
      if(!list.includes(s.name))list.push(s.name);
      candidates.set(target,list);
    });
  }
  return candidates;
}
function conditionText(text,keyword){
  return text.replace(new RegExp('^\\s*'+keyword+'\\s+','i'),'').replace(/\s+(THEN|DO)\s*;?\s*$/i,'').replace(/:\s*$/,'').trim().slice(0,MAX_CONTEXT_CHARS);
}
function motionArguments(line,word){
  const rest=line.trim().slice(word.length).trim().replace(/;\s*$/,'');
  if(rest.startsWith('(')&&rest.endsWith(')'))return splitTopLevel(rest.slice(1,-1));
  return splitTopLevel(rest);
}
function zoneIndex(lower){return lower==='triggl'||lower==='triggj'||lower==='triggc'?3:2}
function toolIndex(lower){return lower==='triggl'||lower==='triggj'||lower==='triggc'?4:3}
function parseToolWobj(text,declarations,reassigned){
  const raw=String(text||'').trim();
  const match=raw.match(/^([A-Za-z_]\w*)?\s*(?:\\WObj:=([A-Za-z_]\w*))?/i);
  const toolName=match&&match[1]?match[1]:'tool0';
  const wobjName=match&&match[2]?match[2]:'wobj0';
  return {tool:resolveDataRef(toolName,'tooldata',declarations,reassigned),wobj:resolveDataRef(wobjName,'wobjdata',declarations,reassigned)};
}
function resolveDataRef(name,type,declarations,reassigned){
  if(!name)return {ref:'',resolution:'missing'};
  const key=name.toLowerCase();
  if(key==='tool0'||key==='wobj0')return {ref:name,resolution:'default'};
  const decl=declarations.get(key);
  if(!decl||decl.type!==type)return {ref:name,resolution:'missing'};
  if(!decl.value||reassigned.has(key))return {ref:name,resolution:'runtime'};
  return {ref:name,resolution:'static',data:decl.value};
}
function parseSpeedArg(text,declarations,reassigned){
  const raw=String(text||'').trim();
  if(!raw)return null;
  const named=declarations.get(raw.toLowerCase());
  if(named&&named.type==='speeddata'){
    if(!named.value||reassigned.has(raw.toLowerCase()))return {ref:raw,resolution:'runtime'};
    return {ref:raw,resolution:'static',data:named.value};
  }
  if(/^v\d+$/i.test(raw))return {ref:raw.toLowerCase(),resolution:'builtin',tcp:Number(raw.slice(1))};
  return {ref:raw,resolution:'runtime'};
}
function parseZoneArg(text){
  const raw=String(text||'').trim();
  if(!raw)return null;
  if(BUILTIN_ZONES.has(raw.toLowerCase()))return {ref:raw.toLowerCase(),resolution:'builtin'};
  return {ref:raw,resolution:'runtime'};
}
function resolveTarget(arg,instruction,declarations,reassigned){
  const raw=String(arg||'').trim();
  const ref=stripFlags(raw);
  const type=targetKind(instruction);
  if(!ref)return {resolution:'missing',kind:type,reason:'运动指令缺少目标'};
  if(ref.startsWith('[[')){
    const value=parsePose(ref,type);
    if(!value)return {resolution:'missing',kind:type,ref:ref.slice(0,120),reason:'目标字面量格式无法识别'};
    return targetResult(value,type,'static','literal',ref.slice(0,60));
  }
  const offset=ref.match(/^Offs\s*\((.*)\)$/i);
  if(offset){
    const parts=splitTopLevel(offset[1]);
    const base=parts[0]?parts[0].trim():'';
    const nums=parts.slice(1).map(Number);
    const baseResolved=base?resolveTarget(base,instruction,declarations,reassigned):{resolution:'missing'};
    if(baseResolved.resolution==='static'&&nums.length>=1&&nums.every(Number.isFinite)&&type==='robtarget'&&baseResolved.pose){
      const pose={...baseResolved.pose,pos:[baseResolved.pose.pos[0]+(nums[0]||0),baseResolved.pose.pos[1]+(nums[1]||0),baseResolved.pose.pos[2]+(nums[2]||0)]};
      return {resolution:'static',kind:type,ref:'Offs('+base+',…)',baseRef:baseResolved.ref,offset:nums.slice(0,3),pose};
    }
    return {resolution:'runtime',kind:type,ref:'Offs('+base+',…)',baseRef:base||null,reason:'Offs 的基准或偏移不是静态数值'};
  }
  const call=ref.match(/^([A-Za-z_]\w*)\s*\(/);
  if(call)return {resolution:'computed',kind:type,ref:ref.slice(0,120),name:call[1],reason:'目标由函数 '+call[1]+' 计算，需运行程序才能得到'};
  const indexed=ref.match(/^([A-Za-z_]\w*)\s*\{/);
  if(indexed)return {resolution:'indexed',kind:type,ref:indexed[1]+'{…}',name:indexed[1],reason:'目标为数组元素，索引依赖运行时变量'};
  const name=ref.match(/^([A-Za-z_]\w*)/);
  if(!name)return {resolution:'missing',kind:type,ref:ref.slice(0,120),reason:'目标表达式无法识别'};
  const key=name[1].toLowerCase(),decl=declarations.get(key);
  if(!decl||decl.type!==type)return {resolution:'missing',kind:type,ref:name[1],reason:'未找到同名 '+type+' 声明'};
  if(!decl.value)return {resolution:'runtime',kind:type,ref:decl.name,reason:'PERS/VAR 未在源码中初始化，需运行时赋值'};
  if(reassigned.has(key))return {resolution:'runtime',kind:type,ref:decl.name,reason:'该变量在程序中被重新赋值，最终值取决于运行路径'};
  return targetResult(decl.value,type,'static','named',decl.name,decl);
}
function targetResult(value,type,resolution,origin,name,decl){
  const result={resolution,kind:type,ref:name||origin,origin};
  if(decl)result.source={fileId:decl.fileId,file:decl.file,line:decl.line};
  if(type==='robtarget'){
    result.pose={pos:value.pos,quat:value.quat,conf:value.conf,extax:value.extax};
    if((value.extax||[]).some(item=>Number.isFinite(item)&&Math.abs(item)<1e9))result.externalAxes=true;
  }else{
    result.joints=value.joints;
    result.extax=value.extax||null;
    if((value.extax||[]).some(item=>Number.isFinite(item)&&Math.abs(item)<1e9))result.externalAxes=true;
  }
  return result;
}
function parseParameters(line){
  const match=codePart(String(line||'')).match(/^\s*(?:LOCAL\s+)?(?:PROC|FUNC|TRAP)\s+(?:[A-Za-z_]\w*\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)/i);
  if(!match||!match[2].trim())return [];
  return splitTopLevel(match[2]).map(item=>{
    const parts=item.trim().split(/\s+/);
    const varFlag=parts.length>1&&/^VAR$/i.test(parts[0]);
    return {name:parts.at(-1),type:parts[varFlag?1:0],var:varFlag};
  });
}

function scanRoutines(files,declarations,reassigned,signalNames){
  const routines=[],actions=[];
  for(const file of files){
    const lines=file.text.split(/\r\n|\n|\r/);
    for(const definition of file.routines||[]){
      const routine={id:file.id+':'+definition.name,fileId:file.id,file:file.name,module:file.module||'',task:file.task||'',name:definition.name,kind:String(definition.kind||'PROC').toUpperCase(),startLine:definition.startLine,endLine:definition.endLine,motion:0,static:0,dynamic:0,preview:'no-motion',parameters:parseParameters(lines[definition.startLine-1]),calls:[],signals:[]};
      const contextStack=[];
      const contextSnapshot=()=>contextStack.map(frame=>({type:frame.type,line:frame.line,text:frame.text}));
      let i=definition.startLine;
      while(i<=definition.endLine){
        let line=codePart(lines[i-1]||'');
        if(!line.trim()){i++;continue}
        let guard=0;
        while(guard++<20){
          const opens=(line.match(/[({\[]/g)||[]).length,closes=(line.match(/[)}\]]/g)||[]).length;
          if(opens<=closes||i>=definition.endLine)break;
          line+=' '+codePart(lines[i]||'');
          i++;
        }
        if(line.length>MAX_LINE_CHARS)line=line.slice(0,MAX_LINE_CHARS);
        const head=line.match(/^\s*([A-Za-z_]\w*)\b/);
        const word=head?head[1]:'',lower=word.toLowerCase();
        if(['if','elseif','else','endif','while','endwhile','for','endfor','test','case','endtest'].includes(lower)){
          const text=line.trim().replace(/\s+/g,' ');
          const top=contextStack[contextStack.length-1];
          if(lower==='if')contextStack.push({type:'IF',line:i,text:conditionText(text,'IF')});
          else if(lower==='elseif'&&top)top.text=conditionText(text,'ELSEIF');
          else if(lower==='else'&&top)top.text='ELSE';
          else if(lower==='while')contextStack.push({type:'WHILE',line:i,text:conditionText(text,'WHILE')});
          else if(lower==='for')contextStack.push({type:'FOR',line:i,text:text.replace(/;\s*$/,'').slice(0,MAX_CONTEXT_CHARS)});
          else if(lower==='test')contextStack.push({type:'TEST',line:i,text:text.replace(/;\s*$/,'').slice(0,MAX_CONTEXT_CHARS)});
          else if(lower==='case'&&top&&top.type==='TEST')top.text=top.text+' · CASE '+text.replace(/^\s*CASE\s+/i,'').replace(/:\s*$/,'').slice(0,80);
          else if((lower==='endif'||lower==='endwhile'||lower==='endfor'||lower==='endtest')&&contextStack.length)contextStack.pop();
          collectSignals(line,signalNames,routine);
          i++;continue;
        }
        if(MOTION[lower]){
          const instruction=MOTION[lower];
          const args=motionArguments(line,word);
          const target=resolveTarget(args[0]||'',instruction,declarations,reassigned);
          const toolwobj=parseToolWobj(args[toolIndex(lower)]||'',declarations,reassigned);
          const action={
            routineId:routine.id,routine:routine.name,fileId:file.id,line:i,instruction,
            target,
            speed:parseSpeedArg(args[1],declarations,reassigned),
            zone:parseZoneArg(args[zoneIndex(lower)]),
            tool:toolwobj.tool,
            wobj:toolwobj.wobj,
            flags:flagsOf(args[0]||''),
            context:contextSnapshot()
          };
          actions.push(action);
          routine.motion++;
          if(target.resolution==='static'&&!UNSUPPORTED_MOTION.has(lower))routine.static++;else routine.dynamic++;
          collectSignals(line,signalNames,routine);
          i++;continue;
        }
        if(TRIGGER_ONLY.has(lower)||IO_WRITE.has(lower)||IO_WAIT.has(lower)||CONTROL.has(lower)){collectSignals(line,signalNames,routine);i++;continue}
        if(line.match(/^\s*[A-Za-z_]\w*\s*:=/)){collectSignals(line,signalNames,routine);i++;continue}
        const call=line.match(/^\s*([A-Za-z_]\w*)\s*(?:\([^;]*\))?\s*;\s*$/);
        if(call&&!MOTION[call[1].toLowerCase()]&&!CONTROL.has(call[1].toLowerCase()))routine.calls.push({line:i,name:call[1]});
        collectSignals(line,signalNames,routine);
        i++;
      }
      routine.signals=[...new Set(routine.signals)];
      routine.preview=!routine.motion?'no-motion':routine.dynamic?'blocked':'static';
      routines.push(routine);
    }
  }
  return {routines,actions};
}
function collectSignals(line,signalNames,routine){
  if(!signalNames.size)return;
  for(const match of line.matchAll(/\b([A-Za-z_]\w*)\b/g)){
    if(signalNames.has(match[1].toLowerCase())&&!routine.signals.includes(match[1]))routine.signals.push(match[1]);
  }
}

function buildFrames(declarations,reassigned,candidates){
  const tools=[],wobjs=[];
  for(const decl of declarations.values()){
    if(decl.type==='tooldata'&&decl.value)tools.push({name:decl.name,robhold:decl.value.robhold,tcp:decl.value.tcp,quat:decl.value.quat,mass:decl.value.mass,cog:decl.value.cog,source:{file:decl.file,line:decl.line}});
    if(decl.type==='wobjdata'&&decl.value)wobjs.push({name:decl.name,robhold:decl.value.robhold,ufprog:decl.value.ufprog,ufmec:decl.value.ufmec,uframe:decl.value.uframe,oframe:decl.value.oframe,source:{file:decl.file,line:decl.line}});
  }
  const runtime={};
  for(const decl of declarations.values()){
    if(decl.value||!['tooldata','wobjdata'].includes(decl.type))continue;
    runtime[decl.name]={kind:decl.type,resolution:'runtime',candidates:candidates.get(decl.key)||[],assignments:(reassigned.get(decl.key)||[]).slice(0,6)};
  }
  return {tools,wobjs,defaults:{tool0:'ABB 内置默认，无偏置',wobj0:'ABB 内置默认，无偏置'},runtime};
}
function signalReference(report,files){
  const known=new Map((report.signals||[]).map(signal=>[String(signal.name||'').toLowerCase(),signal]));
  const found=new Map();
  for(const file of files){
    const lines=file.text.split(/\r\n|\n|\r/);
    lines.forEach((raw,index)=>{
      const line=codePart(raw);
      if(!/^\s*(IF|ELSEIF|WHILE|WaitDI|WaitDO|WaitGI|WaitGO|WaitAI|WaitAO|WaitUntil)\b/i.test(line))return;
      for(const match of line.matchAll(/\b([A-Za-z_]\w*)\b/g)){
        const key=match[1].toLowerCase();
        if(!known.has(key))continue;
        if(!found.has(key))found.set(key,{name:known.get(key).name,type:known.get(key).type||'',label:known.get(key).label||'',refs:[]});
        const item=found.get(key);
        if(item.refs.length<6&&!item.refs.some(ref=>ref.fileId===file.id&&ref.line===index+1))item.refs.push({fileId:file.id,file:file.name,line:index+1});
      }
    });
  }
  return [...found.values()];
}
function uniqueById(list){const seen=new Set();return list.filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true})}
function findRoutine(routines,query){
  const value=String(query||'').trim();
  if(!value)return null;
  const exact=routines.find(item=>item.id===value);
  if(exact)return exact;
  const matches=routines.filter(item=>item.name.toLowerCase()===value.toLowerCase());
  return matches.length===1?matches[0]:null;
}

function buildMotionPlan(report,{routine=''}={}){
  if(!report||!Array.isArray(report.files))throw new TypeError('需要 parseBackup 生成的 report');
  const files=report.files.filter(file=>file.kind==='program'&&file.readable&&typeof file.text==='string');
  const declarations=declarationsOf(files);
  const reassigned=reassignedNames(files,declarations);
  const candidates=runtimeCandidates(files,declarations);
  const signalNames=new Set((report.signals||[]).map(signal=>String(signal.name||'').toLowerCase()));
  const {routines,actions}=scanRoutines(files,declarations,reassigned,signalNames);
  const frames=buildFrames(declarations,reassigned,candidates);
  const diagnostics=[];
  for(const action of actions){
    const target=action.target;
    if(target.externalAxes)diagnostics.push({code:'external-axes',routineId:action.routineId,line:action.line,instruction:action.instruction,reason:'目标带外部轴数值；本版本不推算外轴'});
    if(UNSUPPORTED_MOTION.has(action.instruction.toLowerCase()))diagnostics.push({code:'unsupported-instruction',routineId:action.routineId,line:action.line,instruction:action.instruction,reason:'该运动指令尚未纳入离线计划'});
    if(target.resolution!=='static')diagnostics.push({code:target.resolution==='computed'?'computed-target':target.resolution==='indexed'?'indexed-target':target.resolution==='runtime'?'runtime-target':'missing-target',routineId:action.routineId,line:action.line,instruction:action.instruction,target:target.ref,reason:target.reason||'目标无法仅由源码静态解析'});
  }
  const byCode={},byInstruction={};
  let staticCount=0;
  for(const item of diagnostics)byCode[item.code]=(byCode[item.code]||0)+1;
  for(const action of actions){
    byInstruction[action.instruction]=(byInstruction[action.instruction]||0)+1;
    if(action.target.resolution==='static'&&!UNSUPPORTED_MOTION.has(action.instruction.toLowerCase()))staticCount++;
  }
  const entries=[];
  const isMain=routineItem=>/^main(?:_?\d+)?$/i.test(routineItem.name);
  for(const item of routines)if(isMain(item))entries.push({id:item.id,fileId:item.fileId,task:item.task,name:item.name,line:item.startLine,kind:'main'});
  for(const item of routines){
    if(isMain(item)||item.motion===0)continue;
    const called=routines.some(other=>other.id!==item.id&&other.task===item.task&&other.calls.some(call=>call.name.toLowerCase()===item.name.toLowerCase()));
    if(!called)entries.push({id:item.id,fileId:item.fileId,task:item.task,name:item.name,line:item.startLine,kind:'standalone'});
  }
  const runtimeInputs=Object.entries(frames.runtime).map(([name,value])=>({kind:value.kind==='tooldata'?'tool':'wobj',name,candidates:value.candidates,assignments:value.assignments,reason:'运行时赋值，需在模型面板选择实际工具/工件'}));
  const signals=signalReference(report,files);
  const plan={
    automation:require('./robot-cell-sim').cellProfile(report),
    schema:SCHEMA,
    sourceHash:report.sha256,
    robot:{model:report.robotModel||'',robotWare:report.robotWare||''},
    capabilities:{
      supported:['MoveAbsJ','MoveL','MoveJ','TriggL','TriggJ','literal robtarget','named robtarget','literal jointtarget','named jointtarget','static Offs','builtin zonedata','named speeddata'],
      blocked:['MoveC','SearchL/SearchC','computed target','indexed target','runtime target','runtime tool/wobj','external axes'],
      counts:{motion:actions.length,static:staticCount,unresolved:actions.length-staticCount,byInstruction,byDiagnostic:byCode}
    },
    frames:{...frames,jointLimits:axisLimits(report)},
    routines,
    entries:uniqueById(entries),
    diagnosticsSummary:{total:diagnostics.length,byCode},
    simulationInputs:runtimeInputs.concat(signals.map(item=>({kind:'signal',name:item.name,type:item.type,label:item.label,refs:item.refs,reason:'程序未给运行初值，由用户点击模拟'}))),
    limitations:[
      '仅从备份源码推导，不含轨迹插补、节拍、碰撞、奇异点或现场控制器验证。',
      '静态与运行时目标按源码求值；开启工位自动模拟时使用已展示的信号绑定和受保护模块替代。',
      '外部轴、MoveC 及未列出的指令不纳入本版本计划。',
      'AI 注释与修改建议不参与本计划。'
    ]
  };
  const targetRoutine=findRoutine(routines,routine);
  if(routine&&!targetRoutine)return {error:{code:'unknown-routine',routine:String(routine).slice(0,200)},plan};
  if(targetRoutine){
    plan.routine=targetRoutine;
    plan.actions=actions.filter(action=>action.routineId===targetRoutine.id).map((action,index)=>({...action,seq:index+1}));
    plan.diagnostics=diagnostics.filter(item=>item.routineId===targetRoutine.id);
    const routineSignals=signals.filter(item=>targetRoutine.signals.includes(item.name)).map(item=>({kind:'signal',name:item.name,type:item.type,label:item.label,refs:item.refs,reason:'当前例程条件或等待使用，需用户点击模拟'}));
    const parameters=targetRoutine.parameters.map(item=>({kind:'parameter',name:item.name,type:item.type,reason:'例程参数，调用方未固定传入，需在模型面板补值'}));
    plan.simulationInputs=runtimeInputs.concat(routineSignals,parameters);
  }else{
    plan.diagnostics=diagnostics;
  }
  return {plan};
}

module.exports={buildMotionPlan,SCHEMA,splitTopLevel,parsePose,parseSpeed};
