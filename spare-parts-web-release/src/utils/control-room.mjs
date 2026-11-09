import * as THREE from 'three'

// Numbering follows the supplied photograph; dimensions are visual estimates.
export const controlComputers = Object.freeze([
  { id: 1, x: -2.2, z: 3.6, rotation: 0, row: '第一排 · 左侧' },
  { id: 2, x: -.8, z: 3.6, rotation: 0, row: '第一排 · 中间' },
  { id: 3, x: .6, z: 3.6, rotation: 0, row: '第一排 · 右侧' },
  { id: 4, x: 1.05, z: 2.15, rotation: Math.PI, row: '第二排 · 4号工位' },
  { id: 5, x: -1.8, z: -1.05, rotation: Math.PI, row: '第三排 · 5号工位' },
  { id: 6, x: -1.9, z: -4.8, rotation: 0, row: '第四排 · 左侧' },
  { id: 7, x: -.5, z: -4.8, rotation: 0, row: '第四排 · 左中' },
  { id: 8, x: .9, z: -4.8, rotation: 0, row: '第四排 · 右中' },
  { id: 9, x: 2.3, z: -4.8, rotation: 0, row: '第四排 · 右侧' }
])

export const controlDesks = Object.freeze([
  { row: 1, x: -.8, z: 3.55, width: 5.5, depth: 1.25 },
  { row: 2, x: -.8, z: 2.15, width: 5.5, depth: 1.25 },
  { row: 3, x: -.8, z: -1.1, width: 5.5, depth: 1.25 },
  { row: 4, x: .2, z: -4.8, width: 7.4, depth: 1.45 }
])
export const controlRoomLayout = Object.freeze({ width: 13.6, depth: 17.2, centerZ: -2, rearZ: -10.6, screenZ: -10.35, airConditioners: [-1.8,-4.8] })

export function layoutControlLabels(input, {width,height,size=36,gap=4}) {
  const output={},placed=[],margin=size/2+3,spacing=size+gap
  for(const [id,point] of Object.entries(input).sort((a,b)=>a[1].y-b[1].y||a[1].x-b[1].x)) {
    if(!point.visible){output[id]=point;continue}
    const candidates=[{x:point.x,y:point.y}]
    for(let ring=1;ring<=5;ring++)for(let step=0;step<16;step++) {
      const angle=step*Math.PI/8;candidates.push({x:point.x+Math.cos(angle)*spacing*ring,y:point.y+Math.sin(angle)*spacing*ring})
    }
    let target
    for(const candidate of candidates) {
      const x=Math.max(margin,Math.min(width-margin,candidate.x)),y=Math.max(margin,Math.min(height-margin,candidate.y))
      if(placed.every(other=>Math.abs(other.x-x)>=spacing||Math.abs(other.y-y)>=spacing)){target={x,y};break}
    }
    target ||= {x:point.x,y:point.y}
    output[id]={...point,...target,anchorX:point.x,anchorY:point.y,moved:Math.hypot(target.x-point.x,target.y-point.y)>4};placed.push(target)
  }
  return output
}

