const test = require('node:test');
const assert = require('node:assert/strict');

test('mini spare-parts filters apply only on confirmation and closing discards unfinished changes', () => {
  let page;
  global.Page = definition => { page = definition; };
  const file = require.resolve('../../miniprogram/pages/index/index.js');
  delete require.cache[file];
  require(file);
  delete global.Page;
  const instance = {
    ...page,
    data: structuredClone(page.data),
    setData(values, callback) { Object.assign(this.data, values); callback?.(); },
    loadParts() {}
  };
  instance.data.shelfMap = { 五粮货区: ['8号'] };
  instance.data.layerMap = { 五粮货区: { '8号': ['3层'] } };
  instance.toggleFilters();
  instance.chooseArea({ currentTarget: { dataset: { name: '五粮货区' } } });
  assert.equal(instance.buildParams(1).warehouseAreaName, undefined);
  instance.toggleFilters();
  assert.equal(instance.data.selectedArea, '全部');
  instance.toggleFilters();
  instance.chooseArea({ currentTarget: { dataset: { name: '五粮货区' } } });
  instance.chooseShelfNo({ currentTarget: { dataset: { shelf: '8号' } } });
  instance.chooseLayer({ currentTarget: { dataset: { layer: '3层' } } });
  instance.applyFilters();
  assert.deepEqual({ area: instance.buildParams(1).warehouseAreaName, shelf: instance.buildParams(1).shelf, layer: instance.buildParams(1).layer }, {
    area: '五粮货区', shelf: '8', layer: '3'
  });
  assert.equal(instance.data.activeFilterCount, 3);
});
