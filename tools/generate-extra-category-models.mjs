import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'

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

// ─── 交流接触器 (contactor) ───
function contactor() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.68, 1.0, 0.58), 0xe8edf2, { position: [0, 0.5, 0] })
  mesh(group, new THREE.BoxGeometry(0.62, 0.28, 0.6), 0xf5f7fa, { position: [0, 1.12, 0] })
  for (let i = -1; i <= 1; i++) {
    mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.14, 16), 0xb8770d, { position: [i * 0.22, 1.28, 0], metalness: 0.8, roughness: 0.2 })
    mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16), 0x6b7785, { position: [i * 0.22, 1.21, 0], metalness: 0.7 })
  }
  mesh(group, new THREE.BoxGeometry(0.1, 0.1, 0.08), 0x9ca3af, { position: [-0.28, 0.2, 0.3], metalness: 0.6 })
  mesh(group, new THREE.BoxGeometry(0.1, 0.1, 0.08), 0x9ca3af, { position: [0.28, 0.2, 0.3], metalness: 0.6 })
  mesh(group, new THREE.BoxGeometry(0.12, 0.05, 0.02), 0xd23a43, { position: [0, 0.85, 0.3] })
  mesh(group, new THREE.BoxGeometry(0.5, 0.06, 0.08), 0x4a5560, { position: [0, 0.08, -0.28] })
  return group
}

// ─── 变频器 (VFD/inverter) ───
function vfd() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.72, 1.7, 0.42), 0x3a4858, { position: [0, 0.85, 0] })
  mesh(group, new THREE.BoxGeometry(0.6, 0.38, 0.04), 0x1a2332, { position: [0, 1.55, 0.22] })
  mesh(group, new THREE.BoxGeometry(0.34, 0.16, 0.02), 0x0a8a4a, { position: [0, 1.6, 0.24] })
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), 0xe2e8f0, { position: [-0.18 + i * 0.12, 1.45, 0.24], rotation: [Math.PI / 2, 0, 0] })
  }
  for (let i = 0; i < 6; i++) {
    mesh(group, new THREE.BoxGeometry(0.04, 0.5, 0.38), 0x8a949f, { position: [-0.25 + i * 0.1, 0.25, 0], metalness: 0.85, roughness: 0.2 })
  }
  mesh(group, new THREE.BoxGeometry(0.6, 0.12, 0.06), 0x1a2332, { position: [0, 0.08, 0.22] })
  for (let i = 0; i < 5; i++) {
    mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), 0xd4a72c, { position: [-0.2 + i * 0.1, 0.08, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.9 })
  }
  mesh(group, new THREE.BoxGeometry(0.5, 0.04, 0.34), 0x1a2332, { position: [0, 1.72, 0] })
  return group
}

// ─── 继电器 (relay) ───
function relay() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.5, 0.5, 0.7), 0xe8edf2, { position: [0, 0.25, 0] })
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xc8d4e0, metalness: 0.1, roughness: 0.3, transparent: true, opacity: 0.55 })
  const dome = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.66), domeMat)
  dome.position.set(0, 0.71, 0)
  group.add(dome)
  mesh(group, new THREE.BoxGeometry(0.08, 0.12, 0.04), 0xd4a72c, { position: [-0.12, 0.72, 0.22], metalness: 0.8 })
  mesh(group, new THREE.BoxGeometry(0.08, 0.12, 0.04), 0xd4a72c, { position: [0.12, 0.72, 0.22], metalness: 0.8 })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), 0x8a949f, { position: [0, 0.78, 0.22], rotation: [Math.PI / 2, 0, 0], metalness: 0.7 })
  const pinPositions = [[-0.18, -0.05, 0.25], [-0.06, -0.05, 0.25], [0.06, -0.05, 0.25], [0.18, -0.05, 0.25], [-0.18, -0.05, -0.25], [-0.06, -0.05, -0.25], [0.06, -0.05, -0.25], [0.18, -0.05, -0.25]]
  for (const [x, y, z] of pinPositions) {
    mesh(group, new THREE.BoxGeometry(0.04, 0.16, 0.04), 0xd4a72c, { position: [x, y, z], metalness: 0.9, roughness: 0.15 })
  }
  return group
}

// ─── 软启动器 (soft starter) ───
function softStarter() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.7, 1.5, 0.52), 0x3a4858, { position: [0, 0.75, 0] })
  mesh(group, new THREE.BoxGeometry(0.6, 0.3, 0.04), 0x1a2332, { position: [0, 1.4, 0.24] })
  mesh(group, new THREE.SphereGeometry(0.03, 12, 10), 0x10b981, { position: [0, 1.42, 0.27] })
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), 0x6b7785, { position: [0, 1.32, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.6 })
  for (let i = 0; i < 5; i++) {
    mesh(group, new THREE.BoxGeometry(0.035, 0.7, 0.46), 0x8a949f, { position: [-0.22 + i * 0.11, 0.3, 0], metalness: 0.85, roughness: 0.2 })
  }
  mesh(group, new THREE.BoxGeometry(0.58, 0.1, 0.06), 0x1a2332, { position: [0, 0.06, 0.24] })
  for (let i = 0; i < 6; i++) {
    mesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), 0xd4a72c, { position: [-0.22 + i * 0.09, 0.06, 0.27], rotation: [Math.PI / 2, 0, 0], metalness: 0.9 })
  }
  return group
}

// ─── 皮带/链条 (belt) ───
function belt() {
  const group = new THREE.Group()
  mesh(group, new THREE.CylinderGeometry(0.35, 0.35, 0.12, 32), 0x6b7785, { position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.25 })
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.14, 16), 0x4a5560, { position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.7 })
  mesh(group, new THREE.CylinderGeometry(0.18, 0.18, 0.1, 24), 0x6b7785, { position: [0.9, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.8, roughness: 0.25 })
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), 0x4a5560, { position: [0.9, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.7 })
  const beltGeo = new THREE.RingGeometry(0.48, 0.55, 48, 1)
  mesh(group, beltGeo, 0x1a2332, { position: [0.45, 0.35, 0], metalness: 0.3, roughness: 0.6 })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), 0x27313a, { position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.9 })
  return group
}

