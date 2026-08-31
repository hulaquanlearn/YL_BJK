-- 知识标签字典与设备车间归属。执行前请先备份数据库。
USE spare_parts;
SET @db_name = DATABASE();

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workshop_code VARCHAR(30) NOT NULL DEFAULT 'raw_grain',
  name VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_by_name VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_tags_workshop_name (workshop_code, name),
  KEY idx_knowledge_tags_workshop_status (workshop_code, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='workshop_equipment' AND COLUMN_NAME='workshop_code')=0,
  'ALTER TABLE workshop_equipment ADD COLUMN workshop_code VARCHAR(30) NOT NULL DEFAULT ''raw_grain'' AFTER id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='workshop_equipment' AND INDEX_NAME='idx_workshop_equipment_scope')=0,
  'ALTER TABLE workshop_equipment ADD KEY idx_workshop_equipment_scope (workshop_code, status, equipment_name)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE workshop_equipment SET workshop_code='raw_grain'
WHERE workshop_code IS NULL OR workshop_code='';
