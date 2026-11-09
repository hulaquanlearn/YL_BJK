import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {Matrix4,Vector3} from 'three'
import {robotFlangeMatrix,robotReferenceJoints,robotJointLimits} from '../src/utils/abb-kinematics.mjs'
import {inverseRobotJoints} from '../src/utils/abb-inverse-kinematics.mjs'
import {pendantKeys} from '../src/utils/abb-pendant-controls.mjs'
import {pendantHardware} from '../src/utils/abb-guide.mjs'

function controller(){
 const events=[],calls=[],watchers=[],props={joints:robotReferenceJoints.slice(),playing:false,programSpeed:100}
 const script=fs.readFileSync(new URL('../src/components/agv/AbbPendantControl.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
 const context=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn()}}),useRoute:()=>({query:{}}),defineProps:()=>props,defineEmits:()=>((name,value)=>events.push({name,value})),watch:(get,fn)=>watchers.push({get,fn}),onMounted(){},onBeforeUnmount(){},Matrix4,Vector3,robotFlangeMatrix,robotJointLimits,inverseRobotJoints,pendantKeys,pendantHardware})
 vm.runInContext(script+'\nthis.subject={jog,selectMenu,hardwareControl,enableState,motionAllowed,emergency,mode,axis,page,screen,screenStatus,programControl,increment,incrementEnabled,help,speedPercent,pendantModel,programContext,programCurrent};',context)
 const state=context.subject;state.programControl.value={stop:()=>calls.push('stop'),start:()=>calls.push('start'),step:()=>calls.push('step'),poseChanged:()=>calls.push('poseChanged')}
 return {state,events,calls,props,syncProps:()=>watchers.forEach(w=>w.fn(w.get()))}
}

test('screen arrows require enable and diagonal directions move two joints together in the selected axis group',()=>{
 const {state:s,events,calls}=controller();s.pendantModel.value={openJoystick:()=>calls.push('openJoystick')};s.selectMenu('remote');s.selectMenu('remote-ne')
 assert.equal(events.some(e=>e.name==='jog'),false)
 s.hardwareControl('enable');s.incrementEnabled.value=true;assert.equal(s.motionAllowed.value,true);s.selectMenu('remote-ne')
 let move=events.findLast(e=>e.name==='jog').value
 assert.deepEqual(Array.from(move.deltas,d=>d.axis),[0,1]);assert.ok(Math.abs(Math.hypot(...move.deltas.map(d=>d.delta))-.02)<1e-10)
 s.selectMenu('axis-group');assert.equal(s.page.value,'jog');s.selectMenu('remote-sw')
 move=events.findLast(e=>e.name==='jog').value;assert.deepEqual(Array.from(move.deltas,d=>d.axis),[3,4]);assert.ok(move.deltas.every(d=>d.delta<0))
 s.hardwareControl('enable');assert.equal(s.motionAllowed.value,false);const count=events.filter(e=>e.name==='jog').length;s.selectMenu('remote-n');assert.equal(events.filter(e=>e.name==='jog').length,count)
})

test('linear diagonal arrows preserve their screen and solve a real 1mm combined TCP displacement',()=>{
 const {state:s,events,props}=controller();s.hardwareControl('enable');s.incrementEnabled.value=true;s.selectMenu('remote');s.selectMenu('motion-mode');assert.equal(s.page.value,'jog');assert.equal(s.mode.value,'linear')
 s.selectMenu('remote-ne');const move=events.findLast(e=>e.name==='move').value
 const before=new Vector3().setFromMatrixPosition(robotFlangeMatrix(props.joints)),after=new Vector3().setFromMatrixPosition(robotFlangeMatrix(move.frames.at(-1))),delta=after.sub(before)
 assert.ok(Math.abs(delta.x+.001/Math.sqrt(2))<.000001);assert.ok(Math.abs(delta.y-.001/Math.sqrt(2))<.000001);assert.ok(Math.abs(delta.z)<.000001)
 assert.ok(!s.screen.value.choices.some(c=>/^remote-(n|ne|e|se|s|sw|w|nw)$/.test(c.id)),'directions now appear beside the physical joystick')
})

test('emergency stop cancels motion, blocks program start, and reset requires enabling again',()=>{
 const {state:s,calls}=controller();s.hardwareControl('enable');s.hardwareControl('start');assert.ok(calls.includes('start'));calls.length=0
 s.hardwareControl('emergency');assert.equal(s.emergency.value,true);assert.equal(s.motionAllowed.value,false);assert.ok(calls.includes('stop'));s.hardwareControl('start');assert.ok(!calls.includes('start'))
 s.hardwareControl('reset-emergency');assert.equal(s.motionAllowed.value,false);s.hardwareControl('enable');s.hardwareControl('forward');assert.ok(calls.includes('step'))
})

