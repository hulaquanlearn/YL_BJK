const crypto = require('crypto');

const CONTROL_WORDS = new Set([
  'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF', 'CASE', 'OF', 'END_CASE', 'FOR', 'TO', 'BY', 'DO',
  'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT', 'RETURN', 'EXIT', 'AND', 'OR',
  'NOT', 'XOR', 'MOD', 'TRUE', 'FALSE', 'BEGIN', 'END', 'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT',
  'VAR_TEMP', 'END_VAR', 'FUNCTION', 'FUNCTION_BLOCK', 'ORGANIZATION_BLOCK', 'DATA_BLOCK', 'NETWORK',
  'TITLE', 'CALL', 'PROC', 'FUNC', 'TRAP', 'MODULE', 'SYSMODULE', 'ENDPROC', 'ENDFUNC', 'ENDTRAP', 'ENDMODULE'
]);

const BUILTIN_CALLS = new Set([
  'ABS', 'MIN', 'MAX', 'LIMIT', 'MOVE', 'SEL', 'MUX', 'SHL', 'SHR', 'ROL', 'ROR', 'TON', 'TOF', 'TP',
  'R_TRIG', 'F_TRIG', 'CTU', 'CTD', 'CTUD', 'SETDO', 'RESET', 'SET', 'WAITDI', 'WAITDO', 'PULSEDO',
  'WAITTIME', 'MOVEJ', 'MOVEL', 'MOVEC', 'MOVEABSJ', 'SEARCHL', 'SEARCHC', 'STOP', 'RAISE', 'RETRY'
]);

