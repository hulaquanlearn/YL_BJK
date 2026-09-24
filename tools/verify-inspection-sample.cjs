// Local sample verification only: human-mapped six items, not an AI recognition result.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const ExcelJS=require('../server/node_modules/exceljs');
const sharp=require('../server/node_modules/sharp');
const I=require('../server/src/inspection-notice');
const {exportNotice}=require('../server/src/inspection-export');
const reference=process.env.INSPECTION_REFERENCE_XLSX,imagePath=process.env.INSPECTION_SAMPLE_IMAGE;
if(!reference||!imagePath)throw Error('Set INSPECTION_REFERENCE_XLSX and INSPECTION_SAMPLE_IMAGE');
(async()=>{
  const book=new ExcelJS.Workbook();await book.xlsx.readFile(reference);const sheet=book.worksheets[0];
  assert.deepEqual(sheet.getRow(6).values.slice(1),I.HEADERS);
  const image=await fs.readFile(imagePath),meta=await sharp(image).metadata();
  assert.equal(meta.width,862);assert.equal(meta.height,2802);
  const photoY=[[216,455],[639,879],[1062,1303],[1485,1724],[1910,2148],[2332,2572]];
  const issues=photoY.map(([y1,y2],index)=>{
    const sourceRow=sheet.getRow(17+index);
    assert.equal(sourceRow.getCell(1).value,index+11);
    const problem=String(sourceRow.getCell(5).value||'');
    return I.issue({id:`sample-${index+1}`,segment:sourceRow.getCell(2).value,problem,category:sourceRow.getCell(4).value,rectification:sourceRow.getCell(6).value,remarks:'',reviewStatus:'confirmed',sourceIds:[1],photos:[{sourceId:1,rect:{x:114/862,y:y1/2802,w:317/862,h:(y2-y1)/2802}}]},new Set([1]));
  });
  const notice={header:I.header({title:String(sheet.getCell('A1').value||''),checkTime:'第三周',checkScope:'五区',inspectors:'样例人工核对',checkItems:'综合检查'}),issues};
  const output=await exportNotice(notice,[{id:1,image,width:862,height:2802,reviewed:1}]);
  const target=path.resolve(__dirname,'../.local/inspection-qa/reference-six.xlsx');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,output);
  const verification=new ExcelJS.Workbook();await verification.xlsx.load(output);const result=verification.worksheets[0];
  assert.equal(result.getImages().length,6);
  for(let index=0;index<6;index++){
    const row=7+index;assert.equal(result.getCell(`A${row}`).value,index+1);
    assert.equal(result.getCell(`E${row}`).value,issues[index].problem);
    assert.equal(result.getCell(`H${row}`).value,'');
    const anchored=result.getImages().filter(item=>Math.floor(item.range.tl.row)===row-1);
    assert.equal(anchored.length,1,`photo for issue ${index+11}`);
    assert.ok(anchored[0].range.br.col<=3);
    const imageData=verification.getImage(anchored[0].imageId);
    const cropped=await sharp(imageData.buffer).metadata();
    assert.equal(cropped.width,317);assert.ok(cropped.height>=238&&cropped.height<=241);
  }
  assert.equal(result.pageSetup.orientation,'landscape');assert.equal(result.pageSetup.printArea,'A1:H12');
  console.log(JSON.stringify({kind:'human-mapped sample',sourceItems:'11-16',output:target,images:6,columns:I.HEADERS,printArea:result.pageSetup.printArea}));
})().catch(error=>{console.error(error);process.exitCode=1});
