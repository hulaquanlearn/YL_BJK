import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appSource = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8')
const routerSource = fs.readFileSync(path.join(root, 'src/router/index.js'), 'utf8')
const portalSource = fs.readFileSync(path.join(root, 'src/views/Portal.vue'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'src/api/index.js'), 'utf8')

test('retired qu-making assessment uses the shared unknown-page fallback and leaves no navigation or context requests', () => {
  assert.doesNotMatch(routerSource, /path: '\/work'/)
  assert.match(routerSource, /path: '\/:pathMatch\(\.\*\)\*', redirect: '\/portal'/)
  assert.doesNotMatch(routerSource, /import\('\.\.\/views\/WorkAssessment\.vue'\)/)
  for (const source of [appSource, portalSource]) {
    assert.doesNotMatch(source, /to="\/work"|制曲履职考评|制曲 · 组长履职考评/)
    assert.doesNotMatch(source, /work\.get\('\/context'\)/)
  }
})

test('retired PLC/ABB entry has no dedicated route and has no navigation link', () => {
  assert.doesNotMatch(routerSource, /path: '\/plc-analysis'/)
  assert.doesNotMatch(routerSource, /import\('\.\.\/views\/PlcAnalysis\.vue'\)/)
  for (const source of [appSource, portalSource]) assert.doesNotMatch(source, /to="\/plc-analysis"/)
})

test('personal center uses the avatar menu while business navigation stays separate', () => {
  assert.match(routerSource, /path: '\/account', name:'Account'/)
  for(const source of [appSource,portalSource])assert.match(source,/command="profile"[\s\S]*个人中心/)
  assert.match(routerSource, /path: '\/users', redirect: '\/account\?tab=users'/)
  assert.doesNotMatch(appSource, /to="\/account"|to="\/users"|账户与权限中心/)
  assert.match(appSource, /command="logout"[\s\S]*退出登录/)
})

test('business module navigation does not duplicate account links', () => {
  const knowledgeNav = appSource.match(/<div v-if="isKnowledge"[\s\S]*?<\/div>/)?.[0] || ''
  const spareNav = appSource.match(/<div v-else class="mobile-nav is-spare-nav">[\s\S]*?<\/div>/)?.[0] || ''
  assert.doesNotMatch(knowledgeNav, /to="\/account"/)
  assert.doesNotMatch(spareNav, /to="\/account"/)
})

test('work storage has no business entry and old bookmarks redirect into the personal center',()=>{
 for(const source of [appSource,portalSource])assert.doesNotMatch(source,/to="\/work-storage"/)
 assert.match(routerSource,/path: '\/work-storage', redirect: '\/account\?tab=storage'/)
 const accountSource=fs.readFileSync(path.join(root,'src/views/Account.vue'),'utf8')
 assert.match(accountSource,/<el-tab-pane v-if="isAdmin" label="数据管理" name="storage"><WorkStorage v-if="tab==='storage' && isAdmin"/)
})

test('portal exposes only the two business modules and keeps logout', () => {
  assert.match(portalSource, />数字工作台</)
  assert.match(portalSource, />备件管理中心</)
  assert.match(portalSource, />智能工程中心</)
  assert.doesNotMatch(portalSource, />账户与权限中心</)
  assert.match(portalSource, /command="logout"[\s\S]*退出登录/)
})

test('retired inspection feature has no navigation entry', () => {
  assert.doesNotMatch(appSource, /<el-dropdown-item\b[^>]*\bcommand="\/inspection-notices"/)
  assert.doesNotMatch(appSource, /<router-link to="\/inspection-notices"/)
  assert.doesNotMatch(portalSource, /to="\/inspection-notices"/)
})

test('browser owns the multipart boundary so Multer receives uploaded files', () => {
  assert.doesNotMatch(apiSource, /headers:\s*\{\s*'Content-Type':\s*'multipart\/form-data'/)
  assert.match(apiSource, /config\.data instanceof FormData/)
  assert.match(apiSource, /delete config\.headers\['Content-Type'\]/)
})
