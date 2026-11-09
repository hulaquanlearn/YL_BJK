import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8')
const script = source => source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1] || ''

test('technical document header uses the opened document title, not a duplicate ABB title', () => {
  const source = read('agv/AbbRobotGuide.vue')
  assert.match(source, /:title="headerTitle"/)
  assert.match(source, /const currentDocument=computed\(\(\)=>props\.mode==='technical'\?abbDocuments\[openedDocument\.value\]\|\|null:null\)/)
  assert.match(source, /const headerTitle=computed\(\(\)=>props\.mode==='pendant'\?'FlexPendant 示教器':currentDocument\.value\?\.title\|\|'ABB 技术资料'\)/)
  assert.match(source, /v-if="mode==='pendant'" class="pendant-view-switch"/, 'pendant view switch remains pendant-only')
})

test('document reader uses the dedicated PDF reader and keeps back/new-window/CHM chapter navigation', () => {
  const source = read('agv/AbbDocumentReader.vue')
  const importPath=script(source).match(/import AbbPdfReader from '([^']+)'/)[1]
  assert.ok(fs.existsSync(new URL('../src/components/agv/'+importPath,import.meta.url)), 'import resolves to an existing component')
  assert.doesNotMatch(source, /from '\.\.\/PdfReader\.vue'/, 'shared PdfReader is not modified or reused')
  assert.match(read('agv/AbbRobotGuide.vue'), /返回目录/);assert.match(source, /新窗口打开/)
  assert.match(source, /v-else-if="document\.type==='html'"/)
  assert.match(source, /<iframe[^>]+chapterUrl/)
  assert.match(source, /<AbbPdfReader[^>]+:file="file"/)
  assert.doesNotMatch(source, /<strong>/, 'reader must not duplicate the big title')
})

test('dedicated PDF reader is continuous, lazy, navigable and supports fit width/spread layouts', () => {
  const source = read('AbbPdfReader.vue'), body = script(source)
  assert.match(source, /IntersectionObserver/);assert.match(source, /rootMargin:'700px 0px'/)
  assert.match(source, /v-if="visiblePages\.has\(page\)"/)
  assert.match(source, /v-for="page in pageList"/)
  assert.match(source, /class="abb-pdf-pages" :class="layout==='spread'\?'is-spread':'is-continuous'"/)
  assert.doesNotMatch(source, /<AbbPdfReader[^>]*:file=/, 'dedicated reader receives file via prop and does not nest itself')
  assert.match(source, /goPage\(currentPage-1\)/);assert.match(source, /goPage\(currentPage\+1\)/)
  assert.match(source, /setZoom/);assert.match(source, /fitWidth/);assert.match(source, /setLayout\('spread'\)/)
  assert.match(source, /readPdfData/);assert.match(source, /ensurePdfCompatibility/)
  assert.match(body, /pageList=computed\(/)
})
