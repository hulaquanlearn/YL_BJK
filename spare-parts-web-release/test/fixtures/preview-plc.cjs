// Synthetic PLC UI data only. Never reads production programs or connects to a PLC.
const {
  buildProgramGraph,
  buildReferenceIndex,
  findSymbolReferences,
  stableProgramKey
} = require('../../../server/src/plc-analysis');

const createdAt = '2026-09-05T08:00:00.000Z';
const sourceItems = [
  {
    id: 101,
    itemType: 'block',
    name: 'Main',
    blockType: 'FUNCTION_BLOCK',
    language: 'SCL',
    networkNo: null,
    address: null,
    dataType: null,
    commentText: '合成测试：安全门闭合后调用驱动启动块。',
    contentText: [
      'FUNCTION_BLOCK Main',
      'VAR_INPUT',
      '  GuardClosed : BOOL;',
      'END_VAR',
      'IF GuardClosed THEN',
      '  DriveStart();',
      'END_IF;',
      'END_FUNCTION_BLOCK'
    ].join('\n'),
    sourcePath: 'Controls/Main.scl',
    sourceRef: 'Main',
    isProtected: false
  },
  {
    id: 102,
    itemType: 'block',
    name: 'DriveStart',
    blockType: 'FUNCTION_BLOCK',
    language: 'SCL',
    networkNo: null,
    address: '%Q0.0',
    dataType: null,
    commentText: '合成测试：写入电机运行输出。',
    contentText: [
      'FUNCTION_BLOCK DriveStart',
      'MotorRun := TRUE;',
      'END_FUNCTION_BLOCK'
    ].join('\n'),
    sourcePath: 'Controls/Drive.scl',
    sourceRef: 'DriveStart',
    isProtected: false
  }
];

for (const item of sourceItems) {
  item.metadata = {
    startLine: 1,
    endLine: item.contentText.split('\n').length,
    parserKind: 'preview_fixture',
    meaning: item.commentText,
    referenceIndex: buildReferenceIndex({
      contentText: item.contentText,
      language: item.language,
      startLine: 1,
      definition: item.name,
      parserKind: 'preview_fixture'
    }),
    analysis: {
      purpose: item.commentText,
      execution: item.id === 101 ? ['读取 GuardClosed。', '条件成立时调用 DriveStart。'] : ['将 MotorRun 置为 TRUE。'],
      conditions: item.id === 101 ? ['GuardClosed 必须为 TRUE。'] : ['由调用方触发。'],
      calls: item.id === 101 ? ['DriveStart'] : [],
      ioSignals: item.id === 102 ? ['%Q0.0'] : []
    }
  };
  item.metadata.stableKey = stableProgramKey(item);
}

const project = {
  id: '1',
  name: 'V1.4.0 静态分析验收项目',
  programFamily: 'siemens_tia',
  tiaVersion: 'V17',
  cpuModel: 'S7-1511-1 PN',
  plantArea: null,
  description: null,
  sourceKind: 'source_files',
  parseStatus: 'ready',
  parseMessage: null,
  itemCount: sourceItems.length,
  blockCount: sourceItems.length,
  tagCount: 0,
  ioCount: 1,
  alarmCount: 0,
  protectedCount: 0,
  platformMetadata: { platform: 'siemens_tia', sourceFileCount: 2, cpuModel: 'S7-1511-1 PN' },
  uploadedByName: '本地界面测试',
  createdAt,
  updatedAt: createdAt
};

const graph = buildProgramGraph(sourceItems);
const getParam = (searchParams, name) => searchParams?.get?.(name) ?? searchParams?.[name] ?? '';
const response = data => ({ success: true, data });

module.exports = function previewPlc(pathname, searchParams) {
  if (pathname === '/api/plc/stats') {
    return response({ projects: 1, items: 2, blocks: 2, tags: 0, protectedBlocks: 0, awaitingExtraction: 0 });
  }
  if (pathname === '/api/plc/projects') return response([project]);
  if (pathname === '/api/plc/projects/1/graph') return response({ ...graph, parseStatus: 'ready' });
  if (pathname === '/api/plc/projects/1/references') {
    return response(findSymbolReferences(sourceItems, getParam(searchParams, 'symbol')));
  }
  const itemMatch = pathname.match(/^\/api\/plc\/projects\/1\/items\/(\d+)$/);
  if (itemMatch) {
    const item = sourceItems.find(value => String(value.id) === itemMatch[1]);
    return item ? response({ ...item, id: String(item.id) }) : { success: false, msg: '程序条目不存在' };
  }
  if (pathname === '/api/plc/projects/1/items') {
    const search = String(getParam(searchParams, 'search')).toLocaleLowerCase('zh-CN');
    const type = String(getParam(searchParams, 'type'));
    const filtered = sourceItems.filter(item => (!type || item.itemType === type)
      && (!search || [item.name, item.address, item.commentText, item.contentText].join(' ').toLocaleLowerCase('zh-CN').includes(search)));
    return {
      success: true,
      data: filtered.map(item => ({
        id: String(item.id), itemType: item.itemType, name: item.name, blockType: item.blockType,
        language: item.language, networkNo: item.networkNo, address: item.address, dataType: item.dataType,
        commentText: item.commentText, sourcePath: item.sourcePath, sourceRef: item.sourceRef,
        isProtected: item.isProtected, meaning: item.metadata.meaning, stableKey: item.metadata.stableKey,
        startLine: item.metadata.startLine, endLine: item.metadata.endLine, createdAt
      })),
      total: filtered.length,
      page: 1,
      pageSize: 100
    };
  }
  if (pathname === '/api/plc/projects/1/analyze') {
    return response({
      answer: 'GuardClosed 为 TRUE 时，Main 在第 6 行调用 DriveStart。[证据1]\nDriveStart 在第 2 行写入 MotorRun。[证据2]',
      evidence: sourceItems.map((item, index) => ({
        id: String(item.id), stableKey: item.metadata.stableKey, label: `证据${index + 1}`,
        name: item.name, itemType: item.itemType, address: item.address, sourcePath: item.sourcePath,
        sourceRef: item.sourceRef, line: item.id === 101 ? 6 : 2, excerpt: item.contentText,
        isProtected: false, url: `/plc-analysis?projectId=1&itemId=${item.id}`
      })),
      coverage: graph.coverage,
      risks: graph.risks,
      relatedCalls: [{ caller: 'Main', callee: 'DriveStart', line: 6 }]
    });
  }
  if (pathname === '/api/plc/projects/1') {
    return response({
      ...project,
      storage: { mode: 'managed_server_storage', database: '项目索引、SHA-256、解析条目、逻辑树与分析记录' },
      files: [
        { id: '1', originalFilename: 'Controls/Main.scl', fileType: '.scl', fileSize: 180, sha256: 'fixture-main', parseStatus: 'parsed', parseMessage: null, createdAt },
        { id: '2', originalFilename: 'Controls/Drive.scl', fileType: '.scl', fileSize: 96, sha256: 'fixture-drive', parseStatus: 'parsed', parseMessage: null, createdAt }
      ]
    });
  }
  return null;
};

