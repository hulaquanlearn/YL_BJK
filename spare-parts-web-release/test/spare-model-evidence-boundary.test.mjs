import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import { partPhotoUrl } from '../src/utils/bound-part-model.mjs'
import { modelDisplayStatus } from '../src/utils/model-display-status.mjs'
import { modelReviewConfirmed } from '../src/utils/model-review.mjs'
import { modelReview } from '../src/utils/model-observation.mjs'
import catalog from '../src/utils/reviewed-model-catalog.json' with { type: 'json' }

const evidencePendingIds = [217, 218, 219, 220, 226, 229, 249, 252, 259, 260, 261, 262, 267, 268, 269, 274, 298, 299, 300, 301, 302]
test('specific documentation questions remain pending without erasing rebuilt mesh annotations', () => {
  const flagged = catalog.models.filter(model => evidencePendingIds.includes(model.id))
  assert.equal(flagged.length, 21)
  for (const model of flagged) {
    assert.equal(model.requiresReview, true, String(model.id))
    assert.equal(model.status, 'rebuilt', 'mesh grouping remains distinct from documentation verification')
    const status = modelDisplayStatus({ modelUrl: model.url })
    assert.equal(status.key, 'pending', String(model.id))
    assert.equal(status.description, model.note)
    assert.ok(model.note.includes(model.id >= 298 ? '来源尚待核实' : '厂家图纸'))
  }
})

test('document warnings do not invalidate unrelated assets or certify raw approval flags', () => {
  const url = catalog.models.find(model => model.id === 298).url
  assert.equal(modelDisplayStatus({ modelUrl: url, reviewDecision: { status: 'approved' } }).key, 'pending')
  assert.equal(modelDisplayStatus({ modelUrl: url, reviewDecision: { status: 'approved', valid: true } }).label, '人工核对通过')
  assert.equal(modelDisplayStatus({ modelUrl: url, reviewDecision: { status: 'approved', valid: true, stale: true } }).key, 'pending')
  assert.equal(modelDisplayStatus('/models/reviewed-20261023/skf-22220-e.glb').key, 'ready')
})

// Execute the production normalizer, not a copied implementation or a regex assertion.
const libraryUrl = new URL('../src/views/ModelLibrary.vue', import.meta.url)
const librarySource = fs.readFileSync(libraryUrl, 'utf8')
const start = librarySource.indexOf('function normalizePartRows(rows) {')
const end = librarySource.indexOf('\nasync function loadParts()', start)
assert.ok(start >= 0 && end > start, 'production normalizer must remain extractable')
const normalizationContext = vm.createContext({ partPhotoUrl })
vm.runInContext(librarySource.slice(start, end), normalizationContext, { filename: libraryUrl.pathname })
const normalizePartRows = rows => normalizationContext.normalizePartRows(rows)
const photo = '/uploads/part-images/physical.jpg'
const reference = '/models/reference.jpg'

for (const imageSource of [undefined, 'unknown', 'legacy']) {
  test(`normalizer does not certify source=${String(imageSource)} as a physical photo`, () => {
    const input = { id: 1, imageUrl: reference, categoryImageUrl: '/models/another-reference.jpg' }
    if (imageSource !== undefined) input.imageSource = imageSource
    const [row] = normalizePartRows([input])
    assert.equal(row.partImageUrl, null)
    assert.equal(partPhotoUrl(row), '')
    assert.equal(row.imageUrl, input.categoryImageUrl, 'generic reference fallback remains available')
    assert.equal(Object.hasOwn(input, 'partImageUrl'), false, 'input row is not mutated')
    const [withoutCategory] = normalizePartRows([{ id: 2, imageSource, imageUrl: reference }])
    assert.equal(withoutCategory.partImageUrl, null)
    assert.equal(withoutCategory.imageUrl, reference, 'an unknown generic image is retained but never called a physical photo')
  })
}

test('normalizer keeps category references out of the physical-photo field whether URLs match or differ', () => {
  for (const categoryImageUrl of [reference, '/models/another-reference.jpg', null]) {
    const [row] = normalizePartRows([{ id: 1, imageSource: 'category', imageUrl: reference, categoryImageUrl }])
    assert.equal(row.partImageUrl, null)
    assert.equal(row.imageUrl, categoryImageUrl || reference)
  }
})

test('normalizer accepts explicit part provenance without guessing from URL differences', () => {
  for (const categoryImageUrl of [reference, photo]) {
    const [row] = normalizePartRows([{ id: 1, imageSource: 'part', imageUrl: photo, categoryImageUrl }])
    assert.equal(row.partImageUrl, photo)
    assert.equal(row.imageUrl, photo)
  }
})

