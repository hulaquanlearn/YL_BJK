const array=value=>Array.isArray(value)?value:[]
const lower=value=>String(value||'').toLowerCase()
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
const text=value=>typeof value==='string'?value.trim():''
const compact=(value,max=240)=>{const valueText=text(value).replace(/\s+/g,' ');return valueText.length>max?valueText.slice(0,max)+'…':valueText}

export function robotRoutineReference(node){
  if(!node?.fileId||!positive(node.startLine)||!positive(node.endLine)||Number(node.endLine)<Number(node.startLine))return null
  return {fileId:node.fileId,startLine:Number(node.startLine),endLine:Number(node.endLine)}
}

function taskIdentity(file){
  const folder=text(file.taskFolder)||String(file.path||'').match(/(?:^|\/)RAPID\/([^/]+)\//i)?.[1]
  if(folder)return 'folder:'+lower(folder)
  return text(file.task)?'task:'+lower(file.task):'unknown:'+file.id
}
const routineId=(fileId,line)=>String(fileId)+':'+Number(line)
function sourceLines(file){return typeof file.text==='string'?file.text.split(/\r\n|\n|\r/):[]}
function localDefinition(file,routine,lines){return routine.local===true||/^\s*LOCAL\s+(?:PROC|FUNC|TRAP)\b/i.test(lines[Number(routine.startLine)-1]||'')}

function evidenceFor(node,options){
  const within=ref=>String(ref?.fileId)===String(node.fileId)&&positive(ref.startLine)&&positive(ref.endLine??ref.startLine)&&Number(ref.startLine)>=node.startLine&&Number(ref.endLine??ref.startLine)<=node.endLine
  const usable=report=>report&&(!options.sourceHash||!report.sourceHash||report.sourceHash===options.sourceHash)
  for(const [kind,report] of [['overview',options.overview],...Object.values(options.reports||{}).map(report=>['batch',report]),['analysis',options.analysis]]){
    if(!usable(report))continue
    for(const section of array(report.sections)){
      const refs=array(section.refs)
      // An overall description spanning several routines is not a single routine's purpose.
      if(!text(section.content)||!refs.length||!refs.every(within))continue
      return {text:compact(section.content),title:text(section.title),source:kind,partial:!refs.some(ref=>Number(ref.startLine)===node.startLine&&Number(ref.endLine)>=node.endLine),refs:refs.map(ref=>({fileId:ref.fileId,startLine:Number(ref.startLine),endLine:Number(ref.endLine??ref.startLine)}))}
    }
  }
  const notes=options.analysis?.sourceHash&&options.sourceHash&&options.analysis.sourceHash!==options.sourceHash?[]:array(array(options.annotations).length?options.annotations:options.analysis?.annotations)
  const note=notes.filter(note=>String(note.fileId)===String(node.fileId)&&positive(note.line)&&Number(note.line)>=node.startLine&&Number(note.line)<=node.endLine&&text(note.text)).sort((a,b)=>Number(a.line)-Number(b.line))[0]
  if(note)return {text:compact(note.text),title:'行内说明',source:'annotation',partial:true,refs:[{fileId:note.fileId,startLine:Number(note.line),endLine:Number(note.line)}]}
  return {text:'暂无分析',title:'',source:'none',partial:false,refs:[]}
}

// Strongly connected components are computed iteratively: a deep backup must not
// recurse through JavaScript's call stack, and the UI never expands calls recursively.
function markCycles(nodes,byId){
  const adjacent=new Map(nodes.map(node=>[node.id,node.calls.filter(call=>call.status==='resolved').map(call=>call.targetId)])),reverse=new Map(nodes.map(node=>[node.id,[]]))
  for(const [from,targets] of adjacent)for(const to of targets)reverse.get(to)?.push(from)
  const seen=new Set(),order=[]
  for(const node of nodes){
    if(seen.has(node.id))continue
    seen.add(node.id);const stack=[{id:node.id,index:0}]
    while(stack.length){const top=stack.at(-1),targets=adjacent.get(top.id)||[];if(top.index<targets.length){const id=targets[top.index++];if(!seen.has(id)){seen.add(id);stack.push({id,index:0})}}else{order.push(top.id);stack.pop()}}
  }
  const component=new Map(),sizes=[]
  for(const first of order.reverse()){
    if(component.has(first))continue
    const id=sizes.length,stack=[first];let size=0;component.set(first,id)
    while(stack.length){const next=stack.pop();size++;for(const source of reverse.get(next)||[])if(!component.has(source)){component.set(source,id);stack.push(source)}}sizes.push(size)
  }
  for(const node of nodes)for(const call of node.calls)if(call.status==='resolved'){
    call.cyclic=component.get(node.id)===component.get(call.targetId)&&(sizes[component.get(node.id)]>1||node.id===call.targetId)
    call.recursive=node.id===call.targetId
    byId.get(call.targetId).calledBy.push({sourceId:node.id,line:call.line,ref:call.ref,cyclic:call.cyclic})
  }
}

export function buildRobotCallTree(files=[],options={}){
  const tasks=[],taskMap=new Map(),nodes=[],byId=new Map(),linesByFile=new Map()
  for(const file of array(files).filter(file=>file?.id&&(file.kind==='program'||!file.kind&&Array.isArray(file.routines)))){
    const taskId=taskIdentity(file),module={id:'module:'+file.id,fileId:file.id,name:text(file.module)||text(file.name)||'未命名模块',filename:text(file.name),path:text(file.path),readable:file.readable!==false,reason:text(file.reason),routineIds:[]}
    if(!taskMap.has(taskId)){const task={id:taskId,name:text(file.task)||text(file.taskFolder)||'未知任务',folder:text(file.taskFolder),modules:[]};taskMap.set(taskId,task);tasks.push(task)}
    taskMap.get(taskId).modules.push(module);linesByFile.set(String(file.id),sourceLines(file))
    if(!module.readable)continue
    for(const routine of array(file.routines)){
      if(!text(routine.name)||!positive(routine.startLine)||!positive(routine.endLine)||Number(routine.endLine)<Number(routine.startLine))continue
      const id=routineId(file.id,routine.startLine);if(byId.has(id))continue
      const node={id,fileId:file.id,taskId,taskName:taskMap.get(taskId).name,moduleId:module.id,moduleName:module.name,filename:module.filename,name:routine.name,kind:text(routine.kind)||'例程',startLine:Number(routine.startLine),endLine:Number(routine.endLine),local:localDefinition(file,routine,linesByFile.get(String(file.id))),calls:[],calledBy:[],rawCalls:array(routine.calls)}
      node.ref=robotRoutineReference(node);node.description=evidenceFor(node,options);nodes.push(node);byId.set(id,node);module.routineIds.push(id)
    }
  }
  const names=new Map()
  for(const node of nodes){const key=node.taskId+'\0'+lower(node.name);if(!names.has(key))names.set(key,[]);names.get(key).push(node)}
  for(const node of nodes){
    const lines=linesByFile.get(String(node.fileId))||[],dynamicLines=new Set()
    for(const [index,raw] of node.rawCalls.entries()){
      const line=Number(raw.line),source=lines[line-1]||''
      if(!positive(line)||line<node.startLine||line>node.endLine)continue
      const name=text(raw.name)||'未命名调用',dynamic=raw.dynamic===true||/dynamic/i.test(text(raw.kind)||text(raw.type))||/%/.test(name)||/^\s*%/.test(source)||/^CallByVar$/i.test(name)
      const call={id:node.id+':call:'+index,name,line,ref:{fileId:node.fileId,startLine:line,endLine:line},status:'unresolved',targetId:null,candidateIds:[],cyclic:false,recursive:false,reason:''}
      if(dynamic){call.status='dynamic';call.reason='动态调用，无法静态确定被调用例程';dynamicLines.add(line)}
      else{
        const possible=(names.get(node.taskId+'\0'+lower(name))||[]).filter(target=>!target.local||String(target.fileId)===String(node.fileId))
        const qualified=text(raw.module||raw.moduleName),candidates=qualified?possible.filter(target=>lower(target.moduleName)===lower(qualified)):possible
        const supplied=array(raw.targets).map(target=>byId.get(routineId(target.fileId,target.line??target.startLine))).filter(target=>target&&target.taskId===node.taskId&&lower(target.name)===lower(name)&&(!target.local||String(target.fileId)===String(node.fileId)))
        const unique=[...new Set(supplied.map(target=>target.id))]
        if(candidates.length===1&&unique.length===1&&candidates[0].id===unique[0]){call.status='resolved';call.targetId=unique[0]}
        else if(candidates.length>1||unique.length>1){call.status='ambiguous';call.candidateIds=candidates.map(target=>target.id);call.reason='同一任务存在多个同名定义，未建立确定调用关系'}
        else call.reason='未在同一任务解析到唯一例程定义；可能是系统指令、外部例程或未解析调用'
      }
      node.calls.push(call)
    }
    // The current parser omits %-prefixed dynamic statements; retain these source
    // facts as unresolved leaves instead of inventing a target from a string value.
    for(let line=node.startLine;line<=Math.min(node.endLine,lines.length);line++)if(/^\s*%[^%\r\n]+%/.test(lines[line-1])&&!dynamicLines.has(line))node.calls.push({id:node.id+':dynamic:'+line,name:compact(lines[line-1].trim().split(';')[0],100),line,ref:{fileId:node.fileId,startLine:line,endLine:line},status:'dynamic',targetId:null,candidateIds:[],cyclic:false,recursive:false,reason:'动态调用，保留源代码位置，未推断目标'})
    delete node.rawCalls
  }
  markCycles(nodes,byId)
  return {tasks,nodes,byId,statistics:{tasks:tasks.length,modules:tasks.reduce((sum,task)=>sum+task.modules.length,0),routines:nodes.length,resolved:nodes.reduce((sum,node)=>sum+node.calls.filter(call=>call.status==='resolved').length,0),unresolved:nodes.reduce((sum,node)=>sum+node.calls.filter(call=>call.status!=='resolved').length,0)}}
}

export function filterRobotCallTree(graph,query=''){
  const term=lower(text(query))
  return graph.tasks.map(task=>({...task,modules:task.modules.map(module=>({...module,routineIds:module.routineIds.filter(id=>{const node=graph.byId.get(id);return !term||lower([task.name,task.folder,module.name,module.filename,module.path,node.name,node.description.text,...node.calls.map(call=>call.name)].join(' ')).includes(term)})})).filter(module=>module.routineIds.length||!term||lower([task.name,module.name,module.path].join(' ')).includes(term))})).filter(task=>task.modules.length)
}
export function groupRobotCallSites(calls = [], incoming = false) {
  const groups = new Map()
  for (const call of calls) {
    const key = JSON.stringify([incoming ? call.sourceId : call.targetId, call.status || '', incoming ? '' : call.name || '', call.reason || '', [...(call.candidateIds || [])].sort()])
    if (!groups.has(key)) groups.set(key, { ...call, id: call.id || key, sites: [] })
    groups.get(key).sites.push({ line: call.line, ref: call.ref })
  }
  return [...groups.values()].map(group => ({ ...group, count: group.sites.length }))
}
