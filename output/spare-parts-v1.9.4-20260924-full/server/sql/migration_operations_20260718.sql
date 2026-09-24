-- 备件运营增强：采购闭环、设备关系、结构化流水。
-- 仅做增量 CREATE/ALTER，不包含 DROP/TRUNCATE/DELETE，不改写现有库存数量。
USE spare_parts;

SET @db_name = DATABASE();

-- Migration version: 20260718-v2. Compatible with legacy suppliers(name/contact/phone).

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_code VARCHAR(50) NOT NULL,
  supplier_name VARCHAR(150) NOT NULL,
  contact_name VARCHAR(50) DEFAULT NULL,
  contact_phone VARCHAR(50) DEFAULT NULL,
  default_lead_time_days INT UNSIGNED DEFAULT NULL,
  default_min_order_qty DECIMAL(20,4) DEFAULT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_suppliers_code (supplier_code),
  KEY idx_suppliers_enabled_name (enabled, supplier_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CREATE TABLE IF NOT EXISTS does not add columns to an existing legacy table.
-- Detect and add every new column independently; do not depend on column order.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='supplier_code')=0,
  'ALTER TABLE suppliers ADD COLUMN supplier_code VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='supplier_name')=0,
  'ALTER TABLE suppliers ADD COLUMN supplier_name VARCHAR(150) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='contact_name')=0,
  'ALTER TABLE suppliers ADD COLUMN contact_name VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='contact_phone')=0,
  'ALTER TABLE suppliers ADD COLUMN contact_phone VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='default_lead_time_days')=0,
  'ALTER TABLE suppliers ADD COLUMN default_lead_time_days INT UNSIGNED DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='default_min_order_qty')=0,
  'ALTER TABLE suppliers ADD COLUMN default_min_order_qty DECIMAL(20,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='enabled')=0,
  'ALTER TABLE suppliers ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='created_at')=0,
  'ALTER TABLE suppliers ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='updated_at')=0,
  'ALTER TABLE suppliers ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill only the new compatibility columns. Keep all legacy columns and values intact.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='name')>0,
  'UPDATE suppliers SET supplier_name = COALESCE(NULLIF(TRIM(supplier_name), ''''), NULLIF(TRIM(name), ''''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='contact')>0,
  'UPDATE suppliers SET contact_name = COALESCE(NULLIF(TRIM(contact_name), ''''), NULLIF(TRIM(contact), ''''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='phone')>0,
  'UPDATE suppliers SET contact_phone = COALESCE(NULLIF(TRIM(contact_phone), ''''), NULLIF(TRIM(phone), ''''))', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE suppliers
SET supplier_name = CONCAT('Unnamed supplier ', id)
WHERE supplier_name IS NULL OR TRIM(supplier_name) = '';

UPDATE suppliers
SET supplier_code = CONCAT('MIGRATED-', LPAD(id, 8, '0'))
WHERE supplier_code IS NULL OR TRIM(supplier_code) = '';

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='supplier_code' AND IS_NULLABLE='YES')>0,
  'ALTER TABLE suppliers MODIFY COLUMN supplier_code VARCHAR(50) NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND COLUMN_NAME='supplier_name' AND IS_NULLABLE='YES')>0,
  'ALTER TABLE suppliers MODIFY COLUMN supplier_name VARCHAR(150) NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND INDEX_NAME='uk_suppliers_code')=0,
  'ALTER TABLE suppliers ADD UNIQUE KEY uk_suppliers_code (supplier_code)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='suppliers' AND INDEX_NAME='idx_suppliers_enabled_name')=0,
  'ALTER TABLE suppliers ADD KEY idx_suppliers_enabled_name (enabled, supplier_name)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS part_suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  part_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  lead_time_days INT UNSIGNED DEFAULT NULL,
  min_order_qty DECIMAL(20,4) DEFAULT NULL,
  quoted_price DECIMAL(20,4) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_part_supplier (part_id, supplier_id),
  KEY idx_part_suppliers_supplier (supplier_id, part_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS replenishment_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(50) NOT NULL,
  supplier_id BIGINT UNSIGNED DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'purchasing',
  expected_date DATE DEFAULT NULL,
  notes VARCHAR(500) DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_by_name VARCHAR(50) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_replenishment_orders_no (order_no),
  KEY idx_replenishment_orders_status_time (status, created_at),
  KEY idx_replenishment_orders_supplier (supplier_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS replenishment_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  inventory_id BIGINT UNSIGNED NOT NULL,
  requested_quantity DECIMAL(20,4) NOT NULL,
  ordered_quantity DECIMAL(20,4) NOT NULL,
  received_quantity DECIMAL(20,4) NOT NULL DEFAULT 0,
  unit VARCHAR(30) DEFAULT NULL,
  unit_price DECIMAL(20,4) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_replenishment_order_inventory (order_id, inventory_id),
  KEY idx_replenishment_items_inventory (inventory_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workshop_equipment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipment_code VARCHAR(50) NOT NULL,
  equipment_name VARCHAR(150) NOT NULL,
  workshop_group VARCHAR(100) DEFAULT NULL,
  location VARCHAR(200) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_workshop_equipment_code (equipment_code),
  KEY idx_workshop_equipment_group (workshop_group, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipment_parts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipment_id BIGINT UNSIGNED NOT NULL,
  part_id BIGINT UNSIGNED NOT NULL,
  quantity_per_equipment DECIMAL(20,4) DEFAULT NULL,
  notes VARCHAR(300) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_part (equipment_id, part_id),
  KEY idx_equipment_parts_part (part_id, equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(50) NOT NULL,
  equipment_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  notes VARCHAR(500) DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_by_name VARCHAR(50) DEFAULT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_maintenance_work_orders_no (order_no),
  KEY idx_maintenance_equipment_status (equipment_id, status, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='reason_code')=0,
  'ALTER TABLE stock_movements ADD COLUMN reason_code VARCHAR(50) DEFAULT NULL AFTER reason', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='department')=0,
  'ALTER TABLE stock_movements ADD COLUMN department VARCHAR(100) DEFAULT NULL AFTER reason_code', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='recipient')=0,
  'ALTER TABLE stock_movements ADD COLUMN recipient VARCHAR(50) DEFAULT NULL AFTER department', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='equipment_id')=0,
  'ALTER TABLE stock_movements ADD COLUMN equipment_id BIGINT UNSIGNED DEFAULT NULL AFTER recipient', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='maintenance_order_id')=0,
  'ALTER TABLE stock_movements ADD COLUMN maintenance_order_id BIGINT UNSIGNED DEFAULT NULL AFTER equipment_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND COLUMN_NAME='batch_no')=0,
  'ALTER TABLE stock_movements ADD COLUMN batch_no VARCHAR(100) DEFAULT NULL AFTER maintenance_order_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='stock_movements' AND INDEX_NAME='idx_stock_movements_reason_time')=0,
  'ALTER TABLE stock_movements ADD KEY idx_stock_movements_reason_time (reason_code, created_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
