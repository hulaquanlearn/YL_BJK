import test from 'node:test'
import assert from 'node:assert/strict'
import {createProgramDisplay} from '../src/utils/abb-program-display.mjs'

function harness(){let time=0,id=0;const tasks=new Map(),seen=[];const display=createProgramDisplay({publish:value=>seen.push({at:time,...value}),now:()=>time,schedule:(fn,ms)=>{tasks.set(++id,{fn,at:time+ms});return id},cancel:key=>tasks.delete(key)});return {display,seen,tasks,tick(to){time=to;for(const [key,task] of tasks)if(task.at<=time){tasks.delete(key);task.fn()}}}}
const move=line=>({running:true,status:'正在执行 MoveL',current:{file:'BuJiu.mod',line,code:'MoveL p'+line+';'}})

test('rapid execution updates keep one coherent latest source per second without replaying the intermediate queue',()=>{
 const h=harness();h.display.push(move(100));h.tick(100);h.display.push({running:true,status:'运动段完成',current:{line:101}});h.tick(200);h.display.push(move(102));h.tick(400);h.display.push(move(103));h.tick(999);assert.equal(h.seen.length,1)
 h.tick(1000);assert.equal(h.seen.length,2);assert.equal(h.seen[1].current.line,103);assert.equal(h.seen[1].current.code,'MoveL p103;');assert.equal(h.seen[1].status,'正在执行 MoveL');assert.equal(h.tasks.size,0)
});
test('stop, completion, error and reset replace pending source immediately and cannot be overwritten by a delayed move',()=>{
 for(const terminal of [{running:false,status:'已停止',current:{line:433}},{running:false,status:'全流程完成',current:{line:339,code:'EXIT;'}},{running:true,status:'已停止：运动失败',current:{line:440}},{running:false,status:'已回到起始位',current:{line:315}}]){
  const h=harness();h.display.push(move(100));h.tick(10);h.display.push(move(102));h.display.push(terminal);assert.equal(h.seen.at(-1).status,terminal.status);assert.deepEqual(h.seen.at(-1).current,terminal.current);h.tick(5000);assert.equal(h.seen.at(-1).status,terminal.status);assert.equal(h.tasks.size,0)
 }
});
test('sustained waits remain visible, a resumed run starts immediately and unmount cancels pending timers',()=>{
 const h=harness();h.display.push(move(100));h.tick(20);h.display.push({running:true,status:'等待信号成立',current:{line:110,code:'WaitDI ready,1;'}});h.tick(1000);assert.equal(h.seen.at(-1).current.line,110)
 h.display.push({running:false,status:'已停止',current:{line:110}});h.tick(1001);h.display.push(move(112));assert.equal(h.seen.at(-1).current.line,112);h.tick(1002);h.display.push(move(114));const count=h.seen.length;h.display.dispose();h.tick(5000);assert.equal(h.seen.length,count);assert.equal(h.tasks.size,0)
});
