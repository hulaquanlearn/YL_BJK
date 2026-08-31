-- 多车间库存独立配置：同一物料在不同车间可拥有不同单位、订购点、最高库存和单价。
-- 仅增量加列，不删除、不清空任何数据；空值自动回退到 parts 主档。

SET @db_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND COLUMN_NAME='unit_override') = 0,
  'ALTER TABLE inventory ADD COLUMN unit_override VARCHAR(30) DEFAULT NULL AFTER in_transit',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND COLUMN_NAME='safety_stock_override') = 0,
  'ALTER TABLE inventory ADD COLUMN safety_stock_override DECIMAL(20,4) DEFAULT NULL AFTER unit_override',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND COLUMN_NAME='max_stock_override') = 0,
  'ALTER TABLE inventory ADD COLUMN max_stock_override DECIMAL(20,4) DEFAULT NULL AFTER safety_stock_override',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='inventory' AND COLUMN_NAME='price_override') = 0,
  'ALTER TABLE inventory ADD COLUMN price_override DECIMAL(20,4) DEFAULT NULL AFTER max_stock_override',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
