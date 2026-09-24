const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const I = require('../src/inspection-notice');
const { exportNotice } = require('../src/inspection-export');
const V=require('../src/inspection-vision');

const raw = (problem, sourceIds, photos=[]) => ({
  problem, sourceIds, photos, segment: '五粮破碎工段',
  categorySuggestion: '现场管理', rectificationSuggestion: '及时处理'
});

test('interleaved people and cross-screenshot photos stay reviewable', () => {
  const result = I.parseAi(JSON.stringify({issues:[
    {...raw('三楼振动循环风旁标识牌脱落', [2,4], [{sourceId:4,rect:{x:.1,y:.1,w:.5,h:.5}}]), pairingReason:'设备编号、位置与引用回复一致'},
    {...raw('', [3], [{sourceId:3,rect:{x:.2,y:.2,w:.4,h:.3}}]), missingInfo:'仅有现场照片，没有问题说明'}
  ]}), [2,3,4], [], new Set([1,2,3,4]));
  assert.equal(result.length,2);
  assert.deepEqual(result[0].sourceIds,[2,4]);
  assert.equal(result[0].photos[0].sourceId,4);
  assert.equal(result[0].reviewStatus,'pending');
  assert.equal(result[0].category,'现场管理');
  assert.equal(result[1].problem,'');
  assert.match(result[1].missingInfo,/没有问题说明/);
  assert.equal(result[1].origin,'ai');
  assert.throws(()=>I.parseAi(JSON.stringify({issues:[raw('伪造', [5])]}),[2],[],new Set([2,5])),{status:502});
  const contextOnly=I.parseAi(JSON.stringify({issues:[raw('已处理的旧问题', [1])]}),[1,2],[],new Set([1,2]),[2]);
  assert.equal(contextOnly.length,0,'previously processed context must not append the old issue again');
});

test('overlapping screenshot text is flagged but never dropped; manual edits remain', () => {
  const existing=I.issue({id:'kept',problem:'五粮破碎四楼集气室内地面过脏，已由人工改字',reviewStatus:'confirmed',sourceIds:[1]},new Set([1]));
  const candidate=I.parseAi(JSON.stringify({issues:[raw('五粮破碎四楼集气室内地面过脏，已由人工改字',[2])]}),[2],[existing],new Set([1,2]));
  assert.equal(candidate.length,1);
  assert.match(candidate[0].duplicateHint,/请核对/);
  assert.equal(existing.problem,'五粮破碎四楼集气室内地面过脏，已由人工改字');
  assert.equal(existing.reviewStatus,'confirmed');
});

test('confirmed content is version-bound and AI cannot write human-only remarks',()=>{
  const sources=new Set([1]);
  const confirmed=I.issue({id:'one',problem:'现场门松动',remarks:'人工备注',sourceIds:[1],reviewStatus:'confirmed',confirmToken:'token-1'},sources);
  const edited=I.issues([{...confirmed,problem:'门已松动'}],sources,[confirmed]);
  assert.equal(edited[0].reviewStatus,'pending');
  const reconfirmed=I.issues([{...confirmed,problem:'门已松动',confirmToken:'token-2'}],sources,[confirmed]);
  assert.equal(reconfirmed[0].reviewStatus,'confirmed');
  const ai=I.parseAi(JSON.stringify({issues:[{...raw('现场漏水',[1]),remarks:'扣1分，整改已完成'}]}),[1],[],sources);
  assert.equal(ai[0].remarks,'');
  assert.equal(ai[0].reviewStatus,'pending');
});

test('AI-generated issues obey the same row and byte limits as manual saves',()=>{
  const source=new Set([1]);
  const rows=Array.from({length:200},(_,index)=>I.issue({id:`row-${index}`,problem:'现场问题',sourceIds:[1]},source));
  assert.equal(I.issues(rows,source).length,200);
  assert.throws(()=>I.issues([...rows,I.issue({id:'extra',problem:'多出一项'},source)],source),/条数超出上限/);
  const oversized=rows.map((row,index)=>({...row,problem:`${index}：`+'说明'.repeat(990),rawText:'原话'.repeat(990),rectification:'检查'.repeat(990)}));
  assert.throws(()=>I.issues(oversized,source),/3MB上限/);
});