// ─── 联轴器 (coupling) ───
function coupling() {
  const group = new THREE.Group()
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.16, 24), 0x6b7785, { position: [-0.2, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.3 })
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.16, 24), 0x6b7785, { position: [0.2, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.3 })
  mesh(group, new THREE.CylinderGeometry(0.24, 0.24, 0.08, 20), 0xd23a43, { position: [0, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.2, roughness: 0.5 })
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const x = i < 3 ? -0.2 : 0.2
    mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), 0x27313a, { position: [x + Math.cos(angle) * 0.22, 0.3 + Math.sin(angle) * 0.22, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.85, roughness: 0.15 })
  }
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), 0x1a1a1a, { position: [0, 0.3, 0], rotation: [0, 0, Math.PI / 2] })
  return group
}

// ─── 编码器 (encoder) ───
function encoder() {
  const group = new THREE.Group()
  mesh(group, new THREE.CylinderGeometry(0.28, 0.28, 0.42, 24), 0x3a4858, { position: [0, 0.21, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.4, roughness: 0.35 })
  mesh(group, new THREE.CylinderGeometry(0.29, 0.29, 0.06, 24), 0x1a2332, { position: [0.24, 0.21, 0], rotation: [0, 0, Math.PI / 2] })
  const diskMat = new THREE.MeshStandardMaterial({ color: 0x90c8e8, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.5 })
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32), diskMat)
  disk.position.set(0.15, 0.21, 0)
  disk.rotation.z = Math.PI / 2
  group.add(disk)
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12), 0x8a949f, { position: [0.4, 0.21, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1 })
  mesh(group, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 20), 0x2a3548, { position: [-0.24, 0.21, 0], rotation: [0, 0, Math.PI / 2] })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), 0x1a1a1a, { position: [-0.35, 0.42, 0], rotation: [0, 0, 0.3], metalness: 0.2, roughness: 0.8 })
  mesh(group, new THREE.SphereGeometry(0.025, 10, 8), 0x10b981, { position: [0.24, 0.36, 0.15] })
  return group
}

// ─── 电机 (motor) ───
function motor() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.9, 0.1, 0.5), 0x4a5560, { position: [0, 0.05, 0], metalness: 0.5, roughness: 0.4 })
  mesh(group, new THREE.CylinderGeometry(0.32, 0.32, 0.9, 32), 0x5b9bd5, { position: [0, 0.55, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.5, roughness: 0.3 })
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    mesh(group, new THREE.BoxGeometry(0.85, 0.03, 0.06), 0x3a4858, { position: [0, 0.55 + Math.sin(angle) * 0.33, Math.cos(angle) * 0.33], rotation: [angle, 0, 0], metalness: 0.6, roughness: 0.3 })
  }
  mesh(group, new THREE.CylinderGeometry(0.33, 0.33, 0.06, 32), 0x3a4858, { position: [0.48, 0.55, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6 })
  mesh(group, new THREE.CylinderGeometry(0.33, 0.33, 0.04, 32), 0x2a3548, { position: [-0.47, 0.55, 0], rotation: [0, 0, Math.PI / 2] })
  mesh(group, new THREE.TorusGeometry(0.3, 0.03, 8, 24), 0x6b7785, { position: [-0.49, 0.55, 0], rotation: [0, Math.PI / 2, 0], metalness: 0.7 })
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.35, 16), 0x8a949f, { position: [0.68, 0.55, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1 })
  mesh(group, new THREE.BoxGeometry(0.15, 0.02, 0.03), 0x27313a, { position: [0.68, 0.61, 0] })
  mesh(group, new THREE.BoxGeometry(0.3, 0.18, 0.22), 0x3a4858, { position: [0, 0.78, 0], metalness: 0.5 })
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), 0x8a949f, { position: [0, 0.88, 0], metalness: 0.7 })
  return group
}

// ─── PLC模块 (plc-module) ───
function plcModule() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(1.2, 2.0, 0.58), 0x3a4858, { position: [0, 1.0, 0], metalness: 0.3, roughness: 0.4 })
  mesh(group, new THREE.BoxGeometry(1.1, 1.9, 0.04), 0x2a3548, { position: [0, 1.0, 0.27] })
  const ledColors = [0x10b981, 0x10b981, 0xf59e0b, 0xd23a43]
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.SphereGeometry(0.03, 12, 10), ledColors[i], { position: [-0.15 + i * 0.1, 1.85, 0.3] })
  }
  mesh(group, new THREE.BoxGeometry(0.9, 0.5, 0.06), 0x1a2332, { position: [0, 1.55, 0.3] })
  for (let row = 0; row < 3; row++) {
    mesh(group, new THREE.BoxGeometry(0.9, 0.08, 0.06), 0x1a2332, { position: [0, 0.3 + row * 0.14, 0.3] })
    for (let j = 0; j < 8; j++) {
      mesh(group, new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), 0xd4a72c, { position: [-0.35 + j * 0.1, 0.3 + row * 0.14, 0.33], rotation: [Math.PI / 2, 0, 0], metalness: 0.9 })
    }
  }
  mesh(group, new THREE.BoxGeometry(0.8, 0.1, 0.12), 0x6b7785, { position: [0, 2.02, 0], metalness: 0.6 })
  mesh(group, new THREE.BoxGeometry(0.9, 0.06, 0.08), 0x4a5560, { position: [0, 0.06, -0.28] })
  return group
}

