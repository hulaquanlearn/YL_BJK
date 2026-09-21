const test = require('node:test');
const assert = require('node:assert/strict');
const { claimHash, assertClaim, excludedJobIds } = require('../src/plc-agent-lease');
const token='a'.repeat(64), other='b'.repeat(64);
test('a reclaimed PLC job rejects an older worker; expired leases cannot heartbeat or submit', () => {
  const project={claimHash:claimHash(token),parseStatus:'extracting',leaseActive:1};
  assert.doesNotThrow(()=>assertClaim(project,token));
  assert.throws(()=>assertClaim(project,other),e=>e.status===409);
  assert.throws(()=>assertClaim({...project,leaseActive:0},token),e=>e.status===409);
  assert.throws(()=>assertClaim({...project,claimHash:null},token),e=>e.status===409);
  assert.throws(()=>assertClaim({...project,parseStatus:'ready'},token),e=>e.status===409);
  assert.doesNotThrow(()=>assertClaim({...project,parseStatus:'ready'},token,false));
});
test('a worker can skip unavailable projects without interpolating unchecked SQL', () => {
  assert.deepEqual(excludedJobIds('12,13,12'),[12,13]);
  for(const v of ['1 OR 1=1','-1','0','9007199254740992',Array(101).fill('1').join(',')]) assert.throws(()=>excludedJobIds(v),e=>e.status===400);
});
