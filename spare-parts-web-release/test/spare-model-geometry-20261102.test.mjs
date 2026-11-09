// Evidence-backed geometry checks for the 2026-11-02 spare-model correction.
// These tests parse the real bundled GLBs; they do not mock geometry.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import {evidenceModels} from '../src/utils/evidence-models.mjs'

async function load(url){
  const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
  scene.updateMatrixWorld(true)
  return {bytes,scene}
}
function glbJson(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')

// Original node extras.sourceDescription text and the two mating ends it declares.
const couplings=[
  {id:298,url:'/models/pending-20261009/505020199.glb',source:'减速机端Φ80x140 头轮端Φ90x150',ends:[{boreMm:80,lengthMm:140},{boreMm:90,lengthMm:150}]},
  {id:299,url:'/models/pending-20261009/505020200.glb',source:'减速机端Φ105x210 头轮端Φ90x150',ends:[{boreMm:105,lengthMm:210},{boreMm:90,lengthMm:150}]},
  {id:300,url:'/models/pending-20261009/505020201.glb',source:'减速机端Φ120x210 头轮端Φ90x150',ends:[{boreMm:120,lengthMm:210},{boreMm:90,lengthMm:150}]},
  {id:301,url:'/models/pending-20261009/505020202.glb',source:'减速机端Φ140x250 头轮端Φ90x150',ends:[{boreMm:140,lengthMm:250},{boreMm:90,lengthMm:150}]},
  {id:302,url:'/models/pending-20261009/505020203.glb',source:'减速机端Φ100x170 头轮端Φ90x150',ends:[{boreMm:100,lengthMm:170},{boreMm:90,lengthMm:150}]}
]

test('couplings expose the two declared bores and hub lengths, not one shared hub size',async()=>{
  for(const item of couplings){
    const {bytes,scene}=await load(item.url),doc=glbJson(bytes)
    const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
    assert.ok(root.extras.sourceDescription.includes(item.source),item.url+' keeps its saved description')
    const entry=catalog.models.find(m=>m.url===item.url)
    assert.ok(entry,item.url+' is catalogued')
    assert.equal(entry.status,'rebuilt',item.url)
    assert.equal(sha(bytes),entry.sha256,item.url+' catalog hash')

    const meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)})
    assert.equal(meshes.length,entry.meshCount,item.url+' mesh count')
    assert.equal(new Set(meshes.map(m=>m.userData.observation?.id)).size,entry.partCount,item.url+' part count')

    const hubs=meshes.filter(m=>m.userData.observation?.id==='hubs')
    assert.equal(hubs.length,2,item.url+' has two hubs')
    const measured=hubs.map(hub=>{
      const box=new T.Box3().setFromObject(hub),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
      // Hub axis is world X: the ring profile spans the hub's axial length there.
      assert.ok(Math.abs(size.x)>0&&Math.abs(size.y)>0&&Math.abs(size.z)>0,item.url+' finite hub bounds')
      const alongAxis=new T.Raycaster(new T.Vector3(center.x-1,center.y,0),new T.Vector3(1,0,0)).intersectObject(hub,true)
      assert.equal(alongAxis.length,0,item.url+' through bore on the axis')
      return {hub,box,size,center}
    }).sort((a,b)=>a.center.x-b.center.x)

    for(const [i,{hub,box,center,size}] of measured.entries()){
      const {boreMm,lengthMm}=item.ends[i],ri=boreMm/2000
      assert.ok(Math.abs(size.x-lengthMm/1000)<1e-5,`${item.url} end ${i} hub length ${size.x}`)
      // A ray inside the declared bore misses the hub; a ray in the hub wall hits it.
      const inside=new T.Raycaster(new T.Vector3(center.x-1,center.y,ri*.5),new T.Vector3(1,0,0)).intersectObject(hub,true)
      assert.equal(inside.length,0,`${item.url} end ${i} bore ${boreMm}mm is open`)
      const wall=new T.Raycaster(new T.Vector3(box.min.x-1,center.y,ri*1.5),new T.Vector3(1,0,0)).intersectObject(hub,true)
      assert.ok(wall.length>0,`${item.url} end ${i} hub wall exists outside ${boreMm}mm bore`)
      assert.equal(hub.material.metalness,.72,`${item.url} hub keeps its steel material`)
      assert.equal(hub.material.roughness,.53,`${item.url} hub keeps its steel roughness`)
    }
    const ratio=measured[0].size.x/measured[1].size.x
    assert.ok(Math.abs(ratio-item.ends[0].lengthMm/item.ends[1].lengthMm)<1e-4,item.url+' hub length ratio')

    // The whole assembly keeps finite bounds and every mesh keeps a PBR material.
    const bounds=new T.Box3().setFromObject(scene),size=bounds.getSize(new T.Vector3())
    assert.ok([size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0),item.url+' finite assembly bounds')
    for(const mesh of meshes){
      assert.ok(mesh.material&&Number.isFinite(mesh.material.metalness)&&Number.isFinite(mesh.material.roughness),item.url+' material retained')
    }
    const flange=meshes.find(m=>m.userData.observation?.id==='flanges')
    assert.equal(flange.material.metalness,.72,item.url+' flange material')
    const pin=meshes.find(m=>m.userData.observation?.id==='pins')
    assert.equal(pin.material.metalness,.12,item.url+' pin material')
    assert.equal(meshes.filter(m=>m.userData.observation?.id==='pins').length,8,item.url+' pin count stays illustrative')
  }
})

test('Mean Well NDR low and detail envelopes match the saved manufacturer dimensions',async()=>{
  const supplies=evidenceModels.filter(item=>item.id.startsWith('meanwell-ndr-'))
  assert.equal(supplies.length,2)
  for(const item of supplies){
    for(const level of ['low','detail']){
      const {scene}=await load(item[level+'Url'])
      const meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)})
      // The simplified level stays five boxes; the detail level keeps its existing parts.
      assert.equal(meshes.length,level==='low'?5:item.id.includes('480')?405:273,`${item.id} ${level} mesh count`)
      const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3()).multiplyScalar(1000)
      const expected=item.dimensionsMm
      for(const [axis,value] of [['x',expected.width],['y',expected.height],['z',expected.depth]]){
        assert.ok(Math.abs(size[axis]-value)<=.02,`${item.id} ${level} ${axis}=${size[axis].toFixed(4)} vs ${value}`)
      }
      // Terminal count is unchanged: two terminal blocks holding 4 and 3 ways.
      // GLTFLoader appends _1 to repeated node names, so match the base prefix.
      const widths=meshes.filter(m=>m.name?.startsWith('terminal-block')).map(m=>new T.Box3().setFromObject(m).getSize(new T.Vector3()).x*1000).sort((a,b)=>b-a)
      assert.equal(widths.length,2,`${item.id} ${level} terminal blocks`)
      assert.ok(Math.abs(widths[0]-4*6.2)<1e-3,`${item.id} ${level} four-way block`)
      assert.ok(Math.abs(widths[1]-3*6.2)<1e-3,`${item.id} ${level} three-way block`)
      const screws=meshes.filter(m=>m.name?.startsWith('screw-slot')).length
      assert.equal(screws,level==='detail'?7:0,`${item.id} ${level} terminal screws`)
    }
  }
})