// ─── 仪表/变送器 (instrument) ───
function instrument() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.8, 0.8, 0.5), 0xe8edf2, { position: [0, 0.4, 0] })
  mesh(group, new THREE.BoxGeometry(0.56, 0.28, 0.04), 0x1a2332, { position: [0, 0.52, 0.25] })
  mesh(group, new THREE.BoxGeometry(0.4, 0.16, 0.01), 0x0a8a4a, { position: [0, 0.52, 0.27] })
  for (let i = 0; i < 3; i++) {
    mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), 0x6b7785, { position: [-0.2 + i * 0.2, 0.25, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.5 })
  }
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), 0x8a949f, { position: [-0.2, 0.05, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.8 })
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), 0x8a949f, { position: [0, 0.05, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.8 })
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), 0x8a949f, { position: [0.2, 0.05, 0.25], rotation: [Math.PI / 2, 0, 0], metalness: 0.8 })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), 0x27313a, { position: [-0.32, 0.4, 0.25], rotation: [Math.PI / 2, 0, 0] })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), 0x27313a, { position: [0.32, 0.4, 0.25], rotation: [Math.PI / 2, 0, 0] })
  return group
}

// ─── 电阻/制动电阻 (resistor) ───
function resistor() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.5, 0.25, 0.2), 0xc89028, { position: [0, 0.12, 0], metalness: 0.6, roughness: 0.3 })
  for (let i = 0; i < 5; i++) {
    mesh(group, new THREE.BoxGeometry(0.06, 0.02, 0.16), 0x1a1a1a, { position: [-0.18 + i * 0.09, 0.24, 0] })
  }
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), 0x8a949f, { position: [-0.3, 0.12, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.8, roughness: 0.2 })
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12), 0x8a949f, { position: [0.3, 0.12, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.8, roughness: 0.2 })
  mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.18), 0x4a5560, { position: [-0.15, 0, 0] })
  mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.18), 0x4a5560, { position: [0.15, 0, 0] })
  return group
}

// ─── 辅助触头 (auxiliary-contact) ───
function auxiliaryContact() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.45, 0.6, 0.55), 0xe8edf2, { position: [0, 0.3, 0] })
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12), 0xd4a72c, { position: [i * 0.12, 0.66, j * 0.12], metalness: 0.85, roughness: 0.15 })
    }
  }
  mesh(group, new THREE.BoxGeometry(0.08, 0.08, 0.06), 0x6b7785, { position: [0, 0.3, 0.3] })
  mesh(group, new THREE.BoxGeometry(0.4, 0.04, 0.06), 0x4a5560, { position: [0, 0.06, -0.28] })
  mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.02), 0x3b82f6, { position: [0, 0.45, 0.28] })
  return group
}

// ─── 开关/按钮 (switch) ───
function switchBtn() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.5, 0.5, 0.08), 0x3a4858, { position: [0, 0.25, 0], metalness: 0.4, roughness: 0.35 })
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24), 0xd23a43, { position: [0, 0.33, 0.08], metalness: 0.3, roughness: 0.4 })
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24), 0x10b981, { position: [0.2, 0.33, 0.08], metalness: 0.3, roughness: 0.4 })
  mesh(group, new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), 0x1a1a1a, { position: [-0.2, 0.32, 0.08], metalness: 0.5, roughness: 0.3 })
  mesh(group, new THREE.BoxGeometry(0.16, 0.03, 0.03), 0x6b7785, { position: [-0.2, 0.36, 0.08], rotation: [0, 0, 0.3], metalness: 0.6 })
  mesh(group, new THREE.BoxGeometry(0.3, 0.1, 0.01), 0xe8edf2, { position: [0, 0.08, 0.05] })
  return group
}

// ─── 接线箱/配电箱 (junction-box) ───
function junctionBox() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.8, 0.6, 0.5), 0xe8a128, { position: [0, 0.3, 0], metalness: 0.3, roughness: 0.5 })
  mesh(group, new THREE.BoxGeometry(0.85, 0.65, 0.04), 0xc89028, { position: [0, 0.3, 0.25] })
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), 0x27313a, { position: [-0.25 + i * 0.17, 0.05, 0.25], rotation: [Math.PI / 2, 0, 0] })
  }
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) {
    mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.08), 0x4a5560, { position: [x, 0, z] })
  }
  return group
}

// ─── 链条 (chain) ───
function chain() {
  const group = new THREE.Group()
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 0.22
    mesh(group, new THREE.TorusGeometry(0.08, 0.03, 8, 16), 0x6b7785, {
      position: [x, 0.3, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.85, roughness: 0.2
    })
    if (i < 7) {
      mesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), 0x4a5560, {
        position: [x + 0.11, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7
      })
    }
  }
  return group
}

// ─── 气缸 (cylinder) ───
function cylinder() {
  const group = new THREE.Group()
  // 主体管
  mesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.7, 24), 0xd4dae0, {
    position: [0, 0.35, 0], metalness: 0.5, roughness: 0.3
  })
  // 前端盖
  mesh(group, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 24), 0x3a4858, { position: [0, 0.74, 0] })
  // 后端盖
  mesh(group, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 24), 0x3a4858, { position: [0, -0.04, 0] })
  // 活塞杆
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.35, 16), 0x9aa4ae, {
    position: [0, 0.96, 0], metalness: 0.9, roughness: 0.1
  })
  // 接气口 x2
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), 0x8a949f, {
    position: [-0.18, 0.7, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7
  })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), 0x8a949f, {
    position: [-0.18, 0.0, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7
  })
  // 磁性开关
  mesh(group, new THREE.BoxGeometry(0.08, 0.1, 0.12), 0x1a2332, { position: [0.18, 0.45, 0] })
  return group
}

// ─── 刮板/锤片 (scraper) ───
function scraper() {
  const group = new THREE.Group()
  // 主体板
  mesh(group, new THREE.BoxGeometry(0.5, 0.7, 0.06), 0x6b7785, {
    position: [0, 0.35, 0], metalness: 0.6, roughness: 0.35
  })
  // 安装孔
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), 0x1a1a1a, {
    position: [0, 0.6, 0], rotation: [Math.PI / 2, 0, 0]
  })
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), 0x1a1a1a, {
    position: [0, 0.15, 0], rotation: [Math.PI / 2, 0, 0]
  })
  // 刮齿
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.BoxGeometry(0.08, 0.12, 0.05), 0x4a5560, {
      position: [-0.18 + i * 0.12, -0.02, 0.02]
    })
  }
  return group
}

