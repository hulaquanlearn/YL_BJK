-- 智能工程中心：区分 Siemens TIA 与 ABB RAPID 项目。
-- 增量迁移，不删除、不清空、不改写既有程序证据。
USE spare_parts;

SET @db_name = DATABASE();
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='plc_projects' AND COLUMN_NAME='program_family')=0,
  "ALTER TABLE plc_projects ADD COLUMN program_family ENUM('siemens_tia','abb_rapid') NOT NULL DEFAULT 'siemens_tia' AFTER name",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='plc_projects' AND COLUMN_NAME='platform_metadata')=0,
  'ALTER TABLE plc_projects ADD COLUMN platform_metadata JSON NULL AFTER description',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='plc_projects' AND INDEX_NAME='idx_plc_projects_family')=0,
  'ALTER TABLE plc_projects ADD KEY idx_plc_projects_family (program_family,status,updated_at)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
