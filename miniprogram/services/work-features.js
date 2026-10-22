const definitions=[
 {id:'raw',title:'工段长履职考评',description:'每日记录、周材料与履职查看',symbol:'职',tone:'purple',group:'原粮车间',url:'/packages/work/pages/home/home'},
 {id:'attendance',title:'考勤核查',description:'排班、打卡与考勤核查',symbol:'勤',tone:'green',group:'原粮车间',path:'/attendance'},
 {id:'spare',title:'备件管理',description:'查备件、出入库与库存盘点',symbol:'件',tone:'red',group:'备件与库存',url:'/pages/home/home'}
];
function allowed(user,id){
 if(!user)return false;
 if(id==='spare')return true;
 if(require('./auth').isRawEmployee(user))return false;
 if(id==='raw')return ['admin','raw_grain'].includes(user.role)||user.role==='viewer'&&user.staffWorkshopCode==='raw_grain'&&user.staffPosition==='shift_leader';
 if(id==='attendance')return ['admin','raw_grain'].includes(user.role)||user.role==='viewer'&&user.staffWorkshopCode==='raw_grain'&&user.staffPosition==='shift_leader';
 return false;
}
function features(user){return definitions.filter(f=>allowed(user,f.id)).map(f=>({...f}))}
function feature(user,id){
 if(id==='warehouse3d'&&allowed(user,'spare'))return {id,title:'3D 库位',path:'/warehouse-3d'};
 return features(user).find(f=>f.id===id);
}
module.exports={features,feature,allowed};
