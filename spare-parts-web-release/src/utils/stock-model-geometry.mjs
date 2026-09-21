import { Mesh, InstancedMesh } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Inventory colors are uniform per stock state, so one static geometry can be
// reused by every occurrence of a category instead of cloning CAD mesh trees.
export function flattenStockModel(template) {
  template.updateMatrixWorld(true)
  const geometries=[]
  template.traverseVisible(node=>{
    if (!node.isMesh || node.isLine || node.isPoints) return
    const source=node.geometry
    const geometry=source.index ? source.toNonIndexed() : source.clone()
    geometry.applyMatrix4(node.matrixWorld)
    for(const key of Object.keys(geometry.attributes)) if(!['position','normal'].includes(key)) geometry.deleteAttribute(key)
    geometry.morphAttributes={}
    if(!geometry.attributes.normal) geometry.computeVertexNormals()
    geometry.clearGroups()
    geometries.push(geometry)
  })
  if(!geometries.length) throw new Error('模型没有可显示的实体')
  const merged=mergeGeometries(geometries,false)
  geometries.forEach(g=>g.dispose())
  if(!merged) throw new Error('模型几何无法合并')
  merged.computeBoundingBox()
  return merged
}

export function instanceStockModels(root) {
  root.updateMatrixWorld(true)
  const groups=new Map()
  root.traverse(node=>{
    if(!(node instanceof Mesh)||node.isInstancedMesh||!node.userData.sharedStockModel) return
    const key=node.geometry.uuid+':'+node.material.uuid
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(node)
  })
  for(const nodes of groups.values()){
    if(nodes.length<2)continue
    const mesh=new InstancedMesh(nodes[0].geometry,nodes[0].material,nodes.length)
    mesh.userData.sharedStockModel=true
    nodes.forEach((node,index)=>{
      const matrix=root.matrixWorld.clone().invert().multiply(node.matrixWorld)
      mesh.setMatrixAt(index,matrix)
      node.parent.remove(node)
    })
    mesh.instanceMatrix.needsUpdate=true
    mesh.computeBoundingSphere()
    root.add(mesh)
  }
}
