-- 备件运营增强：设备关系、结构化流水。
-- 仅做增量 CREATE/ALTER，不包含 DROP/TRUNCATE/DELETE，不改写现有库存数量。
USE spare_parts;

SET @db_name = DATABASE();

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
