// Isolated browser verification with synthetic local data. No production database.
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8515';
(async()=>{
 const out=path.resolve(__dirname,'../output/qa-v1.7.0');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
 const errors=[],httpErrors=[],writes=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!r.url().includes('missing-fixture'))httpErrors.push({status:r.status(),url:r.url()})});
 page.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())&&!/\/auth\//.test(r.url()))writes.push({method:r.method(),url:r.url()})});
 await page.addInitScript(()=>{window.__permissionNotices=0;window.addEventListener('DOMContentLoaded',()=>new MutationObserver(records=>{for(const record of records){if((record.target.nodeType===1?record.target:record.target.parentElement)?.closest('.el-message'))window.__permissionNotices++;for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('.el-message')&&node.textContent.includes('权限不足'))window.__permissionNotices++}}).observe(document.body,{childList:true,subtree:true,characterData:true}))});
 const capture=async name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:false,animations:'disabled'});
 const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true}).first();
 const denied=async(locator,label)=>{await locator.waitFor();assert.equal(await locator.isEnabled(),true,label);const before=await page.evaluate(()=>window.__permissionNotices);await locator.click();await page.waitForFunction(n=>window.__permissionNotices>n,before);checks.push(label||await locator.innerText())};
 const go=async route=>{await page.goto(base+route);await page.locator('.app-layout,main,.page-head,.knowledge-page').first().waitFor().catch(()=>{});};
 try {
  await page.goto(base+'/login');await page.locator('input').first().fill('viewer');await page.locator('input[type=password]').fill('preview');await button('登录').click();await page.waitForURL('**/portal');
  await go('/inventory');await denied(button('新增备件'),'库存新增');await denied(button('导入备件'),'库存导入');await denied(button('出入库'),'库存出入库');
  await button('全选筛选结果').click();await denied(button('批量出入库'),'库存批量出入库');await denied(button('批量删除'),'库存批量删除');
  await button('详情').click();await page.getByRole('dialog').waitFor();await denied(button('编辑信息'),'库存详情编辑');await denied(button('删除备件'),'库存详情删除');await capture('inventory-viewer-desktop');await page.keyboard.press('Escape');
  await go('/model-library');await denied(button('按关键词匹配'),'模型匹配写入入口');await denied(button('上传实物图'),'实物图片上传');
  await page.getByRole('tab',{name:'类别模型管理'}).click();await denied(button('新增类别模型'),'模型新增');await denied(button('编辑/替换'),'模型编辑');await denied(button('删除'),'模型删除');
  await button('站内查看3D').click();await page.getByRole('dialog').waitFor();assert.ok(await page.locator('canvas').count());checks.push('车间人员可以预览模型');await page.keyboard.press('Escape');
  await go('/equipment');await denied(button('新增型号'),'设备新增');await denied(button('导入'),'设备导入');await page.locator('.model-nav-item').first().click();await denied(button('关联备件'),'设备关联');await denied(button('管理型号'),'设备管理');await denied(button('编辑'),'设备关系编辑');await denied(button('解除'),'设备解除关系');
  await go('/check');await denied(button('新建盘点'),'新建盘点');await denied(button('通过'),'盘点审批通过');await denied(button('驳回'),'盘点审批驳回');await button('详情').click();await page.getByRole('dialog').waitFor();checks.push('车间人员可以查看盘点详情');await page.keyboard.press('Escape');
  await go('/data-quality');await denied(button('修复'),'数据修复');
  await go('/knowledge');await denied(button('新增知识'),'知识新增');await button('分类配置').click();const config=page.getByRole('dialog',{name:'知识选项配置'});await config.waitFor();await denied(button('新增',config),'工序新增');await denied(button('保存',config),'工序保存');await denied(button('删除',config),'工序删除');await denied(config.locator('.el-switch'),'配置启停');await denied(button('新增标签',config),'标签新增');await denied(config.locator('.managed-tags .el-tag__close'),'标签删除');
  const input=config.locator('.stage-create input').first();await input.focus();const before=await page.evaluate(()=>window.__permissionNotices);await input.press('Enter');await page.waitForFunction(n=>window.__permissionNotices>n,before);checks.push('键盘操作权限提示');await page.keyboard.press('Escape');
  await page.locator('.knowledge-card').first().click();await denied(button('编辑/替换附件'),'知识编辑');await denied(button('彻底删除'),'知识删除');await button('修订历史').click();await page.getByRole('dialog',{name:'修订历史'}).waitFor();await denied(button('恢复为新版本'),'历史版本恢复');checks.push('车间人员可查看知识和修订历史');
  await go('/plc-analysis');await denied(button('导入程序项目'),'程序导入');await page.locator('.project-card').first().click();await denied(button('删除项目'),'程序删除');checks.push('车间人员可查看程序项目');
  await go('/warehouse-3d?partId=3&workshopCode=raw_grain');await page.locator('.located-part').waitFor();await denied(button('标牌设置'),'货架标牌修改');await button('定位二维码').click();await page.getByRole('dialog').waitFor();checks.push('车间人员可查看定位二维码');await page.keyboard.press('Escape');await capture('warehouse-viewer-desktop');
  for(const route of ['/replenishment','/movements','/statistics']){await go(route);await page.waitForTimeout(250);checks.push('查看页面 '+route)}
  for(const route of ['/inventory','/knowledge','/model-library','/warehouse-3d']){await page.setViewportSize({width:390,height:844});await go(route);await page.waitForTimeout(500);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'手机横向溢出 '+route);if(route==='/inventory')await denied(button('新增备件'),'手机端新增权限提示');await capture(route.slice(1)+'-viewer-mobile')}
  assert.deepEqual(writes,[],'查看账号的业务写请求不应发送');assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
  const result={syntheticData:true,checks,writeRequests:writes,pageErrors:errors,httpErrors};await fs.writeFile(path.join(out,'browser-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){await capture('failure');console.error(JSON.stringify({errors,httpErrors,writes,checks}));console.error((await page.locator('body').innerText()).slice(0,6000));throw error}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
