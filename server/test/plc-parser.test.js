const test = require('node:test');
const assert = require('node:assert/strict');
const { versionFromFilename, extractAddresses, isProtectedText, parsePlcFile } = require('../src/plc-parser');

test('recognizes TIA project versions', () => {
  assert.equal(versionFromFilename('一楼.ap16'), 'V16');
  assert.equal(versionFromFilename('一楼.zap17'), 'V17');
});

test('extracts and deduplicates PLC addresses', () => {
  assert.deepEqual(extractAddresses('A %I0.1 B QW20 C DB10.DBX2.3 D %I0.1'), ['%I0.1', 'QW20', 'DB10.DBX2.3']);
});

test('parses SCL blocks and networks', () => {
  const result = parsePlcFile(Buffer.from('FUNCTION_BLOCK "Motor"\nNETWORK 1\nIF %I0.0 THEN %Q0.0 := TRUE; END_IF;\nNETWORK 2\nEND_FUNCTION_BLOCK'), 'Motor.scl');
  assert.equal(result.status, 'parsed');
  assert.equal(result.items[0].name, 'Motor');
  assert.equal(result.items.filter(item => item.itemType === 'network').length, 2);
});

test('parses every top-level block in a multi-block SCL source', () => {
  const result = parsePlcFile(Buffer.from(`FUNCTION "First" : Void
END_FUNCTION
FUNCTION_BLOCK "Second"
END_FUNCTION_BLOCK`), 'multi.scl');
  assert.deepEqual(result.items.filter(item => item.itemType === 'block').map(item => item.name), ['First', 'Second']);
  assert.equal(result.items[1].metadata.startLine, 3);
});

test('extracts TIA structured XML symbols and calls from plcai exports', () => {
  const xml = `<Document><SW.Blocks.FB><AttributeList><Name>Main</Name><ProgrammingLanguage>LAD</ProgrammingLanguage></AttributeList><ObjectList><SW.Blocks.CompileUnit><AttributeList><NetworkSource><FlgNet><Parts><Access Scope="GlobalVariable" UId="21"><Symbol><Component Name="Ready" /></Symbol></Access><Call UId="22"><CallInfo Name="DriveStart" BlockType="FC" /></Call></Parts></FlgNet></NetworkSource></AttributeList></SW.Blocks.CompileUnit></ObjectList></SW.Blocks.FB></Document>`;
  const result = parsePlcFile(Buffer.from(JSON.stringify({ items: [{ itemType: 'block', name: 'Main', language: 'LAD', contentText: xml }] })), 'export.plcai');
  const refs = result.items[0].metadata.referenceIndex;
  assert.ok(refs.reads.some(item => item.symbol === 'Ready'));
  assert.ok(refs.calls.some(item => item.symbol === 'DriveStart'));
  assert.equal(refs.completeness, 'partial');
});

test('marks native projects and protected content safely', () => {
  assert.equal(parsePlcFile(Buffer.from('x'), 'floor.ap17').status, 'requires_extractor');
  assert.equal(isProtectedText('Know-how protected block'), true);
});

test('parses structured plcai package', () => {
  const result = parsePlcFile(Buffer.from(JSON.stringify({
    projectMetadata: { cpuModel: 'CPU 1515-2 PN', devices: [{ name: 'PLC_1' }], deviceCount: 1 },
    items: [{ itemType: 'tag', name: '启动', address: '%I0.0' }]
  })), 'export.plcai');
  assert.equal(result.items[0].address, '%I0.0');
  assert.equal(result.projectMetadata.cpuModel, 'CPU 1515-2 PN');
  assert.equal(result.projectMetadata.deviceCount, 1);
});

test('keeps exporter warnings so incomplete TIA packages cannot be marked ready', () => {
  const result = parsePlcFile(Buffer.from(JSON.stringify({ warnings: ['OB1 export failed'], items: [{ itemType: 'block', name: 'FB1' }] })), 'warning.plcai');
  assert.deepEqual(result.warnings, ['OB1 export failed']);
  assert.match(result.message, /结果可能不完整/);
});

test('parses ABB RAPID routines, logic tree and IO from a folder file', () => {
  const source = `! RobotWare 6.15.06 IRC5
  MODULE PackCell
  PERS num cycleCount := 0;
  PROC Main()
    IF diReady = 1 THEN
      MoveJ pHome,v1000,z50,tool0;
      SetDO doRunning,1;
      PickPart;
    ELSE
      WaitDI diReady,1;
    ENDIF
  ENDPROC
ENDMODULE`;
  const result = parsePlcFile(Buffer.from(source), 'RAPID/TASK1/PROGMOD/PackCell.mod');
  assert.equal(result.status, 'parsed');
  const routine = result.items.find(item => item.itemType === 'block' && item.name === 'Main');
  assert.ok(routine);
  assert.equal(routine.language, 'RAPID');
  assert.match(routine.metadata.meaning, /运动指令/);
  assert.deepEqual(routine.metadata.ioSignals.sort(), ['diReady', 'doRunning'].sort());
  assert.equal(routine.metadata.logicTree.children[0].type, 'if');
  assert.ok(result.items.some(item => item.itemType === 'tag' && item.name === 'cycleCount'));
  assert.equal(result.projectMetadata.controllerFamily, 'IRC5');
  assert.equal(result.projectMetadata.robotWareVersion, '6.15.06');
  assert.equal(result.projectMetadata.moduleCount, 1);
});
