// Integration checks run in an isolated headless browser against synthetic loopback data.
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8515';
(async()=>{
  const output=path.resolve(__dirname,'../output/qa-v1.6.0');await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[],failed=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('missing-fixture'))failed.push({status:r.status(),url:r.url()})});
    const capture=async name=>page.screenshot({path:path.join(output,name+'.png'),fullPage:!name.includes('mobile'),animations:'disabled'});
  try{
    const reset=await page.request.post(base+'/api/fixture/reset');assert.equal(reset.status(),200);
    await page.goto(base+'/login');await page.locator('input').first().fill('preview');await page.locator('input[type=password]').fill('preview');
    await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL('**/portal');
    await page.goto(base+'/model-library');await page.locator('.ml-card').first().waitFor();
    assert.deepEqual(await page.locator('.summary-row article strong').allTextContents(),['10','1','9']);
    await capture('models-desktop-before');
    await page.getByRole('button',{name:'选择当前结果',exact:true}).click();
    await page.locator('.batch-workbench .el-select').click();
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().waitFor();
    const ordered=await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allTextContents();
    assert.deepEqual(ordered,['电机','电缆','减速电机','PLC模块','RGV部件','三角带/V带','深沟球轴承','特殊装置','消声器','轴承']);
    await page.locator('.batch-workbench .el-select input').fill('xsq');
    await page.waitForFunction(()=>[...document.querySelectorAll('.el-select-dropdown__item')].filter(e=>e.offsetParent!==null).length===1);
    assert.deepEqual(await page.locator('.el-select-dropdown:visible .el-select-dropdown__item:visible').allTextContents(),['消声器']);
    await capture('category-search');await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'取消选择',exact:true}).click();checks.push('Dropdown A-Z and pinyin initials search');
    await page.getByRole('button',{name:'按关键词匹配',exact:true}).click();
    await page.getByRole('button',{name:'关联所选 4 项',exact:true}).waitFor();
    const dialog=page.getByRole('dialog',{name:'按关键词匹配模型'});
    assert.match(await dialog.innerText(),/已关联保留 1/);
    await capture('matching-preview');
    await dialog.getByRole('button',{name:/需要核对/}).click();
    assert.equal(await dialog.locator('.el-table__body tbody tr').count(),3);
    await dialog.getByRole('button',{name:/资源缺失/}).click();
    assert.equal(await dialog.locator('.el-table__body tbody tr').count(),1);
    await capture('matching-unavailable');
    await dialog.getByRole('button',{name:/可直接关联/}).click();
    for(const width of [390,360]){
      await page.setViewportSize({width,height:844});await capture('matching-mobile-'+width);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
      const action=await dialog.getByRole('button',{name:'关联所选 4 项',exact:true}).boundingBox();assert.ok(action.y+action.height<=844);
    }
    await page.setViewportSize({width:1440,height:1000});
    await dialog.getByRole('button',{name:'关联所选 4 项',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelectorAll('.summary-row article strong')[1]?.textContent==='5');
    assert.deepEqual(await page.locator('.summary-row article strong').allTextContents(),['10','5','5']);
    const motor=page.locator('.ml-card').filter({hasText:'电机 380V'});
    await motor.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('.ml-card img[src$="motor.jpg"]')?.naturalWidth>0);
    assert.equal(await motor.locator('.image-source').innerText(),'类别参考图');
    checks.push('Four reviewed associations persist; manual association retained; stale real-photo URL falls back without mislabeling');
    for(const width of [390,360]){await page.setViewportSize({width,height:844});await capture('models-mobile-'+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('tab',{name:'类别模型管理'}).click();
    const muffler=page.locator('.category-card').filter({has:page.locator('.category-copy > strong',{hasText:'消声器'})});
    await muffler.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.category-card img[src$="muffler.jpg"]')?.naturalWidth>0);
    assert.equal(await page.locator('.category-card').filter({hasText:'特殊装置'}).locator('.reference-image-empty').count(),1);
    await capture('category-images');checks.push('Broken reference image recovers from bundled resource; missing image has a clean placeholder');
    await page.goto(base+'/warehouse-3d?partId=3&workshopCode=raw_grain');
    await page.locator('.located-part').waitFor();await page.locator('canvas').first().waitFor();
    assert.equal(await page.getByText('未绑定3D模型 · 当前为通用示意',{exact:true}).count(),0);
    assert.equal(await page.locator('.located-part .part-spec').count(),0);
    assert.equal(await page.locator('.located-part').getByText('物料编码',{exact:true}).count(),1);
    await page.locator('.located-part').scrollIntoViewIfNeeded();await page.waitForTimeout(1000);await capture('warehouse-location-desktop');
    await page.locator('.located-part').getByRole('button',{name:'定位二维码'}).click();
    await page.getByRole('dialog').waitFor();await capture('location-qr');await page.keyboard.press('Escape');
    for(const width of [390,360]){
      await page.setViewportSize({width,height:844});await page.locator('.located-part').scrollIntoViewIfNeeded();await capture('warehouse-location-mobile-'+width);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const card=await page.locator('.located-part').boundingBox();assert.ok(card.x>=0&&card.x+card.width<=width+1);
    }
    checks.push('Locator card removes duplicate spec; QR remains functional; desktop and 360/390 px layouts fit');
    await page.setViewportSize({width:1440,height:1000});
    const result={syntheticData:true,checks,errors,unexpectedHttpErrors:failed};
    await fs.writeFile(path.join(output,'browser-result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  }catch(error){await capture('failure');console.error(await page.locator('body').innerText());throw error}
  finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