function clean(value, maxLength = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function normalizedSymbol(value) {
  return clean(value, 255).replace(/^#/, '').toUpperCase();
}

function stableProgramKey(item) {
  const identity = [item.sourcePath, item.itemType, item.blockType, item.sourceRef, item.name]
    .map(value => clean(value, 500)).join('\u001f');
  return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32);
}

function withoutComments(line, language) {
  let value = String(line || '');
  if (String(language || '').toUpperCase() === 'RAPID') value = value.replace(/!.*/, '');
  return value.replace(/\/\/.*$/, '').replace(/\(\*.*?\*\)/g, '');
}

function identifierTokens(value) {
  return String(value || '').match(/%?[A-Za-z_][A-Za-z0-9_.]*|DB\d+(?:\.DB[XBWD]?\d+(?:\.\d+)?)?/gi) || [];
}

function xmlText(value) {
  return String(value || '')
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
}

function structuredXmlReferences(contentText, startLine) {
  const source = xmlText(contentText);
  if (!/<(?:SW\.Blocks\.|FlgNet\b|CallInfo\b|Access\b)/i.test(source)) return null;
  const calls = [], reads = [], writes = [];
  const lineOf = index => Number(startLine) + source.slice(0, index).split(/\r?\n/).length - 1;
  for (const match of source.matchAll(/<CallInfo\b[^>]*\bName=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)) {
    calls.push({ symbol: clean(match[1] || match[2], 255), line: lineOf(match.index), kind: 'call' });
  }
  for (const match of source.matchAll(/<Access\b([^>]*)>([\s\S]*?)<\/Access>/gi)) {
    const body = match[2];
    const components = [...body.matchAll(/<Component\b[^>]*\bName=(?:"([^"]+)"|'([^']+)')[^>]*\/?\s*>/gi)]
      .map(item => item[1] || item[2]).filter(Boolean);
    if (!components.length) continue;
    const symbol = components.join('.');
    const access = `${match[1]} ${body}`;
    const reference = { symbol, line: lineOf(match.index), kind: /\b(?:Write|Out|Output)\b/i.test(access) ? 'write' : 'read' };
    (reference.kind === 'write' ? writes : reads).push(reference);
  }
  return { calls, reads, writes, completeness: 'partial', parserKind: 'tia_structured_xml' };
}

function uniqueRefs(values, limit = 500) {
  const seen = new Set();
  const result = [];
  for (const item of values) {
    const key = `${normalizedSymbol(item.symbol)}:${item.line}:${item.kind || ''}`;
    if (!item.symbol || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function buildReferenceIndex({ contentText, language, startLine = 1, definition = '', parserKind = 'source_heuristic' }) {
  const calls = [], reads = [], writes = [], addresses = [], localDefinitions = [];
  const normalizedLanguage = String(language || '').toUpperCase();
  const xmlReferences = structuredXmlReferences(contentText, startLine);
  if (xmlReferences) {
    calls.push(...xmlReferences.calls);
    reads.push(...xmlReferences.reads);
    writes.push(...xmlReferences.writes);
    parserKind = xmlReferences.parserKind;
  }
  const lines = String(contentText || '').split(/\r?\n/);
  lines.forEach((raw, offset) => {
    const line = Number(startLine) + offset;
    const source = withoutComments(raw, language).trim();
    if (!source) return;
    for (const address of source.match(/(?:%?[IQM](?:B|W|D)?\d+(?:\.\d+)?|DB\d+\.(?:DB[XBWD])?\d+(?:\.\d+)?)/gi) || []) {
      addresses.push({ symbol: address.toUpperCase(), line, kind: 'address' });
    }
    if (['SCL', 'ST', 'STRUCTURED_TEXT'].includes(normalizedLanguage)) {
      const declaration = source.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:ARRAY\b.*?\bOF\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*:=.*?)?\s*;\s*$/i);
      if (declaration && !CONTROL_WORDS.has(normalizedSymbol(declaration[1]))) {
        localDefinitions.push({ symbol: declaration[1], line, kind: 'definition' });
      }
    }
    if (normalizedLanguage === 'RAPID') {
      const declaration = source.match(/^\s*(?:LOCAL\s+)?(?:VAR|PERS|CONST)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*\{[^}]+\})?\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (declaration) localDefinitions.push({ symbol: declaration[1], line, kind: 'definition' });
    }
    const declarationsOnly = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*:(?!=)|(?:VAR|PERS|CONST)\b)/i.test(source);
    let hasAssignment = false;
    if (!declarationsOnly) {
      for (const assignment of source.matchAll(/(%?[A-Za-z_][A-Za-z0-9_.]*|DB\d+(?:\.DB[XBWD]?\d+(?:\.\d+)?)?)\s*:=\s*([^;]*)/gi)) {
        hasAssignment = true;
        writes.push({ symbol: assignment[1], line, kind: 'write' });
        for (const symbol of identifierTokens(assignment[2])) {
          if (!CONTROL_WORDS.has(normalizedSymbol(symbol))) reads.push({ symbol, line, kind: 'read' });
        }
      }
    }
    const output = source.match(/^\s*(?:SETDO|PULSEDO|SET|RESET)\s+([^,;\\\s]+)/i);
    if (output) writes.push({ symbol: output[1], line, kind: 'write' });
    const input = source.match(/^\s*(?:WAITDI|WAITDO)\s+([^,;\\\s]+)/i);
    if (input) reads.push({ symbol: input[1], line, kind: 'read' });
    const condition = source.match(/^\s*(?:IF|ELSIF|WHILE|UNTIL|CASE)\b(.*?)(?:\bTHEN\b|\bDO\b|\bOF\b|;|$)/i);
    if (condition) {
      for (const symbol of identifierTokens(condition[1])) {
        if (!CONTROL_WORDS.has(normalizedSymbol(symbol))) reads.push({ symbol, line, kind: 'read' });
      }
    }

    const explicitCall = source.match(/^\s*CALL\s+["']?([A-Za-z_][A-Za-z0-9_.]*)/i);
    if (explicitCall) calls.push({ symbol: explicitCall[1], line, kind: 'call' });
    for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) {
      const symbol = match[1];
      const normalized = normalizedSymbol(symbol);
      if (!CONTROL_WORDS.has(normalized) && !BUILTIN_CALLS.has(normalized)) calls.push({ symbol, line, kind: 'call' });
    }
    if (String(language || '').toUpperCase() === 'RAPID' && !hasAssignment) {
      const command = source.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
      const normalized = normalizedSymbol(command?.[1]);
      if (command && !CONTROL_WORDS.has(normalized) && !BUILTIN_CALLS.has(normalized)) {
        calls.push({ symbol: command[1], line, kind: 'call' });
      }
    }
  });
  return {
    version: 1,
    parserKind,
    completeness: xmlReferences?.completeness || (parserKind === 'structured_export' ? 'partial' : 'heuristic'),
    definitions: uniqueRefs([
      ...(definition ? [{ symbol: clean(definition, 255), line: Number(startLine) || 1, kind: 'definition' }] : []),
      ...localDefinitions
    ]),
    calls: uniqueRefs(calls),
    reads: uniqueRefs(reads),
    writes: uniqueRefs(writes),
    addresses: uniqueRefs(addresses)
  };
}

function metadataOf(item) {
  if (item?.metadata && typeof item.metadata === 'object') return item.metadata;
  if (item?.metadataJson && typeof item.metadataJson === 'object') return item.metadataJson;
  const raw = item?.metadata || item?.metadataJson;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function refsOf(item) {
  const metadata = metadataOf(item);
  return metadata.referenceIndex || { definitions: [], calls: [], reads: [], writes: [], addresses: [] };
}

function buildProgramGraph(items = []) {
  const nodes = items.filter(item => item.itemType === 'block').map(item => {
    const metadata = metadataOf(item);
    return {
      id: String(item.id), stableKey: item.stableKey || metadata.stableKey || stableProgramKey(item),
      name: item.name, blockType: item.blockType, language: item.language,
      sourcePath: item.sourcePath, sourceRef: item.sourceRef,
      startLine: Number(metadata.startLine || metadata.line) || null,
      endLine: Number(metadata.endLine) || null,
      isProtected: Boolean(item.isProtected)
    };
  });
  const definitions = new Map();
  for (const node of nodes) {
    const key = normalizedSymbol(node.name);
    if (!definitions.has(key)) definitions.set(key, []);
    definitions.get(key).push(node);
  }
  const edges = [], unresolved = [];
  for (const item of items.filter(entry => entry.itemType === 'block')) {
    const sourceId = String(item.id);
    for (const call of refsOf(item).calls || []) {
      const targets = definitions.get(normalizedSymbol(call.symbol)) || [];
      if (!targets.length) {
        unresolved.push({ sourceId, sourceName: item.name, symbol: call.symbol, line: Number(call.line) || null, sourcePath: item.sourcePath });
        continue;
      }
      for (const target of targets) edges.push({ sourceId, targetId: target.id, symbol: call.symbol, line: Number(call.line) || null });
    }
  }
  const duplicateDefinitions = [...definitions.values()].filter(group => group.length > 1).map(group => ({ symbol: group[0].name, itemIds: group.map(item => item.id) }));
  const eligible = items.filter(item => item.itemType === 'block' || item.itemType === 'network');
  const indexed = eligible.filter(item => metadataOf(item).referenceIndex).length;
  const related = eligible.filter(item => {
    const refs = refsOf(item);
    return ['calls', 'reads', 'writes', 'addresses'].some(key => Array.isArray(refs[key]) && refs[key].length);
  }).length;
  const partialStructured = eligible.filter(item => refsOf(item).completeness === 'partial').length;
  const sourceFiles = new Set(items.map(item => item.sourcePath).filter(Boolean));
  const protectedCount = items.filter(item => item.isProtected).length;
  const risks = [];
  if (protectedCount) risks.push({ level: 'warning', code: 'protected_source', title: `${protectedCount} 项受保护内容无法完整检查`, detail: '这是静态解析覆盖提示，不代表现场程序异常。' });
  if (unresolved.length) risks.push({ level: 'info', code: 'unresolved_calls', title: `${unresolved.length} 个调用未在已导入块中解析`, detail: '可能是库指令、未导入模块或启发式识别假阳性。' });
  if (duplicateDefinitions.length) risks.push({ level: 'warning', code: 'duplicate_definitions', title: `${duplicateDefinitions.length} 个名称存在多个定义`, detail: '请结合命名空间、库版本和实际调用范围确认。' });
  if (partialStructured) risks.push({ level: 'info', code: 'partial_structured_parse', title: `${partialStructured} 项结构化程序为部分解析`, detail: '已提取可识别的符号与调用，复杂接线和执行路径仍需结合 TIA Portal 核对。' });
  return {
    nodes,
    edges,
    unresolved: unresolved.slice(0, 500),
    duplicateDefinitions,
    coverage: {
      sourceFileCount: sourceFiles.size,
      itemCount: items.length,
      blockCount: nodes.length,
      referenceIndexedCount: indexed,
      referenceCoveragePercent: eligible.length ? Math.round(indexed * 100 / eligible.length) : 0,
      relationIndexedCount: related,
      relationCoveragePercent: eligible.length ? Math.round(related * 100 / eligible.length) : 0,
      protectedCount,
      scope: '索引建立率只表示已处理对象；含引用关系比例表示提取到调用、读写或地址的对象，不代表语法完整率或现场执行路径。'
    },
    risks
  };
}

function findSymbolReferences(items = [], requestedSymbol = '') {
  const symbol = clean(requestedSymbol, 255);
  const key = normalizedSymbol(symbol);
  if (!key) return { symbol: '', definitions: [], references: [] };
  const definitions = [], references = [], definitionKeys = new Set();
  for (const item of items) {
    const metadata = metadataOf(item);
    const index = refsOf(item);
    let indexedItemName = false;
    for (const ref of index.definitions || []) {
      if (normalizedSymbol(ref.symbol) !== key) continue;
      if (normalizedSymbol(item.name) === key) indexedItemName = true;
      const line = Number(ref.line) || null;
      const definitionKey = `${item.id}:${key}:${line ?? ''}`;
      if (definitionKeys.has(definitionKey)) continue;
      definitionKeys.add(definitionKey);
      definitions.push({
        id: String(item.id), name: item.name, symbol: ref.symbol, itemType: item.itemType,
        sourcePath: item.sourcePath, sourceRef: item.sourceRef, line
      });
    }
    if (normalizedSymbol(item.name) === key && !indexedItemName) {
      const line = Number(metadata.startLine || metadata.line) || null;
      const definitionKey = `${item.id}:${key}:${line ?? ''}`;
      if (!definitionKeys.has(definitionKey)) {
        definitionKeys.add(definitionKey);
        definitions.push({
          id: String(item.id), name: item.name, symbol: item.name, itemType: item.itemType,
          sourcePath: item.sourcePath, sourceRef: item.sourceRef, line
        });
      }
    }
    for (const field of ['calls', 'reads', 'writes', 'addresses']) {
      for (const ref of index[field] || []) if (normalizedSymbol(ref.symbol) === key) references.push({
        id: String(item.id), name: item.name, itemType: item.itemType, kind: ref.kind || field.slice(0, -1),
        sourcePath: item.sourcePath, sourceRef: item.sourceRef, line: Number(ref.line) || null
      });
    }
  }
  return { symbol, definitions, references };
}

module.exports = { buildProgramGraph, buildReferenceIndex, findSymbolReferences, normalizedSymbol, stableProgramKey };
