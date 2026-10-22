const STOP_WORDS = new Set([
  '请问', '帮我', '告诉我', '查询', '查找', '一下', '相关', '哪些', '有什么',
  '怎么', '如何', '为什么', '是否', '可以', '资料', '信息', '这个', '那个',
  '在哪里', '在哪儿', '在哪', '有多少', '多少个', '多少', '有没有', '是什么',
  '库存', '价格', '单价', '位置', '故障', '维修', '查看', '找到'
]);

function normalizeText(value, maxLength = 100000) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cjkFragments(value) {
  const result = [];
  for (const phrase of String(value || '').match(/[\p{Script=Han}]{2,}/gu) || []) {
    result.push(phrase);
    const max = Math.min(6, phrase.length - 1);
    for (let size = max; size >= 2; size -= 1) {
      result.push(phrase.slice(0, size), phrase.slice(-size));
    }
  }
  return result;
}

function searchTokens(value, limit = 12) {
  const raw = normalizeText(value, 12000);
  const codes = raw.match(/[A-Za-z0-9][A-Za-z0-9_.\/-]{2,}/g) || [];
  // Operators often join an equipment acronym and its alarm without a separator.
  // Preserve the complete identifier as well as its searchable components.
  const components = codes.flatMap(code => {
    const split = code.split(/[_.\/-]+/).filter(part => part.length >= 2);
    const joined = code.match(/^(AGV|AMR)([A-Za-z]{2,})(\d*)$/i);
    return [...split, ...(joined ? [joined[1], joined[2], joined[2] + joined[3]] : [])];
  });
  let cleaned = raw;
  for (const word of STOP_WORDS) cleaned = cleaned.replaceAll(word, ' ');
  const words = cleaned
    .replace(/[^\p{L}\p{N}_\-]+/gu, ' ')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && !STOP_WORDS.has(item));
  const fragments = cjkFragments(cleaned);
  return [...new Set([...codes, ...components, ...words, ...fragments])]
    .filter(item => item.length >= 2 && !STOP_WORDS.has(item))
    .slice(0, limit);
}

function conversationQuery(messages, maxUserTurns = 3) {
  const turns = (Array.isArray(messages) ? messages : [])
    .filter(item => item?.role === 'user' && typeof item?.content === 'string')
    .slice(-maxUserTurns)
    .map(item => normalizeText(item.content, 4000))
    .filter(Boolean);
  return turns.reverse().join('\n');
}

function findMatchIndex(haystack, tokens) {
  const lower = haystack.toLocaleLowerCase('zh-CN');
  let best = -1;
  for (const token of tokens) {
    const index = lower.indexOf(String(token).toLocaleLowerCase('zh-CN'));
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

function makeExcerpt(fields, tokens, maxLength = 700) {
  const text = normalizeText((Array.isArray(fields) ? fields : [fields]).filter(Boolean).join(' 。 '));
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const matchIndex = findMatchIndex(text, tokens);
  const start = Math.max(0, (matchIndex < 0 ? 0 : matchIndex) - Math.floor(maxLength * 0.28));
  const end = Math.min(text.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function evidenceLink(sourceType, sourceId) {
  const id = encodeURIComponent(String(sourceId || ''));
  if (sourceType === 'knowledge') return `/knowledge?entryId=${id}`;
  if (sourceType === 'part') return `/inventory?inventoryId=${id}`;
  if (sourceType === 'equipment') return `/equipment?equipmentId=${id}`;
  return '';
}

function citationLabel(sourceType, sourceId) {
  const type = { knowledge: '知识', part: '备件', equipment: '设备型号' }[sourceType] || '证据';
  return `${type}#${sourceId}`;
}

module.exports = {
  citationLabel,
  conversationQuery,
  evidenceLink,
  makeExcerpt,
  normalizeText,
  searchTokens
};
