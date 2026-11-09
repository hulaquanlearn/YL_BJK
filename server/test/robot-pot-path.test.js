'use strict';
// Pot exit / rim-cleanup geometry tests.
// The real-backup cases are skipped when the local fixture (.local/…report.json,
// git-ignored real ZIP index) is absent; the geometry unit tests always run.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..', '..');
const { createSimulation, advanceSimulation, programFor } = require('../src/robot-sim');
const { cellProfile } = require('../src/robot-cell-sim');
const deposit = require('../src/robot-deposit-state');

const realBackupPath = path.join(ROOT, '.local', 'abb-flow-20261105', 'report.json');
const hasRealBackup = fs.existsSync(realBackupPath);
const realReport = hasRealBackup ? require('../src/robot-basemod-legacy').withLegacySource(JSON.parse(fs.readFileSync(realBackupPath, 'utf8'))) : null;
const CELL = { depositGrid: { lowerRadius: 1.09, upperRadius: 1.2, potHeight: .97 } };

test('pot shell: 1.2 m inner rim, 75.1 mm wall/rim width, 0.97 m height', () => {
  const shell = deposit.potShell(CELL);
  assert.ok(Math.abs(shell.heightMm - 970) < .01);
  assert.ok(Math.abs(shell.rimInnerMm - 1200) < .01);
  assert.ok(Math.abs(shell.rimOuterMm - 1275.2) < .5);
  assert.ok(Math.abs(shell.rimWidthMm - 75.1) < .5);
  assert.ok(Math.abs(shell.innerAt(0) - 1090) < .01);
});

test('pot clearance: cavity free, wall solid, above rim free', () => {
  const shell = deposit.potShell(CELL);
  assert.ok(deposit.potPointClearance(shell, [500, 0, 500]).clearance > 600);
  assert.ok(deposit.potPointClearance(shell, [1220, 0, 500]).clearance < 0);
  assert.ok(deposit.potPointClearance(shell, [1250, 0, 1100]).clearance > 120);
});

test('QS sweep left/right covers the rim annulus with the declared brush proxy', () => {
  // Real backup values (yuanxin.mod:346-362 / :390-404, Clean_L/R minus 100 mm).
  const left = deposit.potRimSweep(CELL, { tcpLocal: [1250.1, 95, 946.74], steps: 75, stepDeg: 5, direction: 1 });
  assert.ok(left.insideRimBand);
  assert.ok(Math.abs(left.radiusMm - 1253.73) < .5);
  assert.ok(Math.abs(left.belowRimMm - 23.26) < .2);
  assert.ok(Math.abs(left.distanceInnerMm - 56.37) < .6);
  assert.strictEqual(left.angularDeg, 375);
  assert.ok(left.fullCircle);
  assert.ok(Math.abs(left.requiredRadiusMm - 53.73) < .5);
  assert.ok(Math.abs(left.requiredBristleMm - 23.26) < .2);
  assert.ok(Math.abs(left.distanceOuterMm - 18.8) < .6);
  assert.ok(left.coversRim);
  const right = deposit.potRimSweep(CELL, { tcpLocal: [1256.11, 0, 955.94], steps: 75, stepDeg: -5, direction: -1 });
  assert.ok(right.insideRimBand);
  assert.ok(Math.abs(right.radiusMm - 1256.11) < .5);
  assert.ok(Math.abs(right.belowRimMm - 14.06) < .2);
  assert.ok(right.coversRim);
  // A smaller brush must fail the coverage check: the check is not vacuous.
  const small = deposit.potRimSweep(CELL, { tcpLocal: [1250.1, 95, 946.74], steps: 75, stepDeg: 5, brush: { radiusMm: 40, bristleMm: 25 } });
  assert.strictEqual(small.coversRim, false);
});

test('tool envelope is a real multi-part CAD AABB set, not a TCP point', () => {
  assert.ok(deposit.TOOL_ENVELOPES['tool-640'].length >= 20);
  assert.ok(deposit.TOOL_ENVELOPES['tool-700'].length >= 18);
  const rake = deposit.TOOL_ENVELOPES['tool-640'].find(box => box.name === 'rake');
  assert.ok(rake && rake.max[2] - rake.min[2] > 80 && rake.max[1] - rake.min[1] > 500);
});

