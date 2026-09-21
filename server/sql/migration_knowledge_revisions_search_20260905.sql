-- 工程知识修订历史与附件全文索引状态。
-- 不重建业务表，可在既有库上重复执行。
-- 请由 mysql 命令或部署工具显式选择目标库，脚本不内置数据库名。

SET @db_name = DATABASE();

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='fermentation_knowledge_entries' AND COLUMN_NAME='revision_no')=0,
  'ALTER TABLE fermentation_knowledge_entries ADD COLUMN revision_no INT UNSIGNED NOT NULL DEFAULT 1 AFTER view_count',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='fermentation_knowledge_entries' AND COLUMN_NAME='index_status')=0,
  "ALTER TABLE fermentation_knowledge_entries ADD COLUMN index_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER revision_no",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='fermentation_knowledge_entries' AND COLUMN_NAME='index_message')=0,
  'ALTER TABLE fermentation_knowledge_entries ADD COLUMN index_message VARCHAR(500) DEFAULT NULL AFTER index_status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='fermentation_knowledge_entries' AND COLUMN_NAME='indexed_at')=0,
  'ALTER TABLE fermentation_knowledge_entries ADD COLUMN indexed_at DATETIME DEFAULT NULL AFTER index_message',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS knowledge_entry_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id BIGINT UNSIGNED NOT NULL,
  revision_no INT UNSIGNED NOT NULL,
  workshop_code VARCHAR(30) NOT NULL,
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
  index_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  index_message VARCHAR(500) DEFAULT NULL,
  indexed_at DATETIME DEFAULT NULL,
  change_kind VARCHAR(30) NOT NULL DEFAULT 'edit',
  change_summary VARCHAR(500) DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_by_name VARCHAR(80) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_revision (entry_id, revision_no),
  KEY idx_knowledge_revision_time (entry_id, created_at),
  CONSTRAINT fk_knowledge_revision_entry FOREIGN KEY (entry_id)
    REFERENCES fermentation_knowledge_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 旧附件在部署后显示为待建索，管理员/作者可在页面重试。
UPDATE fermentation_knowledge_entries
SET index_status = CASE
      WHEN stored_filename IS NULL OR stored_filename='' THEN IF(content_text IS NULL OR content_text='', 'empty', 'ready')
      WHEN content_text IS NULL OR content_text='' THEN 'pending'
      ELSE 'ready'
    END,
    indexed_at = CASE WHEN content_text IS NOT NULL AND content_text<>'' THEN COALESCE(indexed_at, updated_at) ELSE indexed_at END
WHERE index_status IS NULL OR index_status='' OR index_status='pending';
