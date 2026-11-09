const test=require('node:test');
const assert=require('node:assert/strict');
const Excel=require('exceljs');
const {parseFireWorkbook,warnExistingAssets,existingAssetFingerprint}=require('../src/fire-import');
test('fire multipart source filenames preserve Chinese without changing correctly decoded names',()=>{
 const {uploadFilename}=require('../src/fire-inspection'),name='智能园灭火器消防栓统计.xlsx';
 assert.equal(uploadFilename(Buffer.from(name,'utf8').toString('latin1')),name);assert.equal(uploadFilename(name),name);assert.equal(uploadFilename('source.xlsx'),'source.xlsx');
});
test('fire workbook preserves duplicate source rows, unknown quantities and original date precision',async()=>{
 const w=new Excel.Workbook(),e=w.addWorksheet('灭火器');e.addRow(['序号','中心','部门',2,'编号','新编号','型号','数量','出厂日期','生产厂家','备注']);
 e.addRow([1,'中心','一区','门口','E001','','4公斤干粉',1,new Date('2024-03-01T00:00:00Z'),'淮海','']);e.getCell('I2').numFmt='yyyy"年"m"月"';
 e.addRow([2,'中心','一区','门口','E001','','4公斤干粉',1,new Date('2024-03-02T00:00:00Z'),'淮海','']);
 e.addRow([3,'中心','一区','门外','','','4公斤干粉','','','','暂未配置']);
 const h=w.addWorksheet('消火栓');h.addRow(['序号','中心','部门','位置','编号','数量','备注']);h.addRow([{formula:'ROW()-1',result:1},'中心','二区','东门','H1','','数量现场核实']);
 const blank=w.addWorksheet('Sheet1');blank.addRow(['序号','单位','灭火器数量']);blank.addRow([1]);
 const buffer=Buffer.from(await w.xlsx.writeBuffer()),p=await parseFireWorkbook(buffer),again=await parseFireWorkbook(buffer);
 assert.equal(p.counts.rows,4);assert.equal(p.counts.points,4);assert.equal(p.counts.unknownQuantity,2);assert.equal(p.counts.unconfigured,1);assert.equal(p.rows[0].manufacturedDate,'2024-03');assert.equal(p.rows[0].manufacturer,'淮海');assert.equal(p.rows[0].source.row,2);assert.equal(p.rows[0].source.originalCode,'E001');
 assert.equal(p.warnings.filter(x=>x.code==='duplicate_code').length,2);assert.equal(p.warnings.filter(x=>x.code==='location_header').length,1);assert.equal(p.rows[2].quantity,null);assert.equal(p.rows[3].quantity,null);assert.notEqual(p.rows[0].sourceKey,p.rows[1].sourceKey);assert.notEqual(p.rows[0].pointCode,p.rows[1].pointCode);assert.equal(p.rows[0].sourceKey,again.rows[0].sourceKey);assert.equal(p.sheets[2].type,'ignored');
});
test('fire importer rejects unrelated files and invalid workbook bytes',async()=>{
 await assert.rejects(()=>parseFireWorkbook(Buffer.from('not xlsx')),/无法读取/);const w=new Excel.Workbook();w.addWorksheet('普通资产').addRow(['名称','数量']);await assert.rejects(()=>w.xlsx.writeBuffer().then(b=>parseFireWorkbook(Buffer.from(b))),/未找到/);
});
test('fire importer warns about an existing business code and distinguishes an identical source retry',()=>{
 const preview={rows:[{sheet:'灭火器',row:2,type:'extinguisher',code:'E1',sourceKey:'new',warnings:[]},{sheet:'灭火器',row:3,type:'extinguisher',code:'E2',sourceKey:'same',warnings:[]}],warnings:[],counts:{}};
 warnExistingAssets(preview,[{type:'extinguisher',code:'e1',source_key:'old'},{type:'extinguisher',code:'E2',source_key:'same'}]);assert.equal(preview.warnings.length,1);assert.equal(preview.warnings[0].code,'existing_code');assert.equal(preview.rows[1].alreadyImported,true);assert.equal(preview.counts.alreadyImported,1);
});
test('fire preview duplicate fingerprint detects committed same-code changes without treating the same source as a conflict',()=>{
 const p={rows:[{sourceKey:'source-1',type:'extinguisher',code:'E1'}]};assert.notEqual(existingAssetFingerprint(p,[]),existingAssetFingerprint(p,[{id:2,type:'extinguisher',code:'E1',source_key:'other-source'}]));assert.equal(existingAssetFingerprint(p,[]),existingAssetFingerprint(p,[{id:2,type:'extinguisher',code:'E1',source_key:'source-1'}]));
});

test('import warnings apply to selected rows and relevant sheet headers',()=>{const {selectedImportWarnings}=require('../src/fire-import');const p={rows:[{sourceKey:'safe',sheet:'灭火器',row:2},{sourceKey:'duplicate',sheet:'灭火器',row:3}],warnings:[{sheet:'灭火器',row:3,code:'duplicate_code'}]};assert.equal(selectedImportWarnings(p,new Set(['safe'])).length,0);assert.equal(selectedImportWarnings(p,new Set(['duplicate'])).length,1);p.warnings.push({sheet:'灭火器',row:1,code:'location_header'});assert.equal(selectedImportWarnings(p,new Set(['safe'])).length,1)})
