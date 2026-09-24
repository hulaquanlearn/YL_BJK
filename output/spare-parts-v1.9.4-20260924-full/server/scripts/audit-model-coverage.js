// Read-only current database audit. Run from server/ with its existing configuration.
const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
const config=require('../src/config');
const candidates=[path.resolve(__dirname,'../../web/dist'),path.resolve(__dirname,'../../spare-parts-web-release/public')];
const staticRoot=candidates.find(p=>fs.existsSync(path.join(p,'models')));
function localAsset(url){
  if(!url)return {available:false,reason:'未配置'};
  const mappings=[['/models/',staticRoot&&path.join(staticRoot,'models')],['/uploads/part-models/',config.parts.modelDir]];
  for(const [prefix,dir] of mappings){
    if(!url.startsWith(prefix))continue;
    if(!dir)return {available:null,reason:'未找到网页静态目录'};
    const target=path.resolve(dir,url.slice(prefix.length));
    if(!target.startsWith(path.resolve(dir)+path.sep))return {available:false,reason:'路径超出资源目录'};
    return {available:fs.existsSync(target),reason:fs.existsSync(target)?'文件存在':'模型文件缺失'};
  }
  return {available:null,reason:'需另外检查远程或自定义地址'};
}
(async()=>{
  let connection;
  try{
    connection=await mysql.createConnection({...config.mysql,connectTimeout:8000});
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.beginTransaction();
    const [rows]=await connection.query(`SELECT p.id,p.code,p.name,p.category_model_id AS categoryId,
      cm.name AS categoryName,cm.active AS categoryActive,cm.model_url AS categoryUrl,
      CASE WHEN NULLIF(p.model_url,'') IS NOT NULL THEN 1 ELSE 0 END AS legacyDedicated,
      GROUP_CONCAT(DISTINCT COALESCE(i.workshop_code,'raw_grain') ORDER BY i.workshop_code) AS workshops
      FROM parts p INNER JOIN inventory i ON i.part_id=p.id AND COALESCE(i.active,1)=1
      LEFT JOIN part_category_models cm ON cm.id=p.category_model_id
      WHERE COALESCE(p.active,1)=1
      GROUP BY p.id,p.code,p.name,p.category_model_id,cm.name,cm.active,cm.model_url,p.model_url ORDER BY p.code`);
    await connection.rollback();
    const details=rows.map(row=>({...row,asset:Number(row.categoryActive)===1?localAsset(row.categoryUrl):{available:false,reason:row.categoryId?'类别停用或不存在':'未关联类别'}}));
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),scope:'所有有有效库存记录的物料，按物料ID去重；文件存在不等于形状准确',total:details.length,categoryLinked:details.filter(r=>Number(r.categoryActive)===1&&r.categoryUrl).length,localFileAvailable:details.filter(r=>r.asset.available===true).length,unresolved:details.filter(r=>r.asset.available!==true),details},null,2));
  }catch(error){console.error('模型覆盖检查未完成：'+(error.code||error.name));process.exitCode=1;}
  finally{if(connection)await connection.end();}
})();
