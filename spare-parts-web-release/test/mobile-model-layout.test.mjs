import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import postcss from 'postcss'
import {parse,compileStyle} from '@vue/compiler-sfc'

const read=path=>fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8')
// Inspect the viewport-only cascade, deliberately treating @container as
// unsupported. This covers the old WebView fallback, not pixel/device QA.
function viewportRule(css,selector,width){
  const declarations={}
  postcss.parse(css).walkRules(rule=>{
    let active=true
    for(let parent=rule.parent;parent?.type!=='root';parent=parent.parent){
      if(parent.name==='container')active=false
      if(parent.name==='media'){
        const limit=parent.params.match(/^\(max-width:\s*(\d+)px\)$/)
        if(!limit||width>Number(limit[1]))active=false
      }
    }
    if(active&&rule.selectors.includes(selector))rule.walkDecls(d=>{declarations[d.prop]=d.value})
  })
  return declarations
}

test('phone model layout remains usable without container-query support',()=>{
  const css=read('components/agv/AgvModelViewer.css')
  const compiled=compileStyle({source:css,id:'mobile-model',scoped:true})
  assert.deepEqual(compiled.errors,[])
  for(const width of [320,360,390,540,720]){
    const style=selector=>viewportRule(css,selector,width)
    assert.match(style('.agv-model-viewer').height,/var\(--agv-viewer-height,/,'the parent measures remaining viewport space')
    assert.equal(style('.agv-stage').position,'relative')
    assert.equal(style('.agv-topbar')['flex-direction'],'row','the external tools stay on a compact row')
    assert.equal(style('.agv-actions button')['min-height'],'44px')
    assert.equal(style('.agv-drawer').left,'8px')
    assert.equal(style('.agv-drawer').right,'8px')
    assert.equal(style('.agv-drawer').bottom,'118px')
    assert.match(style('.agv-drawer')['max-height'],/42%/,'the sheet leaves the upper canvas to the vehicle')
    assert.equal(style('.agv-model-viewer>.agv-bottombar')['flex-direction'],'row')
    assert.equal(style('.agv-controls').display,'flex')
    assert.equal(style('.agv-controls').overflow,'visible','phone controls must not need horizontal scrolling')
    assert.equal(style('.agv-controls')['overflow-x'],undefined)
    assert.equal(style('.agv-main-actions button')['min-height'],'44px')
    assert.equal(style('.agv-extra').display,'flex','the same view controls remain visible')
    assert.equal(style('.agv-model-viewer .agv-selection').bottom,'16px')
    assert.equal(style('.agv-explode').width,'100%','the explode slider owns the first bar row')
  }
  assert.equal(viewportRule(css,'.agv-extra',1200).display,'flex')
  assert.equal(viewportRule(css,'.agv-stage',1200).position,'relative','desktop canvas fills the remaining flex area below tools')
  assert.equal(viewportRule(css,'.agv-drawer',1200).position,'absolute','desktop parts/systems drawer overlays instead of shrinking the canvas')
  const source=read('components/agv/AgvModelViewer.vue')
  assert.ok(!source.includes('ASSEMBLY WORKBENCH'))
  assert.ok(!source.includes('STRUCTURAL VIEW'))
  assert.ok(!source.includes('model-part-note'),'no permanent note footer under the canvas')
})

test('spare previews show annotations by default without a redundant button bar',()=>{
  const source=read('components/ModelPreview.vue')
  const {descriptor}=parse(read('components/ModelPreview.vue'))
  const css=descriptor.styles.map(s=>s.content).join('\n')
  assert.doesNotMatch(source,/preview-tools|function turn\(|function zoom\(|function toggleLabels\(/)
  assert.match(source,/labelsVisible=ref\(true\)/)
  assert.match(source,/new OrbitControls/)
  assert.doesNotMatch(css,/preview-tools/)
})

test('field dialogs, drawings and code reader keep a height limit on older WebViews',()=>{
  for(const file of ['components/PdfReader.vue','components/agv/AgvElectrical.vue','app/app-layout.css']){
    const source=read(file),css=file.endsWith('.vue')?parse(source).descriptor.styles.map(s=>s.content).join('\n'):source
    postcss.parse(css).walkDecls(declaration=>{
      if(!declaration.value.includes('dvh'))return
      const previous=declaration.prev()
      assert.equal(previous?.prop,declaration.prop,file+' '+declaration.prop)
      assert.equal(previous.value,declaration.value.replaceAll('dvh','vh'),file+' supplies an equivalent vh fallback')
    })
  }
})
