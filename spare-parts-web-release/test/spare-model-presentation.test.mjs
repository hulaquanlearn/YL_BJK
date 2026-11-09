import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
import { parse as parseJs } from '@babel/parser'
import { parse as parseSfc, compileStyle } from '@vue/compiler-sfc'
import postcss from 'postcss'
import { createShowroom, createShowroomBackground, showroomPalette } from '../src/utils/showroom-stage.mjs'
import { normalizeShowroomModel } from '../src/utils/model-observation.mjs'

const previewUrl = new URL('../src/components/ModelPreview.vue', import.meta.url)
const previewSource = fs.readFileSync(previewUrl, 'utf8')
const { descriptor } = parseSfc(previewSource, { filename: previewUrl.pathname })
const script = descriptor.scriptSetup.content
const mounted = parseJs(script, { sourceType: 'module' }).program.body.find(node =>
  node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'onMounted'
).expression.arguments[0]
const mountedCode = script.slice(mounted.start, mounted.end)

function canvasDocument() {
  const stops = [], fills = []
  const canvas = { width: 0, height: 0, getContext: () => ({
    createLinearGradient: () => ({ addColorStop: (at, color) => stops.push({ at, color }) }),
    fillRect: (...args) => fills.push(args)
  }) }
  return { stops, fills, canvas, createElement: name => { assert.equal(name, 'canvas'); return canvas }, addEventListener() {} }
}

function luminance(value) {
  const color = new THREE.Color(typeof value === 'string' ? value.slice(0, 7) : value)
  return color.r * .2126 + color.g * .7152 + color.b * .0722
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
function release(object) {
  const geometries = new Set(), materials = new Set()
  object.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const material of [].concat(node.material || [])) materials.add(material) })
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
}

test('real stage uses a neutral light deck with the model resting exactly on its contact plane', () => {
  const stage = createShowroom(THREE)
  const source = new THREE.Mesh(new THREE.BoxGeometry(.12, .33, .06), new THREE.MeshStandardMaterial({ color: '#b3b7bc' }))
  const originalMaterial = source.material
  const model = normalizeShowroomModel(THREE, source, .55, stage.userData.contactY)
  try {
    assert.equal(stage.userData.presentation, 'light-steel-blue')
    assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.y - stage.userData.contactY) < 1e-6)
    const decks = stage.children.filter(node => node.isMesh && node.geometry.type === 'CylinderGeometry')
    assert.equal(decks.length, 3)
    assert.ok(Math.abs(Math.max(...decks.map(node => new THREE.Box3().setFromObject(node).max.y)) - stage.userData.contactY) < 1e-6)
    stage.traverse(node => {
      assert.ok(!node.isLight, 'decoration must not add colored lights to the part')
      if (node.material?.isMeshStandardMaterial) {
        assert.ok(luminance(node.material.color.getHex()) > .30, 'stage surfaces stay neutral light gray or steel blue')
        assert.equal(node.material.emissive.getHex(), 0)
      }
    })
    assert.equal(source.material, originalMaterial, 'presentation must not replace the asset material')
    assert.equal(source.material.color.getHexString(), 'b3b7bc')
  } finally { release(model); release(stage) }
})

test('real background texture paints only light neutral gradient stops', () => {
  const previous = globalThis.document, document = canvasDocument()
  globalThis.document = document
  let texture
  try {
    texture = createShowroomBackground(THREE)
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
    assert.equal(texture.image, document.canvas)
    assert.deepEqual(document.fills, [[0, 0, 512, 512]])
    assert.equal(document.stops.length, 3)
    // The studio keeps a light-to-mid neutral gradient so white/grey plastic
    // shells still read against it; no dark or coloured stop is allowed.
    for (const stop of document.stops) assert.ok(luminance(stop.color) > .70)
    assert.ok(document.stops.some(stop => stop.color === showroomPalette.background))
  } finally { texture?.dispose(); globalThis.document = previous }
})

