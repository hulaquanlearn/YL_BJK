// Neutral inspection studio. Stage decoration must not tint the part's material.
export const showroomPalette = Object.freeze({
  background: '#e8eef4', fog: 0xe6edf3,
  outline: '#2f5972', hiddenOutline: '#6d8498',
  deck: 0xd2dde6, edge: 0x8fa6b8, base: 0xb9c7d4, floor: 0xe9eff4
})

export function createShowroomBackground(THREE) {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, '#f4f8fb')
  gradient.addColorStop(.58, showroomPalette.background)
  gradient.addColorStop(1, '#dbe5ee')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createShowroom(THREE) {
  const group = new THREE.Group()
  group.name = 'industrial-showroom'
  const material = (color, metalness = .12) => new THREE.MeshStandardMaterial({color, roughness: .72, metalness})
  const floor = material(showroomPalette.floor, 0)
  const deck = material(showroomPalette.deck)
  const edge = material(showroomPalette.edge, .28)
  const base = material(showroomPalette.base)
  const add = (geometry, mat, y) => {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.y = y; mesh.receiveShadow = true; group.add(mesh)
    return mesh
  }
  add(new THREE.BoxGeometry(44, .06, 44), floor, -2.99)
  // The upper face stays at -2.60, matching normalizeShowroomModel's contact plane.
  add(new THREE.CylinderGeometry(3.22, 3.27, .10, 96), base, -2.91)
  add(new THREE.CylinderGeometry(3.16, 3.22, .12, 96), edge, -2.80)
  add(new THREE.CylinderGeometry(3.16, 3.16, .14, 96), deck, -2.67)
  const vertices = []
  for (let i = 0; i < 128; i++) {
    const a = i * Math.PI / 64, b = (i + 1) * Math.PI / 64
    vertices.push(Math.cos(a)*3.05, -2.599, Math.sin(a)*3.05, Math.cos(b)*3.05, -2.599, Math.sin(b)*3.05)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0x8299ac, transparent: true, opacity: .45})))
  // No colored point lights, additive glow or emissive bands: keep attention on the part.
  group.userData.kind = 'procedural-industrial-stage'
  group.userData.presentation = 'light-steel-blue'
  group.userData.contactY = -2.60
  return group
}
