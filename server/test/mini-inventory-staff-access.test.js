const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('mini staff may submit a workshop count while approval and part edits remain blocked', async () => {
  const calls = [];
  const modals = [];
  global.wx = {
    getStorageSync: key => key.endsWith('token') ? 'synthetic-token'
      : { role: 'viewer', workshopCode: 'raw_grain', staffPosition: 'group_leader' },
    showModal: options => modals.push(options),
    request: options => { calls.push(options); options.success({ statusCode: 201, data: { success: true } }); }
  };
  const root = path.resolve(__dirname, '../../miniprogram/services');
  const auth = require(path.join(root, 'auth.js'));
  const api = require(path.join(root, 'api.js'));
  function page(name) {
    let definition;
    global.Page = value => { definition = value; };
    const file = path.resolve(root, `../pages/${name}/${name}.js`);
    delete require.cache[require.resolve(file)];
    require(file);
    return { ...definition, data: structuredClone(definition.data),
      setData(values, callback) { Object.assign(this.data, values); callback?.(); } };
  }
  try {
    assert.equal(auth.canSubmitInventory(), true);
    assert.equal(auth.canApproveInventory(), false);
    const home = page('home');
    home.onShow();
    assert.equal(home.data.canSubmitInventory, true);
    assert.equal(home.data.canApproveInventory, false);
    const approval = page('approve');
    approval.onLoad();
    assert.equal(approval.data.canApprove, false);
    const inventory = page('inventory');
    inventory.onLoad({ status: '未盘点' });
    assert.equal(inventory.data.isReadOnly, false);
    await api.getParts({ page: 1 });
    assert.ok(calls.some(call => /\/parts\?page=1$/.test(call.url)));
    assert.ok(calls.filter(call => /\/parts\?page=1$/.test(call.url)).every(call => !call.url.includes('workshopCode=')));
    await api.createInventoryOrder({ inventoryAllList: [] });
    assert.ok(calls.some(call => /\/inventory-orders$/.test(call.url) && call.method === 'POST'));
    await assert.rejects(api.approveInventoryOrder(1, { status: '已通过' }), { statusCode: 403 });
    await assert.rejects(api.addPart({}), { statusCode: 403 });
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    assert.equal(modals.length, 0);
  } finally {
    delete global.wx;
    delete global.Page;
  }
});