// Execute the production mounted callback with real scene, colors, lights and stage.
// GPU/DOM/observer ports are synthetic: this verifies initialization, not rendered pixels.
function mountPreview(objectOnly = false) {
  const document = canvasDocument(), error = { value: '' }
  const domElement = { setAttribute() {}, addEventListener() {} }
  class Renderer {
    constructor() { this.domElement = domElement; this.shadowMap = {} }
    setPixelRatio() {}
  }
  class Controls {
    constructor() { this.target = new THREE.Vector3() }
    addEventListener() {}
  }
  class Outline {
    constructor() { this.visibleEdgeColor = new THREE.Color(); this.hiddenEdgeColor = new THREE.Color() }
  }
  class Composer { constructor() { this.passes = [] } addPass(value) { this.passes.push(value) } }
  const context = vm.createContext({
    THREE: { ...THREE, WebGLRenderer: Renderer, PMREMGenerator: class { fromScene() { return { texture: {}, dispose() {} } } dispose() {} } },
    props: { objectOnly }, createShowroom, createShowroomBackground: () => new THREE.Texture(), showroomPalette,
    RoomEnvironment: class { dispose() {} }, OrbitControls: Controls, EffectComposer: Composer,
    RenderPass: class {}, OutlinePass: Outline, OutputPass: class {}, ResizeObserver: class { observe() {} },
    surface: { value: { appendChild() {} } }, rendererReady: { value: false }, loading: { value: false }, error,
    document, window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
    requestRender() {}, onPointerDown() {}, onPointerUp() {}, resetView() {}, resize() {}, loadModel() {}
  })
  vm.runInContext(`let scene,camera,renderer,controls,resizeObserver,composer,outline,environmentTarget,backgroundTexture,stage; (${mountedCode})(); globalThis.result={scene,stage,outline,backgroundTexture};`, context, { filename: previewUrl.pathname })
  assert.equal(error.value, '', 'production initialization must reach its ready branch')
  return context.result
}

test('production preview initialization uses the light palette for fog and selected part edges', () => {
  const result = mountPreview()
  try {
    assert.equal(result.scene.fog.color.getHex(), showroomPalette.fog, 'a light texture must not mix with the previous dark fog')
    assert.equal(result.outline.visibleEdgeColor.getHexString(), showroomPalette.outline.slice(1))
    assert.equal(result.outline.hiddenEdgeColor.getHexString(), showroomPalette.hiddenOutline.slice(1))
    assert.equal(result.stage.userData.presentation, 'light-steel-blue')
    assert.equal(result.scene.children.filter(node => node.isDirectionalLight).length, 3)
    for (const light of result.scene.children.filter(node => node.isDirectionalLight)) assert.equal(light.color.getHex(), 0xffffff)
  } finally { release(result.scene); result.backgroundTexture?.dispose() }
})

test('production thumbnail initialization stays transparent with no showroom or fog', () => {
  const result = mountPreview(true)
  try {
    assert.equal(result.scene.background, null)
    assert.equal(result.scene.fog, null)
    assert.equal(result.stage, undefined)
    assert.equal(result.scene.children.filter(node => node.isMesh).length, 0)
  } finally { release(result.scene) }
})

function styles(filename) {
  const { descriptor, errors } = parseSfc(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), { filename })
  assert.deepEqual(errors, [])
  const rules = new Map()
  for (const style of descriptor.styles) {
    const compiled = compileStyle({ source: style.content, filename, id: 'spare-light-contract', scoped: true })
    assert.deepEqual(compiled.errors, [])
    postcss.parse(style.content).walkRules(rule => {
      if (rule.parent.type !== 'root') return
      for (const selector of rule.selectors) {
        const existing = rules.get(selector) || {}
        rule.walkDecls(decl => { existing[decl.prop] = decl.value })
        rules.set(selector, existing)
      }
    })
  }
  return rules
}

test('catalog panels and selected controls share the light steel-blue surface and readable text', () => {
  const rules = styles('../src/components/ModelCatalogShowroom.vue')
  for (const selector of ['.catalog-showroom', '.catalog-choices button.active', '.catalog-observation', '.review-filter button', '.review-filter button[aria-pressed=true]']) {
    const rule = rules.get(selector)
    assert.ok(luminance(rule.background) > .65, `${selector}: no dark panel left in the light showroom`)
    assert.ok(contrast(rule.color, rule.background) >= 4.5, `${selector}: normal text remains readable`)
  }
  assert.ok(luminance(rules.get('.catalog-stage').background) > .8)
  assert.ok(rules.has('.catalog-choices button:focus-visible'))
})

test('model descriptions and annotation overflow controls no longer retain dark overlays', () => {
  const rules = styles('../src/components/ModelPreview.vue')
  for (const selector of ['.observation-description', '.annotation-overflow button']) {
    const rule = rules.get(selector)
    assert.ok(luminance(rule.background) > .8, `${selector}: light surface`)
    assert.ok(contrast(rule.color, rule.background) >= 4.5, `${selector}: readable text`)
  }
})
