import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as fireUtilities from '../src/utils/fire-inspection.mjs'

// Compile the actual SFC and evaluate its setup/render closure in memory.
// No browser, DOM automation, HTTP server or real inspection data is used.
const filename = new URL('../src/app/AppFireInspection.vue', import.meta.url)
const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename: filename.pathname })
const compiled = compileScript(descriptor, { id: 'joint-review-fire', inlineTemplate: true })
const executable = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g, (_, clause, _quote, specifier) => {
  const binding = clause.trim().startsWith('{') ? clause.trim().replace(/\s+as\s+/g, ': ') : `{ default: ${clause.trim()} }`
  return `const ${binding} = modules[${JSON.stringify(specifier)}];\n`
}).replace('export default', 'return')

function setupFire(overrides = {}) {
  const fire = Vue.reactive({
    dashboardError: '', pageError: '', listError: '', issuesError: '', loading: false, issuesLoading: false,
    query: { cycleId: 'synthetic-cycle', status: 'abnormal', q: '' },
    points: [], issueRows: [], issueTotal: 0, issueQuery: { page: 1, pageSize: 30 },
    selectedCycle: { name: '合成点检周期', inspectionMonth: '2026-11' },
    photoRecognition: { periodMonth: '2026-11' },
    issueStatus: value => value, time: value => value,
    typeName: value => value, location: point => point.location,
    reload() {}, loadDashboard() {}, loadPoints() {}, loadIssues() {}, setStatus(value) { this.query.status = value }, openPoint() {},
    ...overrides
  })
  const runtime = {
    ...Vue,
    inject: key => { assert.equal(key, 'fireInspection'); return fire },
    resolveComponent: name => name,
    resolveDirective: () => ({}),
    withDirectives: node => node
  }
  const component = new Function('modules', executable)({
    vue: runtime,
    './AppFireIssueCard.vue': { default: { name: 'AppFireIssueCard' } },
    '../utils/fire-inspection.mjs': fireUtilities,
    '../components/fire/FirePhotoRecognition.vue': { default: { name: 'FirePhotoRecognition' } },
    '../components/fire/FireSectionFilter.vue': { default: { name: 'FireSectionFilter' } }
  })
  const scope = Vue.effectScope()
  const render = scope.run(() => component.setup({}, { expose() {} }))
  return { fire, render: () => render({}, []), stop: () => scope.stop() }
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  let children = tree.children
  if (children && typeof children === 'object' && !Array.isArray(children)) {
    children = Object.entries(children).filter(([key, value]) => !key.startsWith('_') && typeof value === 'function').flatMap(([, value]) => value())
  }
  return [tree, ...nodes(children)]
}

function alerts(view) { return nodes(view).filter(node => node.type === 'el-alert') }
function emptyStates(view) { return nodes(view).filter(node => node.type === 'el-empty') }

test('App abnormal inspections show the request failure instead of claiming there are no issues', t => {
  const app = setupFire({ issuesError: '合成网络中断：异常列表读取失败' })
  t.after(app.stop)
  assert.ok(alerts(app.render()).some(node => node.props.title === app.fire.issuesError))
  assert.equal(emptyStates(app.render()).length, 0)
})

test('App retry uses the existing refresh action and clears the error only after a successful reload', async t => {
  let retries = 0
  const app = setupFire({
    issuesError: '合成超时',
    async reload() {
      retries++
      app.fire.issuesLoading = true
      await Promise.resolve()
      app.fire.issuesError = ''
      app.fire.issueRows = [{ id: 'synthetic-issue', pointId: 'synthetic-point', status: 'open', remark: '合成回归异常' }]
      app.fire.issuesLoading = false
    }
  })
  t.after(app.stop)
  assert.ok(alerts(app.render()).some(node => node.props.title === '合成超时'))
  const refresh = nodes(app.render()).find(node => node.type === 'el-button' && node.props?.['aria-label'] === '刷新点检进度')
  assert.ok(refresh)
  // Call the component event handler directly; this is not browser/UI automation.
  await refresh.props.onClick()
  await Vue.nextTick()
  assert.equal(retries, 1)
  assert.equal(alerts(app.render()).length, 0)
  assert.equal(emptyStates(app.render()).length, 0)
  assert.equal(nodes(app.render()).filter(node => node.type?.name === 'AppFireIssueCard').length, 1)
})

