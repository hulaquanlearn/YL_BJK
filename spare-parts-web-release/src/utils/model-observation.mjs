import reviewedCatalog from './reviewed-model-catalog.json' with {type:'json'}
const reviewedByPath=new Map(reviewedCatalog.models.flatMap(m=>[m.url,...m.aliases||[]].map(url=>[url,m])))
export function modelReview(url){return reviewedByPath.get(String(url||'').split(/[?#]/)[0])||null}
// Reviewed mesh order for these bundled assets only. Other models stay whole.
// Do not infer internal part names from a catalog title or anonymous mesh index.
export function modelObservationParts(url, meshes) {
  const path = String(url || '').split(/[?#]/)[0]
  const reviewed=reviewedByPath.get(path)
  if(reviewed && ['rebuilt','annotated'].includes(reviewed.status) && reviewed.meshCount===meshes.length){
    const grouped=new Map()
    for(const mesh of meshes){const p=mesh.userData?.observation;if(p?.schema!==1||!p.id||!p.name||!p.description)return [];if(!grouped.has(p.id))grouped.set(p.id,{id:p.id,name:p.name,description:p.description,objects:[]});grouped.get(p.id).objects.push(mesh)}
    return [...grouped.values()]
  }
  let definitions = []
  if (path === '/models/supplement-20261009/spherical-roller-bearing-22212e.glb' && meshes.length === 40) {
    definitions = [
      ['outer', '外圈', [0], '外圈与座孔配合，通过滚道承受滚动体传递的载荷。'], ['inner', '内圈', [1], '内圈与轴配合，与滚动体共同形成滚动接触。'],
      ['rollers', '滚子', [...Array.from({ length: 18 }, (_, i) => i + 3), ...Array.from({ length: 18 }, (_, i) => i + 22)], '两列滚子位于内外圈之间，通过滚动接触传递载荷。'],
      ['cage', '保持架', [2, 21], '保持架分隔并引导滚子，维持滚动体之间的间距。']
    ]
  } else if ((path === '/models/supplement-20261009/oil-seal-90-110-12.glb' || path === '/models/supplement-20261009/oil-seal-60-80-5-5.glb') && meshes.length === 3) {
    definitions = [['body', '密封环体', [0], '环体安装在座孔内，支承密封结构。'], ['lip', '唇口示意', [1], '唇口贴合轴表面，减少润滑介质泄漏及外部杂质进入。'], ['spring', '弹簧示意', [2], '弹簧为密封唇提供径向紧固力。']]

  }
  return definitions.map(([id, name, indices,description]) => ({ id, name, description, objects: indices.map(i => meshes[i]) }))
}

export function normalizeShowroomModel(THREE, object, rotation = 0, floorY = -2.60) {
  const wrapper = new THREE.Group()
  wrapper.rotation.y = Number(rotation) || 0
  wrapper.add(object)
  wrapper.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(wrapper)
  const size = box.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z)
  if (![size.x, size.y, size.z].every(Number.isFinite) || !Number.isFinite(extent) || extent <= 0) throw new Error('模型没有有效几何尺寸')
  const scale = 4.2 / extent
  wrapper.scale.setScalar(scale)
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale)
  wrapper.position.copy(center).multiplyScalar(-1)
  wrapper.position.y = floorY === null ? .15-center.y : floorY-box.min.y*scale
  wrapper.updateMatrixWorld(true)
  return wrapper
}