async function runReal(height, barrel, toolType = 'tool-640',routineName=null) {
  const { solveProgramRequest,prepareProgramMotion } = await import(pathToFileURL(path.join(ROOT, 'spare-parts-web-release/src/utils/abb-program-motion.mjs')).href);
  const profile = cellProfile(realReport);
  let simulation = createSimulation(realReport, { routine: routineName||profile.entry, joints: [0, 0, 0, 0, 90, 0], automation: { profile: profile.id, targetHeight: height, capacityLitres: 90, barrel }, toolType });
  if (simulation.error) throw Error(JSON.stringify(simulation.error));
  const motions = [], substitutions = [], provenance = [];let motionSeconds=0;
  const program=programFor(realReport);
  for (let step = 0; step < 60000; step++) {
    const stop = simulation.stop;
    if (!stop || ['blocked', 'pause', 'end'].includes(stop.type)) break;
    const elapsed = motionSeconds+(stop.type === 'wait' ? (stop.autoSeconds || 0) : 0);motionSeconds=0;
    const solve = stop.type === 'robot-solve' ? solveProgramRequest(stop.request) : null;
    simulation = advanceSimulation(realReport, { state: simulation.state, solveResult: solve, elapsed, stopOnMotion: true, maxSteps: 2000 });
    for (const event of simulation.events || []) {
      if (event.type === 'motion'){const prepared=prepareProgramMotion(event,event.from,{},{automatic:true});motionSeconds=Math.min(60,prepared.duration);if(event.straight){let prior=event.from;for(const frame of prepared.frames){assert.ok(frame.every((q,i)=>Math.abs(q-prior[i])<90),'rendered MoveL keeps a continuous joint branch');prior=frame}}motions.push(event)}
      if (event.type === 'substitution') substitutions.push(event);
      if (event.type === 'provenance') provenance.push({...event,stack:(simulation.state.stack||[]).map(frame=>(program.routines.get(frame.routineId)||{}).name)});
    }
  }
  return { motions, substitutions, provenance, stop: simulation.stop, state: simulation.state };
}

test('real backup: QS executes 75 rim steps per side and the sweep is on the rim band', { skip: !hasRealBackup }, async () => {
  for (const barrel of ['left', 'right']) {
    const { motions,stop } = await runReal(40, barrel,'tool-640','QS');assert.equal(stop.type,'end',JSON.stringify(stop));
    const sweep = motions.filter(motion => motion.potClean && motion.file === 'yuanxin.mod' && (motion.line === 349 || motion.line === 393));
    assert.strictEqual(sweep.length, 75, barrel + ' sweep steps');
    for (const motion of sweep) {
      assert.ok(motion.potClean.insideRimBand, barrel + ' step must be on the rim band');
      assert.ok(motion.potClean.belowRimMm > 0 && motion.potClean.belowRimMm < 30);
    }
    const stepDeg = barrel === 'right' ? -5 : 5;
    const coverage = deposit.potRimSweep(CELL, { tcpLocal: [sweep[0].tcpLocal[0], sweep[0].tcpLocal[1], sweep[0].tcpLocal[2]], steps: 75, stepDeg, direction: barrel === 'right' ? -1 : 1 });
    assert.ok(coverage.coversRim, barrel + ' rim coverage');
    assert.strictEqual(coverage.angularDeg, 375);
  }
});

test('real backup: protected BaseMod falls back to the 2025-09-29 author-readable source', { skip: !hasRealBackup }, () => {
  const program = programFor(realReport);
  assert.ok(program.legacyBaseMod, 'legacy BaseMod metadata missing');
  assert.deepEqual([...program.legacyBaseMod.applied].sort(), ['MidPosCal', 'guodu', 'guodu_SAFE']);
  for (const name of ['guodu', 'guodu_SAFE', 'MidPosCal']) {
    const routine = program.routines.get('name:T_ROB1:' + name.toLowerCase());
    assert.ok(routine && routine.legacy, name + ' must come from the readable copy');
    assert.match(routine.legacy.sourceFile, /\.mod$/);
    assert.ok(routine.legacy.sourceLineStart > 0 && routine.legacy.sourceLineEnd > routine.legacy.sourceLineStart);
  }
});

