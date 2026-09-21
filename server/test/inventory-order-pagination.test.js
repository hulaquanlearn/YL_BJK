const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const utils = require('../src/utils');

function listHandler(pool) {
  const handlers = new Map();
  const router = Object.fromEntries(['get','post','patch','delete'].map(method => [method, (url,...chain) => handlers.set(`${method} ${url}`,chain.at(-1))]));
  const mocks = {
    express: {Router:()=>router}, '../db':{pool},
    '../utils': {...utils, asyncHandler:fn=>fn},
    '../inventory-guards': {}, '../auth':{requireRole:()=>()=>{}},
    '../workshop-scope': {normalizeWorkshopCode:code=>code,requireAnyWorkshopEditor:()=>{}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/inventory.js'),'utf8'), {require:name=>mocks[name],module:{exports:{}},console});
  return handlers.get('get /inventory-orders');
}

test('inventory orders page beyond 200 carries separate unfiltered status counts', async () => {
  const calls=[];
  const handler=listHandler({query:async(sql,params)=>{
    calls.push({sql,params:[...params]});
    if(sql.includes('AS pending'))return [[{total:601,pending:401,approved:180,rejected:20}]];
    if(sql.startsWith('SELECT COUNT'))return [[{total:401}]];
    return [[{id:221,approveStatus:'待审批',inventoryAllList:'[]',abnormalList:'[]',filterParams:'{}'}]];
  }});
  let body;
  await handler({query:{page:'12',pageSize:'20',status:'待审批',workshopCode:'raw_grain',date:'2026-09-05'}},{json:value=>{body=value}});
  assert.equal(body.page,12);assert.equal(body.pageSize,20);assert.equal(body.total,401);
  assert.equal(body.summary.total,601);assert.equal(body.summary.approved,180);
  assert.deepEqual(calls[0].params,['2026-09-05','raw_grain']);
  assert.deepEqual(calls[2].params,['2026-09-05','raw_grain','待审批',20,220]);
  assert.match(calls[2].sql,/ORDER BY createTime DESC,id DESC LIMIT \? OFFSET \?/);
  assert.equal(body.data.length,1);
});

test('legacy limit stays supported and explicit pageSize is capped', async () => {
  const query=async(sql)=>sql.includes('AS pending')?[[{total:0,pending:null,approved:null,rejected:null}]]:sql.startsWith('SELECT COUNT')?[[{total:0}]]:[[]];
  const handler=listHandler({query});let body;
  await handler({query:{limit:'80'}},{json:value=>body=value});
  assert.equal(body.page,1);assert.equal(body.pageSize,80);assert.equal(body.summary.pending,0);
  await handler({query:{pageSize:'9999'}},{json:value=>body=value});
  assert.equal(body.pageSize,200);
});
