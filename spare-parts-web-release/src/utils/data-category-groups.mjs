const definitions=[
 {id:'spare',title:'备件管理',categories:['inventory_records','inventory_orders','images','models','model_reviews']},
 {id:'fire',title:'消防点检',categories:['fire_records','fire_photos','fire_imports']},
 {id:'duties',title:'履职管理',categories:['raw_duty_records','raw_duty_photo']},
 {id:'knowledge',title:'工程知识',categories:['knowledge']},
 {id:'robot',title:'机器人助手',categories:['robot','robot_archives']},
 {id:'system',title:'系统管理',categories:['accounts','ai_logs','database']}
]
export function groupDataCategories(categories){
 const byId=new Map(categories.map(item=>[item.id,item])),known=new Set(definitions.flatMap(group=>group.categories))
 return definitions.map(group=>({...group,items:[...group.categories.map(id=>byId.get(id)).filter(Boolean),...(group.id==='system'?categories.filter(item=>!known.has(item.id)):[])]})).filter(group=>group.items.length)
}
