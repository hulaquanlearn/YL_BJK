// Native browser asset-cookie check against actual middleware and web runtime; synthetic sessions only.
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os'),assert=require('node:assert/strict'),http=require('node:http'),{once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),config=require('../server/src/config'),{pool}=require('../server/src/db');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'private-assets-browser-'));await fs.writeFile(path.join(dir,'index.html'),'<html><body>Private asset fixture</body></html>');await fs.copyFile(path.join(root,'spare-parts-web-release/public/models/categories/motor.jpg'),path.join(dir,'part.jpg'));
 process.env.MODEL_ASSETS_DIR=path.join(root,'spare-parts-web-release/public');config.env='development';config.parts.uploadDir=dir;let enabled=true;pool.query=async()=>[[{id:91,username:'fixture',display_name:'Fixture',role:'viewer',enabled:enabled?1:0,session_id:2}]];
 const api=require('../server/src/app').listen(0,'127.0.0.1');await once(api,'listening');const app=require('../spare-parts-web-release/server').createWebApp({distDir:dir,apiTarget:`http://127.0.0.1:${api.address().port}`});const web=http.createServer(app).listen(0,'127.0.0.1');await once(web,'listening');const base=`http://127.0.0.1:${web.address().port}`;
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
 try{
  await page.goto(base);assert.equal((await page.request.get(base+'/uploads/part-images/part.jpg')).status(),401);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+'A'.repeat(43)}});return r.status}),200);
  assert.equal((await page.request.get(base+'/models/categories/motor.glb')).status(),200);
  const cookie=(await page.context().cookies()).find(c=>c.name==='spare_parts_asset_session'&&c.path==='/uploads');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/uploads');
  await page.evaluate(()=>{const img=document.createElement('img');img.src='/uploads/part-images/part.jpg';document.body.append(img)});await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);
  assert.equal((await page.request.get(base+'/api/users')).status(),401,'asset cookie must not authorize JSON business API');
  enabled=false;assert.equal((await page.request.get(base+'/uploads/part-images/part.jpg')).status(),401);
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/uploads/part-images/part.jpg')).status(),401);assert.equal((await anonymous.request.get(base+'/models/reference-20260904/manifest.json')).status(),401);await anonymous.close();
  const result={syntheticSessions:true,anonymousAssets:401,authenticatedNativeImage:'rendered',cookie:{httpOnly:true,sameSite:'Strict',path:'/uploads'},cookieOnlyBusinessApi:401,disabledAccount:401};await fs.writeFile(path.join(root,'output/qa-v1.7.0/private-assets-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();for(const server of [web,api])await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});await fs.rm(dir,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
