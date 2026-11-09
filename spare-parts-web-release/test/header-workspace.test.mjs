import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { mobileAccountLinks, mobileModules, mobileWorkspaceEnabled, nativeFieldPaths } from '../src/utils/mobile-workspace.mjs'

const read = file => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
const mobileSource = read('app/AppShell.vue'), statusSource = read('components/ServiceStatus.vue')
const render = source => new Function('Vue', compile(source.match(/<template>([\s\S]*?)<\/template>\s*<script/)[1], { mode: 'function' }).code)(Vue)
const script = source => source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
const ServiceStatus = { props: { status: { type: String, default: 'checking' } }, render: render(statusSource), setup(props) { const context = { defineProps: () => props, computed: Vue.computed }; vm.runInNewContext(script(statusSource) + '\nglobalThis.state = {state,label}', context); return context.state } }
async function renderPhone({ health = 'online', search = '', home = true } = {}) {
  const user = { id: 1, role: 'admin', displayName: '测试员' }, props = { enabled: true, user, modules: mobileModules(user), role: '总管理员', health }
  const component = { render: render(mobileSource), setup() { const context = { defineProps: () => props, defineEmits:()=>()=>{}, useRoute: () => ({ path: home ? '/portal' : '/inventory', fullPath: home ? '/portal' : '/inventory', meta: { portal: home, title: '库存总览' } }), mobileAccountLinks,nativeFieldPaths, computed: Vue.computed, ref: Vue.ref, watch: Vue.watch, navigator: { userAgent: 'Mozilla/5.0 iPhone Mobile' } }; vm.runInNewContext(script(mobileSource) + '\nglobalThis.state = {enabled:props.enabled,user:props.user,modules:props.modules,role:props.role,health:props.health,route,search,catalogVisible,home,initial,accountLinks,currentGroup,catalogGroups,filteredModules,legacyNative,nativeAndroid,closeCatalog}', context); context.state.search.value = search; return context.state } }
  const app = Vue.createSSRApp(component)
  app.config.warnHandler = () => {}
  app.component('ServiceStatus', ServiceStatus)
  app.component('RouterLink', { props: ['to'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to }, slots.default?.()) })
  app.component('ElInput', { setup: () => () => Vue.h('input') })
  app.component('ElEmpty', { props: ['description'], setup: props => () => Vue.h('p', props.description) })
  app.component('ElDrawer', { props: ['modelValue'], setup: (props, { slots }) => () => props.modelValue ? Vue.h('aside', slots.default?.()) : null })
  app.component('ElIcon', { setup: (_props, { slots }) => () => Vue.h('i', slots.default?.()) })
  return renderToString(app)
}

test('desktop narrow windows remain the website while real narrow phones keep the mobile workspace', () => {
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36'
  for (const width of [944, 760, 640, 390]) assert.equal(mobileWorkspaceEnabled({ userAgent: desktop, narrow: width <= 760, coarse: false }), false, String(width))
  assert.equal(mobileWorkspaceEnabled({ userAgent: 'Mozilla/5.0 iPhone Mobile', narrow: true }), true)
  assert.equal(mobileWorkspaceEnabled({ userAgent: 'Mozilla/5.0 Android Mobile', narrow: true }), true)
  assert.equal(mobileWorkspaceEnabled({ userAgent: desktop, narrow: true, coarse: true }), true)
  assert.equal(mobileWorkspaceEnabled({ userAgent: desktop, narrow: false, coarse: true }), false)
  assert.equal(mobileWorkspaceEnabled({ userAgent: 'DigitalWorkbenchAndroid/1.9.10-android.5', narrow: false }), true)
  assert.equal(mobileWorkspaceEnabled({ userAgent: 'DigitalWorkbenchAndroid/1.9.10-android.5', narrow: true, embedded: true }), false)
})
test('mobile home has one service status beside the avatar, with greeting and duplicate quick cards removed', async () => {
  const html = await renderPhone()
  assert.equal((html.match(/class="service-status /g) || []).length, 1)
  const header = html.match(/<header[\s\S]*?<\/header>/)[0]
  assert.match(header, /mobile-header-actions[\s\S]*服务正常[\s\S]*mobile-account-avatar/)
  assert.doesNotMatch(html, /你好|mobile-direct-actions|现场常用/)
  assert.match(html, /aria-label="查找业务功能"/)
  for (const label of ['备件管理', '智能工程', '工作管理', '库存总览', '3D 库位', '工段长履职考评']) assert.ok(html.includes(label), label)
  const homeContent = html.match(/<main[\s\S]*?<\/main>/)[0]
  assert.equal((homeContent.match(/href="\/inventory"/g) || []).length, 1)
  assert.equal((homeContent.match(/href="\/warehouse-3d"/g) || []).length, 1)
})
test('feature search still filters business entries after removing shortcut cards', async () => {
  const html = await renderPhone({ search: '消防' })
  assert.match(html, /消防点检/); assert.doesNotMatch(html, /href="\/inventory"[^>]*>[\s\S]*?库存总览/)
  const noMatch = await renderPhone({ search: '不存在的功能' })
  assert.match(noMatch, /没有匹配的功能/)
})
test('service status preserves online, failure and preview states without an independent network request', async () => {
  for (const [status, label] of [['online', '服务正常'], ['offline', '服务异常'], ['preview', '本地预览'], ['unknown', '正在连接']]) {
    const app = Vue.createSSRApp({ render: () => Vue.h(ServiceStatus, { status }) })
    app.config.warnHandler = () => {}
    const html = await renderToString(app)
    assert.match(html, /role="status"/); assert.ok(html.includes(label), label)
  }
  assert.doesNotMatch(statusSource, /getHealth|fetch\(|setInterval/)
  const app = read('App.vue'), portal = read('views/Portal.vue')
  assert.equal((app.match(/await getHealth\(\)/g) || []).length, 1)
  assert.match(app, /topbar-actions">\s*<ServiceStatus[\s\S]*?class="workspace-switch"[\s\S]*?class="account-chip"/)
  assert.match(portal, /portal-account-actions"><ServiceStatus[\s\S]*?class="portal-account"/)
})
test('removed shortcut data and styles do not remain in the active mobile shell', () => {
  assert.doesNotMatch(mobileSource, /quickLinks|mobile-direct-actions|你好|toLocaleDateString/)
  assert.doesNotMatch(read('mobile-app.css'), /mobile-direct-actions/)
})
