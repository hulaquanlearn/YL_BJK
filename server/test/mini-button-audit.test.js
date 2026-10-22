const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../miniprogram');
function definition(name,api={}){
 let page;const auth={requireLogin:()=>true,getUser:()=>({role:'viewer'}),isAdmin:()=>false,isViewer:()=>true,canSubmitInventory:()=>false};
 vm.runInNewContext(fs.readFileSync(path.join(root,`pages/${name}/${name}.js`),'utf8'),{Page:p=>page=p,require:p=>p.includes('/api')?api:p.includes('/auth')?auth:p.includes('/utils')?require(path.join(root,'services/utils.js')):{},console,wx:{},setTimeout,clearTimeout});
 return {...page,data:structuredClone(page.data),setData(values,callback){Object.assign(this.data,values);callback?.()}};
}
test('all mini-program template button handlers and registered page paths exist',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),pages=app.pages,registered=[...pages,...(app.subPackages||[]).flatMap(p=>p.pages.map(page=>p.root+'/'+page))];let events=0;
 for(const entry of pages){
  assert.ok(fs.existsSync(path.join(root,entry+'.js')),entry);
  const name=entry.split('/')[1],page=definition(name),template=fs.readFileSync(path.join(root,entry+'.wxml'),'utf8');
  for(const match of template.matchAll(/(?:bind|catch)(?::)?[a-z]+\s*=\s*["']([a-zA-Z_$][\w$]*)["']/g)){events++;assert.equal(typeof page[match[1]],'function',`${entry}: ${match[1]}`)}
  const script=fs.readFileSync(path.join(root,entry+'.js'),'utf8');
  for(const match of script.matchAll(/\/((?:packages\/[\w-]+\/)?pages\/[\w-]+\/[\w-]+)/g))assert.ok(registered.includes(match[1]),match[0]);
 }
 assert.ok(events>70);
});
test('mini inventory labels distinguish missing reorder point and retain zero as configured',()=>{
 const p=definition('index');
 assert.equal(p.formatPart({totalStock:3,reorderPoint:null}).stockStatus,'unconfigured');
 assert.equal(p.formatPart({totalStock:3,reorderPoint:0}).stockStatus,'normal');
 assert.equal(p.formatPart({totalStock:0,reorderPoint:null}).stockStatus,'zero');
 assert.equal(p.formatPart({totalStock:3,reorderPoint:3}).stockStatus,'low');
});
test('mini low-stock page can return to all stock without discarding location filters',()=>{
 const p=definition('index');p.data.lowStockOnly=true;p.data.appliedArea='五粮货区';let refreshed=false;p.refreshParts=()=>refreshed=true;p.showAllStock();
 assert.equal(p.data.lowStockOnly,false);assert.equal(p.buildParams(1).lowStock,undefined);assert.equal(p.buildParams(1).warehouseAreaName,'五粮货区');assert.equal(refreshed,true);
});
test('mini inventory ignores late search responses and lets retry recover a failed page',async()=>{
 const requests=[];const p=definition('index',{getParts:()=>new Promise(resolve=>requests.push(resolve))});
 const first=p.loadParts({page:1});p.data.searchKeyword='新搜索';const second=p.loadParts({page:1});
 requests[1]({success:true,total:1,data:[{_id:2,name:'新搜索结果'}]});await second;
 requests[0]({success:true,total:1,data:[{_id:1,name:'旧结果'}]});await first;
 assert.equal(p.data.filteredParts[0]._id,2);assert.equal(p.data.isLoading,false);
});
