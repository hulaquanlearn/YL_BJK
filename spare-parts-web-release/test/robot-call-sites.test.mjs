import test from 'node:test'
import assert from 'node:assert/strict'
import { groupRobotCallSites } from '../src/utils/robot-call-tree.mjs'
test('repeated calls share one target card while every original source location remains accessible',()=>{
 const calls=[{id:'a',name:'Check',status:'resolved',targetId:'task1/A:Check',line:10,ref:{fileId:'main',startLine:10}},{id:'b',name:'Check',status:'resolved',targetId:'task1/A:Check',line:30,ref:{fileId:'main',startLine:30}},{id:'c',name:'Check',status:'resolved',targetId:'task2/A:Check',line:40,ref:{fileId:'other',startLine:40}}]
 const grouped=groupRobotCallSites(calls);assert.equal(grouped.length,2);assert.equal(grouped[0].count,2);assert.deepEqual(grouped[0].sites.map(s=>s.ref.startLine),[10,30]);assert.equal(calls[0].sites,undefined)
 const incoming=groupRobotCallSites([{sourceId:'main',line:10},{sourceId:'main',line:30},{sourceId:'background',line:10}],true);assert.deepEqual(incoming.map(g=>g.count),[2,1])
})
