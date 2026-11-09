const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver');
const {parseBackup}=require('../src/robot-backup'),{axisLimits}=require('../src/robot-axis-limits'),{createSimulation,advanceSimulation}=require('../src/robot-sim'),{buildMotionPlan}=require('../src/robot-motion');
test('MOC active bounds govern playback, not product defaults or the configurable maximum, without renumbering source files',async()=>{
 const zip=archiver('zip'),chunks=[],done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});
 const joints=Array.from({length:6},(_,i)=>' -use_joint_'+i+' "rob1_'+(i+1)+'"').join(''),arms=Array.from({length:6},(_,i)=>' -name "rob1_'+(i+1)+'" -lower_joint_bound -6.98132 -upper_joint_bound '+(i===4?'1.745':'6.98132')+' -upper_joint_bound_max 589 -lower_joint_bound_min -589').join('\n');
 zip.append('ROBOT:\n -name "ROB_1"'+joints+'\n#\nARM:\n'+arms+'\n#',{name:'Backup/SYSPAR/MOC.cfg'});
 zip.append('MODULE Main\nCONST jointtarget j:=[[0,0,0,0,90,370],[9E9,9E9,9E9,9E9,9E9,9E9]];\nPROC main()\nMoveAbsJ j,v100,fine,tool0;\nENDPROC\nENDMODULE',{name:'Backup/RAPID/T_ROB1/PROGMOD/Main.mod'});await zip.finalize();const r=await parseBackup(await done,'axis.zip'),limits=axisLimits(r);
 assert.equal(r.files[0].id,'file-1');assert.equal(r.files[0].name,'Main.mod');assert.equal(limits[5][1],400);assert.equal(limits[4][1],99.981);assert.equal(buildMotionPlan(r).plan.frames.jointLimits[5][1],400);
 const o=advanceSimulation(r,{state:createSimulation(r,{routine:'main'}).state}),e=o.events.find(e=>e.type==='motion');assert.equal(e.joints[5],370,'absolute source turn is preserved');assert.deepEqual(e.jointLimits,limits);
 assert.equal(createSimulation(r,{routine:'main',joints:[0,0,0,0,110,0]}).error.code,'joints-invalid');assert.equal(createSimulation(r,{routine:'main',joints:[0,0,0,0,90,401]}).error.code,'joints-invalid');
});
