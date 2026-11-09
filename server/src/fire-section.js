const F=require('./fire-inspection');
// SQL identifiers below are internal constants, never request input. Old records
// without the new field use the current point classification without rewriting evidence.
function sectionExpression(pointId,snapshot){
 const current=`(SELECT section_name FROM fire_points WHERE id=${pointId})`;
 return snapshot?`COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${snapshot},'$.sectionName')),'null'),''),${current},'')`:`COALESCE(${current},'')`;
}
function filterSection(query,conditions,args,pointId,snapshot){
 if(query.sectionName){conditions.push(`${sectionExpression(pointId,snapshot)}=?`);args.push(F.text(query.sectionName,100));}
}
module.exports={sectionExpression,filterSection};