// ─── 软连接/布筒 (flexible-connector) ───
function flexibleConnector() {
  const group = new THREE.Group()
  // 法兰 x2
  mesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), 0x6b7785, {
    position: [0, 0.02, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.6
  })
  mesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), 0x6b7785, {
    position: [0, 0.5, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.6
  })
  // 软管(波纹)
  for (let i = 0; i < 6; i++) {
    mesh(group, new THREE.TorusGeometry(0.16, 0.02, 6, 16), 0x8a6d3b, {
      position: [0, 0.08 + i * 0.07, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.2, roughness: 0.6
    })
  }
  // 卡箍 x2
  mesh(group, new THREE.TorusGeometry(0.18, 0.015, 6, 16), 0x4a5560, {
    position: [0, 0.06, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.7
  })
  mesh(group, new THREE.TorusGeometry(0.18, 0.015, 6, 16), 0x4a5560, {
    position: [0, 0.46, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.7
  })
  return group
}

// ─── 滤网/筛网 (filter-mesh) ───
function filterMesh() {
  const group = new THREE.Group()
  // 框架
  mesh(group, new THREE.BoxGeometry(0.7, 0.02, 0.5), 0x4a5560, { position: [0, 0.01, 0], metalness: 0.6 })
  mesh(group, new THREE.BoxGeometry(0.7, 0.08, 0.03), 0x4a5560, { position: [0, 0.05, 0.25] })
  mesh(group, new THREE.BoxGeometry(0.7, 0.08, 0.03), 0x4a5560, { position: [0, 0.05, -0.25] })
  mesh(group, new THREE.BoxGeometry(0.03, 0.08, 0.5), 0x4a5560, { position: [0.35, 0.05, 0] })
  mesh(group, new THREE.BoxGeometry(0.03, 0.08, 0.5), 0x4a5560, { position: [-0.35, 0.05, 0] })
  // 网面(半透明)
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0, metalness: 0.7, roughness: 0.3,
    transparent: true, opacity: 0.4, side: THREE.DoubleSide
  })
  const net = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.44), meshMat)
  net.position.set(0, 0.03, 0)
  net.rotation.x = -Math.PI / 2
  group.add(net)
  // 网格线
  for (let i = -3; i <= 3; i++) {
    mesh(group, new THREE.BoxGeometry(0.64, 0.01, 0.01), 0x8a949f, {
      position: [0, 0.03, i * 0.07], metalness: 0.7
    })
    mesh(group, new THREE.BoxGeometry(0.01, 0.01, 0.44), 0x8a949f, {
      position: [i * 0.1, 0.03, 0], metalness: 0.7
    })
  }
  return group
}

// ─── 紧定套 (adapter-sleeve) ───
function adapterSleeve() {
  const group = new THREE.Group()
  // 锥形套筒
  mesh(group, new THREE.CylinderGeometry(0.12, 0.18, 0.5, 24), 0x9aa4ae, {
    position: [0, 0.25, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.85, roughness: 0.2
  })
  // 螺母
  mesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), 0x6b7785, {
    position: [0.29, 0.25, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.25
  })
  // 锁紧垫片
  mesh(group, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), 0x4a5560, {
    position: [0.21, 0.25, 0], rotation: [0, 0, Math.PI / 2]
  })
  // 内孔
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 16), 0x1a1a1a, {
    position: [0, 0.25, 0], rotation: [0, 0, Math.PI / 2]
  })
  return group
}

// ─── 网络/通讯设备 (network-switch) ───
function networkSwitch() {
  const group = new THREE.Group()
  // 主体
  mesh(group, new THREE.BoxGeometry(1.1, 0.4, 0.4), 0x3a4858, { position: [0, 0.2, 0], metalness: 0.3, roughness: 0.4 })
  // 面板
  mesh(group, new THREE.BoxGeometry(1.05, 0.35, 0.04), 0x1a2332, { position: [0, 0.2, 0.2] })
  // 网口 x8
  for (let i = 0; i < 8; i++) {
    mesh(group, new THREE.BoxGeometry(0.08, 0.06, 0.03), 0x0a4a2a, { position: [-0.38 + i * 0.11, 0.22, 0.22] })
    mesh(group, new THREE.BoxGeometry(0.07, 0.05, 0.02), 0xd4a72c, { position: [-0.38 + i * 0.11, 0.14, 0.22] })
  }
  // LED指示灯 x4
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.SphereGeometry(0.02, 8, 6), 0x10b981, { position: [-0.15 + i * 0.1, 0.32, 0.22] })
  }
  // 电源口
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10), 0x27313a, {
    position: [-0.48, 0.12, 0.2], rotation: [0, 0, Math.PI / 2]
  })
  // DIN导轨槽
  mesh(group, new THREE.BoxGeometry(0.9, 0.04, 0.06), 0x4a5560, { position: [0, 0.04, -0.18] })
  return group
}

// ─── 气动元件 (pneumatic-unit) ───
function pneumaticUnit() {
  const group = new THREE.Group()
  // 过滤器
  mesh(group, new THREE.CylinderGeometry(0.14, 0.14, 0.3, 20), 0x3a4858, {
    position: [-0.25, 0.15, 0], metalness: 0.4
  })
  mesh(group, new THREE.CylinderGeometry(0.1, 0.1, 0.28, 16), 0xe8edf2, {
    position: [-0.25, 0.16, 0], metalness: 0.1, roughness: 0.3
  })
  // 减压阀
  mesh(group, new THREE.CylinderGeometry(0.16, 0.16, 0.25, 20), 0x3a4858, {
    position: [0, 0.12, 0], metalness: 0.4
  })
  // 旋钮
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), 0x27313a, {
    position: [0, 0.28, 0], metalness: 0.6
  })
  // 压力表
  mesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), 0xe8edf2, {
    position: [0, 0.28, 0.12], rotation: [Math.PI / 2, 0, 0]
  })
  // 油雾器
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.3, 20), 0x8a6d3b, {
    position: [0.25, 0.15, 0], metalness: 0.3, roughness: 0.5
  })
  // 底座
  mesh(group, new THREE.BoxGeometry(0.7, 0.04, 0.25), 0x4a5560, { position: [0, 0, 0] })
  // 接气口
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), 0x27313a, {
    position: [-0.4, 0.15, 0], rotation: [0, 0, Math.PI / 2]
  })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), 0x27313a, {
    position: [0.4, 0.15, 0], rotation: [0, 0, Math.PI / 2]
  })
  return group
}

