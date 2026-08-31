const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pool } = require('../src/db');

const apply = process.argv.includes('--apply');
const dataPath = path.resolve(__dirname, '../data/original-workshop-spare-parts.v2.json');
const raw = fs.readFileSync(dataPath);
const payload = JSON.parse(raw.toString('utf8'));
const sourceHash = crypto.createHash('sha256').update(raw).digest('hex');

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function sameLocation(row, item) {
  const same = (left, right) => String(left ?? '') === String(right ?? '');
  return same(row.warehouse, item.warehouseArea)
    && same(row.location, item.locationCode)
    && same(row.shelf, item.shelf)
    && same(row.direction, item.position)
    && same(row.layer, item.layer)
    && same(row.slot, item.location)
    && same(row.location_type || 'shelf', item.locationType)
    && same(row.location_note, item.locationNote);
}

function validatePayload() {
  if (payload.schemaVersion !== 2 || !Array.isArray(payload.records)) throw new Error('导入文件版本无效');
  const codes = new Set();
  let stock = 0;
  for (const item of payload.records) {
    if (!/^\d+$/.test(item.materialCode)) throw new Error(`无效物料编码：${item.materialCode}`);
    if (!item.materialDesc || codes.has(item.materialCode)) throw new Error(`物料为空或重复：${item.materialCode}`);
    if (!Number.isFinite(item.totalStock) || item.totalStock < 0) throw new Error(`无效库存：${item.materialCode}`);
    if (!['shelf', 'free_text'].includes(item.locationType)) throw new Error(`无效位置类型：${item.materialCode}`);
    codes.add(item.materialCode);
    stock += item.totalStock;
  }
  if (codes.size !== payload.expected.distinctCodes || payload.records.length !== payload.expected.records || stock !== payload.expected.totalStock) {
    throw new Error('导入文件汇总校验失败');
  }
}

