'use strict';
const catalog = require('../data/ledger-model-catalog.json');
async function ensureSupplementalModels(db, batches = catalog.supplements || []) {
  for (const batch of batches) {
    const [version] = await db.query('INSERT IGNORE INTO model_catalog_versions(version) VALUES (?)', [batch.version]);
    if (!version.affectedRows) continue;
    for (const model of batch.models) {
      // Add by name without reusing IDs or replacing a user's existing model.
      await db.query(`INSERT IGNORE INTO part_models(name,description,model_url,built_in,quality) VALUES (?,?,?,1,?)`,
        [model.name, model.description, model.modelUrl, model.quality]);
      // Only the five explicitly requested codes; keep every existing binding.
      await db.query(`UPDATE parts p JOIN part_models m ON m.name=? AND m.active=1
        SET p.bound_model_id=m.id WHERE p.code=? AND COALESCE(p.active,1)=1 AND p.bound_model_id IS NULL`,
        [model.name, model.materialCode]);
    }
  }
}
async function ensureModelCatalog(db) {
  // A separate catalog avoids reusing legacy IDs or changing historical records.
  await db.query(`CREATE TABLE IF NOT EXISTS part_models (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL, keywords VARCHAR(500) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL, model_url VARCHAR(500) DEFAULT NULL,
    image_url VARCHAR(500) DEFAULT NULL, model_scale DOUBLE NOT NULL DEFAULT 1,
    front_rotation_y DECIMAL(9,6) NOT NULL DEFAULT 0,
    workshop_code VARCHAR(30) DEFAULT NULL, quality VARCHAR(30) NOT NULL DEFAULT '外观示意',
    built_in TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_part_model_name(name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[column]] = await db.query("SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='parts' AND COLUMN_NAME='bound_model_id'");
  if (!Number(column.total)) await db.query('ALTER TABLE parts ADD COLUMN bound_model_id BIGINT UNSIGNED DEFAULT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS model_catalog_versions (
    version VARCHAR(80) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.beginTransaction();
  try {
    // The version row serializes concurrent starts. Never reseed renamed or
    // deleted models, and never overwrite bindings on a subsequent restart.
    const [version] = await db.query('INSERT IGNORE INTO model_catalog_versions(version) VALUES (?)', [catalog.version]);
    if (version.affectedRows) {
      for (const model of catalog.models) {
        await db.query(`INSERT INTO part_models(id,name,description,model_url,built_in,quality) VALUES (?,?,?,?,1,?)`,
          [model.id, model.name, model.description, model.modelUrl || null, model.quality]);
      }
    }
    await ensureSupplementalModels(db);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
}
module.exports = { ensureModelCatalog, ensureSupplementalModels };
