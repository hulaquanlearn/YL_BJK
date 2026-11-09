const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver');
const {parseBackup}=require('../src/robot-backup');
const {createSimulation,advanceSimulation}=require('../src/robot-sim');
async function report(){
 const zip=archiver('zip'),chunks=[],done=new Promise((resolve,reject)=>{zip.on('data',b=>chunks.push(b));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});
 zip.append('MODULE Main\nVAR robtarget p;\nPROC main()\np:=CRobT();\nMoveL p,v100,fine,tool0;\nENDPROC\nENDMODULE',{name:'Backup/RAPID/TASK1/PROGMOD/Main.mod'});await zip.finalize();return parseBackup(await done,'cache.zip');
}
test('in-flight FK/IK retries retain their solutions; a committed movement releases obsolete cache entries',async()=>{
 const parsed=await report(),created=createSimulation(parsed,{routine:'main'});
 for(let i=0;i<40;i++)created.state.solveCache['old-'+i]={joints:[i,0,0,0,0,0]};
 const fk=advanceSimulation(parsed,{state:created.state,stopOnMotion:true});assert.equal(fk.stop.type,'robot-solve');assert.equal(fk.stop.request.kind,'fk');assert.equal(Object.keys(fk.state.solveCache).length,40);
 const ik=advanceSimulation(parsed,{state:fk.state,solveResult:{pose:{pos:[100,0,300],quat:[1,0,0,0]}},stopOnMotion:true});assert.equal(ik.stop.type,'robot-solve');assert.equal(ik.stop.request.kind,'ik');assert.equal(Object.keys(ik.state.solveCache).length,41);
 const moved=advanceSimulation(parsed,{state:ik.state,solveResult:{joints:[0,0,0,0,90,0]},stopOnMotion:true});assert.equal(moved.events.filter(e=>e.type==='motion').length,1);assert.equal(Object.keys(moved.state.solveCache).length,16);assert.ok(!Object.hasOwn(moved.state.solveCache,'old-0'));
 assert.equal(advanceSimulation(parsed,{state:moved.state}).stop.type,'end');
});
