// Synthetic local browser check. No production API or database is contacted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const duties=require('../server/src/work-duties').entries;
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8518';
const out=path.resolve(__dirname,'../.local/work-settings-qa');

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  try{
    for(const width of [1440,390]){
      const user={id:1,role:'admin',displayName:'测试系统管理员'};
      const page=await browser.newPage({viewport:{width,height:900}});
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(value=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify(value))},user);
      await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url()),key=url.pathname.replace('/api/work','');
        if(url.pathname==='/api/auth/me')return route.fulfill({json:{success:true,data:{user}}});
        if(url.pathname==='/api/health')return route.fulfill({json:{success:true,database:'connected'}});
        let data;
        if(key==='/context')data={members:[{user_id:10,name:'制曲组长',workshop_code:'qu_making',floor:2}],users:[
          {id:10,name:'制曲组长',role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},
          {id:11,name:'制曲班长',role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'shift_leader'},
          {id:12,name:'原粮组长',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'group_leader'}
        ],isManager:true,canConfigure:true,workRole:null,scope:null,duties};
        else if(key==='/week')data={member:{user_id:10,name:'制曲组长',workshop_code:'qu_making',floor:2},records:[],report:null,config:[],events:[],coverage:{reportedDays:0,expectedItems:null,completedItems:0,missingEvidenceItems:0}};
        else if(key==='/rules')data={current:{rules:[{id:'1',dutyId:'production_progress',title:duties[0].title,kind:'manual',max:100,standard:'根据本项结果与验证记录复核'}]},history:[]};
        else if(key==='/reviewers')data=[];
        else throw Error('Unexpected '+url.pathname);
        return route.fulfill({json:{success:true,data}});
      });
      await page.goto(base+'/work');
      await page.getByRole('button',{name:'人员设置',exact:true}).click();
      await page.getByRole('heading',{name:'考评人员设置'}).waitFor();
      const group=await page.getByLabel('组长账号').locator('option').allTextContents();
      const shift=await page.getByLabel('班长账号').locator('option').allTextContents();
      assert.ok(group.some(value=>value.includes('制曲组长')));
      assert.ok(shift.some(value=>value.includes('制曲班长')));
      assert.ok(![...group,...shift].some(value=>value.includes('原粮组长')));
      await page.screenshot({path:path.join(out,`members-${width}.png`),fullPage:true});
      await page.getByRole('button',{name:'评分标准',exact:true}).click();
      const choices=page.locator('.rule-duty-select select').first().locator('option');
      assert.equal(await choices.count(),duties.length+1);
      assert.equal(await page.locator('.rule-duty-select select').first().inputValue(),'production_progress');
      await page.getByRole('button',{name:'＋ 添加工作事项'}).click();
      assert.equal(await page.locator('.rule-duty-select select').nth(1).locator('option[value="production_progress"]').getAttribute('disabled'),'');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
      await page.screenshot({path:path.join(out,`rules-${width}.png`),fullPage:true});
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({syntheticApi:true,workshopCandidates:true,dutyChoices:duties.length,desktop:true,mobile:true,pageErrors:errors,output:out}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});


