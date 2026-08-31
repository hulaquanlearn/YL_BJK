const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTags, safeExtension, knowledgePayload } = require('../src/knowledge-utils');

test('normalizes and deduplicates knowledge tags', () => {
  assert.equal(normalizeTags('高温, 曲房；高温  风机'), '高温,曲房,风机');
});

test('accepts only the documented attachment extensions', () => {
  assert.equal(safeExtension('操作规程.PDF'), '.pdf');
  assert.equal(safeExtension('脚本.exe'), '');
});

test('builds separate document and fault payloads', () => {
  assert.equal(knowledgePayload({ entryType: 'fault', title: ' 风机异响 ' }).entryType, 'fault');
  assert.equal(knowledgePayload({ entryType: 'other' }).entryType, 'document');
});
