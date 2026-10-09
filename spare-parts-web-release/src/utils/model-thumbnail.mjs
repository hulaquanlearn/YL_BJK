import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PUBLIC_PART_MODEL, createPublicPartModel } from './public-part-model.mjs'

// Serialize card renders through one temporary context, rather than one per card.
const cache = new Map()
let queue = Promise.resolve()
let renderer
let releaseTimer
function disposeModel(root) {
  const textures = new Set()
  root.traverse(node => {
    node.geometry?.dispose()
    for (const material of [].concat(node.material || [])) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
      material.dispose()
    }
  })
  textures.forEach(texture => texture.dispose())
}
async function renderThumbnail(url, rotation) {
  let root
  clearTimeout(releaseTimer)
  try {
    root = url === PUBLIC_PART_MODEL ? createPublicPartModel() : (await new GLTFLoader().loadAsync(url)).scene
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
      renderer.setSize(400, 320)
      renderer.setPixelRatio(1)
    }
    root.rotation.y = Number(rotation) || 0
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const extent = Math.max(size.x, size.y, size.z)
    if (!Number.isFinite(extent) || extent <= 0) throw new Error('模型没有有效几何尺寸')
    root.position.sub(box.getCenter(new THREE.Vector3()))
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f5f7fa')
    scene.add(root, new THREE.HemisphereLight(0xffffff, 0x8996a8, 3))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(extent, extent * 2, extent * 3)
    scene.add(light)
    const camera = new THREE.PerspectiveCamera(34, 1.25, extent / 100, extent * 100)
    camera.position.set(extent * .65, extent * .4, extent * 2.7)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  } finally {
    if (root) disposeModel(root)
    releaseTimer = setTimeout(() => {
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = undefined
    }, 1500)
  }
}
export function modelThumbnail(url, rotation = 0) {
  const key = JSON.stringify([url, Number(rotation) || 0])
  if (cache.has(key)) return cache.get(key)
  const result = queue.then(() => renderThumbnail(url, rotation))
  queue = result.catch(() => {})
  cache.set(key, result)
  result.catch(() => cache.delete(key))
  if (cache.size > 48) cache.delete(cache.keys().next().value)
  return result
}
if (typeof window !== 'undefined') window.addEventListener('auth-changed', () => cache.clear())
