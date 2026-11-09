import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRobotCallTree, filterRobotCallTree, robotRoutineReference } from '../src/utils/robot-call-tree.mjs'

const routine=(name,startLine=2,calls=[],extra={})=>({name,kind:'PROC',startLine,endLine:startLine+4,calls,...extra})
const file=(id,module,routines,extra={})=>({id,kind:'program',task:'T_ROB1',taskFolder:'TASK1',module,name:module+'.mod',path:`RAPID/TASK1/PROGMOD/${module}.mod`,readable:true,routines,...extra})
const call=(name,line,targets=[],extra={})=>({name,line,targets,...extra})
const target=(fileId,line=2)=>({fileId,line})

test('hierarchy groups real tasks, modules and routines, resolving calls and reverse references by source IDs',()=>{
  const files=[file('main','Main',[routine('main',2,[call('helper',3,[target('helper')])])]),file('helper','Utilities',[routine('helper')])]
  const before=structuredClone(files),graph=buildRobotCallTree(files),main=graph.byId.get('main:2'),helper=graph.byId.get('helper:2')
  assert.equal(graph.tasks.length,1);assert.deepEqual(graph.tasks[0].modules.map(m=>m.name),['Main','Utilities'])
  assert.equal(main.calls[0].status,'resolved');assert.equal(main.calls[0].targetId,helper.id)
  assert.deepEqual(helper.calledBy,[{sourceId:main.id,line:3,ref:{fileId:'main',startLine:3,endLine:3},cyclic:false}])
  assert.deepEqual(robotRoutineReference(helper),{fileId:'helper',startLine:2,endLine:6})
  assert.deepEqual(files,before,'navigation indexing must not mutate parsed backup facts')
})

test('duplicate names in the same task remain ambiguous across modules and never create reverse edges',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main',2,[call('helper',3,[target('a'),target('b')])])]),file('a','A',[routine('helper')]),file('b','B',[routine('helper')])])
  const edge=graph.byId.get('main:2').calls[0]
  assert.equal(edge.status,'ambiguous');assert.deepEqual(edge.candidateIds,['a:2','b:2']);assert.equal(edge.targetId,null)
  assert.equal(graph.byId.get('a:2').calledBy.length,0);assert.equal(graph.byId.get('b:2').calledBy.length,0)
})

test('a misleading single parser target still cannot disambiguate multiple visible definitions',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main',2,[call('helper',3,[target('a')])])]),file('a','A',[routine('helper')]),file('b','B',[routine('helper')])])
  assert.equal(graph.byId.get('main:2').calls[0].status,'ambiguous')
})

test('cross-task names and aliases cannot be joined even when a target points across task folders',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main',2,[call('helper',3,[target('other')])])]),file('other','Other',[routine('helper')],{task:'T_ROB1',taskFolder:'TASK2',path:'RAPID/TASK2/PROGMOD/Other.mod'})])
  assert.equal(graph.tasks.length,2);assert.equal(graph.byId.get('main:2').calls[0].status,'unresolved');assert.equal(graph.byId.get('other:2').calledBy.length,0)
})

test('module-local definitions do not leak to callers in other modules',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main',2,[call('helper',3,[target('local')])])]),file('local','Local',[routine('helper')],{text:'MODULE Local\nLOCAL PROC helper()\nWaitTime 1;\nENDPROC\nENDMODULE'})])
  assert.equal(graph.byId.get('local:2').local,true);assert.equal(graph.byId.get('main:2').calls[0].status,'unresolved')
})

test('self recursion and mutual cycles are marked once without building a recursive node structure',()=>{
  const graph=buildRobotCallTree([file('main','Main',[
    routine('first',2,[call('first',3,[target('main',2)]),call('second',4,[target('main',10)])]),
    routine('second',10,[call('first',11,[target('main',2)])])
  ])])
  assert.equal(graph.nodes.length,2);assert.equal(graph.byId.get('main:2').calls[0].recursive,true)
  assert.equal(graph.byId.get('main:2').calls[1].cyclic,true);assert.equal(graph.byId.get('main:10').calls[0].cyclic,true)
  assert.doesNotThrow(()=>JSON.stringify(graph.tasks))
})

