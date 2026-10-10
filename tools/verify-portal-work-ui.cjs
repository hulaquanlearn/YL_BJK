// Browser-only role and layout check against the local built preview; API responses are synthetic.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8518';
const out=path.resolve(__dirname,'../.local/portal-qa');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
  try{
    for(const scenario of [
      {name:'raw-grain',role:'raw_grain',workRole:'',inspection:true,assessment:false,width:1440},
      {name:'qu-making',role:'qu_making',workRole:'',inspection:false,assessment:true,width:1440},
      {name:'group-leader',role:'viewer',workRole:'group_leader',inspection:false,assessment:true,width:390},
      {name:'shift-leader',role:'viewer',workRole:'shift_leader',inspection:false,assessment:true,width:390},
      {name:'unassigned',role:'viewer',workRole:'',inspection:false,assessment:false,width:390}
    ]){
      const user={id:scenario.name,role:scenario.role,displayName:scenario.name,...(scenario.workRole?{staffWorkshopCode:'qu_making',staffPosition:scenario.workRole}:{})};
      const page=await browser.newPage({viewport:{width:scenario.width,height:900}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(u=>{localStorage.setItem('spare_parts_auth_token','x'.repeat(43));localStorage.setItem('spare_parts_auth_user',JSON.stringify(u))},user);
      await page.route('**/api/**',route=>{
        const pathname=new URL(route.request().url()).pathname;
        if(pathname==='/api/auth/me')return route.fulfill({json:{success:true,data:{user}}});
        if(pathname==='/api/health')return route.fulfill({json:{success:true,database:'connected'}});
        if(pathname==='/api/work/context')return route.fulfill({json:{success:true,data:{workRole:scenario.workRole,members:[],users:[],duties:[]}}});
        return route.fulfill({status:404,json:{success:false,msg:'synthetic route unavailable'}});
      });
      const start=Date.now();await page.goto(base+'/portal');await page.getByRole('heading',{name:'工作管理中心'}).waitFor();
      if(scenario.role==='viewer')await page.waitForTimeout(100);
      assert.equal(await page.getByText('从这里开始工作').count(),0);
      assert.equal(await page.getByText('工作空间',{exact:true}).count(),0);
      // Entrances remain visible; route and server guards enforce data access.
      assert.equal(await page.getByRole('link',{name:/制曲 · 组长履职考评/}).count(),1);
      assert.equal(await page.getByRole('link',{name:/原粮 · 检查通报(整理|查看)/}).count(),1);
      assert.equal(await page.getByRole('link',{name:/原粮 · 考勤核查/}).count(),scenario.role==='raw_grain'?1:0);
      const colors=await page.evaluate(()=>({work:getComputedStyle(document.querySelector('.work-card')).borderTopColor,knowledge:getComputedStyle(document.querySelector('.knowledge-card')).borderTopColor,overflow:document.documentElement.scrollWidth>innerWidth+1}));
      assert.notEqual(colors.work,colors.knowledge);
      assert.equal(colors.overflow,false);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,`${scenario.name}.png`),fullPage:true});
      results.push({name:scenario.name,loadMs:Date.now()-start,colors});
      await page.close();
    }
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
