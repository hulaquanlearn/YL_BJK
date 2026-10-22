// Built website + synthetic fixture only. No production accounts, SQL or model calls.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createWebApp}=require('../spare-parts-web-release/server');const {handler}=require('../spare-parts-web-release/test/fixtures/preview-api.cjs');
(async()=>{
 const fixture=http.createServer(handler).listen(0,'127.0.0.1');await once(fixture,'listening');
 // Express intentionally refuses dot-directories, so serve this fixture from a named temp directory.
 const dist=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'workbench-ai-ui-'));
 const built=process.env.WEB_DIST||path.resolve(__dirname,'../.local/online-app-20261019/web-dist-progress-final');await fs.copyFile(path.join(built,'index.html'),path.join(dist,'index.html'));await fs.cp(path.join(built,'assets'),path.join(dist,'assets'),{recursive:true});
 const app=createWebApp({distDir:dist,apiTarget:`http://127.0.0.1:${fixture.address().port}`}).listen(0,'127.0.0.1');await once(app,'listening');
 const browser=await chromium.launch({channel:'msedge',headless:true});const out=path.resolve(__dirname,'../.local/online-app-20261019/ui');await fs.mkdir(out,{recursive:true});const checks=[],errors=[];
 try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify({id:1,role:'admin',displayName:'本地界面测试',username:'preview'}));});
  const calls=[];await page.route('**/api/ai/chat',route=>{const body=route.request().postDataJSON();calls.push(body);return route.fulfill({json:{success:true,data:{answer:'1、核对报警代码。\n\n2、依据库内案例检查接插件。[知识#36]',evidence:[{sourceType:'knowledge',sourceId:'36',citation:'知识#36',title:'演示：AGV超级电容/EKK故障',excerpt:'仅用于合成界面验证'}]}}});});
  const base=`http://127.0.0.1:${app.address().port}`;await page.goto(base+'/knowledge');await page.getByRole('button',{name:'问 AI',exact:true}).click();
  const input=page.getByRole('textbox',{name:'设备故障问题'});await input.fill('AGVEKK故障');await page.getByRole('button',{name:'提问',exact:true}).click();await page.locator('.assistant-turn .assistant-answer').waitFor();
  assert.equal(await page.locator('.assistant-user p').first().textContent(),'AGVEKK故障');assert.equal(await input.inputValue(),'');
  await input.fill('那下一步具体检查什么？');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.assistant-turn .assistant-answer').nth(1).waitFor();assert.equal(calls[1].messages[0].content,'AGVEKK故障');
  await page.reload();await page.getByRole('button',{name:'问 AI',exact:true}).click();assert.equal(await page.locator('.assistant-turn').count(),2);assert.equal(await page.locator('.assistant-evidence').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:path.join(out,`conversation-${width}.png`)});
  await page.getByRole('button',{name:'新对话',exact:true}).click();assert.equal(await page.locator('.assistant-turn').count(),0);checks.push({width,questionVisible:true,followupContext:true,refreshRestored:true,perTurnEvidence:true,newConversation:true});await context.close();
 }assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));}
 finally{await browser.close();for(const server of [app,fixture])await new Promise(r=>{server.close(r);server.closeAllConnections();});if(!path.basename(dist).startsWith('workbench-ai-ui-')||path.dirname(dist)!==require('node:os').tmpdir())throw Error('Unexpected cleanup path');await fs.rm(dist,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