async function assertMigration(connection) {
  const required = [
    ['parts', 'max_stock'], ['parts', 'part_type'], ['parts', 'usage_description'], ['parts', 'active'],
    ['inventory', 'location_type'], ['inventory', 'location_note'], ['inventory', 'active'], ['inventory', 'import_batch_id']
  ];
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (TABLE_NAME, COLUMN_NAME) IN (${required.map(() => '(?, ?)').join(',')})`,
    required.flat()
  );
  const found = new Set(rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
  const missing = required.map(([table, column]) => `${table}.${column}`).filter((key) => !found.has(key));
  if (missing.length) throw new Error(`请先执行 sql/migration_existing.sql，缺少字段：${missing.join(', ')}`);
}

async function preview(connection) {
  const codes = payload.records.map((item) => item.materialCode);
  const [matched] = await connection.query(`SELECT code FROM parts WHERE code IN (${placeholders(codes)})`, codes);
  const [[current]] = await connection.query(
    `SELECT COUNT(DISTINCT p.code) AS partCodes, COUNT(i.id) AS inventoryRows,
            COALESCE(SUM(CASE WHEN COALESCE(i.active, 1) = 1 THEN i.quantity ELSE 0 END), 0) AS activeStock
     FROM parts p LEFT JOIN inventory i ON i.part_id = p.id`
  );
  const [[pending]] = await connection.query("SELECT COUNT(*) AS total FROM inventory_orders WHERE approveStatus = '待审批'");
  return {
    mode: apply ? 'apply' : 'dry-run',
    sourceFile: payload.sourceFile,
    sourceHash,
    incoming: payload.expected,
    current,
    pendingInventoryOrders: Number(pending.total) || 0,
    matchedCodes: matched.length,
    newCodes: codes.length - matched.length,
    note: apply ? '即将开始事务导入' : '仅检查，数据库未修改。确认后运行 npm run import:new-data'
  };
}

async function execute(connection) {
  const records = payload.records;
  const codes = records.map((item) => item.materialCode);
  await connection.beginTransaction();
  try {
    const [[pending]] = await connection.query(
      "SELECT COUNT(*) AS total FROM inventory_orders WHERE approveStatus = '待审批'"
    );
    if (Number(pending.total)) throw new Error('存在待审批盘点单，请先审批或驳回后再导入');
    const [run] = await connection.query(
      `INSERT INTO spare_parts_import_runs
       (source_file, source_hash, expected_records, expected_stock, status)
       VALUES (?, ?, ?, ?, 'running')`,
      [payload.sourceFile, sourceHash, payload.expected.records, payload.expected.totalStock]
    );
    const batchId = run.insertId;

    for (const item of records) {
      await connection.query(
        `INSERT INTO warehouses (code, name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [item.warehouseArea, item.warehouseAreaName]
      );
      await connection.query(
        `INSERT INTO parts
         (code, name, unit, safety_stock, max_stock, part_type, usage_description, price, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), unit = VALUES(unit), safety_stock = VALUES(safety_stock),
           max_stock = VALUES(max_stock), part_type = VALUES(part_type),
           usage_description = VALUES(usage_description), price = VALUES(price), active = 1`,
        [item.materialCode, item.materialDesc, item.unit, item.reorderPoint, item.maxStock,
          item.partType, item.usageDescription, item.price]
      );
    }

    const [partRows] = await connection.query(
      `SELECT id, code FROM parts WHERE code IN (${placeholders(codes)}) FOR UPDATE`,
      codes
    );
    const partIdByCode = new Map(partRows.map((row) => [row.code, row.id]));
    const partIds = partRows.map((row) => row.id);
    const [inventoryRows] = await connection.query(
      `SELECT id, part_id, warehouse, location, shelf, direction, layer, slot,
              location_type, location_note, active
       FROM inventory WHERE part_id IN (${placeholders(partIds)})
       ORDER BY active DESC, id ASC FOR UPDATE`,
      partIds
    );
    const inventoryByPart = new Map();
    for (const row of inventoryRows) {
      const list = inventoryByPart.get(row.part_id) || [];
      list.push(row);
      inventoryByPart.set(row.part_id, list);
    }

    let insertedInventory = 0;
    let updatedInventory = 0;
    let archivedDuplicateLocations = 0;
    for (const item of records) {
      const partId = partIdByCode.get(item.materialCode);
      if (!partId) throw new Error(`写入后找不到物料：${item.materialCode}`);
      const existing = inventoryByPart.get(partId) || [];
      const selected = existing.find((row) => sameLocation(row, item)) || existing[0];
      const params = [item.warehouseArea, item.locationCode, item.shelf, item.position, item.layer,
        item.location, item.locationType, item.locationNote, item.totalStock, batchId];
      if (selected) {
        await connection.query(
          `UPDATE inventory SET warehouse = ?, location = ?, shelf = ?, direction = ?, layer = ?, slot = ?,
             location_type = ?, location_note = ?, quantity = ?, active = 1, import_batch_id = ?
           WHERE id = ?`,
          [...params, selected.id]
        );
        updatedInventory += 1;
        const otherIds = existing.filter((row) => row.id !== selected.id).map((row) => row.id);
        if (otherIds.length) {
          await connection.query(`UPDATE inventory SET active = 0 WHERE id IN (${placeholders(otherIds)})`, otherIds);
          archivedDuplicateLocations += otherIds.length;
        }
      } else {
        await connection.query(
          `INSERT INTO inventory
           (part_id, warehouse, location, shelf, direction, layer, slot, location_type, location_note, quantity, active, import_batch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [partId, ...params]
        );
        insertedInventory += 1;
      }
    }

    const [archivedInventoryResult] = await connection.query(
      `UPDATE inventory i INNER JOIN parts p ON p.id = i.part_id
       SET i.active = 0 WHERE p.code NOT IN (${placeholders(codes)}) AND i.active <> 0`,
      codes
    );
    const [archivedPartsResult] = await connection.query(
      `UPDATE parts SET active = 0 WHERE code NOT IN (${placeholders(codes)}) AND active <> 0`,
      codes
    );

    const [[verified]] = await connection.query(
      `SELECT COUNT(*) AS records, COUNT(DISTINCT p.code) AS distinctCodes, COALESCE(SUM(i.quantity), 0) AS totalStock
       FROM inventory i INNER JOIN parts p ON p.id = i.part_id
       WHERE i.active = 1 AND p.active = 1`
    );
    if (Number(verified.records) !== payload.expected.records
      || Number(verified.distinctCodes) !== payload.expected.distinctCodes
      || Number(verified.totalStock) !== payload.expected.totalStock) {
      throw new Error(`导入后校验失败：${JSON.stringify(verified)}`);
    }

    const summary = {
      batchId,
      insertedInventory,
      updatedInventory,
      archivedDuplicateLocations,
      archivedInventory: archivedInventoryResult.affectedRows,
      archivedParts: archivedPartsResult.affectedRows,
      verified
    };
    await connection.query(
      `UPDATE spare_parts_import_runs
       SET status = 'success', summary = ?, completed_at = NOW() WHERE id = ?`,
      [JSON.stringify(summary), batchId]
    );
    await connection.commit();
    return summary;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  validatePayload();
  const connection = await pool.getConnection();
  try {
    await assertMigration(connection);
    console.log(JSON.stringify(await preview(connection), null, 2));
    if (!apply) return;
    console.log(JSON.stringify(await execute(connection), null, 2));
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch (_) {}
  process.exitCode = 1;
});
