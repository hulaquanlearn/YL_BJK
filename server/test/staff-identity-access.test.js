const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStaffIdentity } = require('../src/staff-identity');
const { publicUser } = require('../src/auth');

test('staff identity validates workshop and position without granting spare-parts write access', () => {
  assert.deepEqual(normalizeStaffIdentity('viewer', 'raw_grain', 'shift_leader', { required: true }), {
    staffWorkshopCode: 'raw_grain', staffPosition: 'shift_leader'
  });
  assert.throws(() => normalizeStaffIdentity('viewer', '', 'group_leader', { required: true }), { status: 400 });
  assert.throws(() => normalizeStaffIdentity('viewer', 'raw_grain', 'manager'), { status: 400 });
  assert.deepEqual(normalizeStaffIdentity('raw_grain', 'qu_making', 'shift_leader'), {
    staffWorkshopCode: null, staffPosition: null
  });
  assert.equal(publicUser({ id: 1, role: 'viewer', staff_workshop_code: 'raw_grain', staff_position: 'group_leader' }).workshopCode, 'raw_grain');
});
