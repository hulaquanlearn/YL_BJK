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

const material = (color, metalness = 0.12, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, metalness, roughness })

function mesh(group, geometry, color, options = {}) {
  const item = new THREE.Mesh(geometry, material(color, options.metalness, options.roughness))
  item.position.set(...(options.position || [0, 0, 0]))
  item.rotation.set(...(options.rotation || [0, 0, 0]))
  group.add(item)
  return item
}

function circuitBreaker() {
  const group = new THREE.Group()
  mesh(group, new THREE.BoxGeometry(0.74, 1.18, 0.52), 0xe8edf2, { position: [0, 0.59, 0] })
  mesh(group, new THREE.BoxGeometry(0.58, 0.18, 0.54), 0xb8c2cc, { position: [0, 0.83, 0.02] })
  mesh(group, new THREE.BoxGeometry(0.18, 0.36, 0.16), 0x303944, { position: [0, 0.76, 0.32], rotation: [-0.18, 0, 0] })
  mesh(group, new THREE.BoxGeometry(0.58, 0.05, 0.55), 0xd23a43, { position: [0, 1.02, 0] })
  mesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 18), 0x8c98a4, { position: [-0.2, 0.19, 0.28], rotation: [Math.PI / 2, 0, 0], metalness: 0.7 })
  mesh(group, new THREE.CylinderGeometry(0.07, 0.07, 0.04, 18), 0x8c98a4, { position: [0.2, 0.19, 0.28], rotation: [Math.PI / 2, 0, 0], metalness: 0.7 })
  return group
}

function bearing() {
  const group = new THREE.Group()
  mesh(group, new THREE.TorusGeometry(0.48, 0.13, 16, 40), 0x9aa4ae, { position: [0, 0.5, 0], rotation: [0, 0, 0], metalness: 0.82, roughness: 0.22 })
  mesh(group, new THREE.TorusGeometry(0.25, 0.07, 14, 36), 0xd4dae0, { position: [0, 0.5, 0.01], metalness: 0.86, roughness: 0.18 })
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2
    mesh(group, new THREE.SphereGeometry(0.065, 12, 10), 0xc2c9d0, {
      position: [Math.cos(angle) * 0.355, 0.5 + Math.sin(angle) * 0.355, 0.075], metalness: 0.9, roughness: 0.16
    })
  }
  return group
}

function valve() {
  const group = new THREE.Group()
  mesh(group, new THREE.CylinderGeometry(0.28, 0.34, 0.52, 20), 0xb7791f, { position: [0, 0.4, 0], metalness: 0.58, roughness: 0.3 })
  mesh(group, new THREE.CylinderGeometry(0.16, 0.16, 1.15, 18), 0x8a949f, { position: [0, 0.38, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.72, roughness: 0.25 })
  mesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.58, 16), 0x626d78, { position: [0, 0.91, 0], metalness: 0.62, roughness: 0.28 })
  mesh(group, new THREE.TorusGeometry(0.36, 0.055, 12, 32), 0xd33b45, { position: [0, 1.2, 0], rotation: [Math.PI / 2, 0, 0], metalness: 0.28, roughness: 0.42 })
  mesh(group, new THREE.BoxGeometry(0.72, 0.055, 0.055), 0xd33b45, { position: [0, 1.2, 0] })
  mesh(group, new THREE.BoxGeometry(0.055, 0.055, 0.72), 0xd33b45, { position: [0, 1.2, 0] })
  return group
}

function sensor() {
  const group = new THREE.Group()
  mesh(group, new THREE.CylinderGeometry(0.24, 0.24, 0.88, 24), 0x31546f, { position: [0, 0.34, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.36, roughness: 0.38 })
  mesh(group, new THREE.CylinderGeometry(0.245, 0.245, 0.12, 24), 0x15a67c, { position: [0.5, 0.34, 0], rotation: [0, 0, Math.PI / 2] })
  mesh(group, new THREE.CylinderGeometry(0.13, 0.13, 0.16, 20), 0xdbe5ec, { position: [-0.52, 0.34, 0], rotation: [0, 0, Math.PI / 2], metalness: 0.4 })
  mesh(group, new THREE.TorusGeometry(0.27, 0.045, 10, 24), 0xe2a128, { position: [0.14, 0.34, 0], rotation: [0, Math.PI / 2, 0] })
  mesh(group, new THREE.CylinderGeometry(0.045, 0.045, 0.62, 12), 0x27313a, { position: [-0.77, 0.34, 0], rotation: [0, 0, Math.PI / 2] })
  return group
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

async function writeModel(filename, factory) {
  const scene = new THREE.Scene()
  scene.name = filename.replace('.glb', '')
  scene.add(normalize(factory()))
  const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, trs: false })
  await fs.writeFile(path.join(outputDir, filename), Buffer.from(result))
}

await fs.mkdir(outputDir, { recursive: true })
await writeModel('circuit-breaker.glb', circuitBreaker)
await writeModel('bearing.glb', bearing)
await writeModel('valve.glb', valve)
await writeModel('sensor.glb', sensor)
console.log(`Generated 4 category models in ${outputDir}`)
