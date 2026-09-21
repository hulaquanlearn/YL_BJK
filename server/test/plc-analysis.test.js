const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramGraph, buildReferenceIndex, findSymbolReferences, stableProgramKey } = require('../src/plc-analysis');

test('ST reference index reports real source lines, reads, writes and calls', () => {
  const index = buildReferenceIndex({
    contentText: 'MotorReady := StartSignal AND NOT Fault;\nIF GuardClosed AND AutoMode THEN\n  DriveStart();\nEND_IF;',
    language: 'SCL', startLine: 20, definition: 'Main'
  });
  assert.deepEqual(index.writes[0], { symbol: 'MotorReady', line: 20, kind: 'write' });
  assert.ok(index.reads.some(item => item.symbol === 'StartSignal' && item.line === 20));
  assert.ok(index.reads.some(item => item.symbol === 'GuardClosed' && item.line === 21));
  assert.ok(index.reads.some(item => item.symbol === 'AutoMode' && item.line === 21));
  assert.ok(index.calls.some(item => item.symbol === 'DriveStart' && item.line === 22));
});

test('ST reference index reports assignments that follow a condition on the same line', () => {
  const index = buildReferenceIndex({ contentText: 'IF Ready THEN Output := Input1; END_IF;', language: 'SCL' });
  assert.ok(index.reads.some(item => item.symbol === 'Ready'));
  assert.ok(index.reads.some(item => item.symbol === 'Input1'));
  assert.ok(index.writes.some(item => item.symbol === 'Output'));
});

test('program graph resolves imported calls and leaves unknown calls explicit', () => {
  const mainIndex = buildReferenceIndex({ contentText: 'DriveStart();\nMissingBlock();', language: 'SCL', definition: 'Main' });
  const items = [
    { id: 1, itemType: 'block', name: 'Main', sourcePath: 'main.scl', sourceRef: 'Main', metadata: { referenceIndex: mainIndex } },
    { id: 2, itemType: 'block', name: 'DriveStart', sourcePath: 'drive.scl', sourceRef: 'DriveStart', metadata: { referenceIndex: buildReferenceIndex({ contentText: '', definition: 'DriveStart' }) } }
  ];
  const graph = buildProgramGraph(items);
  assert.ok(graph.edges.some(edge => edge.sourceId === '1' && edge.targetId === '2'));
  assert.ok(graph.unresolved.some(item => item.symbol === 'MissingBlock'));
  assert.equal(graph.coverage.referenceCoveragePercent, 100);
  assert.equal(graph.coverage.relationCoveragePercent, 50);
});

test('cross references and stable keys remain source based', () => {
  const item = { id: 9, itemType: 'block', name: 'Main', sourcePath: 'main.scl', sourceRef: 'Main', metadata: { referenceIndex: buildReferenceIndex({ contentText: 'Output1 := Input1;', language: 'SCL', definition: 'Main' }) } };
  assert.equal(stableProgramKey(item), stableProgramKey({ ...item, id: 99 }));
  assert.equal(findSymbolReferences([item], 'Input1').references[0].line, 1);
});

test('cross references include simple SCL and RAPID source declarations', () => {
  const scl = {
    id: 10, itemType: 'block', name: 'Main', sourcePath: 'Main.scl', sourceRef: 'Main',
    metadata: { referenceIndex: buildReferenceIndex({
      contentText: 'VAR\nGuardClosed : BOOL;\nEND_VAR\nIF GuardClosed THEN\nEND_IF;',
      language: 'SCL', startLine: 2, definition: 'Main'
    }) }
  };
  const rapid = {
    id: 11, itemType: 'block', name: 'Cell', sourcePath: 'Cell.mod', sourceRef: 'Cell',
    metadata: { referenceIndex: buildReferenceIndex({
      contentText: 'VAR bool DoorClosed;\nPERS num CycleCount := 0;\nCONST num MaxCycles := 10;',
      language: 'RAPID', startLine: 40, definition: 'Cell'
    }) }
  };

  const sclResult = findSymbolReferences([scl], 'GuardClosed');
  assert.equal(sclResult.definitions[0].line, 3);
  assert.ok(sclResult.references.some(item => item.kind === 'read' && item.line === 5));
  assert.equal(findSymbolReferences([rapid], 'DoorClosed').definitions[0].line, 40);
  assert.equal(findSymbolReferences([rapid], 'CycleCount').definitions[0].line, 41);
  assert.equal(findSymbolReferences([rapid], 'MaxCycles').definitions[0].line, 42);
});
