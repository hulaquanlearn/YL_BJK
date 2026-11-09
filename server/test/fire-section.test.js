const test=require('node:test'),assert=require('node:assert/strict'),Excel=require('exceljs');
const F=require('../src/fire-inspection'),S=require('../src/fire-store'),Q=require('../src/fire-query');
const {parseFireWorkbook}=require('../src/fire-import');
test('new ledger reads the separate section column without shifting location or inventing a header warning',async()=>{
 const w=new Excel.Workbook(),e=w.addWorksheet('灭火器'),h=w.addWorksheet('消火栓');
 e.addRow(['序号','中心','部门','工段','位置','编号','型号','数量','出厂日期','生产厂家','备注']);
 e.addRow([1,'中心','原粮','五粮工段','筒仓G12','1008','4公斤干粉',1,new Date('2024-03-01'),'厂家','']);
 h.addRow(['序号','中心','部门','工段','位置','编号','数量','备注']);h.addRow([1,'中心','二车间','输送工段','A1北侧','x364',1,'']);
 const p=await parseFireWorkbook(Buffer.from(await w.xlsx.writeBuffer()));
 assert.deepEqual(p.rows.map(r=>[r.sectionName,r.area,r.location,r.code]),[['五粮工段','原粮','筒仓G12','1008'],['输送工段','二车间','A1北侧','x364']]);
 assert.equal(p.warnings.filter(w=>w.code==='location_header').length,0);assert.equal(p.rows[0].source.sectionName,'五粮工段');
});
test('section is independent from permission area and remains present in point snapshots',()=>{
 const p=F.normalizePoint({areaId:2,sectionName:' 输送工段 ',code:'P1',name:'北门',assets:[{type:'hydrant',quantity:1}]});
 assert.equal(p.sectionName,'输送工段');assert.equal(p.areaId,2);assert.throws(()=>F.normalizePoint({...p,sectionName:'段'.repeat(101)}),/100字/);
 assert.equal(F.pointRow({id:4,area_id:2,section_name:'输送工段'}).sectionName,'输送工段');
});
test('cycle lists filter section before counting progress and enrich old snapshots without rewriting them',async()=>{
 const source={id:4,areaId:2,assets:[{id:7,quantity:1,status:'active'}]},original=JSON.stringify(source),calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM fire_cycles'))return [[{id:3,name:'本期'}]];if(sql.startsWith('SELECT cp.*,r.id'))return [[{snapshot_json:source,current_section_name:'五粮工段'},{snapshot_json:{...source,id:5},current_section_name:'输送工段'}]];throw Error(sql)}};
 const result=await S.points(db,{canManage:false,areaIds:[2]},{cycleId:3,sectionName:'输送工段'});
 assert.equal(result.items.length,1);assert.equal(result.items[0].id,5);assert.equal(result.stats.total,1);assert.equal(result.items[0].sectionName,'输送工段');assert.equal(JSON.stringify(source),original);
 assert.match(calls[1].sql,/cp.area_id IN \(\?\)/);assert.deepEqual(calls[1].args,[2,3,2]);
});
test('record/issue section filter is parameterized, keeps area authorization, and falls back for old evidence',()=>{
 const args=[],where=Q.recordFilters({canManage:false,areaIds:[2]},{sectionName:"输送' OR 1=1 --"},'r',args).join(' AND ');
 assert.deepEqual(args,[2,"输送' OR 1=1 --"]);assert.match(where,/r.area_id IN \(\?\)/);assert.match(where,/JSON_EXTRACT\(r.point_snapshot,'\$.sectionName'\)/);assert.match(where,/SELECT section_name FROM fire_points WHERE id=r.point_id/);assert.ok(!where.includes("OR 1=1"));
 assert.throws(()=>Q.recordFilters({canManage:false,areaIds:[2]},{areaId:9,sectionName:'输送工段'},'r',[]),/权限/);
});
test('reconciliation matches source identity, preserves permissions and is idempotent even after JSON key reordering',()=>{
 const {planFireSections}=require('../src/fire-ledger-sections'),{warnExistingAssets}=require('../src/fire-import');
 const row={sheet:'灭火器',row:2,type:'extinguisher',code:'E1',sourceKey:'new-source',sectionName:'五粮工段',location:'北门',area:'上级部门'},parsed={fileHash:'new-hash',rows:[row]};
 const points=[{id:4,area_id:2,area_name:'原授权区域',location:'北门',name:'北门'}],assets=[{id:7,point_id:4,type:'extinguisher',code:'E1',source_json:{sheet:'灭火器',row:2,fileHash:'old-hash'}}];
 const first=planFireSections(parsed,points,assets);assert.equal(first.errors.length,0);assert.equal(first.pointsChanged,1);assert.equal(first.departmentDifferences,1);assert.equal(first.updates[0].areaId,undefined);assert.equal(first.updates[0].source.fileHash,'old-hash');
 const source=first.updates[0].source;source.latestClassification=Object.fromEntries(Object.entries(source.latestClassification).reverse());
 const second=planFireSections(parsed,[{...points[0],section_name:'五粮工段'}],[{...assets[0],source_json:source}]);assert.equal(second.pointsChanged,0);assert.equal(second.assetsChanged,0);
 const preview={rows:[{...row,warnings:[]}],warnings:[],counts:{}};warnExistingAssets(preview,[{...assets[0],source_key:'old-source',source_json:source}]);assert.equal(preview.rows[0].alreadyImported,true);assert.equal(preview.warnings.length,0);
 assert.ok(planFireSections(parsed,points,[...assets,{...assets[0],id:8}]).errors.length,'ambiguous duplicated source is rejected');
});
