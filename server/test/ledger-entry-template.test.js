const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {makePartsTemplate,makeModelBindingsTemplate}=require('../src/import-workbook');
test('each workshop template includes all applicable create fields and a model-name column',async()=>{
  for(const code of ['raw_grain','qu_making','brewing']) {
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await makePartsTemplate(code));
    const columns=wb.worksheets[0].getRow(1).values.slice(1);
    for(const field of ['物料编码','物料名称','单位','规格型号','备件类型','库存量','订购点','最高储备','不含税单价','用途','备注','存放位置','模型名称']) assert.ok(columns.includes(field),code+':'+field);
    if(code!=='qu_making') for(const field of ['货区','六位库位码'])assert.ok(columns.includes(field),code+':'+field);
  }
});
test('binding-only template is empty, with the exact two import headers and copyable live model names',async()=>{
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await makeModelBindingsTemplate([{id:2,name:'交流接触器'}]));
  assert.deepEqual(wb.worksheets[0].getRow(1).values.slice(1),['物料编码','模型名称']);
  assert.equal(wb.worksheets[0].rowCount,1);
  assert.equal(wb.getWorksheet('可用模型').getCell('B2').value,'交流接触器');
});
