import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildVehicleModel} from '../src/utils/agv-model-catalog.mjs'
import {groupsFor} from '../src/utils/agv-presentation.mjs'
import {SYSTEM_COLORS,matrixGroups,clampUnit,advanceExplosion} from '../src/utils/agv-workbench.mjs'

const models=[
 {family:'latent',variant:'old'},
 {family:'latent',variant:'new'},
 {family:'counterweight'},
 {family:'flipping'}
]
const flatten=groups=>groups.flatMap(group=>group.parts)
const ids=parts=>parts.map(part=>part.id)
const freezeParts=parts=>Object.freeze(parts.map(part=>Object.freeze({...part})))
const freezeGroups=groups=>Object.freeze(groups.map(group=>Object.freeze({...group,parts:Object.freeze([...group.parts])})))
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`)


function disposeModel(built){
 const geometries=new Set(),materials=new Set(Object.values(built.materials||{}))
 built.root.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry)
  for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])materials.add(material)
 })
 for(const geometry of geometries)geometry.dispose()
 for(const material of materials)material.dispose()
}

function assertCoverage(result,partInfo){
 const all=flatten(result),byId=new Map(partInfo.map(part=>[part.id,part]))
 assert.equal(all.length,partInfo.length,'every real part appears exactly once')
 assert.equal(new Set(ids(all)).size,partInfo.length,'no repeated assignments')
 assert.deepEqual(ids(all).sort(),ids(partInfo).sort())
 assert.equal(all.filter(part=>part.id==='chassis').length,1,'chassis remains in the matrix')
 for(const group of result){
  assert.ok(group.parts.length,'empty groups are removed')
  assert.equal(group.color,SYSTEM_COLORS[group.id]||SYSTEM_COLORS.other)
  for(const part of group.parts)assert.equal(part,byId.get(part.id),'use the current model object, not an ID or foreign part')
 }
}

for(const options of models)test(`${options.family}/${options.variant||'default'} real-model pure workbench regression`,async t=>{
 const built=buildVehicleModel(options)
 try{
  const partInfo=freezeParts(built.parts.map(part=>({id:part.name,label:part.userData.label,description:part.userData.description})))
  const groups=freezeGroups(groupsFor(options.family))
  const snapshot=JSON.stringify({partInfo,groups})
  const matrix=matrixGroups(partInfo,groups)

  await t.test('real grouping conserves all parts and never crosses model boundaries',()=>{
   assertCoverage(matrix,partInfo)
   for(const group of matrix)for(const part of group.parts){
    const owner=groups.find(candidate=>candidate.parts.includes(part.id))
    assert.equal(group.id,owner?.id||'other')
   }
   if(options.family==='latent'){
    assert.equal(flatten(matrix).some(part=>part.id==='kinco-left'),options.variant==='new')
    for(const id of ['battery','mast','rotation','clamp'])assert.ok(!flatten(matrix).some(part=>part.id===id))
   }else{
    for(const id of ['pickup','tpm','ekk','supercapacitor','kinco-left'])assert.ok(!flatten(matrix).some(part=>part.id===id))
    assert.equal(flatten(matrix).some(part=>part.id==='rotation'),options.family==='flipping')
   }
  })

  await t.test('duplicate, invalid and overlapping IDs retain only the first owner; unassigned chassis survives',()=>{
   const duplicate=groups[0].parts.find(id=>id!=='chassis'&&partInfo.some(part=>part.id===id))
   assert.ok(duplicate)
   const damaged=freezeGroups(groups.map((group,index)=>({...group,parts:[
    ...(index===1?[duplicate]:[]),
    ...group.parts.filter(id=>id!=='chassis'),
    ...(index===0?[duplicate,duplicate]:[]),
    'not-a-real-part',null,42,{id:duplicate}
   ]})))
   const before=JSON.stringify(damaged)
   const result=matrixGroups(partInfo,damaged)
   assertCoverage(result,partInfo)
   assert.equal(result.find(group=>group.parts.some(part=>part.id===duplicate)).id,groups[0].id)
   const other=result.find(group=>group.id==='other')
   assert.equal(other.label,'其他部件')
   assert.ok(other.parts.some(part=>part.id==='chassis'))
   assert.equal(JSON.stringify(damaged),before)
   assertCoverage(matrixGroups(partInfo,[]),partInfo)
   assertCoverage(matrixGroups(partInfo,freezeGroups([{id:'unknown',label:'未知系统',parts:ids(partInfo)}])),partInfo)
  })

  assert.equal(JSON.stringify({partInfo,groups}),snapshot,'grouping and statistics must not modify inputs')
 }finally{
  disposeModel(built)
 }
})

test('system legend has the exact eight light-background accent colors',()=>{
 assert.deepEqual(Object.keys(SYSTEM_COLORS),['body','lift','drive','power','control','safety','rotation','other'])
 assert.equal(new Set(Object.values(SYSTEM_COLORS)).size,8)
 const luminance=color=>{
  const rgb=color.match(/[\da-f]{2}/gi).map(hex=>parseInt(hex,16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4)
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
 }
 for(const color of Object.values(SYSTEM_COLORS)){
  assert.match(color,/^#[\da-f]{6}$/i)
  assert.ok((luminance('#f3f5f7')+.05)/(luminance(color)+.05)>=3,'legend swatches must remain visible on light grey')
 }
})

test('empty data, object identity, unknown groups and duplicate assignment',()=>{
 assert.deepEqual(matrixGroups([],[]),[])
 assert.deepEqual(matrixGroups([],groupsFor('latent')),[])
 const partInfo=freezeParts([{id:'chassis',label:'底架'},{id:'lift',label:'顶升'},{id:'control',label:'控制'}])
 const groups=freezeGroups([
  {id:'body',label:'Body SYS',parts:['chassis','lift','lift','invalid']},
  {id:'lift',label:'Second SYS',parts:['lift']},
  {id:'empty',label:'Empty SYS',parts:['invalid']}
 ])
 const before=JSON.stringify({partInfo,groups})
 assertCoverage(matrixGroups(partInfo,groups),partInfo)
 assert.deepEqual(matrixGroups(partInfo,groups)[0].parts,partInfo.slice(0,2))
 assert.equal(matrixGroups(partInfo,groups).filter(g=>g.id==='lift').length,0,'duplicate part is not reassigned')
 const duplicate=Object.freeze({id:'lift',label:'not the real part'})
 assert.equal(matrixGroups([...partInfo,duplicate],groups)[0].parts[1],partInfo[1],'the first real object owns a duplicate input ID')
 assert.equal(JSON.stringify({partInfo,groups}),before)
})

test('clampUnit accepts finite numbers/numeric strings and safely bounds fallback values',()=>{
 for(const [value,expected] of [[0,0],[1,1],[.37,.37],[-2,0],[5,1],[' 0.42 ',.42],['-3',0],['2',1],['1e-2',.01]]){
  assert.equal(clampUnit(value),expected)
 }
 const invalid=[NaN,Infinity,-Infinity,'NaN','Infinity','-Infinity','invalid','','  ',null,undefined,true,false,[],[.3],{},Symbol('invalid'),1n]
 for(const value of invalid){
  assert.equal(clampUnit(value),0)
  assert.equal(clampUnit(value,.4),.4)
  assert.equal(clampUnit(value,' .7 '),.7)
  assert.equal(clampUnit(value,-2),0)
  assert.equal(clampUnit(value,5),1)
  for(const fallback of [NaN,Infinity,'bad',null,{},Symbol('fallback')])assert.equal(clampUnit(value,fallback),0)
 }
 assert.equal(clampUnit(.2,'bad'),.2,'valid input never needs the fallback')
 const object=Object.freeze({valueOf(){throw new Error('must not coerce arbitrary objects')}})
 assert.equal(clampUnit(object,.5),.5)
})

test('advanceExplosion uses seconds, bounded delta and linear forward/reverse durations',()=>{
 near(advanceExplosion(.2,1,.03),.2+.03/.9)
 near(advanceExplosion(.8,0,.03),.8-.03/.65)
 near(advanceExplosion(.2,1,10),advanceExplosion(.2,1,.05))
 near(advanceExplosion(.8,0,10),advanceExplosion(.8,0,.05))

})

test('advanceExplosion pauses on zero/invalid delta, clamps endpoints and never overshoots either direction',()=>{
 for(const delta of [0,-1,NaN,Infinity,-Infinity,undefined,null,'0.02','invalid',{},Symbol('delta')]){
  assert.equal(advanceExplosion(.42,1,delta),.42)
  assert.equal(advanceExplosion(.42,0,delta),.42)
 }
 assert.equal(advanceExplosion(-1,1,0),0)
 assert.equal(advanceExplosion(3,0,0),1)
 assert.equal(advanceExplosion(' .3 ',1,0),.3)
 assert.equal(advanceExplosion(NaN,1,0),0)
 assert.equal(advanceExplosion(.5,Infinity,.05),.5-.05/.65)
 assert.equal(advanceExplosion(.99,1,.05),1)
 assert.equal(advanceExplosion(.01,0,.05),0)
 assert.equal(advanceExplosion(.39,.4,.05,2),.4)
 assert.equal(advanceExplosion(.41,.4,.05,2),.4)
 assert.equal(advanceExplosion(.4,.4,.05),.4)
 for(const [start,target] of [[0,1],[1,0],[.2,.8],[.8,.2]]){
  let current=start
  for(let index=0;index<200;index++){
   const next=advanceExplosion(current,target,.05,index%2?.25:2)
   assert.ok(Number.isFinite(next)&&next>=0&&next<=1)
   assert.ok(next>=Math.min(current,target)&&next<=Math.max(current,target),'step cannot pass target')
   current=next
  }
  assert.equal(current,target)
 }
})
