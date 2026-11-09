'use strict';
// Guards for the 2025-09-29 readable BaseMod copy embedded in
// server/src/robot-basemod-legacy.js: the text must stay byte-identical to the
// extracted source, and it must only be registered when the 2026 backup's
// BaseMod is unreadable.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const legacy = require('../src/robot-basemod-legacy');
const { programFor } = require('../src/robot-sim');
const ROOT = path.resolve(__dirname, '..', '..');
const realBackupPath = path.join(ROOT, '.local', 'abb-flow-20261105', 'report.json');
const hasRealBackup = fs.existsSync(realBackupPath);
const rawReport = hasRealBackup ? JSON.parse(fs.readFileSync(realBackupPath, 'utf8')) : null;
const realReport = rawReport ? legacy.withLegacySource(rawReport) : null;

test('embedded legacy source is byte-identical to the recorded 2025 extraction', () => {
  const lines = legacy.SOURCE.split('\n');
  legacy.ROUTINES.forEach((routine, index) => {
    const text = lines.slice(routine.startLine - 1, routine.endLine).join('\n') + '\n';
    const sha = crypto.createHash('sha256').update(text).digest('hex');
    assert.equal(sha, legacy.PROVENANCE.routines[index].textSha256, routine.name + ' body hash');
    assert.equal(routine.kind, legacy.PROVENANCE.routines[index].kind);
    assert.equal(routine.name, legacy.PROVENANCE.routines[index].name);
  });
  assert.deepEqual(legacy.routineNames, ['MidPosCal', 'guodu', 'guodu_SAFE']);
});

test('fileFor slices only the requested routines with fresh line ranges', () => {
  const file = legacy.fileFor(['guodu']);
  assert.equal(file.routines.length, 1);
  assert.equal(file.routines[0].name, 'guodu');
  assert.match(file.text, /PROC guodu\(/);
  assert.doesNotMatch(file.text, /PROC guodu_SAFE/);
  assert.ok(file.routines[0].startLine > 0 && file.routines[0].endLine > file.routines[0].startLine);
  const all = legacy.fileFor(legacy.routineNames);
  assert.equal(all.routines.length, 3);
  for (const routine of all.routines) assert.match(all.text.split('\n')[routine.startLine - 1], /^\s*(PROC|FUNC)\s+/);
});

test('legacy source registers only for the exact protected BaseMod of the 2026 backup', { skip: !hasRealBackup }, () => {
  const baseMod = realReport.files.find(file => file.name === 'BaseMod.mod');
  assert.equal(legacy.PROVENANCE.baseMod2026.sha256, baseMod.sha256);
  assert.equal(baseMod.bytes, legacy.PROVENANCE.baseMod2026.bytes);
  const withProtected = programFor(realReport);
  assert.ok(withProtected.legacyBaseMod);
  assert.deepEqual([...withProtected.legacyBaseMod.applied].sort(), ['MidPosCal', 'guodu', 'guodu_SAFE']);
  const clone = {
    ...realReport,
    sha256: 'test-no-protected-basemod',
    files: realReport.files.filter(file => file.name !== 'BaseMod.mod'),
  };
  const withoutProtected = programFor(clone);
  assert.equal(withoutProtected.legacyBaseMod, null);
  assert.equal(withoutProtected.routines.get('name:T_ROB1:guodu'), undefined);
  assert.equal(withoutProtected.routines.get('name:T_ROB1:guodu_safe'), undefined);
  assert.equal(withoutProtected.routines.get('name:T_ROB1:midposcal'), undefined);
  // A different protected BaseMod (other program/version) must not borrow this source.
  const foreign = { ...realReport, sha256: 'test-foreign-basemod', files: realReport.files.map(file => file.name === 'BaseMod.mod' ? { ...file, sha256: '0'.repeat(64) } : file) };
  assert.equal(programFor(foreign).legacyBaseMod, null);
});

test('the original 2026 backup ZIP hash is unchanged', { skip: !hasRealBackup }, () => {
  assert.equal(realReport.sha256, '01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad');
  const zip=path.join(ROOT,'.local/review-20261018/robot-library',realReport.sha256,'backup.zip');
  if(fs.existsSync(zip))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),realReport.sha256);
});

test('readable compatibility copy is separate from native backup files and cannot poison a raw-report cache', { skip: !hasRealBackup }, () => {
  assert.equal(programFor(rawReport).legacyBaseMod,null);
  assert.ok(programFor(realReport).legacyBaseMod);
  assert.equal(realReport.files,rawReport.files);
  assert.equal(rawReport.simulationCompatibility,undefined);
  assert.equal(legacy.withLegacySource({...rawReport,sha256:'0'.repeat(64)}).simulationCompatibility,undefined);
});