test('long screenshot tiles retain overlap and map crop to original height',async()=>{
  const image=await sharp({create:{width:600,height:7000,channels:3,background:'#fff'}}).png().toBuffer();
  const tiles=await V.tilesForSource(7,image);
  assert.ok(tiles.length>=4);
  assert.ok(tiles[1].top<tiles[0].top+tiles[0].height);
  assert.equal(tiles.at(-1).top+tiles.at(-1).height,7000);
  const mapped=V.mapTilePhoto({sourceId:7,tileId:tiles[1].tileId,rect:{x:.2,y:.4,w:.3,h:.2}},tiles);
  assert.equal(mapped.rect.x,.2);
  assert.ok(Math.abs(mapped.rect.y-(tiles[1].top+.4*tiles[1].height)/7000)<1e-9);
  assert.ok(Math.abs(mapped.rect.h-(.2*tiles[1].height/7000))<1e-9);
});

test('vision response reader rejects an oversized streamed body',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(V.MAX_RESPONSE_BYTES+1));controller.close()}});
  await assert.rejects(()=>V.readLimitedJson({headers:{get:()=>null},body:stream}),/响应过大/);
});

test('Excel has exact eight columns, preserved order, two matching photos and printable layout', async () => {
  const image=await sharp({create:{width:800,height:500,channels:3,background:'#258b76'}}).png().toBuffer();
  const notice={header:I.header({title:'酿造四部五区综合检查--周通报',checkTime:'2026年9月第三周',checkScope:'五区',inspectors:'张三',checkItems:'现场检查'}),issues:[
    I.issue({id:'one',segment:'五粮破碎工段',problem:'三楼3振动循环风旁边标识牌脱落',category:'现场管理',rectification:'及时恢复',reviewStatus:'confirmed',sourceIds:[1],photos:[{sourceId:1,rect:{x:0,y:0,w:.5,h:1}},{sourceId:1,rect:{x:.5,y:0,w:.5,h:1}}]},new Set([1])),
    I.issue({id:'two',segment:'破曲工段',problem:'三楼北楼梯间安全出口标志脱落',category:'现场管理',rectification:'立即固定',reviewStatus:'confirmed',sourceIds:[1]},new Set([1]))
  ]};
  const sources=[{id:1,image,width:800,height:500,reviewed:1}];
  const data=await exportNotice(notice,sources);
  const book=new ExcelJS.Workbook();await book.xlsx.load(data);const sheet=book.getWorksheet('检查通报');
  assert.equal(sheet.getCell('A1').value,notice.header.title);
  assert.deepEqual(sheet.getRow(6).values.slice(1),I.HEADERS);
  assert.equal(sheet.getCell('A7').value,1);
  assert.equal(sheet.getCell('A8').value,2);
  assert.match(sheet.getCell('E7').value,/标识牌脱落/);
  assert.match(sheet.getCell('E8').value,/安全出口标志脱落/);
  assert.equal(sheet.getCell('G7').value,'');
  assert.equal(sheet.getImages().length,2);
  for(const entry of sheet.getImages()){
    assert.ok(entry.range.tl.col>=2&&entry.range.br.col<=3,'image stays in problem-image column');
    assert.ok(entry.range.tl.row>=6&&entry.range.br.row<7,'image stays in first issue row');
    const media=book.getImage(entry.imageId);const dimensions=await sharp(media.buffer).metadata();
    assert.equal(dimensions.width,400);assert.equal(dimensions.height,500);
  }
  assert.equal(sheet.pageSetup.orientation,'landscape');
  assert.equal(sheet.pageSetup.fitToWidth,1);
  assert.equal(sheet.pageSetup.printArea,'A1:H8');
  await assert.rejects(()=>exportNotice({...notice,issues:[{...notice.issues[0],reviewStatus:'pending'}]},sources),{status:400});
});

test('long text continues into extra rows without losing the next issue number', async () => {
  const problem='现场情况说明'.repeat(220);
  const issue=I.issue({id:'long',segment:'输送工段',problem,reviewStatus:'confirmed'},new Set());
  const next=I.issue({id:'next',segment:'破曲工段',problem:'第二项',reviewStatus:'confirmed'},new Set());
  const data=await exportNotice({header:I.header({}),issues:[issue,next]},[]);
  const book=new ExcelJS.Workbook();await book.xlsx.load(data);const sheet=book.getWorksheet(1);
  const numberRows=[];for(let row=7;row<=sheet.rowCount;row++)if(typeof sheet.getCell(`A${row}`).value==='number')numberRows.push(row);
  assert.ok(numberRows[1]>numberRows[0]+1);
  assert.deepEqual(numberRows.map(row=>sheet.getCell(`A${row}`).value),[1,2]);
  assert.ok(sheet.getRow(7).height<=400);
});
