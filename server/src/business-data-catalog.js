'use strict';
// Fixed identifiers only. Read exact counts, never business rows, photos or credentials.
const GROUPS=[
 ['inventory_records','库存与出入库','inventory','/inventory',['parts','inventory','stock_movements']],
 ['inventory_orders','盘点单与明细','inventory_orders','/check',['inventory_orders','inventory_order_items']],
 ['raw_duty_records','履职记录与模板','raw_duty_reports','/raw-duties',['raw_duty_reports','raw_duty_events','raw_duty_templates','raw_duty_members']],
 ['fire_records','消防台账与点检','fire_assets','/fire-inspection',['fire_areas','fire_points','fire_assets','fire_cycles','fire_cycle_points','fire_records','fire_record_assets','fire_issues','fire_issue_events','fire_admin_events','fire_members']],
 ['fire_photos','消防照片','fire_photos','/fire-inspection',['fire_photos']],
 ['fire_imports','消防导入资料','fire_imports','/fire-inspection',['fire_imports']],
 ['model_reviews','模型核对记录','part_model_reviews','/model-library',['part_model_reviews']],
 ['accounts','账号与会话','app_users','/account?tab=users',['app_users','app_sessions']]
];
const NAMES={parts:'备件台账',inventory:'库存台账',stock_movements:'出入库流水',inventory_orders:'盘点单',inventory_order_items:'盘点明细',raw_duty_reports:'履职填报',raw_duty_events:'履职操作记录',raw_duty_templates:'履职模板',raw_duty_members:'履职人员分配',fire_areas:'消防区域',fire_points:'消防点位',fire_assets:'消防器材',fire_cycles:'点检月份',fire_cycle_points:'月份器材快照',fire_records:'点检记录',fire_record_assets:'检查项目明细',fire_issues:'消防异常',fire_issue_events:'异常处理记录',fire_admin_events:'消防管理记录',fire_members:'区域授权',fire_photos:'点检及整改照片',fire_imports:'导入原文件及核对预览',part_model_reviews:'模型核对及历史',app_users:'账号',app_sessions:'登录会话'};
async function businessCatalog(pool,metadata){
 const tables=new Map(metadata.map(t=>[t.name,t]));
 const names=[...new Set(GROUPS.flatMap(g=>g[4]))].filter(n=>tables.has(n));
 const counts=new Map(await Promise.all(names.map(async name=>{const[[row]]=await pool.query('SELECT COUNT(*) AS recordCount FROM `'+name+'`');return [name,Number(row.recordCount)];})));
 return GROUPS.map(([id,title,primary,link,group])=>{
  const items=group.filter(n=>tables.has(n)).map(name=>({id:name,title:NAMES[name],recordCount:counts.get(name),bytes:Number(tables.get(name).bytes),protected:true,link}));
  return {id,title,count:counts.get(primary)||0,unit:'条',bytes:items.reduce((sum,r)=>sum+r.bytes,0),storageKind:'database',description:'展示真实记录数及数据库分配空间。通过对应功能维护，历史、引用和授权数据受保护。',items};
 });
}
module.exports={businessCatalog,GROUPS};
