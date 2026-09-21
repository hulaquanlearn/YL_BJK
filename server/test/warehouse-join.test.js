const test = require('node:test');
const assert = require('node:assert/strict');
const { warehouseJoin } = require('../src/warehouse-join');
test('warehouse lookup is constrained to workshop and chooses one code before a legacy name', () => {
  const sql = warehouseJoin();
  assert.match(sql, /w.workshop_code=COALESCE\(i.workshop_code,'raw_grain'\)/);
  assert.match(sql, /warehouse_lookup.workshop_code=COALESCE\(i.workshop_code,'raw_grain'\)/);
  assert.match(sql, /ORDER BY \(warehouse_lookup.code=i.warehouse\) DESC/);
  assert.match(sql, /LIMIT 1/);
});
test('warehouse aliases cannot introduce SQL fragments', () => {
  assert.throws(() => warehouseJoin('i; DROP TABLE inventory'));
});
