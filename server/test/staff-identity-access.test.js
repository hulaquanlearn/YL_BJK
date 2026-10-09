const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { pool } = require('../src/db');
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

test('raw-grain staff may read inspection notices, but cannot upload or modify them', async () => {
  const original = pool.query;
  pool.query = async sql => sql.includes('COUNT(*) AS total') ? [[{ total: 0 }]] : [[]];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 4, role: 'viewer', staffWorkshopCode: req.get('x-workshop') || null };
    next();
  });
  app.use('/inspection', require('../src/routes/inspection-notices'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/inspection`;
  try {
    const headers = { 'x-workshop': 'raw_grain' };
    const list = await fetch(`${base}/reports`, { headers });
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json()).data.items, []);
    assert.equal((await fetch(`${base}/reports/99/export`, { headers })).status, 404);
    for (const [method, url] of [['POST', '/reports'], ['PATCH', '/reports/99'], ['POST', '/reports/99/sources']]) {
      assert.equal((await fetch(base + url, { method, headers })).status, 403);
    }
    assert.equal((await fetch(`${base}/reports`, { headers: { 'x-workshop': 'qu_making' } })).status, 403);
    assert.equal((await fetch(`${base}/reports`)).status, 403);
  } finally {
    pool.query = original;
    await new Promise(resolve => server.close(resolve));
  }
});

test('work assessment rejects ordinary staff and cross-workshop writes', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 5, role: req.get('x-role') || 'viewer', staffWorkshopCode: 'raw_grain' };
    next();
  });
  app.use('/work', require('../src/routes/work'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/work/context`;
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url.replace('/context','/members'), {method:'POST', headers: { 'x-role': 'raw_grain' } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('unassigned or other-workshop staff cannot enter qu-making assessment',async()=>{
  const app=express();
  app.use((req,_res,next)=>{req.user={id:5,role:'viewer',staffWorkshopCode:req.get('x-workshop')||null,staffPosition:req.get('x-position')||null};next()});
  app.use('/work',require('../src/routes/work'));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({msg:error.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url=`http://127.0.0.1:${server.address().port}/work/context`;
    for(const headers of [{},{'x-workshop':'raw_grain','x-position':'group_leader'},{'x-workshop':'qu_making'}])assert.equal((await fetch(url,{headers})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