test('external, system-like and dynamic calls retain their call-site evidence without invented targets',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main',2,[call('MoveJ',3),call('ExternalProcedure',4),call('CallByVar',5)])],{text:'MODULE Main\nPROC main()\nMoveJ p1,v100,z10,t1;\nExternalProcedure;\nCallByVar name,1;\n%procName%;\nENDPROC\nENDMODULE',routines:[routine('main',2,[call('MoveJ',3),call('ExternalProcedure',4),call('CallByVar',5)],{endLine:7})]})])
  const calls=graph.byId.get('main:2').calls
  assert.deepEqual(calls.map(c=>c.status),['unresolved','unresolved','dynamic','dynamic'])
  assert.deepEqual(calls.map(c=>c.targetId),[null,null,null,null])
  assert.deepEqual(calls.at(-1).ref,{fileId:'main',startLine:6,endLine:6})
})

test('purpose comes from saved single-routine evidence, and broad overview text cannot be assigned by name',()=>{
  const files=[file('main','Main',[routine('Pick',2),routine('Other',10)])]
  const graph=buildRobotCallTree(files,{overview:{summary:'由名称猜测抓取',sections:[{title:'整套流程',content:'跨例程总体描述',refs:[{fileId:'main',startLine:2,endLine:14}]},{title:'有依据的功能',content:'等待允许信号，检查完成后设置输出。',refs:[{fileId:'main',startLine:2,endLine:6}]}]}})
  assert.equal(graph.byId.get('main:2').description.text,'等待允许信号，检查完成后设置输出。')
  assert.equal(graph.byId.get('main:2').description.source,'overview');assert.equal(graph.byId.get('main:2').description.partial,false)
  assert.equal(graph.byId.get('main:10').description.text,'暂无分析')
})

test('line notes remain partial evidence and stale backup analysis is rejected',()=>{
  const files=[file('main','Main',[routine('main')])],notes=[{fileId:'main',line:3,text:'等待允许信号'}]
  const partial=buildRobotCallTree(files,{annotations:notes}).nodes[0].description
  assert.equal(partial.partial,true);assert.equal(partial.source,'annotation');assert.deepEqual(partial.refs,[{fileId:'main',startLine:3,endLine:3}])
  const stale=buildRobotCallTree(files,{annotations:notes,sourceHash:'current',analysis:{sourceHash:'old'},overview:{sourceHash:'old',sections:[{content:'旧备份说明',refs:[{fileId:'main',startLine:2,endLine:6}]}]}})
  assert.equal(stale.nodes[0].description.text,'暂无分析')
})

test('search includes saved purpose and preserves unreadable or declaration-only modules',()=>{
  const graph=buildRobotCallTree([file('main','Main',[routine('main')]),file('data','Data',[]),file('locked','Locked',[],{readable:false,reason:'受保护'})],{annotations:[{fileId:'main',line:3,text:'等待允许信号'}]})
  assert.deepEqual(filterRobotCallTree(graph).flatMap(task=>task.modules.map(m=>m.fileId)),['main','data','locked'])
  assert.deepEqual(filterRobotCallTree(graph,'允许信号').flatMap(task=>task.modules.flatMap(m=>m.routineIds)),['main:2'])
  assert.equal(filterRobotCallTree(graph,'Locked')[0].modules[0].readable,false)
  assert.equal(filterRobotCallTree(graph,'Data')[0].modules[0].fileId,'data')
  assert.deepEqual(filterRobotCallTree(graph,'not-present'),[])
})

test('invalid source locations cannot emit a navigation range',()=>{
  for(const ref of [{fileId:'a',startLine:0,endLine:1},{fileId:'a',startLine:8,endLine:2},{fileId:'a',startLine:1.5,endLine:2},{startLine:1,endLine:2}])assert.equal(robotRoutineReference(ref),null)
})

test('a deep call chain uses bounded graph nodes and iterative cycle analysis',()=>{
  const routines=Array.from({length:5000},(_,i)=>routine('r'+i,i*3+1,i===4999?[]:[call('r'+(i+1),i*3+2,[target('large',(i+1)*3+1)])],{endLine:i*3+3}))
  const graph=buildRobotCallTree([file('large','Large',routines)])
  assert.equal(graph.nodes.length,5000);assert.equal(graph.statistics.resolved,4999);assert.equal(graph.byId.get('large:14998').calledBy.length,1)
})
