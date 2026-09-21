-- 程序智能分析：本机解析节点领取任务时加互斥锁，防止多节点重复解析同一项目。
-- 增量迁移，不删除、不清空、不改写既有程序证据。

SET @db_name = DATABASE();
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='plc_projects' AND COLUMN_NAME='extracting_since')=0,
  "ALTER TABLE plc_projects ADD COLUMN extracting_since DATETIME DEFAULT NULL AFTER parse_message",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
