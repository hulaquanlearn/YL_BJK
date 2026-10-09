const test = require('node:test');
const assert = require('node:assert/strict');
const { createWarehouseArea, listWarehouseAreas } = require('../src/warehouse-areas');

test('new area is persisted under the selected workshop and repeated submissions reuse it', async () => {
  const stored=[];
  const db={query:async(sql,args)=>{
    if(sql.startsWith('SELECT'))return [stored.filter(row=>row.workshopCode===args[0]&&row.name===args[1])];
    if(!stored.some(row=>row.code===args[0]))stored.push({code:args[0],name:args[1],workshopCode:args[2]});
    return [{}];
  }};
  const data={workshopCode:'raw_grain',name:' 五粮备件库 '};
  const first=await createWarehouseArea(db,{role:'raw_grain'},data);
  assert.equal(first.name,'五粮备件库');
  assert.deepEqual(await createWarehouseArea(db,{role:'raw_grain'},data),first);
  assert.equal(stored.length,1);
  const other=await createWarehouseArea(db,{role:'admin'},{...data,workshopCode:'brewing'});
  assert.notEqual(other.code,first.code);
});

test('invalid names and unauthorized workshop writes never touch the database',async()=>{
  const db={query:()=>{throw new Error('unexpected write')}};
  for(const [user,data,status] of [
    [{role:'viewer'},{workshopCode:'raw_grain',name:'A'},403],
    [{role:'raw_grain'},{workshopCode:'brewing',name:'A'},403],
    [{role:'admin'},{workshopCode:'',name:'A'},400],
    [{role:'admin'},{workshopCode:'raw_grain',name:'  '},400],
    [{role:'admin'},{workshopCode:'raw_grain',name:'a'.repeat(101)},400]
  ])await assert.rejects(createWarehouseArea(db,user,data),error=>error.status===status);
});

test('area options include dictionary and legacy areas, deduplicate names, and require workshop scope',async()=>{
  const db={query:async(sql,args)=>{
    assert.deepEqual(args,['raw_grain','raw_grain']);
    assert.match(sql,/FROM warehouses/);assert.match(sql,/FROM inventory/);
    return [[{code:'A',name:'空货区'},{code:'B',name:'旧货区'},{code:'C',name:'旧货区'}]];
  }};
  const rows=await listWarehouseAreas(db,'raw_grain');
  assert.equal(rows.length,2);assert.equal(rows[0].name,'空货区');
  await assert.rejects(listWarehouseAreas(db,''));
});
