import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'vite'
import { inlineBuildStyles, inlineStylesInBundle } from '../tools/inline-build-styles.mjs'

test('inlining preserves complete CSS, removes links/assets, and prevents a closing style injection',()=>{
 const css='.shell{color:red}.route{color:blue}.notice::after{content:"</StYle><script>bad()</script>"}'
 const bundle={
  'index.html':{type:'asset',fileName:'index.html',source:'<head><link rel="stylesheet" crossorigin href="/assets/style-a.css"></head>'},
  'assets/style-a.css':{type:'asset',fileName:'assets/style-a.css',source:css}
 }
 assert.equal(inlineStylesInBundle(bundle),1)
 assert.equal(bundle['assets/style-a.css'],undefined)
 const html=bundle['index.html'].source
 assert.match(html,/<style data-built-styles>\.shell/);assert.match(html,/\.route\{color:blue\}/)
 assert.doesNotMatch(html,/<link\b/);assert.equal((html.match(/<\/style/gi)||[]).length,1)
 assert.match(html,/<\\\/StYle><script>bad/)
})
test('inlining fails instead of silently dropping missing CSS or leaving a JavaScript CSS preload',()=>{
 assert.throws(()=>inlineStylesInBundle({'index.html':{type:'asset',fileName:'index.html',source:'<link rel="stylesheet" href="/missing.css">'}}),/Missing emitted/)
 assert.throws(()=>inlineStylesInBundle({'index.html':{type:'asset',fileName:'index.html',source:'<link rel="stylesheet" href="/a.css">'},'a.css':{type:'asset',fileName:'a.css',source:'body{}'},'index.js':{type:'chunk',code:'preload("a.css")'}}),/still preloads/)
})
test('a real Vite build puts initial and lazy route CSS in the HTML with no CSS artifacts or preload references',async()=>{
 const root=process.cwd().replace(/\\/g,'/'),entry=`${root}/inline-styles-fixture.html`
 const files={
  '/entry.js':'import "./base.css"; globalThis.loadFixtureRoute=()=>import("./route.js")',
  '/base.css':'.shell-fixture{color:#123456}',
  '/route.js':'import "./route.css";export const view="lazy route"',
  '/route.css':'.route-fixture{background:#abcdef}'
 }
 const result=await build({configFile:false,logLevel:'silent',base:'/',plugins:[{
  name:'inline-styles-fixture',resolveId(id,importer){if(id===entry)return id;if(id.startsWith('./'))return `${importer.slice(0,importer.lastIndexOf('/'))}/${id.slice(2)}`;if(files[id])return `${root}${id}`},
  load(id){if(id===entry)return '<html><head></head><body><script type="module" src="/entry.js"></script></body></html>';return files[id.slice(root.length)]}
 },inlineBuildStyles()],build:{write:false,cssCodeSplit:false,rollupOptions:{input:entry}}})
 const output=result.output,html=output.find(item=>item.fileName==='inline-styles-fixture.html')?.source
 assert.ok(html,'built HTML entry exists');assert.match(html,/\.shell-fixture\{/);assert.match(html,/\.route-fixture\{/)
 assert.doesNotMatch(html,/<link[^>]+rel=["']stylesheet/)
 assert.equal(output.filter(item=>item.fileName.endsWith('.css')).length,0)
 for(const chunk of output.filter(item=>item.type==='chunk'))assert.doesNotMatch(chunk.code,/assets\/[^"'\s]+\.css/)
})
