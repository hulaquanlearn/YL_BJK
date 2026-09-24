#!/usr/bin/env node
'use strict';
// Offline package migration. No writes to DB unless --apply --plan is supplied.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {keys,base,planAssociations,planDigest,referenceCategory} = require('../src/reference-model-association');
const args=process.argv.slice(2);
function value(flag,fallback){const i=args.indexOf(flag);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`${flag} 缺少参数`);return args[i+1]}
async function readManifest(dir){
  const m=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  if(m.version!=='20260904'||m.models?.length!==7||new Set(m.models.map(e=>e.key)).size!==7)throw new Error('模型清单版本或数量无效');
  for(const e of m.models){
    if(!keys.includes(e.key)||e.model!==`${e.key}.glb`||e.image!==`${e.key}.png`)throw new Error('模型清单文件名无效');
    for(const [file,expected] of [[e.model,e.modelSha256],[e.image,e.imageSha256]]){
      const bytes=await fs.readFile(path.join(dir,file));
      if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error(`资源校验失败：${file}`);
    }
  }
  return m;
}
function csv(rows){const q=s=>{let text=String(s??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};return '\uFEFF'+[['备件ID','物料编码','名称','匹配类别','关联类别资源','图片来源','说明'],...rows.map(r=>[r.id,r.code,r.name,r.key||'',r.bindModel?'是':'否',r.inheritCategoryImage?'类别参考图（不复制）':'备件实物图优先',r.reason])].map(r=>r.map(q).join(',')).join('\r\n')}
async function main(){
  const apply=args.includes('--apply');
  for(let i=0;i<args.length;i++){if(args[i]==='--apply')continue;if(['--assets-dir','--plan'].includes(args[i])){i++;continue}throw new Error(`未知参数：${args[i]}`)}
  const dir=path.resolve(value('--assets-dir',path.join(__dirname,'../../web-dist/models/reference-20260904')));
  const planFile=path.resolve(value('--plan','reference-model-plan.json'));
  if(apply&&!args.includes('--plan'))throw new Error('执行必须显式指定已核对的 --plan 文件');
  const manifest=await readManifest(dir);
  const manifestDigest=planDigest(manifest);
  const approved=apply?JSON.parse(await fs.readFile(planFile,'utf8')):null;
  const {pool}=require('../src/db');
  let conn;
  try{
    conn=await pool.getConnection();await conn.beginTransaction();
    const [categories]=await conn.query('SELECT id,name,model_url,image_url,front_rotation_y,built_in,active FROM part_category_models ORDER BY id FOR UPDATE');
    const [parts]=await conn.query('SELECT id,code,name,spec,model_url,image_url,category_model_id FROM parts WHERE active=1 ORDER BY id FOR UPDATE');
    const rows=planAssociations(parts,categories,manifest),digest=planDigest(rows);
    const report={version:'20260904',createdAt:new Date().toISOString(),manifestDigest,digest,summary:{total:rows.length,categoryLinks:rows.filter(r=>r.bindModel).length,inheritedImages:rows.filter(r=>r.inheritCategoryImage).length,unmatched:rows.filter(r=>!r.key).length},rows};
    if(!apply){
      await conn.rollback();
      await fs.writeFile(planFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      await fs.writeFile(planFile+'.csv',csv(rows),{flag:'wx'});
      console.log(JSON.stringify({mode:'dry-run',...report.summary,plan:planFile,review:planFile+'.csv'},null,2));return;
    }
    if(approved.version!=='20260904'||approved.manifestDigest!==manifestDigest||approved.digest!==digest||planDigest(approved.rows)!==digest)throw new Error('资料或数据库已变化，或计划被修改；请重新生成计划并核对，未执行任何关联');
    const ids=new Map();
    for(const e of manifest.models){
      const name=`${e.name} · 参考图20260904`,existing=referenceCategory(categories,e)||categories.find(c=>c.name===name);
      const imageUrl=base+e.image,frontRotationY=Number(e.frontRotationY)||0;
      if(existing){
        if(existing.model_url!==base+e.model||!existing.built_in||!existing.active)throw new Error(`已有类别冲突：${name}`);
        await conn.query('UPDATE part_category_models SET image_url=COALESCE(NULLIF(image_url,\'\'),?) WHERE id=?',[imageUrl,existing.id]);
        ids.set(e.key,existing.id);continue
      }
      const [result]=await conn.query('INSERT INTO part_category_models (name,keywords,description,model_url,image_url,model_scale,front_rotation_y,built_in,active) VALUES (?,?,?,?,?,1,?,1,1)',[name,'', '依据用户照片制作的类别示意模型，非精密CAD；原图仅供类别识别。',base+e.model,imageUrl,frontRotationY]);ids.set(e.key,result.insertId);
    }
    for(const r of rows){
      if(r.bindModel)await conn.query('UPDATE parts SET category_model_id=? WHERE id=?',[ids.get(r.key),r.id]);
    }
    // Store before-images before COMMIT; a write failure must roll back DB work.
    const receipt=planFile+`.applied-${Date.now()}.json`;
    await fs.writeFile(receipt,JSON.stringify({...report,status:'prepared',note:'提交结果以终端成功消息为准；此文件保留变更前数据'},null,2)+'\n',{flag:'wx'});
    await conn.commit();console.log(JSON.stringify({mode:'applied',...report.summary,receipt},null,2));
  }catch(e){if(conn)await conn.rollback();throw e}finally{conn?.release();await pool.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
