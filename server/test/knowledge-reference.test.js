const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {referenceMetadata,referenceSearchText,metadataWithFileHash}=require('../src/knowledge-reference');
const {knowledgePayload}=require('../src/knowledge-utils');

test('reference metadata keeps classification, provenance and unresolved boundaries distinct',()=>{
 const meta=referenceMetadata(JSON.stringify({family:'气动元件',documentKind:'尺寸图',manufacturer:'AirTAC',models:['SC40','SC40','SAI100'],sourceUrl:'https://www.airtac.com/manual.pdf',verification:'partial',verifiedScope:'PDF第3页外形尺寸',limitations:'安装附件与内部密封未核实'}),{strict:true});
 assert.deepEqual(meta.models,['SC40','SAI100']);
 assert.equal(meta.verification,'partial');
 assert.match(referenceSearchText(meta),/已核实范围：PDF第3页/);
 assert.match(referenceSearchText(meta),/未核实或冲突：安装附件/);
 assert.equal(knowledgePayload({category:'备件资料',referenceMetadata:JSON.stringify(meta)}).referenceMetadata.manufacturer,'AirTAC');
 assert.equal(knowledgePayload({category:'设备资料',referenceMetadata:JSON.stringify(meta)}).referenceMetadata,null);
});

test('source URLs reject executable schemes and embedded credentials',()=>{
 for(const sourceUrl of ['javascript:alert(1)','file:///etc/passwd','https://key:secret@example.com/a.pdf']){
  assert.throws(()=>referenceMetadata({sourceUrl},{strict:true}),/来源地址/);
  assert.equal(referenceMetadata({sourceUrl}),null);
 }
 assert.throws(()=>referenceMetadata('{broken',{strict:true}),/格式无效/);
});

test('document hash comes from uploaded bytes and is retained during metadata-only revisions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-reference-'));
 try{
  const file=path.join(dir,'sample.pdf'),bytes=Buffer.from('%PDF-fixture-byte-content');await fs.writeFile(file,bytes);
  const meta=referenceMetadata({fileSha256:'f'.repeat(64)});
  const saved=JSON.parse(await metadataWithFileHash(meta,file));
  assert.equal(saved.fileSha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  const edited=JSON.parse(await metadataWithFileHash({...meta,manufacturer:'updated'},null,saved));
  assert.equal(edited.fileSha256,saved.fileSha256);
  assert.equal(edited.manufacturer,'updated');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
