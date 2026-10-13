const test = require('node:test');
const assert = require('node:assert/strict');
const { createFixture } = require('./fixtures/attendance-preview.cjs');

test('local storage samples support retention, cleanup, linked-file protection and audit', async t => {
  const fixture = createFixture();
  const server = await new Promise(resolve => { const listener = fixture.app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/work-storage`;
  const request = async (suffix = '', method = 'GET', body) => {
    const response = await fetch(base + suffix, { method, headers: { Authorization: 'Bearer attendance-preview-admin', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const list = () => request('?cutoff=2026-01-01');
  const remove = (kind, id, revision) => request(`/${kind}/${id}`, 'DELETE', { cutoff: '2026-01-01', revision });
  let initial = await list();
  assert.equal(initial.status, 200);
  assert.equal(initial.data.total, 3);
  assert.equal(initial.data.items.find(r => r.id === 91).eligible, true);
  assert.equal(initial.data.items.find(r => r.id === 93).eligible, false);
  assert.equal((await remove('inspection', 91, 2)).status, 409);

  assert.equal((await request('/inspection/91/retention', 'PATCH', { revision: 1, retentionUntil: '2099-01-01' })).status, 200);
  assert.equal((await remove('inspection', 91, 2)).status, 409);
  assert.equal((await list()).data.items.find(r => r.id === 91).eligible, false);
  assert.equal((await request('/inspection/91/retention', 'PATCH', { revision: 2, retentionUntil: null })).status, 200);

  fixture.inspect().inspectionSources[0].status = 'processing';
  assert.equal((await remove('inspection', 91, 3)).status, 409);
  assert.equal(fixture.inspect().inspectionSources.length, 2);
  assert.equal(fixture.inspect().audit.length, 0);
  fixture.inspect().inspectionSources[0].status = 'ready';
  const cleared = await remove('inspection', 91, 3);
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.data, { releasedBytes: 150000, kind: 'inspection', id: 91 });
  assert.equal(fixture.inspect().inspectionSources.length, 0);
  assert.equal(fixture.inspect().inspectionEvents.length, 0);
  assert.equal((await remove('inspection', 91, 3)).status, 404);
  assert.equal((await list()).data.total, 2);

  const photo = await remove('work_photo', 92, 1);
  assert.equal(photo.status, 200);
  assert.equal(photo.data.releasedBytes, 90000);
  const parent = fixture.inspect().workParents.find(r => r.id === 920);
  assert.equal(parent.revision, 2);
  assert.equal(parent.text, '本地测试工作记录文字');
  assert.equal((await remove('task_file', 93, 1)).status, 409);
  const remaining = await list();
  assert.equal(remaining.data.total, 1);
  assert.deepEqual(remaining.data.summary, [{ kind: 'task_file', itemCount: 1, bytes: 120000, fileCount: 1 }]);
  const audited = await request('/audit');
  assert.equal(audited.data.length, 2);
  assert.equal(audited.data[1].source_kind, 'inspection');
  assert.equal(audited.data[1].released_bytes, 150000);
  assert.equal(JSON.parse(audited.data[0].detail_json).preservedWorkText, true);
});
