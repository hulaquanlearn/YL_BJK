import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createRobotServicePanel,createRobotBatteryCompartment,robotServicePart,robotBatteryPart} from '../src/utils/abb-service-panel.mjs'
import {applyRobotJoints} from '../src/utils/abb-kinematics.mjs'
import {FreeModelControls} from '../src/utils/free-model-controls.mjs'
import {robotPlantEquipment} from '../src/utils/abb-robot.mjs'

test('SMB cover and brake controls have independent, non-overlapping anchors and follow the turntable',async()=>{
 const b=await readFile(new URL('../public/models/abb-irb6700/irb6700-150-320.glb',import.meta.url)),{scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')
 const buttons=createRobotServicePanel(scene),battery=createRobotBatteryCompartment(scene)
 assert.notEqual(robotServicePart.id,robotBatteryPart.id);assert.doesNotMatch(robotServicePart.label,/电池/);assert.match(robotBatteryPart.label,/SMB.*电池仓/)
 scene.updateMatrixWorld(true)
 const cover=()=>new T.Box3().setFromObject(battery),guard=()=>new T.Box3().setFromObject(buttons)
 assert.ok(cover().getCenter(new T.Vector3()).distanceTo(guard().getCenter(new T.Vector3()))>.07)
 assert.ok(cover().min.x>guard().max.x,'manual front view: battery cover left of vertical button guard')
 assert.ok(cover().min.y>guard().min.y&&cover().max.y<guard().max.y,'cover beside middle of the button guard')
 const ray=new T.Raycaster(new T.Vector3(.245,.475,-.8),new T.Vector3(0,0,1)),hit=ray.intersectObject(battery,true)[0]
 assert.ok(hit);assert.equal(hit.object.name,'smb-battery-cover');assert.ok(Math.abs(hit.point.z+.2312)<.0005,'SMB selection stays on the existing CAD cover')
 assert.equal(battery.getObjectByName('smb-battery-housing'),undefined,'no fabricated battery housing')
 assert.equal(createRobotBatteryCompartment(scene),battery,'repeat prepare cannot duplicate the cover')
 assert.equal(createRobotServicePanel(scene),buttons,'repeat prepare cannot duplicate the controls')
 const bodyHits=ray.intersectObject(scene.getObjectByName('axis1'),true).filter(h=>h.object!==hit.object&&Math.abs(h.point.z-hit.point.z)<.00001)
 assert.equal(bodyHits.length,0,'the selected cover replaces its body triangles without a second overlapping face')
 assert.ok(battery.userData.labelAnchor.length===3&&battery.userData.labelNormal.length===3,'SMB label anchor/normal metadata')
 assert.equal(buttons.getObjectByName('brake-button-backing'),undefined)
 assert.ok(buttons.userData.labelAnchor.length===3&&buttons.userData.labelNormal.length===3)
 for(const cap of buttons.children.filter(item=>item.userData.axis)){assert.equal(cap.geometry.type,'CylinderGeometry');assert.ok(buttons.getObjectByName('brake-button-guard'),'existing guard reused')}
 for(const spread of [0,1]){applyRobotJoints(scene,[50,0,0,0,90,0],spread);assert.equal(battery.parent,scene.getObjectByName('axis1'));assert.ok(cover().getSize(new T.Vector3()).length()>.05)}
})

test('chain approaches from the far side of the hopper, away from the robot, without moving its outlet',()=>{
 const a=robotPlantEquipment[0],r=a.create();r.position.fromArray(a.position);r.rotation.y=a.rotationY;r.updateMatrixWorld(true)
 const tail=new T.Vector3(0,r.userData.chainDeck.deckY,r.userData.chainDeck.tailZ).applyMatrix4(r.matrixWorld),end=new T.Vector3(0,r.userData.chainDeck.deckY,r.userData.chainDeck.dischargeZ).applyMatrix4(r.matrixWorld)
 assert.ok(tail.x>a.position[0]+1,'链板移至用户箭头所指的机器人外侧');assert.ok(Math.abs(end.x-a.position[0])<.1);assert.equal(r.userData.chainDeck.transportDirection,-1)
 r.userData.dispose()
})

test('free camera retains underside orientation, supports auto rotation and restores its saved view',()=>{
 const camera=new T.PerspectiveCamera(38,1,.01,100);camera.position.set(1,-4,2);camera.up.set(0,0,1)
 const c=new FreeModelControls(camera,null);c.update();assert.ok(camera.position.y<0);assert.ok(camera.up.z>.99)
 c.saveState();const before=camera.position.clone();c.autoRotate=true;assert.equal(c.update(.5),true);assert.ok(camera.position.distanceTo(before)>.01);assert.ok(Math.abs(camera.position.length()-before.length())<1e-8)
 c.autoRotate=false;c.clearMotion();c.reset();assert.ok(camera.position.distanceTo(before)<1e-8);// No DOM listeners were installed for this headless camera.
})