test('quick-setting zero speed stops and blocks motion until a nonzero speed is chosen',()=>{
 const {state:s,calls,events}=controller();s.hardwareControl('enable');s.selectMenu('speed-set-0');assert.equal(s.motionAllowed.value,false);assert.ok(calls.includes('stop'))
 s.selectMenu('remote-ne');assert.ok(!events.some(e=>e.name==='jog'));s.selectMenu('speed-set-25');assert.equal(s.motionAllowed.value,true);assert.equal(s.speedPercent.value,25)
 s.selectMenu('remote-ne');assert.ok(events.some(e=>e.name==='jog'))
})

test('menu pages are usable and production displays the same current source as the linked program',()=>{
 const {state:s,props}=controller(),current={file:'Current.mod',line:42,excerpt:[{line:42,text:'MoveJ p1,v100,z10,tool0;'}]}
 props.programCurrent=current;props.programContext={routine:{name:'CurrentRoutine'},files:[{id:'f1',name:'Current.mod',text:'MODULE Current\nENDMODULE'}],signals:[{name:'di1',type:'DI',value:0}]}
 for(const page of ['io','control','logs','info','backup','files','calibrate','hotedit']){s.selectMenu(page);assert.equal(s.page.value,page)}
 s.selectMenu('production');assert.equal(s.page.value,'production');assert.equal(s.screen.value.current,current);assert.equal(s.screen.value.routine.name,'CurrentRoutine')
 s.selectMenu('choose-file:f1');assert.equal(s.screen.value.current.file,'Current.mod');assert.equal(s.screen.value.current.excerpt[0].text,'MODULE Current')
 s.selectMenu('lock');s.selectMenu('program');assert.equal(s.page.value,'locked');s.selectMenu('unlock');assert.equal(s.page.value,'menu')
})

test('pendant follows the shared running program and blocks manual jogging during its waits',()=>{
 const {state:s,props,events}=controller();props.programRunning=true;props.programStatus='正在执行 MoveL';props.programCurrent={line:80,file:'Main.mod'};props.programContext={routine:{name:'main'}};s.selectMenu('production');
 assert.equal(s.screen.value.programRunning,true);assert.equal(s.screenStatus.value,props.programStatus);assert.equal(s.screen.value.current.line,80);
 props.programCurrent={line:95,file:'Main.mod'};props.programStatus='等待暂存斗料满';assert.equal(s.screen.value.current.line,95);assert.equal(s.screenStatus.value,props.programStatus);
 s.hardwareControl('enable');events.length=0;s.jog({directions:[1,0,0],remote:true});assert.equal(events.some(e=>e.name==='jog'),false);assert.match(s.help.value.text,/先停止/);
 const source=fs.readFileSync(new URL('../src/components/agv/AbbPendantControl.vue',import.meta.url),'utf8');assert.doesNotMatch(source,/<AbbProgramControl\b/);
})

test('default arrow taps are visible short motions and their speed provider follows live override changes',()=>{
 const {state:s,events}=controller();s.hardwareControl('enable');s.selectMenu('remote-n')
 const motion=events.findLast(e=>e.name==='jog').value;assert.equal(motion.deltas[0].delta,1);assert.equal(motion.speed(),1)
 s.selectMenu('speed-set-25');assert.equal(motion.speed(),.25);s.selectMenu('speed-set-0');assert.equal(motion.speed(),0)
})

test('releasing a manual jog stops the viewer immediately and never stops an unrelated program',()=>{
 const {state:s,events,props,calls}=controller()
 s.hardwareControl('jog-release');assert.equal(events.length,0)
 s.hardwareControl('enable');s.jog({directions:[1,0,0],remote:true});events.length=0;calls.length=0
 s.hardwareControl('jog-release');assert.deepEqual(events.map(e=>e.name),['stop']);assert.equal(calls.length,0)
 s.hardwareControl('jog-release');assert.equal(events.length,1,'duplicate release is harmless')
 props.playing=true;s.jog({directions:[1,0,0],remote:true});s.hardwareControl('jog-release');assert.equal(events.length,1)
})


test('pendant speed changes address the main override and external speed changes update the LCD and live jog provider',()=>{
 const {state:s,events,props,syncProps}=controller();props.programRunning=true;props.programSpeed=50;syncProps();s.selectMenu('quickset');assert.equal(s.screen.value.speedPercent,50);
 s.selectMenu('speed-minus-5');assert.equal(s.screen.value.speedPercent,45);const command=events.findLast(e=>e.name==='program-command');assert.equal(command.value.action,'setSpeed');assert.equal(command.value.args[0],45);
 props.programRunning=false;s.hardwareControl('enable');s.selectMenu('remote-n');const motion=events.findLast(e=>e.name==='jog').value;assert.equal(motion.speed(),.45);props.programSpeed=20;syncProps();assert.equal(s.screen.value.speedPercent,20);assert.equal(motion.speed(),.2);
});
