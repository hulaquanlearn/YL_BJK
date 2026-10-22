-- 原粮、制曲、酿酒三车间数据归属与账号权限增量迁移。
-- 执行前必须备份。该脚本不删除业务记录；现有库存、货架和知识默认归属原粮车间。
USE spare_parts;
SET @db_name = DATABASE();

CREATE TABLE IF NOT EXISTS workshops (
  code VARCHAR(30) NOT NULL,
  name VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  UNIQUE KEY uk_workshops_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO workshops (code,name,sort_order,active) VALUES
  ('raw_grain','原粮车间',10,1),
  ('qu_making','制曲车间',20,1),
  ('brewing','酿酒车间',30,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),sort_order=VALUES(sort_order),active=1;

ALTER TABLE app_users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'viewer';
UPDATE app_users SET role='viewer' WHERE role='user';

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouses' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE warehouses ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE inventory ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER warehouse', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory_orders' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE inventory_orders ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouse_shelves' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE warehouse_shelves ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER layout_key', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='knowledge_process_stages' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE knowledge_process_stages ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='fermentation_knowledge_entries' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE fermentation_knowledge_entries ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE warehouses SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code='';
UPDATE inventory SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code='';
UPDATE inventory_orders SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code='';
UPDATE warehouse_shelves SET workshop_code='raw_grain',default_levels=4 WHERE workshop_code IS NULL OR workshop_code='' OR workshop_code='raw_grain';
UPDATE knowledge_process_stages SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code='';
UPDATE fermentation_knowledge_entries SET workshop_code='raw_grain' WHERE workshop_code IS NULL OR workshop_code='';

INSERT INTO warehouses (code,name,workshop_code)
SELECT 'QU_MAKING_MAIN','制曲车间备件库','qu_making'
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code='QU_MAKING_MAIN');
INSERT INTO warehouses (code,name,workshop_code)
SELECT 'BREWING_MAIN','酿酒车间备件库','brewing'
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code='BREWING_MAIN');

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouse_shelves' AND INDEX_NAME='uk_warehouse_shelves_layout_key')>0,
  'ALTER TABLE warehouse_shelves DROP INDEX uk_warehouse_shelves_layout_key', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='knowledge_process_stages' AND INDEX_NAME='uk_knowledge_process_stage_name')>0,
  'ALTER TABLE knowledge_process_stages DROP INDEX uk_knowledge_process_stage_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='knowledge_process_stages' AND INDEX_NAME='uk_knowledge_process_stage_workshop_name')=0,
  'ALTER TABLE knowledge_process_stages ADD UNIQUE KEY uk_knowledge_process_stage_workshop_name (workshop_code,name)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouse_shelves' AND INDEX_NAME='uk_warehouse_shelves_shelf_no')>0,
  'ALTER TABLE warehouse_shelves DROP INDEX uk_warehouse_shelves_shelf_no', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouse_shelves' AND INDEX_NAME='uk_warehouse_shelves_workshop_layout')=0,
  'ALTER TABLE warehouse_shelves ADD UNIQUE KEY uk_warehouse_shelves_workshop_layout (workshop_code,layout_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='warehouse_shelves' AND INDEX_NAME='uk_warehouse_shelves_workshop_no')=0,
  'ALTER TABLE warehouse_shelves ADD UNIQUE KEY uk_warehouse_shelves_workshop_no (workshop_code,shelf_no)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND INDEX_NAME='idx_inventory_workshop_active')=0,
  'ALTER TABLE inventory ADD KEY idx_inventory_workshop_active (workshop_code,active,warehouse)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory_orders' AND INDEX_NAME='idx_inventory_orders_workshop_time')=0,
  'ALTER TABLE inventory_orders ADD KEY idx_inventory_orders_workshop_time (workshop_code,createTime)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
