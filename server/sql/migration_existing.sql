-- 仅用于已有 spare_parts 数据库的增量迁移。
-- 不创建或删除 parts、inventory、warehouses、categories 等现有业务表。
USE spare_parts;

SET @db_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'last_inventory_no') = 0,
  'ALTER TABLE inventory ADD COLUMN last_inventory_no VARCHAR(100) DEFAULT NULL AFTER in_transit',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'last_inventory_time') = 0,
  'ALTER TABLE inventory ADD COLUMN last_inventory_time DATETIME DEFAULT NULL AFTER last_inventory_no',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'last_inventory_date') = 0,
  'ALTER TABLE inventory ADD COLUMN last_inventory_date DATE DEFAULT NULL AFTER last_inventory_time',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS inventory_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inventoryNo VARCHAR(100) NOT NULL,
  createTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inventoryDate DATE NOT NULL,
  filterParams JSON NOT NULL,
  inventoryAllList JSON NOT NULL,
  abnormalList JSON NOT NULL,
  inventoryUser VARCHAR(100) NOT NULL,
  inventoryRemark TEXT,
  approveStatus VARCHAR(32) NOT NULL DEFAULT '待审批',
  approveRemark TEXT,
  approveTime DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_no (inventoryNo),
  KEY idx_inventory_date (inventoryDate),
  KEY idx_inventory_status (approveStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_sessions_token_hash (token_hash),
  KEY idx_app_sessions_user_expiry (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 盘点单明细表：对现有 inventory_orders JSON 字段做增量补充，
-- 用于服务端校验范围、防止重复待审批，并记录提交时的库存快照。
-- 不修改、不删除任何现有业务数据。
CREATE TABLE IF NOT EXISTS inventory_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  inventory_id BIGINT UNSIGNED NOT NULL,
  snapshot_quantity DECIMAL(20, 4) NOT NULL,
  actual_quantity DECIMAL(20, 4) DEFAULT NULL,
  is_abnormal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_order_item (order_id, inventory_id),
  KEY idx_inventory_order_item_inventory (inventory_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 小程序账号与角色。密码只保存 bcrypt 哈希，不保存明文。
CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_users_username (username),
  KEY idx_app_users_role_enabled (role, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE app_users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL;

-- 原粮车间 2026 新版台账字段。全部为增量变更，不删除现有数据。
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'max_stock') = 0,
  'ALTER TABLE parts ADD COLUMN max_stock DECIMAL(20,4) DEFAULT NULL AFTER safety_stock',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'part_type') = 0,
  'ALTER TABLE parts ADD COLUMN part_type VARCHAR(20) DEFAULT NULL AFTER max_stock',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'usage_description') = 0,
  'ALTER TABLE parts ADD COLUMN usage_description VARCHAR(500) DEFAULT NULL AFTER part_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'parts' AND COLUMN_NAME = 'active') = 0,
  'ALTER TABLE parts ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER usage_description',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'location_type') = 0,
  'ALTER TABLE inventory ADD COLUMN location_type VARCHAR(20) NOT NULL DEFAULT ''shelf'' AFTER location',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'location_note') = 0,
  'ALTER TABLE inventory ADD COLUMN location_note VARCHAR(255) DEFAULT NULL AFTER location_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'active') = 0,
  'ALTER TABLE inventory ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER location_note',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'import_batch_id') = 0,
  'ALTER TABLE inventory ADD COLUMN import_batch_id BIGINT UNSIGNED DEFAULT NULL AFTER active',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS spare_parts_import_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_file VARCHAR(255) NOT NULL,
  source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expected_records INT UNSIGNED NOT NULL,
  expected_stock DECIMAL(20,4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  summary JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_spare_parts_import_runs_hash (source_hash),
  KEY idx_spare_parts_import_runs_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 出入库与盘点差异流水。仅新增审计数据结构，不修改现有库存数据。
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inventory_id BIGINT UNSIGNED NOT NULL,
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(20,4) NOT NULL,
  before_quantity DECIMAL(20,4) NOT NULL,
  after_quantity DECIMAL(20,4) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  operator_user_id BIGINT UNSIGNED DEFAULT NULL,
  operator_name VARCHAR(50) DEFAULT NULL,
  related_order_no VARCHAR(100) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_movements_inventory_time (inventory_id, created_at),
  KEY idx_stock_movements_operator_time (operator_user_id, created_at),
  KEY idx_stock_movements_order (related_order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO warehouses (code, name) VALUES
  ('4150_A', '输送货区'),
  ('4150_B', '五粮货区'),
  ('4150_C', '破曲货区'),
  ('4150_D', '蒸糠货区'),
  ('UNASSIGNED', '未分区')
ON DUPLICATE KEY UPDATE name = VALUES(name);
