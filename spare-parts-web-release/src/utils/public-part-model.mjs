import * as THREE from 'three'
export const PUBLIC_PART_MODEL = 'builtin:public-part'
export function createPublicPartModel() {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(.8, .6, .65), new THREE.MeshStandardMaterial({ color: 0x9aaec4, roughness: .65 }))
  body.position.y = .3
  group.add(body)
  const band = new THREE.Mesh(new THREE.BoxGeometry(.82, .07, .67), new THREE.MeshStandardMaterial({ color: 0x4d6887, roughness: .6 }))
  band.position.y = .4
  group.add(band)
  return group
}
export function displayedPartModel(part) {
  return part?.categoryModelUrl || (part?.categoryModelId || part?.categoryModelName ? '' : PUBLIC_PART_MODEL)
}
