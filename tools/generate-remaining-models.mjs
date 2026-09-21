import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'

// 2026-09-08：补齐 V1.4.0 未覆盖的备件类别（三角带、筛网、畚斗、止逆器、托辊、橡胶弹簧、万向轮）。
// 风格与 generate-extra-category-models.mjs 保持一致：Three.js 基本几何体 + GLTFExporter，输出自包含 GLB 2.0。

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer()
      this.onloadend?.()
    }
    async readAsDataURL(blob) {
      const bytes = Buffer.from(await blob.arrayBuffer())
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`
      this.onloadend?.()
    }
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(here, '../spare-parts-web-release/public/models/categories')
const exporter = new GLTFExporter()

const material = (color, metalness = 0.12, roughness = 0.55) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness })

function mesh(group, geometry, color, options = {}) {
  const item = new THREE.Mesh(geometry, material(color, options.metalness, options.roughness))
  item.position.set(...(options.position || [0, 0, 0]))
  item.rotation.set(...(options.rotation || [0, 0, 0]))
  group.add(item)
  return item
}

function normalize(group) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const center = box.getCenter(new THREE.Vector3())
  group.position.x -= center.x
  group.position.z -= center.z
  group.position.y -= box.min.y
  return group
}

// ─── 三角带/V带/同步带 (v-belt) ───
function vBelt() {
  const group = new THREE.Group()
  const R = 0.45
  // 环形带体（黑色橡胶，梯形截面以宽扁环示意）
  mesh(group, new THREE.TorusGeometry(R, 0.055, 12, 64), 0x1c2126, { rotation: [Math.PI / 2, 0, 0], roughness: 0.85, metalness: 0.02 })
  // 顶面帘线层（略浅色胶层）
  mesh(group, new THREE.TorusGeometry(R, 0.048, 10, 64), 0x333a42, { position: [0, 0.03, 0], rotation: [Math.PI / 2, 0, 0], roughness: 0.8 })
  // 内圈同步齿
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2
    mesh(group, new THREE.BoxGeometry(0.035, 0.03, 0.045), 0x11151a, {
      position: [Math.cos(angle) * (R - 0.05), 0, Math.sin(angle) * (R - 0.05)],
      rotation: [0, -angle, 0],
      roughness: 0.9
    })
  }
  return group
}

// ─── 筛网/筛片/筛格 (sieve-mesh) ───
function sieveMesh() {
  const group = new THREE.Group()
  const W = 0.9, D = 0.6
  // 冲孔钢板网面
  mesh(group, new THREE.BoxGeometry(W, 0.012, D), 0xb8c0c8, { position: [0, 0.02, 0], metalness: 0.55, roughness: 0.45 })
  // 冲孔阵列（交错圆孔以深色短圆柱示意）
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      const offset = row % 2 ? 0.042 : 0
      const x = -W / 2 + 0.06 + col * 0.088 + offset
      const z = -D / 2 + 0.06 + row * 0.09
      if (Math.abs(x) < W / 2 - 0.04 && Math.abs(z) < D / 2 - 0.04) {
        mesh(group, new THREE.CylinderGeometry(0.022, 0.022, 0.014, 10), 0x2a323a, {
          position: [x, 0.021, z], metalness: 0.3
        })
      }
    }
  }
  // 四周边框
  const frame = 0.05
  mesh(group, new THREE.BoxGeometry(W + frame * 2, 0.05, frame), 0x8a949f, { position: [0, 0.028, -D / 2 - frame / 2], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(W + frame * 2, 0.05, frame), 0x8a949f, { position: [0, 0.028, D / 2 + frame / 2], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(frame, 0.05, D), 0x8a949f, { position: [-W / 2 - frame / 2, 0.028, 0], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(frame, 0.05, D), 0x8a949f, { position: [W / 2 + frame / 2, 0.028, 0], metalness: 0.5 })
  // 压紧螺栓 x4
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    mesh(group, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), 0x4a5560, {
      position: [x, 0.055, z], metalness: 0.7
    })
  }
  return group
}

// ─── 畚斗（斗式提升机料斗）(bucket) ───
function bucket() {
  const group = new THREE.Group()
  // 方锥斗体：四棱台（顶大底小），旋转45°对齐轴向
  const body = mesh(group, new THREE.CylinderGeometry(0.34, 0.24, 0.42, 4, 1), 0x9aa4ae, {
    position: [0, 0.24, 0], rotation: [0, Math.PI / 4, 0], metalness: 0.45, roughness: 0.5
  })
  body.scale.set(1, 1, 0.72)
  // 前口加强边
  mesh(group, new THREE.BoxGeometry(0.62, 0.03, 0.05), 0x6b7785, { position: [0, 0.44, 0.26], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(0.62, 0.03, 0.05), 0x6b7785, { position: [0, 0.03, 0.2], metalness: 0.5 })
  // 背部安装背板
  mesh(group, new THREE.BoxGeometry(0.58, 0.44, 0.03), 0x77828c, { position: [0, 0.25, -0.24], metalness: 0.5 })
  // 安装螺栓孔位（螺栓头 x4）
  for (const [x, y] of [[-0.2, 0.36], [0.2, 0.36], [-0.2, 0.12], [0.2, 0.12]]) {
    mesh(group, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8), 0x3a444e, {
      position: [x, y, -0.26], rotation: [Math.PI / 2, 0, 0], metalness: 0.7
    })
  }
  return group
}

// ─── 止逆器/逆止器 (backstop) ───
function backstop() {
  const group = new THREE.Group()
  // 外圈壳体
  mesh(group, new THREE.CylinderGeometry(0.26, 0.26, 0.3, 32), 0x4a5560, { position: [0, 0.26, 0], metalness: 0.5, roughness: 0.4 })
  // 两端法兰盘
  mesh(group, new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32), 0x8a949f, { position: [0, 0.42, 0], metalness: 0.55 })
  mesh(group, new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32), 0x8a949f, { position: [0, 0.1, 0], metalness: 0.55 })
  // 法兰螺栓 x8
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8), 0x27313a, {
      position: [Math.cos(angle) * 0.31, 0.44, Math.sin(angle) * 0.31], metalness: 0.7
    })
  }
  // 内圈轴（带键槽轴伸）
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.55, 20), 0xb8c0c8, { position: [0, 0.26, 0], metalness: 0.9, roughness: 0.15 })
  // 键
  mesh(group, new THREE.BoxGeometry(0.03, 0.24, 0.02), 0x27313a, { position: [0, 0.26, 0.09], metalness: 0.7 })
  // 密封圈
  mesh(group, new THREE.TorusGeometry(0.24, 0.02, 8, 32), 0x1c2126, { position: [0, 0.39, 0], rotation: [Math.PI / 2, 0, 0], roughness: 0.8 })
  mesh(group, new THREE.TorusGeometry(0.24, 0.02, 8, 32), 0x1c2126, { position: [0, 0.13, 0], rotation: [Math.PI / 2, 0, 0], roughness: 0.8 })
  // 扭矩臂
  mesh(group, new THREE.BoxGeometry(0.1, 0.06, 0.34), 0x3a4858, { position: [0.36, 0.26, 0], metalness: 0.5 })
  return group
}

// ─── 托辊/辊筒 (idler-roller) ───
function idlerRoller() {
  const group = new THREE.Group()
  const L = 0.95
  // 辊面（圆柱筒）
  mesh(group, new THREE.CylinderGeometry(0.13, 0.13, L, 28), 0xb0bac2, {
    position: [0, 0.16, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.5, roughness: 0.45
  })
  // 两端轴承座（台阶）
  for (const side of [-1, 1]) {
    mesh(group, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 24), 0x8a949f, {
      position: [side * (L / 2 + 0.04), 0.16, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6
    })
    // 迷宫密封
    mesh(group, new THREE.CylinderGeometry(0.115, 0.115, 0.02, 24), 0x333a42, {
      position: [side * (L / 2 - 0.02), 0.16, 0], rotation: [0, 0, Math.PI / 2], roughness: 0.8
    })
  }
  // 贯穿轴
  mesh(group, new THREE.CylinderGeometry(0.035, 0.035, L + 0.3, 16), 0x9aa4ae, {
    position: [0, 0.16, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1
  })
  // 轴端卡簧槽（深色环）
  for (const side of [-1, 1]) {
    mesh(group, new THREE.TorusGeometry(0.037, 0.006, 6, 20), 0x27313a, {
      position: [side * (L / 2 + 0.11), 0.16, 0], rotation: [0, Math.PI / 2, 0], metalness: 0.6
    })
  }
  return group
}

// ─── 橡胶弹簧 (rubber-spring) ───
function rubberSpring() {
  const group = new THREE.Group()
  // 橡胶体（带环形凹槽）
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.34, 32), 0x1c2126, { position: [0, 0.19, 0], roughness: 0.9, metalness: 0.02 })
  for (const y of [0.12, 0.19, 0.26]) {
    mesh(group, new THREE.CylinderGeometry(0.26, 0.26, 0.03, 32), 0x2a323a, { position: [0, y, 0], roughness: 0.85 })
  }
  // 上下端钢板
  mesh(group, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 32), 0x6b7785, { position: [0, 0.015, 0], metalness: 0.6 })
  mesh(group, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 32), 0x6b7785, { position: [0, 0.375, 0], metalness: 0.6 })
  // 中心定位凸台
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), 0x8a949f, { position: [0, 0.41, 0], metalness: 0.6 })
  // 端面螺栓 x6
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    mesh(group, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), 0x27313a, {
      position: [Math.cos(angle) * 0.26, 0.4, Math.sin(angle) * 0.26], metalness: 0.7
    })
  }
  return group
}

// ─── 万向轮/脚轮 (caster-wheel) ───
function casterWheel() {
  const group = new THREE.Group()
  // 顶部安装板
  mesh(group, new THREE.BoxGeometry(0.42, 0.03, 0.42), 0x6b7785, { position: [0, 0.72, 0], metalness: 0.55 })
  // 安装孔 x4（螺栓头）
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
    mesh(group, new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8), 0x27313a, { position: [x, 0.74, z], metalness: 0.7 })
  }
  // 双叉腿
  mesh(group, new THREE.BoxGeometry(0.05, 0.5, 0.34), 0x4a5560, { position: [-0.15, 0.45, 0], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(0.05, 0.5, 0.34), 0x4a5560, { position: [0.15, 0.45, 0], metalness: 0.5 })
  // 轮子（竖放圆柱，蓝色轮面 + 轮毂）
  mesh(group, new THREE.CylinderGeometry(0.26, 0.26, 0.14, 28), 0x1f4d7a, {
    position: [0, 0.26, 0], rotation: [Math.PI / 2, 0, 0], roughness: 0.7
  })
  mesh(group, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16), 0xb0bac2, {
    position: [0, 0.26, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.7
  })
  // 刹车踏板
  mesh(group, new THREE.BoxGeometry(0.08, 0.03, 0.2), 0xd23a43, { position: [0.28, 0.2, 0.1], metalness: 0.3 })
  // 轴销
  mesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), 0x9aa4ae, {
    position: [0, 0.26, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1
  })
  return group
}

const models = [
  { name: 'v-belt', factory: vBelt },
  { name: 'sieve-mesh', factory: sieveMesh },
  { name: 'bucket', factory: bucket },
  { name: 'backstop', factory: backstop },
  { name: 'idler-roller', factory: idlerRoller },
  { name: 'rubber-spring', factory: rubberSpring },
  { name: 'caster-wheel', factory: casterWheel }
]

async function writeModel(filename, factory) {
  const scene = new THREE.Scene()
  scene.name = filename.replace('.glb', '')
  scene.add(normalize(factory()))
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, trs: false })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result))
}

await fs.mkdir(outputDir, { recursive: true })
for (const { name, factory } of models) {
  await writeModel(`${name}.glb`, factory)
  console.log(`Generated: ${name}.glb`)
}
console.log(`\nDone! Generated ${models.length} remaining category models in ${outputDir}`)
