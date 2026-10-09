const crypto = require('crypto');
const { ApiError } = require('./utils');
const { normalizeWorkshopCode, assertWorkshopWrite } = require('./workshop-scope');

function areaScope(value) {
  const code = normalizeWorkshopCode(value);
  if (!code) throw new ApiError(400, '请选择所属车间');
  return code;
}

async function createWarehouseArea(db, user, data) {
  const workshopCode = areaScope(data.workshopCode);
  assertWorkshopWrite(user, workshopCode);
  const name = String(data.name || '').trim();
  if (!name || name.length > 100) throw new ApiError(400, '货区名称须为1至100个字符');
  const [existing] = await db.query('SELECT code, name FROM warehouses WHERE workshop_code = ? AND name = ? ORDER BY code LIMIT 1', [workshopCode, name]);
  if (existing.length) return { ...existing[0], workshopCode };
  const code = `${workshopCode.toUpperCase()}_${crypto.createHash('sha1').update(name).digest('hex').slice(0, 10).toUpperCase()}`;
  await db.query('INSERT INTO warehouses (code, name, workshop_code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code=code', [code, name, workshopCode]);
  return { code, name, workshopCode };
}

async function listWarehouseAreas(db, value) {
  const workshopCode = areaScope(value);
  // Include legacy inventory areas that have not yet been added to the dictionary.
  const [rows] = await db.query(`SELECT code, name FROM warehouses WHERE workshop_code = ?
    UNION SELECT i.warehouse AS code, COALESCE(w.name, i.warehouse) AS name
    FROM inventory i LEFT JOIN warehouses w ON w.code=i.warehouse AND w.workshop_code=i.workshop_code
    WHERE i.workshop_code = ? AND COALESCE(i.active,1)=1 AND i.warehouse IS NOT NULL AND i.warehouse <> ''
    ORDER BY name, code`, [workshopCode, workshopCode]);
  const unique = new Map();
  for (const row of rows) if (!unique.has(row.name)) unique.set(row.name, { ...row, workshopCode });
  return [...unique.values()];
}

module.exports = { createWarehouseArea, listWarehouseAreas };
