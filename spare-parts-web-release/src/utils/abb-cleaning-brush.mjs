import {BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D} from 'three'

// Photo proportions fitted to the CAD frame. The assembly's +Y points down
// from the flange and its Z axis runs across the belt.
const mounts = {
  'tool-640': {x: -.315, frameY: .835, railY: .897},
  'tool-700': {x: -.100, frameY: .760, railY: .865}
}

export function createCleaningBrush(toolType) {
  const {x, frameY, railY} = mounts[toolType]
  const brush = new Group()
  brush.name = '布料斗底部清扫毛刷'
  brush.position.set(x, railY, 0)

  const steel = new MeshStandardMaterial({color: '#9b8a73', metalness: .5, roughness: .62})
  const bristles = new MeshStandardMaterial({color: '#ddd1b6', roughness: .95})
  const railDepth = .018
  const railLength = .704
  const brushLength = .552
  const bristleLength = .061

  function box(name, dimensions, position) {
    const mesh = new Mesh(new BoxGeometry(...dimensions), steel)
    mesh.name = name
    mesh.position.set(...position)
    brush.add(mesh)
  }

  box('条刷金属底座', [.024, railDepth, railLength], [0, 0, 0])
  for (const side of [-1, 1]) {
    const offset = side * .340
    const mountHeight = railY - frameY
    box('斗底安装耳', [.022, mountHeight, .026], [0, -mountHeight / 2, offset])
    box('刷座端部折边', [.024, .028, .006], [0, -.009, side * (railLength / 2 - .003)])
  }

  const fasteners = new InstancedMesh(new CylinderGeometry(.0035, .0035, .003, 6), steel, 7)
  fasteners.name = '刷座紧固件'
  const transform = new Object3D()
  for (let i = 0; i < fasteners.count; i++) {
    transform.position.set(.013, 0, (i - 3) * .090)
    transform.rotation.z = Math.PI / 2
    transform.updateMatrix()
    fasteners.setMatrixAt(i, transform.matrix)
  }
  brush.add(fasteners)

  const columns = 220
  const fibres = new InstancedMesh(new CylinderGeometry(.00065, .001, 1, 5), bristles, columns * 3)
  fibres.name = '浅色密排刷毛'
  for (let i = 0; i < fibres.count; i++) {
    const row = Math.floor(i / columns)
    const along = (i % columns + .25 * row) / columns - .5
    const length = bristleLength * (.95 + .05 * Math.sin(i * 2.399963))
    transform.position.set((row - 1) * .003, railDepth / 2 + length / 2, along * brushLength)
    transform.rotation.set(.023 * Math.sin(i * 1.7), 0, (1 - row) * .035)
    transform.scale.set(1, length, 1)
    transform.updateMatrix()
    fibres.setMatrixAt(i, transform.matrix)
  }
  brush.add(fibres)
  return brush
}
