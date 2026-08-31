const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../src/db');
const {
  buildInventoryKnowledge,
  formatSnapshotTime
} = require('../src/dify-knowledge-export');

function parseOutputArgument(argv) {
  const outputArg = argv.find((arg) => arg.startsWith('--output='));
  if (!outputArg) {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return path.resolve(process.cwd(), 'output', `spare-parts-knowledge-${stamp}.md`);
  }
  return path.resolve(outputArg.slice('--output='.length));
}

const INVENTORY_EXPORT_SQL = `
  SELECT i.id,
         p.code AS materialCode,
         p.name AS materialDesc,
         p.spec,
         p.unit,
         c.name AS categoryName,
         p.brand,
         p.safety_stock AS safetyStock,
         p.max_stock AS maxStock,
         p.part_type AS partType,
         p.usage_description AS usageDescription,
         p.remark,
         i.quantity AS totalStock,
         i.in_transit AS inTransit,
         i.shelf,
         i.direction AS position,
         i.layer,
         i.slot AS location,
         i.location AS locationCode,
         i.warehouse AS warehouseArea,
         i.location_note AS locationNote,
         COALESCE(w.name, i.warehouse) AS warehouseAreaName
  FROM inventory i
  INNER JOIN parts p ON p.id = i.part_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN warehouses w ON w.code = i.warehouse OR w.name = i.warehouse
  WHERE COALESCE(p.active, 1) = 1
    AND COALESCE(i.active, 1) = 1
  ORDER BY p.code ASC, i.id ASC
`;

async function main() {
  const outputPath = parseOutputArgument(process.argv.slice(2));
  const [rows] = await pool.query(INVENTORY_EXPORT_SQL);
  const snapshotTime = formatSnapshotTime();
  const content = buildInventoryKnowledge(rows, { snapshotTime });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, 'utf8');

  process.stdout.write(JSON.stringify({
    success: true,
    output: outputPath,
    snapshotTime,
    inventoryRecords: rows.length
  }, null, 2));
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
