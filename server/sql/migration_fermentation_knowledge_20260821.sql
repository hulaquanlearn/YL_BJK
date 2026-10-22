-- 制曲知识库：资料上传、故障知识与受保护附件。
-- 仅新增表，不修改备件、库存和盘点数据。
USE spare_parts;

CREATE TABLE IF NOT EXISTS fermentation_knowledge_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
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
  KEY idx_fermentation_knowledge_type_time (entry_type, status, created_at),
  KEY idx_fermentation_knowledge_category (category, status, created_at),
  KEY idx_fermentation_knowledge_stage (process_stage, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
