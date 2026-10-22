// Opt-in local review: synthetic business records, isolated file storage, no MySQL.
const path=require('node:path'),{pathToFileURL}=require('node:url');
async function start(){
 require('../server/node_modules/dotenv').config({path:path.resolve(__dirname,'../server/.env'),quiet:true});
 const root=path.resolve(__dirname,'..'),data=path.join(root,'.local/review-20261018'),port=Number(process.env.REVIEW_PORT||8525),apiPort=Number(process.env.REVIEW_API_PORT||3525);
 if(![port,apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)||port===apiPort)throw Error('Invalid preview ports');
 process.env.ROBOT_LIBRARY_DIR=path.join(data,'robot-library');
 process.env.CODEX_USAGE_LOCAL_ENABLED='true';
 // Exercise the warehouse with bound GLBs and several hundred synthetic slots.
 process.env.PREVIEW_WAREHOUSE='1';
 const attendance=require('../server/test/fixtures/attendance-preview.cjs').createFixture();
 const originalQuery=attendance.pool.query.bind(attendance.pool);
 attendance.pool.query=async(sql,args)=>{
  if(sql.includes('FROM fermentation_knowledge_entries')){
   if(sql.includes('WHERE id=?')){const row=require('../spare-parts-web-release/test/fixtures/preview-api.cjs').getKnowledgeFixture(args[0]);return [row?[{...row,revisionNo:row.revisionNo||1,indexStatus:row.indexStatus||'ready',contentText:row.contentText||'【本地模拟正文】设备旋转后线缆拉扯，检查线缆固定点和预留长度；按设备规程断电后核对接口与线路。'}]:[]]}
   return [[{id:1,title:'【本地演示】AGV接口检查',summary:'模拟资料：断电后按设备规程检查手操器接头与线路，记录排查结果。',category:'故障经验',revisionNo:1}]];
  }
  if(sql.includes('FROM inventory i INNER JOIN parts p'))return [[]];
  if(sql.includes('FROM workshop_equipment e'))return [[]];
  return originalQuery(sql,args);
 };
 const audit=require('../server/src/ai-call-audit'),auditStore=audit.createStore(path.join(data,'ai-call-logs'));
 const demo=attendance.inspect();
 demo.rawReports.push({id:9501,revision:1,updatedAt:'2025-01-01 10:00:00',week_start:'2024-12-30',status:'confirmed',submitted_at:'2025-01-02',identity_json:{name:'本地测试人员'},checks_json:[{dutyId:'demo',note:'本地模拟历史凭证',photoIds:[9501]}],cadence_json:null});
 demo.rawPhotos.push({id:9501,report_id:9501,filename:'历史凭证示例.jpg',byte_size:180000,image:Buffer.alloc(0)},{id:9502,report_id:9501,filename:'其他验证照片示例.jpg',byte_size:80000,image:Buffer.alloc(0)});
 const {app}=await require('../server/test/fixtures/raw-duty-preview.cjs').createFixture({legacyExample:true,extendApp:async(app,{users,accounts})=>{
  const accountQuery=require('../server/test/fixtures/users-preview.cjs').usersQuery(users,accounts),previousQuery=attendance.pool.query.bind(attendance.pool);
  attendance.pool.query=(sql,args)=>/^(?:SELECT [\s\S]* FROM app_users|INSERT INTO app_users|UPDATE app_users|DELETE FROM app_sessions)/.test(sql.replace(/\s+/g,' ').trim())?accountQuery.query(sql,args):previousQuery(sql,args);
  // Vite proxies /models to this API. Serve only bundled public model assets in
  // the loopback preview; never expose the private review/backup directories.
  app.use('/models',require('../server/node_modules/express').static(path.join(root,'spare-parts-web-release/public/models'),{dotfiles:'deny',index:false}));
  app.use('/api',require('../server/src/data-protection').privateResponse);
  app.use('/api',audit.auditMiddleware(auditStore));
  app.use('/api',require('../server/src/routes/ai-call-logs').createRouter(auditStore));
  app.use('/api/personal-usage',require('../server/src/routes/personal-usage').createRouter(undefined,auditStore));
  app.use('/api/robot-program',require('../server/src/routes/robot-program').createRouter());
  app.use('/api/attendance',require('../server/src/routes/attendance'));
  app.use('/api/work-storage',require('../server/src/routes/work-storage'));
  app.use('/api/users',require('../server/src/routes/users'));
  app.use('/api',require('../server/src/routes/ai').createRouter({usage:require('../server/src/knowledge-usage').createUsage(auditStore.root)}));
  const {handler}=require('../spare-parts-web-release/test/fixtures/preview-api.cjs');
  app.use('/api',(req,res,next)=>/^(?:\/knowledge|\/parts|\/part-models?|\/part-category-models|\/filters|\/stats|\/dashboard|\/replenishment|\/stock-movements|\/movement-reasons|\/warehouse|\/equipment|\/data-quality|\/inventory-orders|\/staging-points)(?:\/|$|-)/.test(req.path)?handler(req,res).catch(next):next());
 }});
 const backend=app.listen(apiPort,'127.0.0.1');await new Promise((resolve,reject)=>{backend.once('listening',resolve);backend.once('error',reject)});
 process.env.VITE_API_TARGET='http://127.0.0.1:'+apiPort;
 const {createServer}=await import(pathToFileURL(require.resolve('../spare-parts-web-release/node_modules/vite')).href);
 const vite=await createServer({root:path.join(root,'spare-parts-web-release'),server:{host:'127.0.0.1',port,strictPort:true}});await vite.listen();
 console.log(`Local review: http://127.0.0.1:${port}/portal`);
 console.log('Accounts: admin / raw_grain / worker / worker2 / reviewer; password: preview. Synthetic records, no production MySQL. AI uses the existing server-side DeepSeek key.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await vite.close();backend.close(()=>process.exit(0))});
}
start().catch(error=>{console.error(error.message);process.exit(1)});
