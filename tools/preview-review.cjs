// Opt-in local review: synthetic business records, isolated file storage, no MySQL.
const path=require('node:path'),{pathToFileURL}=require('node:url');
async function start(){
 require('../server/node_modules/dotenv').config({path:path.resolve(__dirname,'../server/.env'),quiet:true});
 const root=path.resolve(__dirname,'..'),data=path.join(root,'.local/review-20261018'),port=Number(process.env.REVIEW_PORT||8534);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
 process.env.ROBOT_LIBRARY_DIR=path.join(data,'robot-library');
 process.env.CODEX_USAGE_LOCAL_ENABLED='true';
 // Exercise the warehouse with bound GLBs and several hundred synthetic slots.
 process.env.PREVIEW_WAREHOUSE='1';
 const storage=require('../server/test/fixtures/work-storage-preview.cjs').createFixture();
 const originalQuery=storage.pool.query.bind(storage.pool);
 storage.pool.query=async(sql,args)=>{
  if(sql.includes('FROM fermentation_knowledge_entries')){
   if(sql.includes('WHERE id=?')){const row=require('../spare-parts-web-release/test/fixtures/preview-api.cjs').getKnowledgeFixture(args[0]);return [row?[{...row,revisionNo:row.revisionNo||1,indexStatus:row.indexStatus||'ready',contentText:row.contentText||'【本地模拟正文】设备旋转后线缆拉扯，检查线缆固定点和预留长度；按设备规程断电后核对接口与线路。'}]:[]]}
   return [[{id:1,title:'【本地演示】AGV接口检查',summary:'模拟资料：断电后按设备规程检查手操器接头与线路，记录排查结果。',category:'故障经验',revisionNo:1}]];
  }
  if(sql.includes('FROM inventory i INNER JOIN parts p'))return [[]];
  if(sql.includes('FROM workshop_equipment e'))return [[]];
  return originalQuery(sql,args);
 };
 const audit=require('../server/src/ai-call-audit'),auditStore=audit.createStore(path.join(data,'ai-call-logs'));
 const demo=storage.inspect();
 demo.rawReports.push({id:9501,revision:1,updatedAt:'2025-01-01 10:00:00',week_start:'2024-12-30',status:'confirmed',submitted_at:'2025-01-02',identity_json:{name:'本地测试人员'},checks_json:[{dutyId:'demo',note:'本地模拟历史凭证',photoIds:[9501]}],cadence_json:null});
 demo.rawPhotos.push({id:9501,report_id:9501,filename:'历史凭证示例.jpg',byte_size:180000,image:Buffer.alloc(0)},{id:9502,report_id:9501,filename:'其他验证照片示例.jpg',byte_size:80000,image:Buffer.alloc(0)});
 const {app}=await require('../server/test/fixtures/raw-duty-preview.cjs').createFixture({legacyExample:true,extendApp:async(app,{users,accounts})=>{
  for(const user of users)user.workshopCode=user.role==='raw_grain'?'raw_grain':user.staffWorkshopCode||null;
  accounts.qu_worker=31;
  app.use('/api',require('../server/src/ai-channels').router());
  if(!users.some(u=>u.id===34)){users.push({id:34,name:'【本地合成】厂家维修人员',role:'viewer',staffWorkshopCode:'qu_making',workshopCode:'qu_making',staffPosition:'manufacturer_maintenance',enabled:true});accounts.qu_manufacturer=34;}
  if(!users.some(u=>u.id===33)){users.push({id:33,name:'【本地合成】制曲维修人员',role:'viewer',staffWorkshopCode:'qu_making',workshopCode:'qu_making',staffPosition:'maintenance',enabled:true});accounts.qu_maintenance=33;}
  if(!users.some(u=>u.id===32)){users.push({id:32,name:'【本地合成】制曲管理员',role:'qu_making',workshopCode:'qu_making',enabled:true});accounts.qu_admin=32;}
  const accountQuery=require('../server/test/fixtures/users-preview.cjs').usersQuery(users,accounts),previousQuery=storage.pool.query.bind(storage.pool);
  storage.pool.query=(sql,args)=>/^(?:SELECT [\s\S]* FROM app_users|INSERT INTO app_users|UPDATE app_users|DELETE FROM app_sessions)/.test(sql.replace(/\s+/g,' ').trim())?accountQuery.query(sql,args):previousQuery(sql,args);
  // Serve only bundled public model assets before the Vite middleware in
  // the loopback preview; never expose the private review/backup directories.
  app.use((await import(pathToFileURL(path.join(root,'spare-parts-web-release/tools/abb-model-assets.mjs')).href)).abbDevelopmentAssets(path.join(root,'spare-parts-web-release')));
  app.use('/models',require('../server/node_modules/express').static(path.join(root,'spare-parts-web-release/public/models'),{dotfiles:'deny',index:false}));
  app.use('/api',require('../server/src/data-protection').privateResponse);
  app.use('/api',audit.auditMiddleware(auditStore));
  if(process.env.PREVIEW_FIRE_SPLIT==='1'){
   await require('../server/test/fixtures/fire-review.cjs').mountFireReview(app,{users,accounts});
   require('../server/test/fixtures/model-review-preview.cjs').mountModelReviewPreview(app);
   app.get('/__fire-2d-review',(_req,res)=>res.redirect('/fire-inspection'));
   app.get('/api/data-management',(_req,res)=>res.json({success:true,data:{categories:[{id:'robot',title:'机器人备份',description:'本地合成资料，仅用于界面核验',count:1,bytes:8192,items:[{id:'qa-robot',title:'【本地合成】长代码阅读与调用树.zip',bytes:8192,annotationCount:6,updatedAt:new Date().toISOString(),revision:1}]},{id:'knowledge',title:'工程知识',count:0,bytes:0,items:[]},{id:'models',title:'模型资源',count:0,bytes:0,items:[]},{id:'images',title:'实物照片',count:0,bytes:0,items:[]},{id:'ai_logs',title:'调用记录',count:1,bytes:1024,items:[{id:'qa-logs',title:'【本地合成】调用记录',fileCount:2,eligibleCount:0,bytes:1024}]},{id:'robot_archives',title:'删除归档',count:0,bytes:0,items:[]}],database:{bytes:4096,tables:[]},protected:['业务数据库','私有配置','有效上传'],storageNote:'本地合成示例，不接生产数据库'}}));
  }
  const usagePreview={read:async()=>({checkedAt:new Date().toISOString(),cacheSeconds:30,deepseek:{status:'unconfigured',message:'本地预览不读取平台余额'},glm:{status:'unconfigured',message:'本地预览不读取平台余额'},codex:{status:'unavailable',message:'本地预览不读取个人账户'},hunyuan:{status:'unconfigured'}})};
  app.use('/api/personal-usage',require('../server/src/routes/personal-usage').createRouter(usagePreview,{read:async()=>({status:'unconfigured',message:'本地预览不读取平台费用'})}));
  app.use('/api/robot-program',require('../server/src/routes/robot-program').createRouter());
  app.use('/api/work-storage',require('../server/src/routes/work-storage'));
  app.use('/api/users',require('../server/src/routes/users'));
  app.use('/api',require('../server/src/routes/ai').createRouter({usage:require('../server/src/knowledge-usage').createUsage(auditStore.root)}));
  const {handler}=require('../spare-parts-web-release/test/fixtures/preview-api.cjs');
  app.get('/api/knowledge/:id/preview',(req,res,next)=>{const id=String(req.params.id),file=['12','17','19','20','26'].includes(id)?path.join(root,'spare-parts-web-release/public/documents/abb/irb6700-product.pdf'):null;if(!file||!require('fs').existsSync(file))return next();res.type('application/pdf').sendFile(file);});
  app.use('/api',(req,res,next)=>/^(?:\/knowledge|\/parts|\/part-models?|\/part-category-models|\/filters|\/stats|\/dashboard|\/replenishment|\/stock-movements|\/movement-reasons|\/warehouse|\/equipment|\/data-quality|\/inventory-orders|\/staging-points)(?:\/|$|-)/.test(req.path)?handler(req,res).catch(next):next());
 }});
 const backend=require('node:http').createServer(app),webRoot=path.join(root,'spare-parts-web-release');
 const {createServer}=await import(pathToFileURL(require.resolve('../spare-parts-web-release/node_modules/vite')).href);
 const config=(await import(pathToFileURL(path.join(webRoot,'vite.config.js')).href)).default;
 // Keep the existing plugins, but replace API proxies with this fixture and
 // attach HMR to the shared HTTP server so it cannot open another port.
 const vite=await createServer({...config,configFile:false,root:webRoot,server:{...config.server,host:'127.0.0.1',port,strictPort:true,proxy:undefined,middlewareMode:true,hmr:{server:backend,clientPort:port}}});
 // Preserve API-side asset misses instead of serving the SPA for missing files.
 app.use(['/models','/uploads'],(_req,res)=>res.sendStatus(404));
 app.use(vite.middlewares);
 await new Promise((resolve,reject)=>{backend.once('error',reject);backend.listen(port,'127.0.0.1',resolve)});
 console.log(`Local review: http://127.0.0.1:${port}/portal`);
 console.log('Accounts: admin / raw_grain / worker / worker2 / reviewer; password: preview. Synthetic records, no production MySQL. AI uses the existing server-side DeepSeek key.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await vite.close();backend.close(()=>process.exit(0))});
}
start().catch(error=>{console.error(error.message);process.exit(1)});
