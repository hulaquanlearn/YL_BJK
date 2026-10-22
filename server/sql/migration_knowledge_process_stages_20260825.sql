-- 工程知识库工序/区域字典。仅新增配置表，不修改已有知识记录。
USE spare_parts;

CREATE TABLE IF NOT EXISTS knowledge_process_stages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_by_name VARCHAR(80) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_knowledge_process_stage_name (name),
  KEY idx_knowledge_process_stage_status_sort (status, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO knowledge_process_stages (name, sort_order, status)
VALUES
  ('原料处理', 10, 'active'),
  ('润粮', 20, 'active'),
  ('蒸煮', 30, 'active'),
  ('摊晾', 40, 'active'),
  ('接种', 50, 'active'),
  ('培养', 60, 'active'),
  ('翻曲', 70, 'active'),
  ('出房', 80, 'active'),
  ('储存', 90, 'active'),
  ('通用', 100, 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name);
