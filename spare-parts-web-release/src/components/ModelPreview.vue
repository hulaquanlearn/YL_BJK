<template>
  <div ref="host" class="model-preview" :style="{ height }">
    <div v-if="loading" class="preview-message">正在加载 3D 模型…</div>
    <div v-else-if="error" class="preview-message is-error">{{ error }}</div>
    <div v-else-if="!modelUrl" class="preview-message">请选择 GLB 模型</div>
    <div class="front-marker" aria-hidden="true"><span>正面</span><i></i></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PUBLIC_PART_MODEL, createPublicPartModel } from '../utils/public-part-model.mjs'

const props = defineProps({
  modelUrl: { type: String, default: '' },
  frontRotationY: { type: Number, default: 0 },
  initialAngle: { type: Number, default: 0 },
  height: { type: String, default: '280px' }
})

const host = ref(null)
const loading = ref(false)
const error = ref('')
const loader = new GLTFLoader()
let scene
let camera
let renderer
let controls
let resizeObserver
let animationFrame
let currentModel
let loadToken = 0
let environmentTarget

function disposeObject(object) {
  object?.traverse(node => {
    node.geometry?.dispose?.()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    materials.forEach(material => {
      if (!material) return
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) material[key]?.dispose?.()
      material.dispose?.()
    })
  })
}

function clearModel() {
  if (!currentModel || !scene) return
  scene.remove(currentModel)
  disposeObject(currentModel)
  currentModel = null
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const width = Math.max(host.value.clientWidth, 1)
  const value = Math.max(host.value.clientHeight, 1)
  renderer.setSize(width, value, false)
  camera.aspect = width / value
  camera.updateProjectionMatrix()
  requestRender()
}

function frameModel(model) {
  // Re-frame from a neutral origin every time the administrator rotates by 90°;
  // otherwise repeated edits accumulate the previous centering offset.
  model.position.set(0, 0, 0)
  model.rotation.y = Number(props.frontRotationY) || 0
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) throw new Error('模型尺寸无效')
  const center = box.getCenter(new THREE.Vector3())
  model.position.x -= center.x
  model.position.y -= box.min.y
  model.position.z -= center.z
  model.updateMatrixWorld(true)
  const radius = Math.max(size.x, size.y, size.z, .01)
  const target = new THREE.Vector3(0, size.y * .46, 0)
  camera.near = Math.max(radius / 100, .001)
  camera.far = Math.max(radius * 100, 100)
  const angle=Number(props.initialAngle)||0
  const distanceFactor = 2.35 / Math.min(camera.aspect || 1, 1)
  camera.position.set(radius * (.08 + Math.sin(angle)*distanceFactor), size.y * (angle ? 1.25 : .58), radius * Math.cos(angle)*distanceFactor)
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  controls.target.copy(target)
  controls.minDistance = radius * .7
  controls.maxDistance = radius * 8
  controls.update()
  requestRender()
}

async function loadModel() {
  const token = ++loadToken
  clearModel()
  error.value = ''
  if (!props.modelUrl || !scene) { loading.value = false; return }
  loading.value = true
  try {
    const gltf = props.modelUrl === PUBLIC_PART_MODEL ? { scene: createPublicPartModel() } : await loader.loadAsync(new URL(props.modelUrl, window.location.origin).href)
    if (token !== loadToken) { disposeObject(gltf.scene); return }
    currentModel = gltf.scene
    scene.add(currentModel)
    frameModel(currentModel)
  } catch (cause) {
    if (token !== loadToken) return
    error.value = '模型无法加载，请检查 GLB 文件或资源地址'
    console.warn('类别模型预览失败', cause)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

function updateFront() {
  if (!currentModel) return
  try { frameModel(currentModel) } catch (cause) { error.value = cause.message || '模型尺寸无效' }
}

function animate() {
  animationFrame = 0
  if (document.hidden) return
  controls?.update()
  renderer?.render(scene, camera)
}

function requestRender() {
  if (!animationFrame && renderer && !document.hidden) animationFrame=requestAnimationFrame(animate)
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf5f8fc)
  camera = new THREE.PerspectiveCamera(36, 1, .01, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia('(max-width: 700px)').matches ? 1.5 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  if (props.initialAngle) {
    const environment=new RoomEnvironment()
    const pmrem=new THREE.PMREMGenerator(renderer)
    environmentTarget=pmrem.fromScene(environment,.04)
    scene.environment=environmentTarget.texture
    environment.dispose()
    pmrem.dispose()
  }
  host.value.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.addEventListener('change', requestRender)
  document.addEventListener('visibilitychange', requestRender)
  controls.enableDamping = true
  controls.enablePan = false
  scene.add(new THREE.HemisphereLight(0xffffff, 0x607080, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 2.8)
  key.position.set(3, 5, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbfd8ff, 1.2)
  fill.position.set(-4, 2, 2)
  scene.add(fill)
  const grid = new THREE.GridHelper(8, 16, 0xb9c6d6, 0xdce4ee)
  grid.material.transparent = true
  grid.material.opacity = .48
  scene.add(grid)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host.value)
  resize()
  requestRender()
  loadModel()
})

watch(() => props.modelUrl, loadModel)
watch(() => props.frontRotationY, updateFront)

onBeforeUnmount(() => {
  loadToken += 1
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  clearModel()
  environmentTarget?.dispose()
  scene?.traverse(node=>{node.geometry?.dispose?.();const mats=Array.isArray(node.material)?node.material:[node.material];mats.forEach(mat=>mat?.dispose?.())})
  controls?.dispose()
  document.removeEventListener('visibilitychange', requestRender)
  renderer?.dispose()
  renderer?.domElement?.remove()
})
</script>

<style scoped>
.model-preview{position:relative;overflow:hidden;width:100%;min-height:180px;border:1px solid #dce4ed;border-radius:12px;background:#f5f8fc}.model-preview :deep(canvas){display:block;width:100%;height:100%}.preview-message{position:absolute;inset:0;z-index:2;display:grid;place-items:center;padding:20px;color:#778398;background:#f5f8fce6;font-size:13px}.preview-message.is-error{color:#b4232d}.front-marker{position:absolute;right:12px;bottom:10px;z-index:3;display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;color:#0f6d58;background:#fffffff0;box-shadow:0 2px 8px #20304018;font-size:11px;font-weight:700;pointer-events:none}.front-marker i{width:0;height:0;border-right:5px solid transparent;border-bottom:8px solid #16a27a;border-left:5px solid transparent}
</style>