// ─── RGV小车部件 (rgv-part) ───
function rgvPart() {
  const group = new THREE.Group()
  // 轮子主体
  mesh(group, new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24), 0x4a5560, {
    position: [0, 0.25, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.6, roughness: 0.35
  })
  // 轮缘(橡胶)
  mesh(group, new THREE.TorusGeometry(0.25, 0.04, 8, 24), 0x1a1a1a, {
    position: [0, 0.25, 0.06], rotation: [0, Math.PI / 2, 0], roughness: 0.8
  })
  mesh(group, new THREE.TorusGeometry(0.25, 0.04, 8, 24), 0x1a1a1a, {
    position: [0, 0.25, -0.06], rotation: [0, Math.PI / 2, 0], roughness: 0.8
  })
  // 中心轴
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), 0x8a949f, {
    position: [0, 0.25, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.9, roughness: 0.1
  })
  // 导向轮支架
  mesh(group, new THREE.BoxGeometry(0.08, 0.4, 0.04), 0x6b7785, { position: [0, 0.2, 0.18], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.16), 0x6b7785, { position: [0, 0.38, 0.12], metalness: 0.5 })
  return group
}

// ─── 齿轮/链轮 (gear-sprocket) ───
function gearSprocket() {
  const group = new THREE.Group()
  // 齿轮体
  const gearGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20)
  mesh(group, gearGeo, 0x6b7785, {
    position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.85, roughness: 0.2
  })
  // 齿 x12
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    mesh(group, new THREE.BoxGeometry(0.04, 0.08, 0.06), 0x6b7785, {
      position: [Math.cos(angle) * 0.32, 0.35 + Math.sin(angle) * 0.32, 0],
      rotation: [0, 0, angle], metalness: 0.85, roughness: 0.2
    })
  }
  // 中心轴孔
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), 0x1a1a1a, {
    position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0]
  })
  // 键槽
  mesh(group, new THREE.BoxGeometry(0.04, 0.02, 0.08), 0x27313a, { position: [0.06, 0.35, 0] })
  return group
}

// ─── 料位计 (level-sensor) ───
function levelSensor() {
  const group = new THREE.Group()
  // 旋转叶片(阻旋式)
  mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), 0x6b7785, {
    position: [0, 0.15, 0], metalness: 0.7
  })
  mesh(group, new THREE.BoxGeometry(0.18, 0.03, 0.02), 0x6b7785, { position: [0.08, 0.05, 0], metalness: 0.7 })
  mesh(group, new THREE.BoxGeometry(0.18, 0.03, 0.02), 0x6b7785, { position: [-0.08, 0.05, 0], metalness: 0.7 })
  // 电机/外壳
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.15, 16), 0x3a4858, {
    position: [0, 0.35, 0], metalness: 0.4
  })
  // 法兰安装
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), 0x4a5560, { position: [0, 0.43, 0] })
  mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), 0x27313a, { position: [0.08, 0.44, 0] })
  mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), 0x27313a, { position: [-0.08, 0.44, 0] })
  // 电缆
  mesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), 0x1a1a1a, {
    position: [0, 0.5, 0.12], rotation: [0.3, 0, 0], roughness: 0.8
  })
  return group
}

// ─── 密封件 (seal) ───
function seal() {
  const group = new THREE.Group()
  // O型圈
  mesh(group, new THREE.TorusGeometry(0.2, 0.05, 16, 32), 0x1a1a1a, {
    position: [0, 0.2, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.1, roughness: 0.7
  })
  // 油封体
  mesh(group, new THREE.CylinderGeometry(0.25, 0.25, 0.08, 24), 0x8a6d3b, {
    position: [0, 0.08, 0], metalness: 0.2, roughness: 0.5
  })
  mesh(group, new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20), 0x4a4030, {
    position: [0, 0.08, 0], metalness: 0.1, roughness: 0.6
  })
  // 弹簧
  mesh(group, new THREE.TorusGeometry(0.16, 0.015, 6, 20), 0x8a949f, {
    position: [0, 0.12, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.9
  })
  return group
}

// ─── 管接头 (pipe-fitting) ───
function pipeFitting() {
  const group = new THREE.Group()
  // 直通本体
  mesh(group, new THREE.CylinderGeometry(0.1, 0.1, 0.4, 20), 0x6b7785, {
    position: [0, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.25
  })
  // 螺纹端 x2
  for (const x of [-0.25, 0.25]) {
    for (let i = 0; i < 4; i++) {
      mesh(group, new THREE.TorusGeometry(0.1, 0.01, 6, 20), 0x4a5560, {
        position: [x + (i - 1.5) * 0.015, 0.2, 0], rotation: [0, Math.PI / 2, 0], metalness: 0.6
      })
    }
  }
  // 六角螺帽 x2
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), 0x4a5560, {
    position: [-0.15, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6
  })
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), 0x4a5560, {
    position: [0.15, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6
  })
  // 内孔
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.42, 12), 0x1a1a1a, {
    position: [0, 0.2, 0], rotation: [0, 0, Math.PI / 2]
  })
  return group
}

// ─── 离合器 (clutch) ───
function clutch() {
  const group = new THREE.Group()
  // 主动盘
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), 0x6b7785, {
    position: [-0.12, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.25
  })
  // 从动盘
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), 0x6b7785, {
    position: [0.12, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7, roughness: 0.25
  })
  // 摩擦片(红色)
  mesh(group, new THREE.CylinderGeometry(0.28, 0.28, 0.02, 24), 0xd23a43, {
    position: [0, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.2, roughness: 0.5
  })
  // 弹簧 x4
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), 0x8a949f, {
      position: [Math.cos(angle) * 0.2, 0.3 + Math.sin(angle) * 0.2, 0],
      rotation: [0, 0, Math.PI / 2], metalness: 0.9
    })
  }
  // 中心轴
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12), 0x27313a, {
    position: [0, 0.3, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.85
  })
  return group
}

