const test = require('node:test');
const assert = require('node:assert/strict');
const {
  citationLabel,
  conversationQuery,
  evidenceLink,
  makeExcerpt,
  searchTokens
} = require('../src/knowledge-search');

test('knowledge search keeps codes and recent conversational context', () => {
  const query = conversationQuery([
    { role: 'user', content: '旧问题' },
    { role: 'assistant', content: '回答' },
    { role: 'user', content: '那 IC65N-C10A 在哪个货区？' }
  ]);
  assert.match(query, /IC65N-C10A/);
  assert.ok(searchTokens(query).includes('IC65N-C10A'));
  assert.ok(query.indexOf('IC65N-C10A') < query.indexOf('旧问题'));
});

test('natural Chinese questions keep useful equipment and workshop fragments', () => {
  const tokens = searchTokens('五粮工段的断路器在哪里，有多少库存？');
  assert.ok(tokens.includes('五粮工段'));
  assert.ok(tokens.includes('断路器'));
  assert.ok(!tokens.includes('在哪里'));
});

test('excerpt is centered around a matched token and remains bounded', () => {
  const excerpt = makeExcerpt([`${'前'.repeat(600)}断路器故障${'后'.repeat(600)}`], ['断路器'], 120);
  assert.ok(excerpt.length <= 122);
  assert.match(excerpt, /断路器/);
  assert.ok(excerpt.startsWith('…'));
  assert.ok(excerpt.endsWith('…'));
});

test('evidence links use stable record identifiers', () => {
  assert.equal(evidenceLink('knowledge', 12), '/knowledge?entryId=12');
  assert.equal(evidenceLink('part', 34), '/inventory?inventoryId=34');
  assert.equal(citationLabel('equipment', 56), '设备型号#56');
});
