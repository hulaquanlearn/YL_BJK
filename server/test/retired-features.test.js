
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('retired routes are absent; authenticated old requests return 404 without business queries',async()=>{
 const {pool}=require('../src/db');const savedQuery=pool.query,savedConnection=pool.getConnection;
 let businessCalls=0,sessionCalls=0;
 pool.query=async sql=>{
  if(sql.includes('FROM app_sessions')){sessionCalls++;return [[{id:1,username:'fixture',display_name:'Fixture',role:'admin',enabled:1,session_id:1}]]}
  businessCalls++;throw Error('Removed feature touched business data');
 };
 pool.getConnection=async()=>{businessCalls++;throw Error('Removed feature opened a transaction')};
 const app=require('../src/app'),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port+'/api';const headers={Authorization:'Bearer '+'A'.repeat(43)};
  for(const url of ['/work/context','/work/records','/work/suggest','/work/photos/1','/work/export','/plc/projects','/plc/projects/1/analyze','/program-agent/jobs','/program-agent/jobs/1/result','/inspection-notices','/suppliers','/procurement-orders','/part-category-models','/parts/batch-category-model','/part-category-model-matches/preview','/part-category-model-matches/apply','/parts/1/model','/parts/1/model-scale']){
   for(const method of (url==='/parts/batch-category-model'?['POST']:['GET','POST','PATCH','DELETE'])){
    const response=await fetch(base+url,{method,headers});assert.equal(response.status,404,method+' '+url);assert.equal((await response.json()).msg,'接口不存在');
   }
   assert.equal((await fetch(base+url)).status,401,'Unknown business API still requires authentication');
  }
  assert.ok(sessionCalls>0);assert.equal(businessCalls,0);
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});pool.query=savedQuery;pool.getConnection=savedConnection;await pool.end()}
});

test('removed implementation and bootstrap are absent while raw duty and robot modules remain',()=>{
 const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 for(const name of fs.readdirSync(path.join(root,'server/src')))assert.doesNotMatch(name,/^(?:plc-|work-(?!storage)|production-report-export)/);
 for(const name of fs.readdirSync(path.join(root,'server/sql')))assert.doesNotMatch(name,/^migration_(?:plc_|program_analysis_|work_(?:assessment|flow|documents|score_jobs|teams)_)/);
 for(const file of ['server/src/routes/work.js','server/src/routes/plc.js','server/src/routes/plc-agent.js','spare-parts-web-release/src/views/WorkAssessment.vue','spare-parts-web-release/src/views/PlcAnalysis.vue','spare-parts-web-release/src/api/work.js','spare-parts-web-release/src/components/CategoryMatchDialog.vue','spare-parts-web-release/src/components/ProductionReportTable.vue','spare-parts-web-release/src/components/ProgramLogicTree.vue','tools/preview-raw-duties.cjs','tools/preview-robot-program.cjs','tools/verify-ui-v1.6.0.cjs','tools/verify-ui-v1.7.0.cjs','tools/verify-private-assets-v1.7.0.cjs','tools/verify-portal-work-ui.cjs','tools/tia-openness-exporter/Start-ProgramAnalysisAgent.ps1'])assert.equal(fs.existsSync(path.join(root,file)),false,file);
 assert.doesNotMatch(read('server/src/db.js'),/migration_work_|plc_projects|work_photos|work_task_files/);
 assert.doesNotMatch(read('server/.env.example'),/PLC_AGENT_TOKEN|PLC_UPLOAD_DIR|PLC_MAX_FILE_SIZE|OPENCLAW_VISION_MODEL/);
 assert.doesNotMatch(read('server/src/app.js'),/['"]\/api\/(?:work|plc|program-agent|inspection-notices|suppliers|procurement-orders)['"]/);
 for(const file of ['server/src/calendar-date.js','server/src/routes/raw-duties.js','server/src/routes/attendance.js','server/src/routes/robot-program.js','server/src/robot-agent.js'])assert.equal(fs.existsSync(path.join(root,file)),true,file);
});
