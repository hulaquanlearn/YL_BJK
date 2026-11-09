<template>
  <section class="control-room-model" aria-label="中控室九台电脑三维布局">
    <div class="room-toolbar"><slot name="actions" /><div><button type="button" @click="reset">复位视角</button><button type="button" @click="topView">俯视</button></div></div>
    <div ref="host" class="room-canvas" :class="{ unavailable }">
      <p v-if="unavailable" class="room-fallback">当前设备无法显示三维图，请从下方编号选择电脑。</p>
      <svg class="room-leaders" aria-hidden="true"><template v-for="computer in controlComputers" :key="computer.id"><line v-if="positions[computer.id]?.visible&&positions[computer.id]?.moved" :x1="positions[computer.id].anchorX" :y1="positions[computer.id].anchorY" :x2="positions[computer.id].x" :y2="positions[computer.id].y" /></template></svg>
      <button v-for="computer in controlComputers" v-show="!unavailable && positions[computer.id]?.visible" :key="computer.id" class="room-number" :class="{ active: selected === computer.id }" :style="{left:positions[computer.id]?.x+'px',top:positions[computer.id]?.y+'px'}" :aria-label="`选择${computer.id}号电脑，${computer.row}`" :aria-pressed="selected === computer.id" @pointerdown.stop @click.stop="$emit('select', computer.id)">{{ computer.id }}</button>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { controlComputers, createControlRoom, layoutControlLabels } from '../utils/control-room.mjs'
const props = defineProps({ selected: Number })
const emit = defineEmits(['select'])
const host = ref(null), unavailable = ref(false), positions = ref({})
let renderer, scene, camera, controls, room, observer, frame = 0, down
function draw() {
  frame = 0
  if (!renderer || !host.value) return
  renderer.render(scene, camera)
  const width = host.value.clientWidth, height = host.value.clientHeight, next = {}
  for (const [id, computer] of room.computers) {
    computer.frame.emissiveIntensity = props.selected === id ? .8 : 0
    const point = computer.label.clone().project(camera)
    next[id] = { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, visible: Math.abs(point.x) < .96 && Math.abs(point.y) < .92 && point.z < 1 }
  }
  positions.value = layoutControlLabels(next,{width,height,size:width<650?32:36,gap:4})
  renderer.render(scene, camera)
}
function schedule() { if (!frame) frame = requestAnimationFrame(draw) }
function resize() {
  if (!renderer || !host.value) return
  const { clientWidth: width, clientHeight: height } = host.value
  if (!width || !height) return
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); schedule()
}
function reset() {
  if (!camera) return
  camera.position.set(8, 8.5, 13)
  controls.target.set(-.25, .6, -2); controls.update(); fit(); schedule()
}
function fit() {
  const points=[]
  room.root.updateMatrixWorld(true)
  room.root.traverse(object=>{
    if(!object.isMesh)return
    object.geometry.computeBoundingBox();const bounds=object.geometry.boundingBox
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld))
  })
  for(let pass=0;pass<3;pass++) {
    camera.updateMatrixWorld();let extent=0
    for(const corner of points) {
      const point=corner.clone().project(camera);extent=Math.max(extent,Math.abs(point.x),Math.abs(point.y))
    }
    camera.position.copy(controls.target.clone().add(camera.position.clone().sub(controls.target).multiplyScalar(extent/.9)));controls.update()
  }
}
function topView() { if (camera) { camera.position.set(0, 19, 1.8); controls.target.set(0, 0, -2); controls.update(); fit(); schedule() } }
function pointerDown(event) { down = { x: event.clientX, y: event.clientY } }
function pointerUp(event) {
  if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
  down = null
  const rect = host.value.getBoundingClientRect(), ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera)
  const hit = ray.intersectObjects(room.targets, false)[0]
  if (hit) emit('select', hit.object.userData.computerId)
}
watch(() => props.selected, schedule)
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor('#e7eff3'); renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-label', '中控室三维图，可拖动旋转')
    host.value.prepend(renderer.domElement)
    scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight('#f4fcff', '#637987', 2.5))
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(3, 10, 7); scene.add(light)
    room = createControlRoom(); scene.add(room.root)
    camera = new THREE.PerspectiveCamera(43, 1, .1, 100)
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.enablePan = false
    controls.minDistance = 7; controls.maxDistance = 45; controls.minPolarAngle = .12; controls.maxPolarAngle = Math.PI * .47
    controls.addEventListener('change', schedule)
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp)
    observer = new ResizeObserver(resize); observer.observe(host.value); resize(); reset()
  } catch { unavailable.value = true }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose()
  renderer?.domElement.removeEventListener('pointerdown', pointerDown); renderer?.domElement.removeEventListener('pointerup', pointerUp)
  scene?.traverse(object => { object.geometry?.dispose(); if (object.material) for (const material of [object.material].flat()) material.dispose() })
  renderer?.dispose(); renderer?.domElement.remove()
})
</script>

<style scoped>
.control-room-model{overflow:hidden;border:1px solid #d9e5eb;border-radius:16px;background:#e7eff3}.room-toolbar{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:12px 16px;background:#f8fbfd;font-weight:600;color:#27485b}.room-toolbar>div{display:flex;gap:8px}.room-toolbar button{min-height:36px;padding:6px 12px;border:1px solid #c9d9e2;border-radius:8px;background:white;color:#36566b;cursor:pointer}.room-canvas{position:relative;height:clamp(420px,65vh,760px)}.room-canvas :deep(canvas){display:block;width:100%;height:100%;touch-action:none}.room-leaders{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.room-leaders line{stroke:#597b91;stroke-width:1.2;stroke-opacity:.8}.room-number{position:absolute;transform:translate(-50%,-50%);width:36px;height:36px;border:2px solid white;border-radius:50%;background:#34556b;color:white;box-shadow:0 2px 8px #213e5340;font-size:17px;font-weight:700;cursor:pointer}.room-number.active{background:#087f8c;box-shadow:0 0 0 4px #13a7b52e}.room-number:focus-visible{outline:3px solid #e89d27;outline-offset:3px}.room-fallback{padding:80px 24px;text-align:center;color:#607383}@media(max-width:760px){.room-canvas{height:440px}.room-number{width:32px;height:32px;font-size:15px}.room-toolbar{padding:10px;font-size:14px}}
</style>
