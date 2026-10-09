const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduledWeek, runScore } = require('../src/work-score-scheduler');

test('weekly scoring only starts in Sunday 08:00 Beijing, independently of server timezone', () => {
  assert.equal(scheduledWeek(new Date('2026-10-04T00:00:00Z')), '2026-09-28');
  assert.equal(scheduledWeek(new Date('2026-10-04T00:00:59Z')), '2026-09-28');
  for (const instant of ['2026-10-03T23:59:59Z','2026-10-04T00:01:00Z','2026-10-04T12:00:00Z','2026-10-05T00:00:00Z'])
    assert.equal(scheduledWeek(new Date(instant)), null);
  assert.equal(scheduledWeek(new Date('2027-01-03T00:00:00Z')), '2026-12-28');
});

function fixture({ lock = 1 } = {}) {
  const keys = new Set(), statements = [];
  let released = 0;
  const db = { release() { released++; }, async query(sql, values) {
    statements.push({ sql, values });
    if (sql.includes('GET_LOCK')) return [[{ acquired: lock }]];
    if (sql.startsWith('INSERT')) {
      if (values[0] && keys.has(values[0])) return [{ affectedRows: 0 }];
      if (values[0]) keys.add(values[0]);
      return [{ affectedRows: 1, insertId: statements.length }];
    }
    return [{}];
  }};
  return { pool: { getConnection: async () => db }, statements, released: () => released };
}

test('durable scheduled claim runs once; explicit manual retry is independent', async () => {
  const f = fixture(); let calls = 0;
  const args = { pool: f.pool, userId: 10, start: '2026-09-28', generate: async () => { calls++; return { available: true }; } };
  await runScore(args); await runScore(args);
  assert.equal(calls, 1);
  await runScore({ ...args, source: 'manual', actorId: 1 });
  assert.equal(calls, 2); assert.equal(f.released(), 3);
});

test('concurrent manual and scheduled scoring never call the model when locked', async () => {
  const f = fixture({ lock: 0 });
  const result = await runScore({ pool: f.pool, userId: 10, start: '2026-09-28', generate: () => assert.fail('model invoked') });
  assert.equal(result.available, false); assert.equal(f.released(), 1);
  assert.equal(f.statements.some(s => s.sql.startsWith('INSERT')), false);
});

test('model unavailability persists failure and does not retry every timer tick', async () => {
  const f = fixture(); let calls = 0;
  const args = { pool: f.pool, userId: 10, start: '2026-09-28', generate: async () => { calls++; return { available: false, reason: '未配置模型' }; } };
  await runScore(args); await runScore(args);
  assert.equal(calls, 1);
  assert.ok(f.statements.some(s => s.values?.[0] === 'failed' && s.values[1] === '未配置模型'));
});

test('exceptions persist safe failure and release connection and model lock', async () => {
  const f = fixture();
  await assert.rejects(() => runScore({ pool: f.pool, userId: 10, start: '2026-09-28', generate: async () => { throw new Error('private database detail'); } }));
  assert.equal(f.released(), 1);
  assert.ok(f.statements.some(s => s.sql.includes('RELEASE_LOCK')));
  assert.ok(f.statements.every(s => !JSON.stringify(s.values).includes('private database detail')));
});
