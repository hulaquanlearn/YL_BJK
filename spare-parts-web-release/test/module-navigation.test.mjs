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

test('account management is removed while every authenticated page keeps logout', () => {
  assert.match(routerSource, /path: '\/account', redirect: '\/portal'/)
  assert.match(routerSource, /path: '\/users', redirect: '\/portal'/)
  assert.doesNotMatch(appSource, /to="\/account"|to="\/users"|账户与权限中心/)
  assert.match(appSource, /command="logout"[\s\S]*退出登录/)
})

test('business module navigation does not duplicate account links', () => {
  const knowledgeNav = appSource.match(/<div v-if="isKnowledge"[\s\S]*?<\/div>/)?.[0] || ''
  const spareNav = appSource.match(/<div v-else class="mobile-nav is-spare-nav">[\s\S]*?<\/div>/)?.[0] || ''
  assert.doesNotMatch(knowledgeNav, /to="\/account"/)
  assert.doesNotMatch(spareNav, /to="\/account"/)
})

test('portal exposes only the two business modules and keeps logout', () => {
  assert.match(portalSource, />数字工作台</)
  assert.match(portalSource, />备件管理中心</)
  assert.match(portalSource, />智能工程中心</)
  assert.doesNotMatch(portalSource, />账户与权限中心</)
  assert.match(portalSource, /command="logout"[\s\S]*退出登录/)
})

test('PLC upload submits the files already confirmed by the interface', () => {
  const plcSource = fs.readFileSync(path.join(root, 'src/views/PlcAnalysis.vue'), 'utf8')
  assert.match(plcSource, /const files = uploadFiles\.value\.slice\(\)/)
  assert.match(plcSource, /files\.forEach\(file => data\.append\('files', file, file\.name\)\)/)
  assert.doesNotMatch(plcSource, /const files = Array\.from\(fileInput\.value\?\.files/)
})

test('browser owns the multipart boundary so Multer receives uploaded files', () => {
  assert.doesNotMatch(apiSource, /headers:\s*\{\s*'Content-Type':\s*'multipart\/form-data'/)
  assert.match(apiSource, /config\.data instanceof FormData/)
  assert.match(apiSource, /delete config\.headers\['Content-Type'\]/)
})

test('program import only asks for platform, project name and files', () => {
  const source = fs.readFileSync(path.join(root, 'src/views/PlcAnalysis.vue'), 'utf8')
  assert.match(source, /const form = reactive\(\{ name: '', programFamily: 'siemens_tia' \}\)/)
  assert.doesNotMatch(source, /v-model="form\.(?:tiaVersion|cpuModel|plantArea|description)"/)
  assert.match(source, /TIA 版本、CPU、设备和网络由解析节点自动识别/)
  assert.match(source, /服务器文件系统/)
})

test('ABB RAPID import selects one complete folder and keeps relative paths', () => {
  const source = fs.readFileSync(path.join(root, 'src/views/PlcAnalysis.vue'), 'utf8')
  assert.match(source, /webkitdirectory directory multiple/)
  assert.match(source, /\(\?:modx\?\|sysx\?\|cfg\|pgf\|rapid\)/)
  assert.match(source, /file\.webkitRelativePath/)
  assert.match(source, /data\.append\('relativePaths'/)
})

test('program analysis exposes a clickable project relationship map', () => {
  const source = fs.readFileSync(path.join(root, 'src/views/PlcAnalysis.vue'), 'utf8')
  assert.match(source, /label="程序关系"/)
  assert.match(source, /项目[\s\S]*源文件 \/ 模块[\s\S]*例程 \/ 程序块[\s\S]*变量 \/ I\/O/)
  assert.match(source, /v-for="item in section\.items"[\s\S]*@click="openItem\(item\)"/)
  assert.match(source, /async function loadMapItems\(\)/)
})
