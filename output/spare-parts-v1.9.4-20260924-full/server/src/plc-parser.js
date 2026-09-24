const path = require('path');
const { buildReferenceIndex, stableProgramKey } = require('./plc-analysis');

const ALLOWED_EXTENSIONS = new Set([
  '.xml', '.scl', '.awl', '.stl', '.csv', '.json', '.plcai', '.txt', '.md',
  '.ap16', '.ap17', '.zap16', '.zap17',
  '.mod', '.modx', '.sys', '.sysx', '.cfg', '.pgf', '.rapid'
]);
const NATIVE_EXTENSIONS = new Set(['.ap16', '.ap17', '.zap16', '.zap17']);
const RAPID_EXTENSIONS = new Set(['.mod', '.modx', '.sys', '.sysx', '.cfg', '.pgf', '.rapid']);

function clean(value, max = 50000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function extensionOf(filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : '';
}

function versionFromFilename(filename, fallback = 'unknown') {
  const extension = path.extname(String(filename || '')).toLowerCase();
  if (['.ap16', '.zap16'].includes(extension)) return 'V16';
  if (['.ap17', '.zap17'].includes(extension)) return 'V17';
  const normalized = String(fallback || '').toUpperCase();
  return ['V16', 'V17'].includes(normalized) ? normalized : 'unknown';
}

function extractAddresses(text) {
  const matches = clean(text).match(/(?:%?[IQM](?:B|W|D)?\d+(?:\.\d+)?|DB\d+\.(?:DB[XBWD])?\d+(?:\.\d+)?)/gi) || [];
  return [...new Set(matches.map(item => item.toUpperCase()))].slice(0, 100);
}

function isProtectedText(text) {
  return /know[- ]?how|protected|password|加密|受保护|BlockProtection/i.test(String(text || ''));
}

function projectMetadataFromPackage(payload) {
  const source = payload?.projectMetadata && typeof payload.projectMetadata === 'object'
    ? payload.projectMetadata : {};
  return JSON.parse(JSON.stringify(source, (_key, value) => {
    if (typeof value === 'string') return clean(value, 1000);
    return value;
  }));
}

function rapidProjectMetadata(text, filename, items) {
  const source = clean(text, 4 * 1024 * 1024);
  const controllerFamily = source.match(/\b(OmniCore|IRC5|S4C\+?|YuMi)\b/i)?.[1] || '';
  const robotWareVersion = source.match(/\bRobotWare(?:\s+version)?\s*[:=]?\s*([0-9]+(?:\.[0-9A-Za-z_-]+)+)/i)?.[1] || '';
  const systemName = source.match(/(?:^|\n)\s*(?:SYSTEM_NAME|NAME)\s*[:=]\s*["']?([^"'\r\n,]+)/i)?.[1] || '';
  const modules = [...new Set(items.filter(item => item.metadata?.module).map(item => item.metadata.module))];
  const routines = items.filter(item => item.itemType === 'block').map(item => item.name);
  const ioSignals = [...new Set(items.filter(item => item.itemType === 'io').map(item => item.name))];
  return {
    platform: 'abb_rapid',
    controllerFamily: clean(controllerFamily, 120),
    robotWareVersion: clean(robotWareVersion, 120),
    systemName: clean(systemName, 200),
    sourceFile: clean(filename, 500),
    modules: modules.slice(0, 500),
    routines: routines.slice(0, 5000),
    ioSignals: ioSignals.slice(0, 5000),
    moduleCount: modules.length,
    routineCount: routines.length,
    ioSignalCount: ioSignals.length
  };
}

function genericLogicTree(text, startLine = 1) {
  const root = rapidNode('routine', '程序逻辑', startLine);
  const stack = [root];
  clean(text, 2 * 1024 * 1024).split(/\r?\n/).forEach((raw, index) => {
    const source = raw.replace(/\/\/.*$/, '').trim();
    if (!source || /^(BEGIN|END_FUNCTION|END_FUNCTION_BLOCK|END_ORGANIZATION_BLOCK)/i.test(source)) return;
    if (/^(END_IF|END_CASE|END_FOR|END_WHILE)\b/i.test(source)) { if (stack.length > 1) stack.pop(); return; }
    let match = source.match(/^IF\s+(.+?)\s+THEN\b/i);
    if (match) { const node = rapidNode('if', `如果 ${match[1]}`, startLine + index, { source }); stack.at(-1).children.push(node); stack.push(node); return; }
    match = source.match(/^(ELSIF\s+(.+?)\s+THEN|ELSE)\b/i);
    if (match) { if (stack.length > 1 && stack.at(-1).type === 'branch') stack.pop(); const node = rapidNode('branch', match[2] ? `否则如果 ${match[2]}` : '否则', startLine + index, { source }); stack.at(-1).children.push(node); stack.push(node); return; }
    match = source.match(/^(FOR|WHILE)\s+(.+?)(?:\s+DO)?$/i);
    if (match) { const node = rapidNode(match[1].toLowerCase(), `${match[1].toUpperCase()} ${match[2]}`, startLine + index, { source }); stack.at(-1).children.push(node); stack.push(node); return; }
    if (/^(NETWORK|TITLE)\b/i.test(source)) return;
    stack.at(-1).children.push(rapidNode(/:=|=/.test(source) ? 'io' : 'call', source.replace(/;$/, ''), startLine + index, { source }));
  });
  return root;
}

function rapidNode(type, label, line, extra = {}) {
  return { type, label: clean(label, 300), line, children: [], ...extra };
}

function rapidRoutineTree(lines, startLine = 1) {
  const root = rapidNode('routine', '程序逻辑', startLine);
  const stack = [root];
  const calls = new Set();
  const ioSignals = new Set();
  const controlOpeners = [
    { pattern: /^IF\s+(.+?)\s+THEN\b/i, type: 'if', label: value => `如果 ${value}` },
    { pattern: /^TEST\s+(.+)/i, type: 'test', label: value => `分支判断 ${value}` },
    { pattern: /^WHILE\s+(.+?)\s+DO\b/i, type: 'while', label: value => `循环条件 ${value}` },
    { pattern: /^FOR\s+(.+?)\s+DO\b/i, type: 'for', label: value => `计数循环 ${value}` }
  ];
  const closers = /^(ENDIF|ENDTEST|ENDWHILE|ENDFOR)\b/i;
  const branch = /^(ELSEIF\s+(.+?)\s+THEN|ELSE|CASE\s+(.+?):|DEFAULT\s*:)/i;
  lines.forEach((raw, index) => {
    const lineNo = startLine + index;
    const source = raw.replace(/!.*/, '').trim();
    if (!source) return;
    if (closers.test(source)) { if (stack.length > 1) stack.pop(); return; }
    const branchMatch = source.match(branch);
    if (branchMatch) {
      if (stack.length > 1 && ['branch', 'case'].includes(stack.at(-1).type)) stack.pop();
      const node = rapidNode(/^CASE|^DEFAULT/i.test(source) ? 'case' : 'branch', source.replace(/;$/, ''), lineNo);
      stack.at(-1).children.push(node); stack.push(node); return;
    }
    const opener = controlOpeners.find(item => item.pattern.test(source));
    if (opener) {
      const match = source.match(opener.pattern);
      const node = rapidNode(opener.type, opener.label(match[1]), lineNo, { source });
      stack.at(-1).children.push(node); stack.push(node); return;
    }
    const instruction = source.match(/^([A-Za-z_][A-Za-z0-9_]*)\b\s*(.*?)\s*;?$/);
    if (!instruction) return;
    const command = instruction[1];
    const args = instruction[2].replace(/;$/, '').trim();
    const commandUpper = command.toUpperCase();
    const type = /:=/.test(source) ? 'io'
      : /^MOVE[JLCA]|^SEARCH[LC]|^CIRPATH/i.test(command) ? 'motion'
      : /^(SETDO|RESET|SET|WAITDI|WAITDO|PULSEDO|ISIGNALDI|ISIGNALDO)$/i.test(command) ? 'io'
        : /^(WAITTIME|STOP|EXIT|RETURN|RAISE|RETRY|TRYNEXT)$/i.test(command) ? 'flow' : 'call';
    const node = rapidNode(type, args ? `${command} ${args}` : command, lineNo, { command, args, source });
    stack.at(-1).children.push(node);
    if (type === 'call') calls.add(command);
    if (type === 'io') {
      const signal = /:=/.test(source) ? command : args.split(/[\\,]/)[0]?.trim();
      if (signal) ioSignals.add(signal);
    }
  });
  return { tree: root, calls: [...calls], ioSignals: [...ioSignals] };
}

function collectLogicNodes(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (node.type !== 'routine') output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) collectLogicNodes(child, output);
  return output;
}

function actionMeaning(node) {
  const command = String(node.command || '').toUpperCase();
  const label = clean(node.label || node.source, 300);
  const args = String(node.args || '').split(',').map(value => clean(value, 120)).filter(Boolean);
  if (/^MOVE/.test(command)) return `运动到目标点 ${args[0] || '（源程序未命名）'}${args[1] ? `，速度参数 ${args[1]}` : ''}${args[2] ? `，转弯区参数 ${args[2]}` : ''}${args[3] ? `，使用工具 ${args[3]}` : ''}`;
  if (/^(SETDO|PULSEDO)$/.test(command)) return `设置数字输出 ${args[0] || label}${args[1] ? ` 为 ${args[1]}` : ''}`;
  if (command === 'SET') return `将状态 ${args[0] || label} 置位`;
  if (command === 'RESET') return `将状态 ${args[0] || label} 复位`;
  if (/^(WAITDI|WAITDO)$/.test(command)) return `等待信号 ${args[0] || label}${args[1] ? ` 达到 ${args[1]}` : ''} 后继续`;
  if (command === 'WAITTIME') return `延时 ${args[0] || label} 后继续`;
  if (node.type === 'if' || node.type === 'test' || node.type === 'case') return `进入条件判断：${label}`;
  if (node.type === 'branch') return `执行分支：${label}`;
  if (node.type === 'while' || node.type === 'for') return `按循环规则执行：${label}`;
  if (node.type === 'io') return `更新变量或 I/O：${label}`;
  if (node.type === 'flow') return `控制执行流程：${label}`;
  if (node.type === 'motion') return `机器人运动：${label}`;
  return `调用子程序或指令 ${node.command || label}${node.args ? `（参数：${clean(node.args, 220)}）` : ''}`;
}

function inferProgramPurpose(name, label, comment, capabilities) {
  if (comment) return `${label}：${comment}。${capabilities.length ? `程序证据中识别到${capabilities.join('、')}。` : ''}`;
  const routine = String(name || '').toLowerCase();
  let intent = '';
  if (/home|origin|zero|return/.test(routine)) intent = '执行回原位或安全初始位流程';
  else if (/work|main|cycle|auto|run/.test(routine)) intent = '组织设备或机器人的主工作循环';
  else if (/check|verify|confirm/.test(routine)) intent = '检查状态、位置或联锁条件';
  else if (/connect|comm|profinet|ethernet/.test(routine)) intent = '建立或确认通信连接，并更新通信状态';
  else if (/alarm|fault|error/.test(routine)) intent = '处理故障、报警或异常状态';
  else if (/place|drop|unload/.test(routine)) intent = '执行放置、卸料或释放工件流程';
  else if (/pick|load|grip|clamp/.test(routine)) intent = '执行取料、上料、夹持或松开流程';
  else intent = '按源程序顺序完成本程序块内的控制动作';
  return `${label}用于${intent}${capabilities.length ? `；包含${capabilities.join('、')}` : ''}。`;
}

function referencedProgramObjects(text) {
  const source = String(text || '');
  const motionTargets = [...source.matchAll(/\b(?:MoveJ|MoveL|MoveC|MoveAbsJ|SearchL|SearchC)\s+([^,;\r\n]+)/gi)]
    .map(match => clean(match[1], 120)).filter(Boolean);
  const ioSignals = [...source.matchAll(/\b(?:SetDO|PulseDO|WaitDI|WaitDO|ISignalDI|ISignalDO)\s+([^,;\r\n]+)/gi)]
    .map(match => clean(match[1], 120)).filter(Boolean);
  const declarations = [...source.matchAll(/^\s*(?:LOCAL\s+)?(?:TASK\s+PERS|PERS|VAR|CONST)\s+(\w+)\s+([A-Za-z_][A-Za-z0-9_]*)/gim)]
    .map(match => ({ dataType: clean(match[1], 80), name: clean(match[2], 120) }));
  return {
    motionTargets: [...new Set(motionTargets)].slice(0, 80),
    ioSignals: [...new Set(ioSignals)].slice(0, 80),
    declarations: declarations.slice(0, 160)
  };
}

function buildProgramExplanation({ name, blockType, language, contentText, commentText, logicTree }) {
  const tree = logicTree || (contentText ? genericLogicTree(contentText) : null);
  const nodes = collectLogicNodes(tree);
  const conditions = nodes
    .filter(node => ['if', 'branch', 'case', 'test', 'while', 'for'].includes(node.type))
    .map(node => clean(node.label || node.source, 300)).filter(Boolean).slice(0, 20);
  const actions = nodes
    .filter(node => !['if', 'branch', 'case', 'test', 'while', 'for'].includes(node.type))
    .map(actionMeaning).filter(Boolean).slice(0, 30);
  const calls = nodes.filter(node => node.type === 'call').map(node => clean(node.command || node.label, 120)).filter(Boolean);
  const motions = nodes.filter(node => node.type === 'motion').length;
  const ioActions = nodes.filter(node => node.type === 'io').length;
  const label = `${clean(blockType || '程序块', 30)} ${clean(name || '未命名', 255)}`;
  const comment = clean(commentText, 500);
  const capabilities = [
    conditions.length ? `${conditions.length} 处条件或分支` : '',
    motions ? `${motions} 条运动指令` : '',
    ioActions ? `${ioActions} 项变量或 I/O 动作` : '',
    calls.length ? `${new Set(calls).size} 个调用对象` : ''
  ].filter(Boolean);
  const references = referencedProgramObjects(contentText);
  const purpose = inferProgramPurpose(name, label, comment, capabilities);
  return {
    purpose,
    execution: actions.length ? actions : ['源程序中没有识别到可展开的执行语句。'],
    conditions: conditions.length ? conditions : ['未识别到显式 IF、TEST、CASE 或循环条件；该段程序被调用后按顺序执行。'],
    calls: [...new Set(calls)].slice(0, 20),
    motionTargets: references.motionTargets,
    ioSignals: references.ioSignals,
    declarations: references.declarations
  };
}

function rapidItems(text, filename) {
  const source = clean(text, 4 * 1024 * 1024);
  const lines = source.split(/\r?\n/);
  const moduleMatch = source.match(/^\s*(?:SYSMODULE|MODULE)\s+([A-Za-z_][A-Za-z0-9_]*)/im);
  const moduleName = clean(moduleMatch?.[1] || path.basename(filename, path.extname(filename)), 255);
  const items = [{
    itemType: 'document', name: moduleName, blockType: /SYSMODULE/i.test(moduleMatch?.[0] || '') ? 'SYSMODULE' : 'MODULE',
    language: 'RAPID', contentText: source, sourcePath: filename, sourceRef: moduleName,
    isProtected: isProtectedText(source), metadata: { platform: 'abb_rapid', module: moduleName, startLine: 1, endLine: lines.length, parserKind: 'structured_source' }
  }];
  const routineStart = /^\s*(LOCAL\s+)?(PROC|FUNC|TRAP)\s+(?:(\w+)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i;
  const declaration = /^\s*(LOCAL\s+)?(PERS|VAR|CONST|TASK\s+PERS)\s+(\w+)\s+([A-Za-z_][A-Za-z0-9_]*)/i;
  for (let index = 0; index < lines.length; index += 1) {
    const decl = lines[index].match(declaration);
    if (decl) items.push({
      itemType: 'tag', name: decl[4], blockType: decl[2].toUpperCase(), language: 'RAPID', dataType: decl[3],
      contentText: clean(lines[index]), sourcePath: filename, sourceRef: `${moduleName}:${index + 1}`,
      isProtected: false, metadata: { platform: 'abb_rapid', module: moduleName, line: index + 1, startLine: index + 1, endLine: index + 1, parserKind: 'structured_source' }
    });
    const start = lines[index].match(routineStart);
    if (!start) continue;
    const kind = start[2].toUpperCase();
    const routineName = kind === 'FUNC' ? start[4] : (start[4] || start[3]);
    const endPattern = new RegExp(`^\\s*END${kind}\\b`, 'i');
    let end = index + 1;
    while (end < lines.length && !endPattern.test(lines[end])) end += 1;
    const routineLines = lines.slice(index + 1, Math.min(end, lines.length));
    const logic = rapidRoutineTree(routineLines, index + 2);
    const routineSource = lines.slice(index, Math.min(end + 1, lines.length)).join('\n');
    const motionCount = routineSource.split(/\r?\n/).filter(line => /^\s*(MoveJ|MoveL|MoveC|MoveAbsJ|SearchL|SearchC)\b/i.test(line)).length;
    const ioCount = logic.ioSignals.length;
    const analysis = buildProgramExplanation({ name: routineName, blockType: kind, language: 'RAPID', contentText: routineSource, commentText: clean((lines[index - 1] || '').replace(/^\s*!\s?/, ''), 1000), logicTree: logic.tree });
    const meaning = analysis.purpose;
    items.push({
      itemType: 'block', name: routineName, blockType: kind, language: 'RAPID',
      commentText: clean((lines[index - 1] || '').replace(/^\s*!\s?/, ''), 1000), contentText: clean(routineSource, 2 * 1024 * 1024),
      sourcePath: filename, sourceRef: `${moduleName}.${routineName}:${index + 1}`, isProtected: false,
      metadata: { platform: 'abb_rapid', module: moduleName, parameters: clean(start[5], 1000), startLine: index + 1, endLine: Math.min(end + 1, lines.length), parserKind: 'structured_source', meaning, analysis, logicTree: logic.tree, calls: logic.calls, ioSignals: logic.ioSignals }
    });
    for (const signal of logic.ioSignals) items.push({
      itemType: 'io', name: signal, blockType: 'SIGNAL', language: 'RAPID', address: signal,
      commentText: `由 ${routineName} 使用`, contentText: signal, sourcePath: filename,
      sourceRef: `${moduleName}.${routineName}`, isProtected: false,
      metadata: { platform: 'abb_rapid', module: moduleName, routine: routineName }
    });
    index = end;
  }
  const routines = items.filter(item => item.itemType === 'block');
  const declarations = items.filter(item => item.itemType === 'tag');
  const pointTypes = new Set(['robtarget', 'jointtarget', 'wobjdata', 'tooldata', 'loaddata']);
  const storedPoints = declarations.filter(item => pointTypes.has(String(item.dataType || '').toLowerCase()));
  const typeCounts = declarations.reduce((acc, item) => {
    const key = String(item.dataType || '未标注类型');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  items[0].metadata.analysis = {
    purpose: `${items[0].blockType} ${moduleName} 是 RAPID 源文件模块，包含 ${routines.length} 个例程、${declarations.length} 个数据声明${storedPoints.length ? `，其中 ${storedPoints.length} 个为机器人点位、工具或工件坐标数据` : ''}。`,
    execution: routines.length
      ? routines.slice(0, 30).map((item, index) => `${index + 1}. ${item.name}：${item.metadata?.analysis?.purpose || '按源程序执行'}`)
      : ['该源文件没有识别到可执行例程，主要用于保存数据、配置或系统声明。'],
    conditions: ['模块本身不直接决定执行顺序；实际入口、调用关系和条件需查看下方例程及逻辑树。'],
    calls: [...new Set(routines.flatMap(item => item.metadata?.calls || []))].slice(0, 80),
    motionTargets: storedPoints.map(item => item.name).slice(0, 160),
    ioSignals: [...new Set(routines.flatMap(item => item.metadata?.ioSignals || []))].slice(0, 160),
    declarations: declarations.slice(0, 160).map(item => ({ name: item.name, dataType: item.dataType })),
    dataTypeCounts: typeCounts
  };
  items[0].metadata.meaning = items[0].metadata.analysis.purpose;
  return items;
}

function textItems(text, filename) {
  const source = clean(text, 2 * 1024 * 1024);
  const headers = [...source.matchAll(/^\s*(FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK|DATA_BLOCK)\s+["']?([^"'\r\n:{]+)/gim)];
  if (headers.length > 1) {
    return headers.slice(0, 500).flatMap((header, index) => {
      const startIndex = header.index;
      const endIndex = headers[index + 1]?.index ?? source.length;
      const segment = source.slice(startIndex, endIndex);
      const startLine = source.slice(0, startIndex).split(/\r?\n/).length;
      return textItems(segment, filename).map(item => ({
        ...item,
        sourceRef: item.itemType === 'block' ? item.name : `${item.name}`,
        metadata: {
          ...item.metadata,
          startLine: startLine + Number(item.metadata?.startLine || 1) - 1,
          endLine: startLine + Number(item.metadata?.endLine || segment.split(/\r?\n/).length) - 1
        }
      }));
    });
  }
  const header = headers[0] || source.match(/\b(FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK|DATA_BLOCK)\s+["']?([^"'\r\n:{]+)/i);
  const blockType = header?.[1]?.toUpperCase() || 'DOCUMENT';
  const blockName = clean(header?.[2] || path.basename(filename, path.extname(filename)), 255);
  const language = path.extname(filename).replace('.', '').toUpperCase() || 'TEXT';
  const protectedFlag = isProtectedText(source);
  const networkMatches = [...source.matchAll(/^\s*NETWORK\b\s*(?:\d+)?/gim)];
  const logicTree = genericLogicTree(source);
  const analysis = buildProgramExplanation({ name: blockName, blockType, language, contentText: source, logicTree });
  const block = {
    itemType: 'block', name: blockName, blockType, language,
    address: extractAddresses(source).join(', '), contentText: source,
    sourcePath: filename, sourceRef: blockName, isProtected: protectedFlag,
    metadata: { addresses: extractAddresses(source), startLine: 1, endLine: source.split(/\r?\n/).length, parserKind: 'source_heuristic', meaning: analysis.purpose, analysis, logicTree }
  };
  if (!networkMatches.length) return [block];
  const networks = networkMatches.slice(0, 500).map((match, index) => {
    const startIndex = match.index;
    const endIndex = networkMatches[index + 1]?.index ?? source.length;
    const part = source.slice(startIndex, endIndex);
    const startLine = source.slice(0, startIndex).split(/\r?\n/).length;
    const endLine = startLine + part.split(/\r?\n/).length - 1;
    return {
      itemType: 'network', name: `${blockName} / 网络 ${index + 1}`, blockType, language,
      networkNo: String(index + 1), address: extractAddresses(part).join(', '),
      contentText: clean(part, 2 * 1024 * 1024), sourcePath: filename, sourceRef: `${blockName}:网络${index + 1}`,
      isProtected: protectedFlag, metadata: { addresses: extractAddresses(part), startLine, endLine, parserKind: 'source_heuristic', meaning: `${blockName} 的第 ${index + 1} 个程序网络。`, logicTree: genericLogicTree(part, startLine) }
    };
  });
  return [block, ...networks];
}

function xmlItems(text, filename) {
  const decoded = clean(text, 2 * 1024 * 1024)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const names = [...decoded.matchAll(/<AttributeList>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<\/AttributeList>/gi)]
    .map(match => clean(match[1], 255));
  const primary = names[0] || path.basename(filename, path.extname(filename));
  const typeMatch = decoded.match(/<SW\.Blocks\.([A-Za-z]+)\b/i);
  const languageMatch = decoded.match(/<ProgrammingLanguage>([^<]+)<\/ProgrammingLanguage>/i);
  const blocks = [...decoded.matchAll(/<SW\.Blocks\.CompileUnit\b[\s\S]*?<ObjectList>([\s\S]*?)<\/ObjectList>[\s\S]*?<\/SW\.Blocks\.CompileUnit>/gi)];
  const base = {
    itemType: 'block', name: primary, blockType: typeMatch?.[1]?.toUpperCase() || 'BLOCK',
    language: clean(languageMatch?.[1] || 'XML', 30), address: extractAddresses(decoded).join(', '),
    contentText: decoded, sourcePath: filename, sourceRef: primary,
    isProtected: isProtectedText(decoded), metadata: { addresses: extractAddresses(decoded), parserKind: 'structured_export', sourceLocationKind: 'export_structure', meaning: `${typeMatch?.[1]?.toUpperCase() || 'BLOCK'} ${primary} 的 TIA Openness 程序证据。`, logicTree: rapidNode('routine', `${primary} 程序块`, 1, { children: blocks.slice(0, 500).map((_match, index) => rapidNode('network', `网络 ${index + 1}`, index + 1)) }) }
  };
  return [base, ...blocks.slice(0, 500).map((match, index) => ({
    ...base, itemType: 'network', name: `${primary} / 网络 ${index + 1}`,
    networkNo: String(index + 1), contentText: clean(match[1], 2 * 1024 * 1024),
    address: extractAddresses(match[1]).join(', '), metadata: { addresses: extractAddresses(match[1]), parserKind: 'structured_export', sourceLocationKind: 'export_structure', meaning: `${primary} 的第 ${index + 1} 个 TIA 程序网络。`, logicTree: genericLogicTree(match[1]) }
  }))];
}

function csvItems(text, filename) {
  const lines = clean(text, 2 * 1024 * 1024).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return textItems(text, filename);
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(item => item.trim().replace(/^"|"$/g, '').toLowerCase());
  const find = (...keys) => headers.findIndex(item => keys.some(key => item.includes(key)));
  const nameIndex = find('name', '名称', '变量');
  const addressIndex = find('address', '地址');
  const typeIndex = find('datatype', 'data type', '数据类型');
  const commentIndex = find('comment', '注释', '说明');
  return lines.slice(1, 5001).map((line, index) => {
    const cells = line.split(delimiter).map(item => item.trim().replace(/^"|"$/g, ''));
    return {
      itemType: addressIndex >= 0 ? 'tag' : 'document',
      name: clean(cells[nameIndex] || `第 ${index + 2} 行`, 255),
      address: clean(cells[addressIndex] || extractAddresses(line).join(', '), 120),
      dataType: clean(cells[typeIndex], 120), commentText: clean(cells[commentIndex], 1000),
      contentText: clean(line), sourcePath: filename, sourceRef: `line:${index + 2}`,
      isProtected: false, metadata: { line: index + 2, startLine: index + 2, endLine: index + 2, parserKind: 'structured_export' }
    };
  });
}

function enrichItemMetadata(item) {
  const current = item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {};
  if (!current.logicTree && item.contentText) current.logicTree = genericLogicTree(item.contentText);
  if (!current.analysis && item.contentText) {
    current.analysis = buildProgramExplanation({
      name: item.name,
      blockType: item.blockType || item.itemType,
      language: item.language,
      contentText: item.contentText,
      commentText: item.commentText,
      logicTree: current.logicTree
    });
  }
  if (!current.meaning && current.analysis) current.meaning = current.analysis.purpose;
  const startLine = Number(current.startLine || current.line) || 1;
  if (!current.referenceIndex) current.referenceIndex = buildReferenceIndex({
    contentText: item.contentText,
    language: item.language,
    startLine,
    definition: item.itemType === 'block' ? item.name : '',
    parserKind: current.parserKind || 'source_heuristic'
  });
  if (!current.stableKey) current.stableKey = stableProgramKey(item);
  return current;
}

function packageItems(text, filename) {
  const payload = JSON.parse(text);
  if (!payload || !Array.isArray(payload.items)) throw new Error('PLC 解析包缺少 items 数组');
  return payload.items.slice(0, 20000).map((item, index) => ({
    itemType: ['block', 'network', 'tag', 'io', 'alarm', 'document'].includes(item.itemType) ? item.itemType : 'document',
    name: clean(item.name || `条目 ${index + 1}`, 255), blockType: clean(item.blockType, 30),
    blockNumber: clean(item.blockNumber, 30), language: clean(item.language, 30),
    networkNo: clean(item.networkNo, 30), address: clean(item.address, 120),
    dataType: clean(item.dataType, 120), commentText: clean(item.commentText, 1000),
    contentText: clean(item.contentText, 2 * 1024 * 1024), sourcePath: clean(item.sourcePath || filename, 500),
    sourceRef: clean(item.sourceRef, 255), isProtected: Boolean(item.isProtected),
    metadata: enrichItemMetadata(item)
  }));
}

function parsePlcFile(buffer, filename) {
  const extension = extensionOf(filename);
  if (!extension) throw new Error('不支持该 PLC 文件格式');
  if (NATIVE_EXTENSIONS.has(extension)) {
    return { items: [], projectMetadata: {}, status: 'requires_extractor', message: '原生 TIA 项目需要在安装了对应版本 TIA Portal 的 Windows 电脑上使用本机解析助手导出', version: versionFromFilename(filename) };
  }
  const text = buffer.toString('utf8');
  let items;
  let warnings = [];
  let projectMetadata = {};
  if (['.json', '.plcai'].includes(extension)) {
    const payload = JSON.parse(text);
    warnings = Array.isArray(payload?.warnings) ? payload.warnings.map(item => clean(item, 500)).filter(Boolean).slice(0, 100) : [];
    items = packageItems(text, filename);
    projectMetadata = projectMetadataFromPackage(payload);
  }
  else if (RAPID_EXTENSIONS.has(extension)) {
    items = rapidItems(text, filename);
    projectMetadata = rapidProjectMetadata(text, filename, items);
  }
  else if (extension === '.xml') items = xmlItems(text, filename);
  else if (extension === '.csv') items = csvItems(text, filename);
  else items = textItems(text, filename);
  items = items.map(item => ({ ...item, metadata: enrichItemMetadata(item) }));
  return { items, projectMetadata, warnings, status: items.length ? 'parsed' : 'skipped', message: warnings.length ? `解析包包含 ${warnings.length} 条警告，结果可能不完整` : (items.length ? '' : '文件中没有识别出可检索内容'), version: versionFromFilename(filename, projectMetadata.tiaVersion) };
}

module.exports = { ALLOWED_EXTENSIONS, NATIVE_EXTENSIONS, RAPID_EXTENSIONS, extensionOf, versionFromFilename, extractAddresses, isProtectedText, rapidRoutineTree, rapidProjectMetadata, buildProgramExplanation, parsePlcFile };
