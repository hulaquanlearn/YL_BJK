const test = require('node:test');
const assert = require('node:assert/strict');
const { changedSharedDescriptors } = require('../src/part-import-identity');

test('shared master conflict detection excludes workshop-local quantity/unit/price', () => {
  const current = {name:'电机',spec:'M1',part_type:'质保件',usage_description:'输送',remark:'保留'};
  assert.deepEqual(changedSharedDescriptors(current,{materialDesc:'电机',spec:'M1',partType:'质保件',unit:'套',totalStock:50,price:20}),[]);
  assert.deepEqual(changedSharedDescriptors(current,{materialDesc:'断路器',spec:'M2'}),['name','spec']);
  assert.deepEqual(changedSharedDescriptors(current,{materialDesc:'电机',spec:null,remark:''}),[]);
});
