import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {Box3, Group, Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createCleaningBrush} from '../src/utils/abb-cleaning-brush.mjs'
import {applyRobotJoints} from '../src/utils/abb-kinematics.mjs'

for (const [type, rakeId] of [['tool-640', '169'], ['tool-700', '187']]) {
  test(type + ' has a fixed strip brush below the belt and clear of the rigid rake', async () => {
    const data = await readFile(new URL('../public/models/abb-irb6700/' + type + '.glb', import.meta.url))
    const {scene: cad} = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
    const brush = createCleaningBrush(type)
    brush.updateMatrixWorld(true)
    const fibres = new Box3().setFromObject(brush.getObjectByName('浅色密排刷毛'))
    const size = fibres.getSize(new Vector3())
    assert.ok(size.z > 8 * size.y, 'strip extends across the belt')
    assert.ok(fibres.min.y > .85, 'bristles are below the tool body')
    let rake
    cad.traverse(node => { if (node.userData.sourceInstance === rakeId) rake = node })
    assert.ok(!new Box3().setFromObject(rake).intersectsBox(new Box3().setFromObject(brush)))

    const robot = new Group(), wrist = new Group(), tool = new Group()
    wrist.name = 'axis6'
    tool.name = 'tool'
    tool.userData.mountPosition = new Vector3(2.1125, 2.26, 0)
    tool.rotation.z = -Math.PI / 2
    robot.add(wrist)
    wrist.add(tool)
    tool.add(cad, brush)
    applyRobotJoints(robot, [0, 0, 0, 0, 90, 0])
    const before = brush.getWorldPosition(new Vector3())
    const mount = brush.position.clone()
    applyRobotJoints(robot, [30, 0, 0, 0, 90, 0])
    const after = brush.getWorldPosition(new Vector3())
    assert.ok(before.distanceTo(after) > .1)
    assert.ok(tool.worldToLocal(after).distanceTo(mount) < 1e-9, 'brush remains rigidly mounted')
  })
}
