const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const {createWebApp}=require('../spare-parts-web-release/server');const {toShelf}=require('../server/src/warehouse-layout');
const catalog=require('../server/data/ledger-model-catalog.json');
const deferred=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release}};
(async()=>{
 const built=process.env.WEB_DIST||path.resolve(__dirname,'../.local/online-app-20261019/web-dist-progress-final'),dist=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-progress-ui-'));await fs.copyFile(path.join(built,'index.html'),path.join(dist,'index.html'));await fs.cp(path.join(built,'assets'),path.join(dist,'assets'),{recursive:true});
 const server=createWebApp({distDir:dist}).listen(0,'127.0.0.1');await once(server,'listening');const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify({id:1,role:'admin',displayName:'合成进度验证'}));});
 const layout=deferred(),staging=deferred(),parts=deferred(),first=deferred(),second=deferred();let secondCalls=0;
 const models=catalog.models.filter(m=>m.modelUrl).slice(0,2),shelf=toShelf({id:1,shelfNo:1,width:4.9,depth:1.4,height:3.2,defaultLevels:4,workshopGroup:'进度演示货区'});
 await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let data=[];
 if(p==='/api/auth/me')data={user:{id:1,role:'admin',displayName:'合成进度验证'}};
 else if(p==='/api/health')data={database:'connected'};
 else if(p==='/api/warehouse-layout'){await layout.promise;data={shelves:[shelf],room:{name:'合成验证库房',size:{width:28,depth:20,height:5}},warehouses:[],workshopCode:'raw_grain'};}
 else if(p==='/api/staging-points'){await staging.promise;data=[];}
 else if(p==='/api/parts'){await parts.promise;data=models.map((m,i)=>({_id:String(i+1),materialCode:'TEST-'+i,materialDesc:'合成备件',workshopCode:'raw_grain',locationCode:'01110'+(i+1),totalStock:3,safetyStock:1,categoryModelUrl:m.modelUrl}));}
 await route.fulfill({json:{success:true,data,total:Array.isArray(data)?data.length:undefined}});});
 await page.route('**/models/**',async route=>{const p=new URL(route.request().url()).pathname;if(p===models[0].modelUrl)await first.promise;else {await second.promise;if(++secondCalls===1){await route.fulfill({status:503,body:'synthetic failure'});return;}}
 await route.fulfill({body:await fs.readFile(path.resolve(__dirname,'../spare-parts-web-release/public','.'+p)),contentType:'model/gltf-binary'});});
 await page.goto(`http://127.0.0.1:${server.address().port}/warehouse-3d`);const loading=page.locator('.stage-loading');await loading.getByText('正在读取库位布局',{exact:true}).waitFor();layout.release();await loading.getByText('正在读取暂存点',{exact:true}).waitFor();staging.release();await loading.getByText('正在读取备件 0 条',{exact:true}).waitFor();parts.release();await loading.getByText('0 / 2 个库位已准备',{exact:true}).waitFor();first.release();await loading.getByText('1 / 2 个库位已准备',{exact:true}).waitFor();
 const out=path.resolve(__dirname,'../.local/online-app-20261019/ui');await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'warehouse-progress.png')});second.release();await loading.waitFor({state:'hidden'});await page.locator('.model-load-warning').getByText(/1 个模型加载失败/).waitFor();await page.getByRole('button',{name:'重试模型',exact:true}).click();await page.locator('.model-load-warning').waitFor({state:'hidden'});await loading.waitFor({state:'hidden'});assert.ok(secondCalls>=2);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({layout:true,staging:true,parts:true,realModelCounts:true,failedModelVisible:true,retrySucceeded:true,errors}));
 }finally{await browser.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});if(path.dirname(dist)!==os.tmpdir()||!path.basename(dist).startsWith('workbench-progress-ui-'))throw Error('Unexpected cleanup path');await fs.rm(dist,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