test('real backup: restored guodu/guodu_SAFE execute the source moves for both pots and keep turns', { skip: !hasRealBackup }, async () => {
  for (const barrel of ['left', 'right']) {
    const { motions, provenance, stop, state } = await runReal(40, barrel);
    assert.equal(stop.type, 'end', JSON.stringify(stop));
    assert.equal(stop.routine, 'main');
    assert.equal(stop.line, 339);
    const transition = motions.filter(motion => /^guodu(_safe)?$/i.test(motion.routine));
    assert.ok(transition.length > 0, barrel + ' must execute guodu/guodu_SAFE');
    assert.ok(transition.every(motion => /BaseMod\(2025-09-29可读源码\)\.mod/.test(motion.file)));
    // No synthetic, invented transition routine may run.
    assert.ok(motions.every(motion => !/^__cell_guodu/.test(motion.routine)));
    // Absolute J6 turns from the source are preserved by MoveAbsJ/MoveL.
    assert.ok(transition.some(motion => Math.abs(motion.to[5]) > 180), barrel + ' keeps the source J6 turn');
    // Whole-tool sweep against the offline pot proxy must not report penetration.
    const checked = transition.filter(motion => motion.potCheck);
    assert.ok(checked.length > 0, barrel + ' transition poses should carry pot checks');
    for (const motion of checked) assert.ok(motion.potCheck.clearance >= 0, barrel + ' transition clearance ' + motion.potCheck.clearance + ' at ' + motion.routine + ':' + motion.line);
    // Provenance events carry the caller arguments, not a hidden default.
    const calls = provenance.filter(event => event.routine.toLowerCase() === 'guodu');
    assert.ok(calls.length > 0, barrel + ' guodu provenance');
    const first = calls[0];
    // The user-confirmed real call chain: main → rWorkLoop → kaishi_saliao → JS → JS_pd0 → guodu.
    assert.equal(first.line, 320);
    assert.deepEqual(first.stack.slice(0, 5), ['main', 'rWorkLoop', 'kaishi_saliao', 'JS', 'JS_pd0']);
    assert.equal(first.stack.at(-1), 'guodu');
    const byName = Object.fromEntries(first.parameters.map(parameter => [parameter.parameter.toLowerCase(), parameter]));
    assert.ok(Number.isFinite(byName.qidianc.value));
    assert.ok(Number.isFinite(byName.zhongdianc.value));
    assert.ok(byName.zhongdianc.value > byName.qidianc.value, 'zhongdian must be ahead of qidian');
    assert.equal(byName.js_hy.value, 'JS1');
    assert.equal(byName.wobjv.source, 'wobjjidian');
    assert.equal(byName.toolcentre.source, 'tGripCentre');
    assert.ok(state.stack.length === 1);
  }
});

test('real backup: readable cleanup whole-tool clearance and configured joint bounds', { skip: !hasRealBackup }, async () => {
  for (const barrel of ['left', 'right']) {
    const { motions,stop } = await runReal(40, barrel,'tool-640','QS');assert.equal(stop.type,'end',JSON.stringify(stop));
    const clean = motions.filter(motion => motion.potClean);
    for (const motion of clean) assert.ok(motion.potCheck.clearance > -12, barrel + ' rim-clean AABB clearance ' + motion.potCheck.clearance);
    for (const motion of motions) {
      const delta = motion.jointDelta;
      if (!delta) continue;
      if(motion.instruction==='MoveAbsJ')continue; // Source absolute turns must not be rewrapped.
      for(let axis=0;axis<6;axis++)assert.ok(motion.joints[axis]>=motion.jointLimits[axis][0]&&motion.joints[axis]<=motion.jointLimits[axis][1],barrel+' transport respects configured axis bounds');
    }
  }
});