// ─── 电缆/线材 (cable) ───
function cable() {
  const group = new THREE.Group()
  // 电缆体(弯曲)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.4, 0.05, 0),
    new THREE.Vector3(-0.2, 0.3, 0),
    new THREE.Vector3(0, 0.1, 0),
    new THREE.Vector3(0.2, 0.35, 0),
    new THREE.Vector3(0.4, 0.15, 0)
  ])
  const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.04, 8)
  mesh(group, tubeGeo, 0x1a1a1a, { metalness: 0.1, roughness: 0.8 })
  // 端子 x2
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), 0xd4a72c, {
    position: [-0.4, 0.05, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9
  })
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), 0xd4a72c, {
    position: [0.4, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9
  })
  return group
}

// ─── 制动器 (brake) ───
function brake() {
  const group = new THREE.Group()
  // 制动盘
  mesh(group, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 32), 0x6b7785, {
    position: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.85, roughness: 0.2
  })
  // 卡钳
  mesh(group, new THREE.BoxGeometry(0.15, 0.3, 0.2), 0xd23a43, {
    position: [0, 0.3, 0.12], metalness: 0.3, roughness: 0.4
  })
  // 制动片
  mesh(group, new THREE.BoxGeometry(0.04, 0.25, 0.18), 0x1a1a1a, {
    position: [0, 0.3, 0.04], roughness: 0.8
  })
  mesh(group, new THREE.BoxGeometry(0.04, 0.25, 0.18), 0x1a1a1a, {
    position: [0, 0.3, -0.04], roughness: 0.8
  })
  // 油管
  mesh(group, new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), 0x27313a, {
    position: [0, 0.5, 0.15], metalness: 0.2, roughness: 0.7
  })
  // 安装支架
  mesh(group, new THREE.BoxGeometry(0.1, 0.04, 0.22), 0x4a5560, { position: [0, 0.48, 0.12] })
  // 中心轴
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10), 0x27313a, {
    position: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.9
  })
  return group
}

// ─── 电源 (power-supply) ───
function powerSupply() {
  const group = new THREE.Group()
  // 外壳
  mesh(group, new THREE.BoxGeometry(0.8, 1.2, 0.4), 0x3a4858, { position: [0, 0.6, 0], metalness: 0.3, roughness: 0.4 })
  // 面板
  mesh(group, new THREE.BoxGeometry(0.7, 1.1, 0.04), 0x1a2332, { position: [0, 0.6, 0.2] })
  // 输出端子排
  mesh(group, new THREE.BoxGeometry(0.6, 0.15, 0.04), 0x2a3548, { position: [0, 0.2, 0.22] })
  // 端子 x6 (V+/V-)
  for (let i = 0; i < 6; i++) {
    const color = i % 2 === 0 ? 0xd23a43 : 0x1a1a1a
    mesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), color, {
      position: [-0.22 + i * 0.09, 0.2, 0.24], rotation: [Math.PI / 2, 0, 0], metalness: 0.8
    })
  }
  // 输入端子 x3
  mesh(group, new THREE.BoxGeometry(0.4, 0.1, 0.04), 0x2a3548, { position: [0, 0.95, 0.22] })
  for (let i = 0; i < 3; i++) {
    const colors = [0xd4a72c, 0xd4a72c, 0x1a1a1a]
    mesh(group, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), colors[i], {
      position: [-0.1 + i * 0.1, 0.95, 0.24], rotation: [Math.PI / 2, 0, 0], metalness: 0.8
    })
  }
  // LED指示灯
  mesh(group, new THREE.SphereGeometry(0.025, 10, 8), 0x10b981, { position: [0, 1.05, 0.22] })
  // 通风孔 x5
  for (let i = 0; i < 5; i++) {
    mesh(group, new THREE.BoxGeometry(0.3, 0.02, 0.02), 0x1a2332, { position: [0, 0.5 + i * 0.06, 0.2] })
  }
  return group
}

// ─── 条码/扫描设备 (barcode-scanner) ───
function barcodeScanner() {
  const group = new THREE.Group()
  // 主体
  mesh(group, new THREE.BoxGeometry(0.3, 0.5, 0.2), 0x2a3548, { position: [0, 0.25, 0], metalness: 0.4 })
  // 扫描窗口
  mesh(group, new THREE.BoxGeometry(0.18, 0.08, 0.02), 0xd23a43, { position: [0, 0.1, 0.1], metalness: 0.2 })
  // 扫描激光线
  mesh(group, new THREE.BoxGeometry(0.2, 0.005, 0.005), 0xff0040, { position: [0, 0.06, 0.12] })
  // 顶部指示灯
  mesh(group, new THREE.SphereGeometry(0.03, 12, 8), 0x10b981, { position: [0, 0.52, 0] })
  // 安装支架
  mesh(group, new THREE.BoxGeometry(0.04, 0.3, 0.04), 0x4a5560, { position: [0, -0.05, 0], metalness: 0.5 })
  mesh(group, new THREE.BoxGeometry(0.2, 0.04, 0.04), 0x4a5560, { position: [0, -0.18, 0], metalness: 0.5 })
  // 电缆
  mesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), 0x1a1a1a, {
    position: [0.12, 0.35, 0], rotation: [0, 0, Math.PI / 2], roughness: 0.8
  })
  return group
}