export function createControlRoom() {
  const root = new THREE.Group(), computers = new Map(), targets = []
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .12, ...extra })
  const desk = material('#ccd2d5'), dark = material('#202b37'), leg = material('#697580', { metalness: .5 }), wall = material('#e2e7e8'), floor = material('#c8d0d3')
  function box(parent, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
  }
  const layout=controlRoomLayout
  box(root, layout.width, .12, layout.depth, 0, -.08, layout.centerZ, floor)
  const grid = new THREE.GridHelper(17.2, 24, '#98a8ad', '#b2bdc2'); grid.scale.x=layout.width/17.2; grid.position.set(0,-.012,layout.centerZ); root.add(grid)
  box(root, layout.width, 3.65, .14, 0, 1.8, layout.rearZ, wall)
  box(root, .14, 3.65, layout.depth, -layout.width/2, 1.8, layout.centerZ, wall)
  // Long side windows and the narrower rear windows.
  const glass = material('#83a1b2', { transparent: true, opacity: .45, metalness: .3 })
  for (const z of [2, -3.7]) {
    box(root, .06, 1.65, 4.6, -6.7, 2, z, dark)
    box(root, .07, 1.47, 4.42, -6.65, 2, z, glass)
    for (const dz of [-1.6,-.55,.55,1.6]) box(root, .09, 1.55, .035, -6.6, 2, z + dz, leg)
  }
  for (const x of [-5.55, 5.55]) {
    box(root, 1.2, 2.05, .08, x, 1.85, layout.rearZ+.12, dark)
    box(root, 1.06, 1.89, .09, x, 1.85, layout.rearZ+.18, glass)
    box(root, 1.12, .045, .11, x, 1.85, layout.rearZ+.23, leg)
  }
  // CCTV wall: decorative schematic displays, never actual camera feeds.
  box(root, 8.6, 2.6, .2, 0, 2.04, layout.screenZ-.13, dark)
  for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
    const x = (col - 2.5) * 1.4, y = 1.05 + row * .48
    box(root, 1.36, .44, .04, x, y, layout.screenZ, material(['#476979', '#5e7378', '#426474'][(row + col) % 3], { emissive: '#24414e', emissiveIntensity: .3 }))
    box(root, .74, .012, .01, x, y - .06, layout.screenZ+.03, leg)
    box(root, .012, .31, .01, x + .2, y, layout.screenZ+.03, leg)
  }
  for (const z of layout.airConditioners) {
    box(root, .67, 2.75, .65, -5.95, 1.38, z, dark)
    for (let j = 0; j < 9; j++) box(root, .51, .016, .015, -5.95, .38 + j * .24, z + .335, leg)
  }
  function table(x, z, width, depth) {
    box(root, width, .1, depth, x, .9, z, desk)
    box(root, width - .12, .12, .08, x, .82, z + depth / 2, dark)
    for (const side of [-1, 1]) box(root, .12, .85, depth - .2, x + side * (width / 2 - .16), .43, z, leg)
    box(root, width - .35, .58, .04, x, .39, z - .2, leg)
  }
  for (const item of controlDesks) table(item.x, item.z, item.width, item.depth)
  function chair(x, z, rotation) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; root.add(group)
    box(group, .52, .11, .5, 0, .5, 0, dark); box(group, .5, .55, .08, 0, .8, .24, dark)
    box(group, .05, .4, .05, 0, .25, 0, leg)
    box(group, .62, .06, .07, 0, .08, 0, leg); box(group, .07, .06, .6, 0, .08, 0, leg)
  }
  for (const spec of controlComputers) {
    const group = new THREE.Group(); group.position.set(spec.x, .96, spec.z); group.rotation.y = spec.rotation; group.userData.computerId = spec.id
    root.add(group)
    const frame = material('#273544', { emissive: '#18a6b7', emissiveIntensity: 0 })
    box(group, 1.16, .74, .065, 0, .66, 0, frame)
    const screen = box(group, 1.06, .64, .01, 0, .67, .039, material('#155a61', { emissive: '#145260', emissiveIntensity: .4 }))
    box(group, .07, .32, .07, 0, .2, 0, leg); box(group, .42, .035, .28, 0, .02, .05, leg)
    box(group, .63, .025, .22, -.07, .025, .47, dark); box(group, .09, .04, .14, .43, .035, .46, dark)
    // Minimal process schematic on the screen.
    for (let line = 0; line < 3; line++) {
      box(group, .78, .012, .008, 0, .5 + line * .16, .047, leg)
      for (let column = 0; column < 3; column++) box(group, .1, .07, .009, -.28 + column * .28, .54 + line * .16, .049, material('#7bac8e', { emissive: '#386c54' }))
    }
    group.traverse(child => { if (child.isMesh) { child.userData.computerId = spec.id; targets.push(child) } })
    computers.set(spec.id, { group, frame, screen, label: new THREE.Vector3(spec.x, 2.18, spec.z) })
    chair(spec.x, spec.z + (spec.rotation ? -.75 : .8), spec.rotation)
  }
  return { root, computers, targets }
}
