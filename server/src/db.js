const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  dateStrings: true,
  charset: config.mysql.charset
});

async function checkDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows[0].cnt > 0;
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows[0].cnt > 0;
}

async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS workshops (
      code VARCHAR(30) NOT NULL,
      name VARCHAR(50) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (code),
      UNIQUE KEY uk_workshops_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`INSERT INTO workshops (code,name,sort_order,active) VALUES
      ('raw_grain','原粮车间',10,1),
      ('qu_making','制曲车间',20,1),
      ('brewing','酿酒车间',30,1)
      ON DUPLICATE KEY UPDATE name=VALUES(name),sort_order=VALUES(sort_order),active=1`);

    // 知识库必须能在旧数据库上自举。之前只做 ALTER，在表尚未执行增量迁移时
    // 会直接触发 500；这里先补齐基础表，再执行后续列和索引兼容处理。
    await conn.query(`CREATE TABLE IF NOT EXISTS fermentation_knowledge_entries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain',
      entry_type VARCHAR(20) NOT NULL,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(80) NOT NULL,
      process_stage VARCHAR(80) DEFAULT NULL,
      equipment_name VARCHAR(150) DEFAULT NULL,
      summary VARCHAR(1000) DEFAULT NULL,
      fault_symptom TEXT NULL,
      fault_cause TEXT NULL,
      solution MEDIUMTEXT NULL,
      preventive_action TEXT NULL,
      content_text MEDIUMTEXT NULL,
      tags VARCHAR(500) DEFAULT NULL,
      original_filename VARCHAR(255) DEFAULT NULL,
      stored_filename VARCHAR(255) DEFAULT NULL,
      mime_type VARCHAR(120) DEFAULT NULL,
      file_size BIGINT UNSIGNED DEFAULT NULL,
      uploaded_by BIGINT UNSIGNED DEFAULT NULL,
      uploaded_by_name VARCHAR(80) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_fermentation_knowledge_type_time (entry_type,status,created_at),
      KEY idx_fermentation_knowledge_category (category,status,created_at),
      KEY idx_fermentation_knowledge_stage (process_stage,status,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.query(`CREATE TABLE IF NOT EXISTS knowledge_process_stages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain',
      name VARCHAR(80) NOT NULL,
      sort_order INT NOT NULL DEFAULT 100,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by BIGINT UNSIGNED DEFAULT NULL,
      created_by_name VARCHAR(80) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_knowledge_process_stage_workshop_name (workshop_code,name),
      KEY idx_knowledge_process_stage_status_sort (status,sort_order,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.query(`CREATE TABLE IF NOT EXISTS warehouse_rooms (
      workshop_code VARCHAR(30) NOT NULL,
      room_name VARCHAR(100) NOT NULL,
      width DOUBLE NOT NULL DEFAULT 19,
      depth DOUBLE NOT NULL DEFAULT 34,
      height DOUBLE NOT NULL DEFAULT 4.2,
      east_axis VARCHAR(10) NOT NULL DEFAULT '+z',
      entrance_wall VARCHAR(10) NOT NULL DEFAULT 'west',
      entrance_offset DOUBLE NOT NULL DEFAULT 0,
      entrance_width DOUBLE NOT NULL DEFAULT 2.4,
      updated_by INT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (workshop_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`INSERT INTO warehouse_rooms
      (workshop_code,room_name,width,depth,height,east_axis,entrance_wall,entrance_offset,entrance_width)
      VALUES
      ('raw_grain','原粮车间备件库',18,32,4.2,'+z','east',11.8,2.4),
      ('qu_making','制曲车间备件库',20,28,4.2,'+z','west',0,2.6),
      ('brewing','酿酒车间备件库',20,28,4.2,'+z','west',0,2.6)
      ON DUPLICATE KEY UPDATE room_name=VALUES(room_name)`);
    // 仅修正曾经发布过的错误原粮库默认值，不覆盖管理员后续自定义的库房参数。
    await conn.query(`UPDATE warehouse_rooms
      SET width=18,depth=32,entrance_wall='east',entrance_offset=11.8,entrance_width=2.4
      WHERE workshop_code='raw_grain' AND width=19 AND depth=34
        AND entrance_wall='west' AND entrance_offset=12.4`);

    if (!(await columnExists('knowledge_process_stages', 'workshop_code'))) {
      await conn.query(`ALTER TABLE knowledge_process_stages ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain' AFTER id`);
      await conn.query(`UPDATE knowledge_process_stages SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code=''`);
    }

    if (!(await columnExists('fermentation_knowledge_entries', 'workshop_code'))) {
      await conn.query(`ALTER TABLE fermentation_knowledge_entries ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain' AFTER id`);
      await conn.query(`UPDATE fermentation_knowledge_entries SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code=''`);
    }

    const [idxRows] = await conn.query(`SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='knowledge_process_stages' AND INDEX_NAME='uk_knowledge_process_stage_name'`);
    if (idxRows[0].cnt > 0) {
      await conn.query(`ALTER TABLE knowledge_process_stages DROP INDEX uk_knowledge_process_stage_name`);
    }
    const [idx2Rows] = await conn.query(`SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='knowledge_process_stages' AND INDEX_NAME='uk_knowledge_process_stage_workshop_name'`);
    if (idx2Rows[0].cnt === 0) {
      await conn.query(`ALTER TABLE knowledge_process_stages ADD UNIQUE KEY uk_knowledge_process_stage_workshop_name (workshop_code,name)`);
    }

    if (await tableExists('warehouse_shelves') && !(await columnExists('warehouse_shelves', 'position_overridden'))) {
      await conn.query(`ALTER TABLE warehouse_shelves ADD COLUMN position_overridden TINYINT(1) NOT NULL DEFAULT 0 AFTER rotation_y`);
    }

    if (await tableExists('parts') && !(await columnExists('parts', 'image_url'))) {
      await conn.query(`ALTER TABLE parts ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER remark`);
    }
    if (await tableExists('parts') && !(await columnExists('parts', 'model_url'))) {
      await conn.query(`ALTER TABLE parts ADD COLUMN model_url VARCHAR(500) DEFAULT NULL AFTER image_url`);
    }
    if (await tableExists('parts') && !(await columnExists('parts', 'model_scale'))) {
      await conn.query(`ALTER TABLE parts ADD COLUMN model_scale DOUBLE DEFAULT 1 AFTER model_url`);
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS part_category_models (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL,
      keywords VARCHAR(500) DEFAULT NULL,
      description VARCHAR(500) DEFAULT NULL,
      model_url VARCHAR(500) NOT NULL,
      model_scale DOUBLE NOT NULL DEFAULT 1,
      built_in TINYINT(1) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_part_category_model_name (name),
      KEY idx_part_category_model_active_name (active,name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(`INSERT INTO part_category_models (name,keywords,description,model_url,model_scale,built_in,active) VALUES
      ('轴承','轴承,bearing','滚动轴承通用示意模型','/models/categories/bearing.glb',1,1,1),
      ('断路器','断路器,空开,breaker,mcb','小型断路器通用示意模型','/models/categories/circuit-breaker.glb',1,1,1),
      ('阀门/电磁阀','阀门,电磁阀,valve','阀体与手轮通用示意模型','/models/categories/valve.glb',1,1,1),
      ('传感器/开关','传感器,接近开关,光电开关,sensor,switch','圆柱传感器通用示意模型','/models/categories/sensor.glb',1,1,1)
      ON DUPLICATE KEY UPDATE name=VALUES(name)`);
    let categoryModelColumnAdded = false;
    if (await tableExists('parts') && !(await columnExists('parts', 'category_model_id'))) {
      await conn.query(`ALTER TABLE parts ADD COLUMN category_model_id BIGINT UNSIGNED DEFAULT NULL AFTER model_scale`);
      categoryModelColumnAdded = true;
    }
    // 首次升级时把现有常见备件关联到内置类别模型；已由管理员设置的关联绝不覆盖。
    if (categoryModelColumnAdded) {
      await conn.query(`UPDATE parts p
        JOIN part_category_models cm ON cm.active=1 AND (
          (cm.name='轴承' AND CONCAT_WS(' ',p.name,p.spec,p.part_type) REGEXP '轴承|bearing') OR
          (cm.name='断路器' AND CONCAT_WS(' ',p.name,p.spec,p.part_type) REGEXP '断路器|空开|breaker|mcb') OR
          (cm.name='阀门/电磁阀' AND CONCAT_WS(' ',p.name,p.spec,p.part_type) REGEXP '阀门|电磁阀|valve') OR
          (cm.name='传感器/开关' AND CONCAT_WS(' ',p.name,p.spec,p.part_type) REGEXP '传感器|接近开关|光电开关|sensor|switch')
        )
        SET p.category_model_id=cm.id
        WHERE p.category_model_id IS NULL`);
    }

    if (await tableExists('inventory') && !(await columnExists('inventory', 'unit_override'))) {
      await conn.query(`ALTER TABLE inventory ADD COLUMN unit_override VARCHAR(30) DEFAULT NULL AFTER in_transit`);
    }
    if (await tableExists('inventory') && !(await columnExists('inventory', 'safety_stock_override'))) {
      await conn.query(`ALTER TABLE inventory ADD COLUMN safety_stock_override DECIMAL(20,4) DEFAULT NULL AFTER unit_override`);
    }
    if (await tableExists('inventory') && !(await columnExists('inventory', 'max_stock_override'))) {
      await conn.query(`ALTER TABLE inventory ADD COLUMN max_stock_override DECIMAL(20,4) DEFAULT NULL AFTER safety_stock_override`);
    }
    if (await tableExists('inventory') && !(await columnExists('inventory', 'price_override'))) {
      await conn.query(`ALTER TABLE inventory ADD COLUMN price_override DECIMAL(20,4) DEFAULT NULL AFTER max_stock_override`);
    }

    await conn.query(`CREATE TABLE IF NOT EXISTS staging_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain',
      name VARCHAR(100) NOT NULL,
      position_x DOUBLE NOT NULL DEFAULT 0,
      position_z DOUBLE NOT NULL DEFAULT 0,
      description VARCHAR(500) DEFAULT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  } finally {
    conn.release();
  }
}

module.exports = { pool, checkDatabase, ensureSchema };