// ─── 风机 (fan) ───
function fan() {
  const group = new THREE.Group()
  // 外壳(圆形)
  mesh(group, new THREE.CylinderGeometry(0.35, 0.35, 0.15, 24), 0x4a5560, {
    position: [0, 0.35, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.5, roughness: 0.4
  })
  // 风扇叶片 x5
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    mesh(group, new THREE.BoxGeometry(0.25, 0.02, 0.08), 0x1a1a1a, {
      position: [Math.cos(angle) * 0.15, 0.35 + Math.sin(angle) * 0.15, 0.08],
      rotation: [angle, 0, 0], roughness: 0.6
    })
  }
  // 中心轴
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12), 0x8a949f, {
    position: [0, 0.35, 0.08], rotation: [Math.PI / 2, 0, 0], metalness: 0.8
  })
  // 安装支架 x4
  for (const [x, z] of [[-0.32, 0], [0.32, 0], [0, -0.32], [0, 0.32]]) {
    mesh(group, new THREE.BoxGeometry(0.08, 0.04, 0.08), 0x4a5560, { position: [x, 0.05, z] })
  }
  // 电源线
  mesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), 0x1a1a1a, {
    position: [0, 0.2, -0.2], roughness: 0.8
  })
  return group
}

// ─── 电动缸 (electric-cylinder) ───
function electricCylinder() {
  const group = new THREE.Group()
  // 电机部分
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.18, 20), 0x3a4858, {
    position: [-0.35, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.4
  })
  // 缸体
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.5, 16), 0x6b7785, {
    position: [0, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6, roughness: 0.3
  })
  // 推杆
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12), 0x9aa4ae, {
    position: [0.35, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1
  })
  // 推杆头
  mesh(group, new THREE.SphereGeometry(0.05, 12, 10), 0x4a5560, { position: [0.5, 0.2, 0], metalness: 0.7 })
  // 法兰
  mesh(group, new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), 0x4a5560, {
    position: [0.25, 0.2, 0], rotation: [0, 0, Math.PI / 2]
  })
  // 安装脚
  mesh(group, new THREE.BoxGeometry(0.04, 0.1, 0.16), 0x4a5560, { position: [-0.2, 0.05, 0] })
  return group
}

// ─── 5G/CPE (5g-cpe) ───
function cpe5g() {
  const group = new THREE.Group()
  // 主体
  mesh(group, new THREE.BoxGeometry(0.4, 0.5, 0.12), 0xe8edf2, { position: [0, 0.25, 0], metalness: 0.3, roughness: 0.4 })
  // 屏幕
  mesh(group, new THREE.BoxGeometry(0.28, 0.2, 0.02), 0x1a2332, { position: [0, 0.35, 0.06] })
  mesh(group, new THREE.BoxGeometry(0.2, 0.12, 0.01), 0x0a8a4a, { position: [0, 0.35, 0.07] })
  // LED x3
  const ledColors = [0x10b981, 0x10b981, 0xf59e0b]
  for (let i = 0; i < 3; i++) {
    mesh(group, new THREE.SphereGeometry(0.015, 8, 6), ledColors[i], { position: [-0.1 + i * 0.1, 0.18, 0.06] })
  }
  // 天线 x2
  mesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), 0x1a1a1a, {
    position: [-0.15, 0.7, 0], rotation: [0, 0, 0.1], roughness: 0.6
  })
  mesh(group, new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), 0x1a1a1a, {
    position: [0.15, 0.7, 0], rotation: [0, 0, -0.1], roughness: 0.6
  })
  // 天线底座 x2
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), 0x4a5560, { position: [-0.15, 0.5, 0] })
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), 0x4a5560, { position: [0.15, 0.5, 0] })
  return group
}

// ─── 熔断器 (fuse) ───
function fuse() {
  const group = new THREE.Group()
  // 陶瓷管
  mesh(group, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 16), 0xe8edf2, {
    position: [0, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.1, roughness: 0.4
  })
  // 熔丝(内部,可见)
  mesh(group, new THREE.CylinderGeometry(0.005, 0.005, 0.28, 6), 0xd4a72c, {
    position: [0, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9
  })
  // 端帽 x2
  mesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), 0x8a949f, {
    position: [-0.17, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7
  })
  mesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), 0x8a949f, {
    position: [0.17, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.7
  })
  // 底座 x2
  for (const x of [-0.17, 0.17]) {
    mesh(group, new THREE.BoxGeometry(0.08, 0.06, 0.12), 0x1a2332, { position: [x, 0.03, 0] })
    mesh(group, new THREE.BoxGeometry(0.04, 0.02, 0.08), 0x6b7785, { position: [x, 0.07, 0], metalness: 0.5 })
  }
  return group
}

// ─── 消声器 (muffler) ───
function muffler() {
  const group = new THREE.Group()
  // 主体
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.25, 16), 0x8a949f, {
    position: [0, 0.12, 0], metalness: 0.5, roughness: 0.35
  })
  // 多孔外壳(简化为环)
  for (let i = 0; i < 5; i++) {
    mesh(group, new THREE.TorusGeometry(0.08, 0.005, 4, 16), 0x4a5560, {
      position: [0, 0.02 + i * 0.05, 0], rotation: [Math.PI / 2, 0, 0]
    })
  }
  // 接口螺纹
  for (let i = 0; i < 3; i++) {
    mesh(group, new THREE.TorusGeometry(0.04, 0.005, 4, 12), 0x4a5560, {
      position: [0, 0.28 + i * 0.015, 0], rotation: [Math.PI / 2, 0, 0]
    })
  }
  // 接口管
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), 0x6b7785, {
    position: [0, 0.33, 0], metalness: 0.6
  })
  return group
}

