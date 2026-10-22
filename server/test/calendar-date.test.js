const test = require('node:test'), assert = require('node:assert/strict');
const { date, week } = require('../src/calendar-date');

test('raw duty dates reject invalid calendar days and preserve leap days', () => {
  assert.equal(date('2024-02-29'), '2024-02-29');
  for (const value of ['2025-02-29', '2026-04-31', '2026-1-01', '', null, undefined]) {
    assert.throws(() => date(value), { status: 400 });
  }
});

test('raw duty weeks start on Monday across month and year boundaries', () => {
  assert.equal(week('2026-10-18'), '2026-10-12');
  assert.equal(week('2026-10-19'), '2026-10-19');
  assert.equal(week('2026-01-01'), '2025-12-29');
});
