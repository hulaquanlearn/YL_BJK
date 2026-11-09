const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { enforceRawEmployeeAccess } = require('../src/raw-staff-access');
const { normalizeStaffIdentity } = require('../src/staff-identity');
const D = require('../src/raw-duties');

test('原粮工段长沿用班长标识，四类岗位保持原始身份，业务权限独立控制', () => {
  for (const position of ['employee', 'group_leader']) {
    assert.equal(normalizeStaffIdentity('viewer','raw_grain',position,{required:true}).staffPosition,position);
    const user = {role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:position};
    assert.throws(() => D.access(user),{status:403});
  }
  const user = {role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'};
  assert.doesNotThrow(() => D.access(user));
  assert.equal(normalizeStaffIdentity('viewer','qu_making','group_leader').staffPosition,'group_leader');
  assert.equal(normalizeStaffIdentity('viewer','qu_making','employee').staffPosition,'employee');assert.equal(normalizeStaffIdentity('viewer','qu_making','maintenance').staffPosition,'maintenance');assert.equal(normalizeStaffIdentity('viewer','brewing','maintenance').staffPosition,'maintenance');
});

test('员工 API 仅允许备件读取，直接访问和写入均不能绕过', async () => {
  const app=express();
  app.use((req,_res,next)=>{req.user={role:req.get('x-role')||'viewer',staffWorkshopCode:'raw_grain',staffPosition:req.get('x-position')||'employee'};next();});
  app.use(enforceRawEmployeeAccess);
  app.use((_req,res)=>res.sendStatus(204));
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const position of ['employee','group_leader']) {
      const headers={'x-position':position};
      for(const path of ['/parts','/parts/1','/filters','/dashboard','/warehouse-layout','/part-models']) assert.equal((await fetch(base+path,{headers})).status,204,path);
      for(const path of ['/inventory-orders','/raw-duties/context','/robot-program/context','/knowledge','/users','/stats','/parts/export']) assert.equal((await fetch(base+path,{headers})).status,403,path);
      for(const path of ['/inventory-orders','/parts','/ai/chat','/raw-duties/reports']) assert.equal((await fetch(base+path,{method:'POST',headers})).status,403,path);
    }
    for(const headers of [{'x-position':'shift_leader'},{'x-role':'raw_grain'},{'x-role':'admin'}]) assert.equal((await fetch(base+'/raw-duties/context',{headers})).status,204);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