test('an explicit partImageUrl wins over generic/category provenance', () => {
  for (const imageSource of [undefined, 'category', 'part']) {
    const [row] = normalizePartRows([{ id: 1, partImageUrl: photo, imageSource, imageUrl: reference, categoryImageUrl: reference }])
    assert.equal(row.partImageUrl, photo)
    assert.equal(row.imageUrl, photo)
  }
})

for (const empty of ['', null, undefined]) {
  test(`an explicit partImageUrl=${JSON.stringify(empty)} suppresses even a part-source fallback`, () => {
    const [row] = normalizePartRows([{ id: 1, partImageUrl: empty, imageSource: 'part', imageUrl: photo, categoryImageUrl: reference }])
    assert.equal(row.partImageUrl, null)
    assert.equal(row.imageUrl, reference)
    assert.equal(partPhotoUrl(row), '')
  })
}

test('normalization still coalesces numeric/string IDs, merges workshop codes, and preserves the first row', () => {
  const first = { id: 7, name: 'first', workshopCodes: ['raw_grain', 'raw_grain'], partImageUrl: '', imageSource: 'part', imageUrl: photo, categoryImageUrl: reference }
  const duplicate = { id: '7', name: 'later', workshopCodes: 'brewing,raw_grain,,qu_making', partImageUrl: photo }
  const single = { id: 8, workshopCode: 'brewing' }
  const rows = normalizePartRows([first, duplicate, single])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, 7)
  assert.equal(rows[0].name, 'first')
  assert.equal(rows[0].partImageUrl, null, 'a later duplicate does not replace an explicit empty photo')
  assert.deepEqual([...rows[0].workshopCodes], ['raw_grain', 'brewing', 'qu_making'])
  assert.deepEqual([...rows[1].workshopCodes], ['brewing'])
  assert.deepEqual(first.workshopCodes, ['raw_grain', 'raw_grain'])
  assert.equal(duplicate.workshopCodes, 'brewing,raw_grain,,qu_making')
  assert.equal(single.workshopCodes, undefined)
})

test('normalizer retains empty-input behavior', () => {
  for (const rows of [undefined, null, []]) assert.equal(normalizePartRows(rows).length, 0)
})

// Compile the real SFC script and template. The only source instrumentation exposes
// existing refs; lifecycle/API and child controls are synthetic offline ports.
const bindingUrl = new URL('../src/components/PartModelBinding.vue', import.meta.url)
const bindingSource = fs.readFileSync(bindingUrl, 'utf8')
const { descriptor, errors } = parse(bindingSource.replace('</script>', 'defineExpose({models, preview, selected, selectedStatus})\n</script>'), { filename: bindingUrl.pathname })
assert.deepEqual(errors, [])
const compiled = compileScript(descriptor, { id: 'spare-model-evidence-boundary', inlineTemplate: true })
const executable = compiled.content
  .replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_all, names, module) => `const {${names.replace(/\s+as\s+/g, ':')}} = modules[${JSON.stringify(module)}];`)
  .replace('export default', 'globalThis.Component =')
const legacyUrl = '/models/ledger-20261008/13.glb'
const approved = { status: 'approved', valid: true, stale: false, versionHash: 'a'.repeat(64) }

async function bindingHarness(model) {
  const mounted = [], unmounted = [], captured = [], buttons = []
  let state
  const Preview = {
    inheritAttrs: false,
    props: { modelUrl: String, frontRotationY: Number, initialAngle: Number, allowUnreviewed: Boolean, objectOnly: Boolean, height: String },
    setup(props) {
      captured.push({ ...props })
      return () => Vue.h('figure', { 'data-model-url': props.modelUrl, 'data-allow-unreviewed': String(props.allowUnreviewed) })
    }
  }
  const context = vm.createContext({ modules: {
    vue: { ...Vue, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn), defineAsyncComponent: () => Preview },
    '../api': { getPartCategoryModels: async () => ({ data: [model] }) },
    '../utils/model-display-status.mjs': { modelDisplayStatus },
    '../utils/model-review.mjs': { modelReviewConfirmed }
  } })
  vm.runInContext(executable, context, { filename: bindingUrl.pathname })
  const render = context.Component.setup({ modelValue: model.id, workshopCode: 'raw_grain', disabled: false }, { expose: value => { state = value }, emit() {} })
  for (const mount of mounted) await mount()
  function html() {
    const app = Vue.createSSRApp({ render: () => render({}, []) })
    for (const name of ['ElSelect', 'ElOption']) app.component(name, {
      inheritAttrs: false, setup: (_props, { slots }) => () => Vue.h('span', slots.default?.())
    })
    app.component('ElButton', {
      inheritAttrs: false,
      setup(_props, { attrs, slots }) {
        if (attrs.onClick) buttons.push(attrs.onClick)
        return () => Vue.h('button', slots.default?.())
      }
    })
    app.component('ElDialog', {
      props: { modelValue: Boolean },
      inheritAttrs: false,
      setup: (props, { slots }) => () => props.modelValue ? Vue.h('section', slots.default?.()) : null
    })
    return renderToString(app)
  }
  return { state, captured, buttons, html, cleanup: () => { for (const unmount of unmounted) unmount() } }
}

