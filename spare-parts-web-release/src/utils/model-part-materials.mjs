// Share equivalent source materials inside one selectable part. A different
// part gets its own pool so highlighting it never recolours its neighbours.
export function createPartMaterialPool(){
 const copies=new Map()
 return original=>{
  if(Array.isArray(original))return original.map(material=>copy(material))
  return copy(original)
 }
 function copy(material){if(!copies.has(material))copies.set(material,material.clone());return copies.get(material)}
}
