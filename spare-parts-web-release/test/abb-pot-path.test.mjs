// Pot rim-sweep geometry shared with the server simulator + additive event fields.
import test from 'node:test'
import assert from 'node:assert'
import {createRequire} from 'node:module'
import {prepareProgramMotion} from '../src/utils/abb-program-motion.mjs'

const require = createRequire(import.meta.url)
const deposit = require('../../server/src/robot-deposit-state.js')
const CELL = {depositGrid: {lowerRadius: 1.09, upperRadius: 1.2, potHeight: .97}}

test('rim sweep: both barrels stay on the rim band and cover the full rim', () => {
  for (const [barrel, tcp, stepDeg] of [
    ['left', [1250.1, 95, 946.74], 5],
    ['right', [1252.1, -78.2, 955.94], -5],
  ]) {
    const r = Math.hypot(tcp[0], tcp[1])
    const sweep = deposit.potRimSweep(CELL, {tcpLocal: [r, 0, tcp[2]], steps: 75, stepDeg, direction: Math.sign(stepDeg)})
    assert.ok(sweep.insideRimBand, barrel + ' ring inside rim band')
    assert.ok(sweep.insideWall, barrel + ' TCP is on the rim wall (brush contact point)')
    assert.strictEqual(sweep.angularDeg, 375)
    assert.ok(sweep.coversRim, barrel + ' brush proxy covers the rim with the required radius/bristle')
    assert.ok(sweep.requiredBristleMm > 10 && sweep.requiredBristleMm < 30, barrel + ' required bristle length')
  }
})

test('pot geometry constants are the same object of truth for server and viewer checks', () => {
  assert.strictEqual(deposit.POT_GEOMETRY.rimWidthMm, 75.1)
  assert.ok(deposit.TOOL_ENVELOPES['tool-640'].length >= 20)
  const shell = deposit.potShell(CELL)
  assert.ok(Math.abs(shell.rimOuterMm - 1275.2) < .5)
})

test('adding pot telemetry to a motion event does not change the prepared path', () => {
  const joints = [-20, 10, 20, 0, 60, 10]
  const event = {type: 'motion', instruction: 'MoveAbsJ', joints, speed: {tcp: 800, orientation: 1000}, zone: 'fine'}
  const plain = prepareProgramMotion({...event}, [0, 0, 0, 0, 90, 0], {}, {automatic: true})
  const withPot = prepareProgramMotion({...event, pot: {heightMm: 970}, potPath: 'clean'}, [0, 0, 0, 0, 90, 0], {}, {automatic: true})
  assert.strictEqual(withPot.duration, plain.duration)
  assert.strictEqual(withPot.frames.length, plain.frames.length)
})