test('App inspection errors are scoped to the currently selected list', async t => {
  const app = setupFire({ issuesError: '合成异常读取失败', listError: '合成器材读取失败' })
  t.after(app.stop)
  assert.deepEqual(alerts(app.render()).map(node => node.props.title), ['合成异常读取失败'])
  app.fire.query.status = 'pending'
  await Vue.nextTick()
  assert.deepEqual(alerts(app.render()).map(node => node.props.title), ['合成器材读取失败'])
  assert.equal(emptyStates(app.render()).length, 0)
  app.fire.query.status = 'checked'
  await Vue.nextTick()
  assert.deepEqual(alerts(app.render()).map(node => node.props.title), ['合成器材读取失败'])
  assert.equal(emptyStates(app.render()).length, 0)
})

test('the real issue-loading controller feeds failure and recovery into the App component', async t => {
  const source = readFileSync(new URL('../src/utils/fire-inspection-controller.mjs', import.meta.url), 'utf8')
  const loadSource = source.slice(source.indexOf('async function loadIssues('), source.indexOf('async function changeWebTab('))
  const state = {
    executionMode: Vue.ref(true),
    query: Vue.reactive({ cycleId:'synthetic-cycle',status:'abnormal',q:'',sectionName: '输送工段' }),
    issueQuery: Vue.reactive({ page: 2, pageSize: 30, status: 'pending', q: 'synthetic-filter' }),
    issuesLoading: Vue.ref(false), issuesError: Vue.ref(''), issueRows: Vue.ref([]), issueTotal: Vue.ref(0)
  }
  let online = false
  const api = { async issues(query) {
    assert.deepEqual(query, { page: 2, pageSize: 30, status: 'all', q: 'synthetic-filter', sectionName: '输送工段' })
    if (!online) throw Error('合成请求失败')
    return { items: [{ id: 'synthetic-row', pointId: 'synthetic-point', status: 'open', remark: '合成异常' }], total: 31 }
  } }
  const loadIssues = new Function('fireApi', ...Object.keys(state), `let issuesRequest=0,disposed=false;\n${loadSource}\nreturn loadIssues`)(api, ...Object.values(state))
  const app = setupFire({ ...state, loadIssues, reload: loadIssues })
  t.after(app.stop)
  await app.fire.loadIssues()
  assert.equal(app.fire.issuesLoading, false)
  assert.deepEqual(alerts(app.render()).map(node => node.props.title), ['合成请求失败'])
  assert.equal(emptyStates(app.render()).length, 0)
  online = true
  await nodes(app.render()).find(node => node.props?.['aria-label'] === '刷新点检进度').props.onClick()
  assert.equal(app.fire.issueQuery.page, 2)
  assert.equal(app.fire.issueTotal, 31)
  assert.equal(app.fire.issueRows.length, 1)
  const abnormalTab = nodes(app.render()).find(node => node.type === 'button' && node.children?.some?.(child => child.children === '31'))
  assert.ok(abnormalTab, 'the tab shows the full result count, even on a partial page')
  assert.equal(alerts(app.render()).length, 0)
  assert.equal(emptyStates(app.render()).length, 0)
})

test('bootstrap failure suppresses both lists\' success-only empty messages', async t => {
  const app = setupFire({ pageError: '合成初始化失败' })
  t.after(app.stop)
  for (const status of ['abnormal', 'pending', 'checked']) {
    app.fire.query.status = status
    await Vue.nextTick()
    assert.deepEqual(alerts(app.render()).map(node => node.props.title), ['合成初始化失败'])
    assert.equal(emptyStates(app.render()).length, 0)
  }
})

test('App empty wording remains available after a successful empty response, but not while loading', async t => {
  const app = setupFire()
  t.after(app.stop)
  assert.deepEqual(emptyStates(app.render()).map(node => node.props.description), ['暂无异常记录'])
  app.fire.issuesLoading = true
  await Vue.nextTick()
  assert.equal(emptyStates(app.render()).length, 0)
  app.fire.query.status = 'pending'
  app.fire.loading = false
  await Vue.nextTick()
  assert.deepEqual(emptyStates(app.render()).map(node => node.props.description), ['当前没有未点检设备'])
  app.fire.query.status = 'checked'
  await Vue.nextTick()
  assert.deepEqual(emptyStates(app.render()).map(node => node.props.description), ['暂无已点检记录'])
})
