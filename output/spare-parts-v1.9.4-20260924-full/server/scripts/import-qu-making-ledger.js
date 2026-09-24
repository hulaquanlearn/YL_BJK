const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const readXlsxFile = require('read-excel-file/node');
const { pool } = require('../src/db');

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find(item => item.startsWith('--file='));
const positionalFile = process.argv.slice(2).find(item => item !== '--apply' && !item.startsWith('--'));
const inputFile = fileArg ? fileArg.slice('--file='.length) : positionalFile;
if (!inputFile) throw new Error('请指定制曲车间台账路径，例如：npm run import:qu-making:check -- "/绝对路径/制曲车间备件详情.xlsx"');
const filePath = path.resolve(inputFile);
if (!fs.existsSync(filePath)) throw new Error(`台账文件不存在：${filePath}`);

const requiredHeaders = ['物料编码', '物料描述', '单位'];
const numberValue = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
};
const textValue = value => String(value ?? '').trim();
const integerValue = value => {
  const number = numberValue(value);
  return number === null ? null : Math.max(0, Math.trunc(number));
};

function normalizeLocation(row) {
  const code = textValue(row['货位编码']).replace(/\D/g, '').padStart(6, '0').slice(-6);
  if (/^\d{6}$/.test(code) && code !== '000000') {
    return { locationCode: code, shelf: Number(code.slice(0, 2)), direction: Number(code.slice(2, 3)), layer: Number(code.slice(3, 4)), slot: Number(code.slice(4, 6)) };
  }
  const shelf = integerValue(row['货架']);
  const direction = integerValue(row['方位']);
  const layer = integerValue(row['层数']);
  const slot = integerValue(row['货位']);
  if (shelf && [1, 2].includes(direction) && layer && slot) {
    return { locationCode: `${String(shelf).padStart(2, '0')}${direction}${layer}${String(slot).padStart(2, '0')}`, shelf, direction, layer, slot };
  }
  return { locationCode: null, shelf, direction, layer, slot };
}

function inferWorkshopGroup(usage) {
  const text = textValue(usage);
  const matched = text.match(/([\u4e00-\u9fa5A-Za-z0-9]{1,12}工段)/);
  return matched?.[1] || '制曲车间';
}

async function readRows() {
  const sheets = await readXlsxFile(filePath);
  const selectedSheet = sheets.find(item => item.sheet === '备件存放位置') || sheets[0];
  if (!selectedSheet) throw new Error('台账内没有可读取的工作表');
  const sheetRows = selectedSheet.data;
  let headerIndex = -1;
  for (let index = 0; index < Math.min(sheetRows.length, 30); index += 1) {
    const values = sheetRows[index].map(value => textValue(value));
    if (requiredHeaders.every(header => values.includes(header))) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) throw new Error(`台账缺少列：${requiredHeaders.join('、')}`);
  const headers = sheetRows[headerIndex].map(value => textValue(value));
  const missing = requiredHeaders.filter(item => !headers.includes(item));
  if (missing.length) throw new Error(`台账缺少列：${missing.join('、')}`);
  const rows = [];
  for (let index = headerIndex + 1; index < sheetRows.length; index += 1) {
    const sourceRow = sheetRows[index];
    const row = {};
    headers.forEach((header, columnIndex) => {
      if (header) row[header] = sourceRow[columnIndex] ?? '';
    });
    if (Object.values(row).some(value => textValue(value))) rows.push(row);
  }
  const records = rows.map((row, index) => {
    const code = textValue(row['物料编码']).replace(/\.0$/, '');
    if (!code) return null;
    if (!/^\d+$/.test(code)) throw new Error(`第${index + 2}行物料编码无效：${code}`);
    const location = normalizeLocation(row);
    const stock = numberValue(row['实际库存量']) ?? numberValue(row['库存量']) ?? 0;
    return {
      code,
      name: textValue(row['物料描述']) || code,
      unit: textValue(row['单位']) || '个',
      quantity: Math.max(stock, 0),
      maxStock: numberValue(row['最高储备']),
      safetyStock: numberValue(row['订购点']),
      partType: textValue(row['易损件/质保件']) || null,
      price: numberValue(row['不含税单价']),
      usage: textValue(row['用途']) || null,
      workshopGroup: inferWorkshopGroup(row['用途']),
      remark: textValue(row['备注']) || null,
      ...location
    };
  }).filter(Boolean);
  const duplicate = records.find((item, index) => records.findIndex(other => other.code === item.code) !== index);
  if (duplicate) throw new Error(`台账存在重复物料编码：${duplicate.code}`);
  return records;
}

