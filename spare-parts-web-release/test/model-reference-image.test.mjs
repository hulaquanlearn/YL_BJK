import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import { referenceImageForModel } from '../src/utils/category-catalog.mjs'

const url = new URL('../src/components/ModelReferenceImage.vue', import.meta.url)
const source = fs.readFileSync(url, 'utf8').replace('</script>', 'defineExpose({currentSource,failed})\n</script>')
const { descriptor, errors } = parse(source, { filename: url.pathname })
assert.deepEqual(errors, [])
const compiled = compileScript(descriptor, { id: 'reference-image-interaction', inlineTemplate: true })
const executable = compiled.content
  .replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_all, names, module) => `const {${names.replace(/\s+as\s+/g, ':')}} = modules[${JSON.stringify(module)}];`)
  .replace('export default', 'globalThis.Component =')

function harness(values = {}) {
  const props = Vue.reactive({ src: '', fallbackSrc: '', modelUrl: '', alt: '类别参考图', zoomable: false, ...values })
  const scope = Vue.effectScope(), buttons = [], viewers = []
  let state
  const context = vm.createContext({ modules: {
    vue: Vue,
    '@element-plus/icons-vue': { Picture: { render: () => Vue.h('i') } },
    '../utils/category-catalog.mjs': { referenceImageForModel }
  } })
  vm.runInContext(executable, context, { filename: url.pathname })
  const render = scope.run(() => context.Component.setup(props, { expose: value => { state = value } }))
  async function html() {
    buttons.length = 0; viewers.length = 0
    function visit(node) {
      if (!node || typeof node !== 'object') return
      if (node.type === 'button') buttons.push(node.props)
      if (Array.isArray(node.children)) node.children.forEach(visit)
    }
    const app = Vue.createSSRApp({ render: () => { const vnode = render({ $slots: {} }, []); visit(vnode); return vnode } })
    app.config.warnHandler = () => {}
    app.component('ElIcon', { setup: (_props, { slots }) => () => Vue.h('i', slots.default?.()) })
    app.component('ElImageViewer', {
      props: { urlList: Array, infinite: Boolean, teleported: Boolean },
      setup: (value, { attrs }) => { viewers.push({ ...value, close: attrs.onClose }); return () => Vue.h('aside', { 'data-preview-url': value.urlList[0] }) }
    })
    return renderToString(app)
  }
  return { props, state, buttons, viewers, html, dispose: () => scope.stop() }
}

test('reference images are non-interactive unless explicitly enabled; parent navigation remains available', async () => {
  const h = harness({ src: '/uploads/reference.jpg' })
  try {
    const html = await h.html()
    assert.ok(html.includes('src="/uploads/reference.jpg"'))
    assert.equal(h.buttons.length, 0)
    assert.equal(h.viewers.length, 0)
  } finally { h.dispose() }
})

test('explicit image zoom opens the actual current fallback and consumes only its own click', async () => {
  const h = harness({ src: '/uploads/missing.jpg', fallbackSrc: '/uploads/reference.jpg', zoomable: true, alt: '配电接线图' })
  try {
    await h.html()
    h.state.failed({ target: { getAttribute: () => '/uploads/missing.jpg' } })
    await Vue.nextTick()
    const html = await h.html()
    assert.equal(h.buttons.length, 1)
    assert.equal(h.buttons[0].type, 'button', 'native button supplies Enter/Space interaction')
    assert.equal(h.buttons[0]['aria-label'], '放大配电接线图')
    assert.ok(html.includes('src="/uploads/reference.jpg"'))
    let stops = 0
    h.buttons[0].onClick({ stopPropagation: () => { stops++ } })
    assert.equal(stops, 1)
    await h.html()
    assert.equal(h.viewers.length, 1)
    assert.deepEqual([...h.viewers[0].urlList], ['/uploads/reference.jpg'])
    assert.equal(h.viewers[0].teleported, true)
    h.viewers[0].close()
    await h.html()
    assert.equal(h.viewers.length, 0)
  } finally { h.dispose() }
})

test('changing source or exhausting failures closes the viewer without showing a stale image', async () => {
  const h = harness({ src: '/uploads/first.jpg', zoomable: true })
  try {
    await h.html(); h.buttons[0].onClick({ stopPropagation() {} }); await h.html()
    assert.equal(h.viewers.length, 1)
    h.props.src = '/uploads/second.jpg'
    await Vue.nextTick(); await h.html()
    assert.equal(h.viewers.length, 0)
    h.buttons[0].onClick({ stopPropagation() {} }); await h.html()
    assert.equal(h.viewers[0].urlList[0], '/uploads/second.jpg')
    h.state.failed({ target: { getAttribute: () => '/uploads/second.jpg' } })
    await Vue.nextTick()
    const html = await h.html()
    assert.equal(h.viewers.length, 0)
    assert.equal(h.buttons.length, 0)
    assert.ok(html.includes('参考图暂不可用'))
  } finally { h.dispose() }
})

test('an empty zoomable image has no misleading action or empty viewer', async () => {
  const h = harness({ zoomable: true })
  try {
    assert.ok((await h.html()).includes('暂无参考图'))
    assert.equal(h.buttons.length, 0)
    assert.equal(h.viewers.length, 0)
  } finally { h.dispose() }
})