const previewCases = [
  { name: 'current server-approved legacy reference', reviewDecision: approved, status: 'ready', label: '人工核对通过', confirmed: true, allow: true },
  { name: 'stale legacy approval', reviewDecision: { ...approved, stale: true, valid: false }, status: 'pending', label: '版本已变更，需重新核对', confirmed: false, allow: true },
  { name: 'stale flag despite valid=true', reviewDecision: { ...approved, stale: true }, status: 'pending', label: '版本已变更，需重新核对', confirmed: false, allow: true },
  { name: 'invalidated version approval', reviewDecision: { ...approved, valid: false }, status: 'pending', label: '版本已变更，需重新核对', confirmed: false, allow: true },
  { name: 'unreviewed legacy reference', status: 'pending', label: '外形待核对', confirmed: false, allow: true },
  { name: 'explicit pending decision', reviewDecision: { ...approved, status: 'pending' }, status: 'pending', label: '待核对', confirmed: false, allow: true },
  { name: 'needs-fix decision', reviewDecision: { ...approved, status: 'needs_fix' }, status: 'pending', label: '需修正', confirmed: false, allow: true },
  { name: 'raw unvalidated approved flag', reviewDecision: { status: 'approved' }, status: 'pending', label: '外形待核对', confirmed: false, allow: true },
  { name: 'rebuilt geometry with unresolved documentation', modelUrl: '/models/pending-20261009/505020199.glb', status: 'pending', label: '外形待核对', confirmed: false, allow: true },
  { name: 'normal observable model', modelUrl: '/uploads/part-models/normal.glb', status: 'ready', label: '可观察', confirmed: false, allow: false }
]

for (const item of previewCases) {
  test(`compiled binding SSR previews ${item.name} without changing its review outcome`, async () => {
    const model = { id: 13, name: '离线模型', modelUrl: legacyUrl, frontRotationY: '0.75', reviewDecision: item.reviewDecision, ...(item.modelUrl ? { modelUrl: item.modelUrl } : {}) }
    if (model.modelUrl === legacyUrl) assert.equal(modelReview(model.modelUrl)?.status, 'reference', 'fixture uses the real static reference catalog')
    const h = await bindingHarness(model)
    try {
      const closed = await h.html()
      assert.equal(h.state.selectedStatus.value.key, item.status)
      assert.equal(modelReviewConfirmed(h.state.selected.value), item.confirmed)
      assert.ok(closed.includes(item.label))
      assert.equal(h.captured.length, 0, 'no preview child before explicit opening')
      assert.equal(h.buttons.length, 1)
      h.buttons[0]()
      assert.equal(h.state.preview.value, true, 'use the actual compiled preview-button handler')
      const opened = await h.html()
      assert.equal(h.captured.length, 1)
      assert.deepEqual(h.captured[0], { modelUrl: model.modelUrl, frontRotationY: 0.75, initialAngle: 0.55, allowUnreviewed: item.allow, objectOnly: true, height: '400px' })
      assert.ok(opened.includes(item.label))
      assert.equal(opened.includes('当前仅供核对旧外形；预览不代表已通过核对。'), item.status === 'pending')
      assert.equal(h.state.selectedStatus.value.key, item.status)
      assert.equal(modelReviewConfirmed(h.state.selected.value), item.confirmed)
      if (item.status === 'pending') assert.ok(!opened.includes('人工核对通过'))
    } finally { h.cleanup() }
  })
}

test('compiled binding with no model file stays missing and has no preview action', async () => {
  const h = await bindingHarness({ id: 13, name: '只有名称', modelUrl: '', reviewDecision: approved })
  try {
    const html = await h.html()
    assert.equal(h.state.selectedStatus.value.key, 'missing')
    assert.ok(html.includes('缺少三维文件'))
    assert.equal(h.buttons.length, 0)
    assert.equal(h.captured.length, 0)
  } finally { h.cleanup() }
})