async function main() {
  const records = await readRows();
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    sourceFile: path.basename(filePath),
    sourceHash,
    workshop: '制曲车间',
    records: records.length,
    totalStock: records.reduce((sum, item) => sum + item.quantity, 0),
    located: records.filter(item => item.locationCode && item.shelf && item.layer && item.slot).length,
    priced: records.filter(item => item.price !== null).length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log('仅校验，数据库未修改。确认无误后运行 npm run import:qu-making -- "/绝对路径/制曲车间备件详情.xlsx"');
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO warehouses (code,name,workshop_code) VALUES ('QU_MAKING_MAIN','制曲车间备件库','qu_making')
       ON DUPLICATE KEY UPDATE name=VALUES(name),workshop_code=VALUES(workshop_code)`
    );
    const shelfGroups = new Map();
    records.filter(item => item.shelf && item.shelf <= 99).forEach(item => {
      if (!shelfGroups.has(item.shelf)) shelfGroups.set(item.shelf, item.workshopGroup);
    });
    let shelfIndex = 0;
    for (const [shelfNo, workshopGroup] of [...shelfGroups.entries()].sort((a, b) => a[0] - b[0])) {
      const row = Math.floor(shelfIndex / 2);
      const column = shelfIndex % 2;
      await connection.query(
        `INSERT INTO warehouse_shelves
         (layout_key,workshop_code,shelf_no,display_name,workshop_group,warehouse_code,is_vendor,
          position_x,position_z,rotation_y,width,depth,height,default_levels,sort_order,active)
         VALUES (?,?,?,?,?,?,0, ?,?,0,4.9,0.9,3.2,4,?,1)
         ON DUPLICATE KEY UPDATE workshop_group=VALUES(workshop_group),warehouse_code=VALUES(warehouse_code),
           default_levels=4,active=1`,
        [`qu-making-shelf-${String(shelfNo).padStart(2, '0')}`, 'qu_making', shelfNo, null,
          workshopGroup, 'QU_MAKING_MAIN', column === 0 ? -1.25 : -6.35, -10.5 + row * 3.4, shelfIndex + 1]
      );
      shelfIndex += 1;
    }
    let inserted = 0;
    let updated = 0;
    for (const item of records) {
      await connection.query(
        `INSERT INTO parts (code,name,unit,safety_stock,max_stock,part_type,usage_description,price,remark,active)
         VALUES (?,?,?,?,?,?,?,?,?,1)
         ON DUPLICATE KEY UPDATE name=VALUES(name),unit=VALUES(unit),safety_stock=VALUES(safety_stock),
           max_stock=VALUES(max_stock),part_type=VALUES(part_type),usage_description=VALUES(usage_description),
           price=COALESCE(VALUES(price),price),remark=COALESCE(VALUES(remark),remark),active=1`,
        [item.code, item.name, item.unit, item.safetyStock, item.maxStock, item.partType, item.usage, item.price, item.remark]
      );
      const [[part]] = await connection.query('SELECT id FROM parts WHERE code=? FOR UPDATE', [item.code]);
      const [existing] = await connection.query(
        `SELECT id FROM inventory WHERE part_id=? AND COALESCE(workshop_code,'raw_grain')='qu_making' ORDER BY active DESC,id ASC FOR UPDATE`,
        [part.id]
      );
      const values = ['QU_MAKING_MAIN', 'qu_making', item.locationCode, item.shelf, item.direction, item.layer, item.slot,
        item.locationCode ? 'shelf' : 'free_text', item.locationCode ? null : '制曲台账未提供完整六位库位码', item.quantity];
      if (existing.length) {
        await connection.query(
          `UPDATE inventory SET warehouse=?,workshop_code=?,location=?,shelf=?,direction=?,layer=?,slot=?,
             location_type=?,location_note=?,quantity=?,active=1 WHERE id=?`,
          [...values, existing[0].id]
        );
        if (existing.length > 1) await connection.query(`UPDATE inventory SET active=0 WHERE id IN (${existing.slice(1).map(() => '?').join(',')})`, existing.slice(1).map(row => row.id));
        updated += 1;
      } else {
        await connection.query(
          `INSERT INTO inventory (part_id,warehouse,workshop_code,location,shelf,direction,layer,slot,location_type,location_note,quantity,active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
          [part.id, ...values]
        );
        inserted += 1;
      }
    }
    await connection.commit();
    console.log(JSON.stringify({ success: true, inserted, updated, ...summary }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main().catch(async error => {
  console.error(error.stack || error.message);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
}).finally(async () => {
  try { await pool.end(); } catch (_) {}
});