// ─── HMI/触摸屏 (hmi-panel) ───
function hmiPanel() {
  const group = new THREE.Group()
  // 外壳
  mesh(group, new THREE.BoxGeometry(0.7, 0.55, 0.08), 0x3a4858, { position: [0, 0.27, 0], metalness: 0.3, roughness: 0.4 })
  // 屏幕
  mesh(group, new THREE.BoxGeometry(0.56, 0.4, 0.02), 0x1a2332, { position: [0, 0.3, 0.04] })
  // 显示内容(蓝色)
  mesh(group, new THREE.BoxGeometry(0.5, 0.34, 0.01), 0x0a4a8a, { position: [0, 0.3, 0.05] })
  // 按钮 x4
  for (let i = 0; i < 4; i++) {
    mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), 0x6b7785, {
      position: [-0.25 + i * 0.16, 0.08, 0.04], rotation: [Math.PI / 2, 0, 0], metalness: 0.5
    })
  }
  // 安装边框
  mesh(group, new THREE.BoxGeometry(0.74, 0.02, 0.1), 0x4a5560, { position: [0, 0.54, 0] })
  mesh(group, new THREE.BoxGeometry(0.74, 0.02, 0.1), 0x4a5560, { position: [0, 0, 0] })
  mesh(group, new THREE.BoxGeometry(0.02, 0.56, 0.1), 0x4a5560, { position: [-0.36, 0.27, 0] })
  mesh(group, new THREE.BoxGeometry(0.02, 0.56, 0.1), 0x4a5560, { position: [0.36, 0.27, 0] })
  return group
}

// ─── 控制板/面板 (control-board) ───
function controlBoard() {
  const group = new THREE.Group()
  // PCB底板
  mesh(group, new THREE.BoxGeometry(0.5, 0.02, 0.4), 0x0a5a2a, { position: [0, 0.01, 0], metalness: 0.2, roughness: 0.6 })
  // 电子元件
  mesh(group, new THREE.BoxGeometry(0.12, 0.06, 0.08), 0x1a1a1a, { position: [-0.15, 0.05, 0], metalness: 0.3 })
  mesh(group, new THREE.BoxGeometry(0.08, 0.05, 0.06), 0x1a1a1a, { position: [0.1, 0.045, -0.1] })
  // 电容 x3
  for (const [x, z] of [[-0.05, 0.1], [0.05, 0.1], [0.15, 0.05]]) {
    mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), 0x4a5560, {
      position: [x, 0.06, z], metalness: 0.5
    })
    mesh(group, new THREE.CylinderGeometry(0.028, 0.028, 0.01, 12), 0x1a1a1a, { position: [x, 0.1, z] })
  }
  // 排针
  for (let i = 0; i < 8; i++) {
    mesh(group, new THREE.BoxGeometry(0.015, 0.04, 0.015), 0xd4a72c, {
      position: [-0.18 + i * 0.05, 0.03, -0.15], metalness: 0.8
    })
  }
  // 接线端子 x2
  mesh(group, new THREE.BoxGeometry(0.1, 0.08, 0.12), 0x2a3548, { position: [-0.2, 0.05, 0.12] })
  mesh(group, new THREE.BoxGeometry(0.1, 0.08, 0.12), 0x2a3548, { position: [0.2, 0.05, 0.12] })
  return group
}

// ─── 减速机 (reducer, 独立于gearmotor) ───
function reducer() {
  const group = new THREE.Group()
  // 齿轮箱
  mesh(group, new THREE.BoxGeometry(0.4, 0.5, 0.4), 0x4a5560, { position: [0, 0.25, 0], metalness: 0.5, roughness: 0.4 })
  // 输入轴(电机侧)
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), 0x8a949f, {
    position: [0, 0.55, 0], metalness: 0.9, roughness: 0.1
  })
  // 输出轴
  mesh(group, new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), 0x9aa4ae, {
    position: [0.32, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.9, roughness: 0.1
  })
  // 输出法兰
  mesh(group, new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), 0x6b7785, {
    position: [0.22, 0.15, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.6
  })
  // 油窗
  mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), 0xe8a128, {
    position: [-0.21, 0.2, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.2
  })
  // 放油螺栓
  mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), 0x27313a, {
    position: [0, 0.03, 0.21], rotation: [Math.PI / 2, 0, 0], metalness: 0.7
  })
  // 底座
  mesh(group, new THREE.BoxGeometry(0.5, 0.04, 0.45), 0x3a4858, { position: [0, 0.02, 0] })
  return group
}

const models = [
  // 第一批(14个)
  { name: 'contactor', factory: contactor },
  { name: 'vfd', factory: vfd },
  { name: 'relay', factory: relay },
  { name: 'soft-starter', factory: softStarter },
  { name: 'belt', factory: belt },
  { name: 'coupling', factory: coupling },
  { name: 'encoder', factory: encoder },
  { name: 'motor', factory: motor },
  { name: 'plc-module', factory: plcModule },
  { name: 'instrument', factory: instrument },
  { name: 'resistor', factory: resistor },
  { name: 'auxiliary-contact', factory: auxiliaryContact },
  { name: 'switch', factory: switchBtn },
  { name: 'junction-box', factory: junctionBox },
  // 第二批(26个)
  { name: 'chain', factory: chain },
  { name: 'cylinder', factory: cylinder },
  { name: 'scraper', factory: scraper },
  { name: 'flexible-connector', factory: flexibleConnector },
  { name: 'filter-mesh', factory: filterMesh },
  { name: 'adapter-sleeve', factory: adapterSleeve },
  { name: 'network-switch', factory: networkSwitch },
  { name: 'pneumatic-unit', factory: pneumaticUnit },
  { name: 'rgv-part', factory: rgvPart },
  { name: 'gear-sprocket', factory: gearSprocket },
  { name: 'level-sensor', factory: levelSensor },
  { name: 'seal', factory: seal },
  { name: 'pipe-fitting', factory: pipeFitting },
  { name: 'clutch', factory: clutch },
  { name: 'cable', factory: cable },
  { name: 'brake', factory: brake },
  { name: 'power-supply', factory: powerSupply },
  { name: 'barcode-scanner', factory: barcodeScanner },
  { name: 'fan', factory: fan },
  { name: 'electric-cylinder', factory: electricCylinder },
  { name: '5g-cpe', factory: cpe5g },
  { name: 'fuse', factory: fuse },
  { name: 'muffler', factory: muffler },
  { name: 'hmi-panel', factory: hmiPanel },
  { name: 'control-board', factory: controlBoard },
  { name: 'reducer', factory: reducer }
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
console.log(`\nDone! Generated ${models.length} extra category models in ${outputDir}`)
