import test from 'node:test'
import assert from 'node:assert/strict'
import {parkBuildings,parkCorridors,parkRiverPoints,parkRooms} from '../src/utils/brewing-park-layout.mjs'
const building=id=>parkBuildings.find(b=>b.id===id).boxes[0]
const corridor=id=>parkCorridors.find(c=>c.id===id)
test('five is narrower than two, right aligned, with open ground between six and five',()=>{
 const two=building('two'),five=building('five'),six=building('six')
 assert.ok(five[2]<two[2]);assert.equal(five[0]+five[2],two[0]+two[2]);assert.ok(five[0]-(six[0]+six[2])>two[0]-(building('three')[0]+building('three')[2]))
})
test('four starts level with five and six and both connecting corridors terminate inside it',()=>{
 const four=building('four');assert.equal(four[1],building('five')[1]);assert.equal(four[1],building('six')[1]);assert.ok(four[3]>building('six')[3])
 for(const id of ['one-four','five-four']){const [x,z]=corridor(id).to;assert.ok(x>four[0]&&x<four[0]+four[2]&&z>four[1]&&z<four[1]+four[3])}
})
test('raw grain and horizontal corridor alignments preserve the confirmed layout without a central branch',()=>{
 const raw=['breaking','grain','steam'].map(building);assert.ok(raw.every(b=>b[0]===raw[0][0]));assert.equal(raw[0][1]+raw[0][3],building('three')[1]+building('three')[3])
 for(const ids of [['breaking-three','three-two','two-one'],['grain-six','six-five','five-four']]){const z=corridor(ids[0]).from[1];for(const id of ids){assert.equal(corridor(id).from[1],z);assert.equal(corridor(id).to[1],z)}}
 assert.ok(!parkCorridors.some(c=>c.from[0]>55&&c.from[0]<60&&c.from[1]!==c.to[1]));assert.ok(corridor('three-six'))
})
test('qu wraps the breaking footprint on its upper and left sides without overlap',()=>{
 const [top,left]=parkBuildings.find(b=>b.id==='qu').boxes,breaking=building('breaking'),three=building('three')
 assert.equal(top[1],three[1]);assert.equal(left[1]+left[3],three[1]+three[3]);assert.ok(top[1]+top[3]<breaking[1],'Separate roofs need a physical gap');assert.ok(left[0]+left[2]<breaking[0],'Separate buildings need a physical gap')
})
test('hexi connects four continuously through the transverse corridor to seven',()=>{
 const four=building('four'),seven=building('seven'),a=corridor('hexi-long'),b=corridor('hexi-cross'),c=corridor('hexi-seven')
 assert.equal(a.from[1],four[1]+four[3]);assert.deepEqual(a.to,b.from);assert.deepEqual(b.to,c.from);assert.equal(c.to[1],seven[1]);assert.ok(c.to[0]>seven[0]&&c.to[0]<seven[0]+seven[2])
})
test('river winds behind five and six and continues beneath the long Hexi corridor',()=>{
 const long=corridor('hexi-long');assert.ok(parkRiverPoints.some(([x,z])=>x===long.from[0]&&z>long.from[1]&&z<long.to[1]));assert.ok(parkRiverPoints.some(([x,z])=>x>building('five')[0]&&z>108));assert.ok(new Set(parkRiverPoints.map(p=>p[1])).size>3)
})
test('spare parts room stays inside five-grain floor one at the marked corner facing six',()=>{
 const room=parkRooms.find(r=>r.id==='spare-room'),grain=building('grain'),six=building('six'),[x,z,w,d]=room.box;assert.equal(room.building,'grain');assert.equal(room.floor,1);assert.ok(x>=grain[0]&&z>=grain[1]&&x+w<=grain[0]+grain[2]&&z+d<=grain[1]+grain[3]);assert.equal(x+w,grain[0]+grain[2]);assert.ok(six[0]>x+w);assert.ok(z+d/2>grain[1]+grain[3]/2);assert.equal(corridor('breaking-grain').to[0],grain[0]+grain[2]);assert.ok(!parkBuildings.some(b=>b.id==='warehouse'))
})
test('both third-floor transport loops close and are supported continuously by floors or corridors',()=>{
 const parkTransportLoops=[[[42.5,27],[72.5,27],[102.5,27],[102.5,80.5],[75.75,80.5],[42.5,80.5],[42.5,27]],[[42.5,27],[12,27],[12,80.5],[42.5,80.5],[42.5,27]]]
 const covered=([x,z])=>parkBuildings.some(b=>b.boxes.some(([a,c,w,d])=>x>=a&&x<=a+w&&z>=c&&z<=c+d))||parkCorridors.some(({from:a,to:b})=>x>=Math.min(a[0],b[0])-1.5&&x<=Math.max(a[0],b[0])+1.5&&z>=Math.min(a[1],b[1])-1.5&&z<=Math.max(a[1],b[1])+1.5)
 for(const loop of parkTransportLoops){assert.deepEqual(loop[0],loop.at(-1));for(let i=1;i<loop.length;i++){const a=loop[i-1],b=loop[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let n=0;n<=steps;n++)assert.ok(covered([a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps]),'Unsupported transport segment')}}
 assert.deepEqual(corridor('breaking-grain').to,corridor('grain-six').from,'Physical raw-grain corner must share the same endpoint')
})
