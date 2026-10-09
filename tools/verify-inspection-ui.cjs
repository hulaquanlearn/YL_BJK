// Local synthetic API/browser checks. No production service or database is contacted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const sharp=require('../server/node_modules/sharp');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8518';
const sample=process.env.INSPECTION_SAMPLE_IMAGE;
const out=path.resolve(__dirname,'../.local/inspection-qa');
const blank={title:'酿造四部五区综合检查--周通报',checkTime:'',checkScope:'',inspectors:'',checkItems:''};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const image=sample?await fs.readFile(sample):await sharp({create:{width:862,height:2802,channels:3,background:'#dce5e3'}}).png().toBuffer();
  const metadata=await sharp(image).metadata();
  const report={id:1,workshopCode:'raw_grain',ownerId:2,header:{...blank},issues:[],revision:0,sources:[{id:11,filename:'群聊截图.png',mime:'image/png',width:metadata.width,height:metadata.height,status:'pending',error_message:null,duplicate_of:null,reviewed:0}]};
  const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];let nextSource=12,failNextUpload=false,uploadAttempts=0,visionEnabled=false,visionDelayMs=0;
  async function page(width){
    const user={id:2,role:'raw_grain',workshopCode:'raw_grain',displayName:'测试车间管理员'};
    const p=await browser.newPage({viewport:{width,height:900}});p.on('pageerror',error=>errors.push(error.message));
    await p.addInitScript(u=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify(u))},user);
    await p.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url()),pathname=url.pathname,method=request.method();
      if(pathname==='/api/auth/me')return route.fulfill({json:{success:true,data:{user}}});
      if(pathname==='/api/health')return route.fulfill({json:{success:true,database:'connected'}});
      if(!pathname.startsWith('/api/'))return route.continue();
      if(!pathname.startsWith('/api/inspection-notices'))throw Error('Unexpected API '+pathname);
      const key=pathname.slice('/api/inspection-notices'.length);
      if(key==='/capability')return route.fulfill({json:{success:true,data:{enabled:visionEnabled,reason:visionEnabled?'合成识图接口，仅用于页面验证。':'缺少 OPENCLAW_VISION_MODEL；可先人工整理截图。'}}});
      if(key==='/reports'&&method==='GET')return route.fulfill({json:{success:true,data:{items:[{id:1,title:report.header.title,workshopCode:'raw_grain',sourceCount:report.sources.length,updatedAt:'2026-09-24'}],total:1,page:1,pageSize:20}}});
      if(key==='/storage')return route.fulfill({json:{success:true,data:{reports:1,sources:report.sources.length,source_bytes:image.length*report.sources.length,quotaBytes:20*1024*1024*1024}}});
      if(key==='/reports/1'&&method==='GET')return route.fulfill({json:{success:true,data:report}});
      if(key==='/reports/1'&&method==='PATCH'){
        const body=request.postDataJSON();assert.equal(body.revision,report.revision);
        report.header=body.header;report.issues=body.issues;report.revision++;
        return route.fulfill({json:{success:true,data:{revision:report.revision,issues:report.issues}}});
      }
      if(key==='/reports/1/sources'&&method==='POST'){
        uploadAttempts++;
        if(failNextUpload){failNextUpload=false;return route.fulfill({status:503,json:{success:false,msg:'模拟上传中断'}})}
        const filenames=[...request.postDataBuffer().toString('latin1').matchAll(/filename="([^"]+)"/g)].map(match=>match[1]);
        const added=filenames.map(filename=>{const row={id:nextSource++,filename,mime:'image/png',width:metadata.width,height:metadata.height,status:'pending',error_message:null,duplicate_of:11,reviewed:0};report.sources.push(row);return {id:row.id,filename,duplicateOf:11}});
        report.revision++;
        return route.fulfill({json:{success:true,data:{revision:report.revision,added,skipped:[]}}});
      }
      if(key==='/reports/1/analyze'&&method==='POST'){
        if(visionDelayMs)await new Promise(resolve=>setTimeout(resolve,visionDelayMs));
        const ids=request.postDataJSON().sourceIds;
        report.sources.filter(source=>ids.includes(source.id)).forEach(source=>source.status='done');
        report.issues.push({id:'ai-synthetic',origin:'ai',segment:'五粮破碎工段',location:'四楼',equipment:'',problem:'集气室地面过脏',category:'粉尘涉爆',rectification:'建议清理',remarks:'',rawText:'四楼集气室地面过脏',pairingReason:'位置相符，仍需核对照片',missingInfo:'照片与文字非同一人发送，请确认',duplicateHint:'',reviewStatus:'pending',sourceIds:ids,photos:[{sourceId:ids[0],rect:{x:.13,y:.23,w:.36,h:.09}}]});
        report.revision++;
        return route.fulfill({json:{success:true,data:{available:true,revision:report.revision,added:1}}});
      }
      if(key==='/reports/1/sources/11/review'&&method==='PATCH'){
        report.sources[0].reviewed=request.postDataJSON().reviewed?1:0;report.revision++;
        return route.fulfill({json:{success:true,data:{revision:report.revision}}});
      }
      if(/^\/reports\/1\/sources\/\d+\/image$/.test(key))return route.fulfill({contentType:'image/png',body:image});
      if(/^\/reports\/1\/sources\/\d+\/crop$/.test(key)){
        const x=Number(url.searchParams.get('x')),y=Number(url.searchParams.get('y')),w=Number(url.searchParams.get('w')),h=Number(url.searchParams.get('h'));
        const left=Math.floor(x*metadata.width),top=Math.floor(y*metadata.height),width=Math.max(1,Math.min(metadata.width-left,Math.floor(w*metadata.width))),height=Math.max(1,Math.min(metadata.height-top,Math.floor(h*metadata.height)));
        const cropped=await sharp(image).extract({left,top,width,height}).png().toBuffer();
        return route.fulfill({contentType:'image/png',body:cropped});
      }
      throw Error('Unexpected '+method+' '+key);
    });
    await p.goto(base+'/inspection-notices?id=1');await p.getByRole('heading',{name:'原始截图'}).waitFor();
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+width);
    return p;
  }
  try{
    const desktop=await page(1440);
    await desktop.locator('.file-button input[type=file]').setInputFiles([{name:'first.png',mimeType:'image/png',buffer:image},{name:'second.png',mimeType:'image/png',buffer:image}]);
    await desktop.locator('.source-card').nth(2).waitFor();assert.equal(report.sources.length,3);
    failNextUpload=true;
    await desktop.locator('.file-button input[type=file]').setInputFiles({name:'third.png',mimeType:'image/png',buffer:image});
    await desktop.getByRole('button',{name:/重试失败的 1 张/}).waitFor();
    await desktop.getByRole('button',{name:/重试失败的 1 张/}).click();
    await desktop.locator('.source-card').nth(3).waitFor();assert.equal(report.sources.length,4);
    await desktop.getByRole('button',{name:'＋ 手工新增'}).click();
    const issue=desktop.locator('.issue-card').first();
    await issue.locator('.issue-problem textarea').fill('三楼3振动循环风旁边标识牌脱落');
    await issue.locator('.issue-extra summary').click();
    await issue.locator('.issue-fields input').first().fill('五粮破碎工段');
    await issue.locator('.attach-actions select').selectOption('11');
    await issue.getByRole('button',{name:'从截图选照片'}).click();
    await desktop.getByRole('dialog',{name:'调整现场照片裁切'}).waitFor();
    await desktop.screenshot({path:path.join(out,'desktop-crop.png'),fullPage:true});
    await desktop.getByRole('button',{name:'确认裁切'}).click();
    await issue.getByText('问题图片（1）').waitFor();
    await issue.getByText('我已核对这条问题描述和配图').locator('input').check();
    await desktop.getByRole('button',{name:'保存修改'}).click();
    await desktop.getByText('已保存到服务器').waitFor();
    assert.equal(report.issues[0].photos[0].sourceId,11);
    await desktop.screenshot({path:path.join(out,'desktop-review.png'),fullPage:true});
    await issue.locator('.attach-actions select').selectOption('12');
    await issue.getByRole('button',{name:'从截图选照片'}).click();
    await desktop.getByRole('button',{name:'确认裁切'}).click();
    await issue.getByText('问题图片（2）').waitFor();
    await issue.getByRole('button',{name:'调整裁切'}).first().click();
    await desktop.getByRole('dialog',{name:'调整现场照片裁切'}).locator('.crop-sliders input').first().fill('20');
    await desktop.getByRole('button',{name:'确认裁切'}).click();
    await desktop.getByRole('button',{name:'＋ 手工新增'}).click();
    await desktop.locator('.issue-card').nth(1).locator('textarea').first().fill('另一人补充的现场问题');
    await desktop.locator('.issue-top input[type=checkbox]').first().check();
    await desktop.locator('.issue-top input[type=checkbox]').nth(1).check();
    await desktop.getByRole('button',{name:'合并选中'}).click();
    await desktop.getByRole('button',{name:'合并',exact:true}).click();
    assert.equal(await desktop.locator('.issue-card').count(),1);
    await desktop.getByRole('button',{name:'拆分'}).click();
    assert.equal(await desktop.locator('.issue-card').count(),2);
    assert.equal(await desktop.locator('.issue-card').nth(1).locator('.photo-item').count(),1);
    await desktop.close();
    const mobile=await page(390);
    await mobile.screenshot({path:path.join(out,'mobile-review.png'),fullPage:true});
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await mobile.close();
    visionEnabled=true;visionDelayMs=600;
    const ai=await page(1440);
    const preservedProblem=report.issues[0].problem;
    await ai.getByRole('button',{name:/识别待处理截图/}).click();
    await ai.getByText(/正在识别截图/).waitFor();
    assert.equal(await ai.locator('.notice-editor').getAttribute('inert'),'','issue editing stays locked until vision response is applied');
    await ai.getByText('AI 草稿').waitFor();
    assert.equal(report.issues[0].problem,preservedProblem,'existing reviewed wording survives recognition');
    await ai.getByText(/照片与文字非同一人发送/).waitFor();
    await ai.screenshot({path:path.join(out,'desktop-ai-review.png'),fullPage:true});
    await ai.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({syntheticApi:true,desktop:true,mobile:true,appendUploads:3,uploadAttempts,manualEdit:true,photoCrop:true,mergeSplit:true,visionEditLock:true,aiDraft:true,errors}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
