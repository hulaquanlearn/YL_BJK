// Built-production UI with local synthetic API responses; no database or live account.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createWebApp } = require('../spare-parts-web-release/server');
const catalog = require('../server/data/ledger-model-catalog.json');
const { toShelf } = require('../server/src/warehouse-layout');

(async () => {
  const out = path.resolve(__dirname, '../.local/release-20261009/ui');
  await fs.mkdir(out, { recursive: true });
  const server = createWebApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [], checks = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => errors.push(e.message));
      const user = { id: '1', role: 'admin', displayName: '本地验收', enabled: true };
      await page.addInitScript(u => { localStorage.setItem('spare_parts_auth_token', 'x'.repeat(43)); localStorage.setItem('spare_parts_auth_user', JSON.stringify(u)); }, user);
      const models = [catalog.models.find(m => m.modelUrl), {...catalog.models[85],modelUrl:null}].map(m => ({ ...m, associatedParts: 0, builtIn: true }));
      const warehouseShelves = [1,2,15,16].map(shelfNo => toShelf({ id:shelfNo,shelfNo,width:4.9,depth:1.4,height:3.2,defaultLevels:4,workshopGroup:'本地测试货区' }));
      const warehouseParts = warehouseShelves.flatMap(shelf => [1,2].map(side => ({
        _id:`${shelf.shelfNo}-${side}`,materialCode:`TEST-${shelf.shelfNo}-${side}`,materialDesc:'本地测试模型',
        workshopCode:'raw_grain',locationCode:`${String(shelf.shelfNo).padStart(2,'0')}${side}301`,
        totalStock:side===1?10:0,safetyStock:2,categoryModelUrl:models[0].modelUrl,categoryFrontRotationY:0
      })));
      let bound = null;
      const writes = [];
      await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url());
        let data = [], total = 0;
        if (url.pathname === '/api/auth/me') data = { user };
        else if (url.pathname === '/api/health') return route.fulfill({ json: { success: true, database: 'connected' } });
        else if (url.pathname === '/api/part-models') data = models;
        else if (url.pathname === '/api/warehouse-layout') data = { room:{name:'本地测试备件库',width:18,depth:32,height:4.2,eastDirection:'+z',entranceWall:'east'},shelves:warehouseShelves };
        else if (url.pathname === '/api/parts') { data=warehouseParts;total=warehouseParts.length; }
        else if (url.pathname === '/api/part-model-library') data = [{ id: 1, name: '测试备件', materialCode: 'TEST-1', workshopCode: 'raw_grain', workshopCodes: ['raw_grain'], categoryModelId: bound, categoryModelName: bound ? models[0].name : null }];
        else if (url.pathname === '/api/parts/batch-model') { const body = request.postDataJSON(); writes.push(body); bound = body.modelId; data = { affected: 1 }; }
        else if (url.pathname.endsWith('/filters')) data = { areas: [], partTypes: [], workshops: [{ code: 'raw_grain', name: '原粮车间' }] };
        else if (url.pathname.endsWith('/stats')) data = {};
        return route.fulfill({ json: { success: true, msg: '本地合成验收', data, total } });
      });
      await page.route('**/models/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const root = path.resolve(__dirname, '../spare-parts-web-release/public');
        const file = path.resolve(root, '.' + pathname);
        assert.ok(file.startsWith(root + path.sep));
        await route.fulfill({ body: await fs.readFile(file), contentType: 'model/gltf-binary' });
      });
      const base = `http://127.0.0.1:${server.address().port}`;
      await page.goto(base + '/portal');
      await page.getByRole('heading', { name: '智能工程中心', exact: true }).waitFor();
      assert.equal(await page.locator('a[href="/plc-analysis"]').count(), 0);
      await page.screenshot({ path: path.join(out, `portal-${width}.png`) });
      await page.goto(base + '/plc-analysis?projectId=1');
      await page.waitForURL(url => url.pathname === '/portal');
      assert.equal(await page.locator('a[href="/plc-analysis"]').count(), 0);
      await page.goto(base + '/model-library');
      await page.getByText('测试备件', { exact: true }).waitFor();
      await page.getByRole('button', { name: '绑定模型', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '绑定备件模型', exact: true });
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: `${models[0].id} · ${models[0].name}`, exact: true }).click();
      await dialog.getByRole('button', { name: '保存绑定', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(writes, [{ partIds: [1], modelId: models[0].id }]);
      await page.getByRole('tab', { name: '模型目录', exact: true }).click();
      await page.getByRole('tabpanel', { name: '模型目录' }).getByText('模型待生成', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `models-${width}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `model library overflow at ${width}`);
      const modelResponse = page.waitForResponse(response => new URL(response.url()).pathname===models[0].modelUrl && response.ok());
      await page.goto(base + '/warehouse-3d');
      await modelResponse;
      await page.locator('.stage-loading').waitFor({state:'hidden'});
      await page.locator('canvas').waitFor();
      assert.equal(await page.locator('.stage-error').count(),0);
      await page.screenshot({path:path.join(out,`warehouse-${width}.png`)});
      await page.getByRole('button',{name:'2D平面',exact:true}).click();
      await page.locator('.two-stage').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),false,`warehouse overflow at ${width}`);
      checks.push({ width, checks: ['portal entry removed', 'old bookmark redirects', 'binding submits named-model ID', 'pending model visible', 'warehouse model resource loaded', 'warehouse 2D switch', 'no horizontal overflow'] });
      await page.close();
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
