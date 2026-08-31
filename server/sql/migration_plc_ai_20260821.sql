-- PLC 程序知识与只读 AI 分析（增量迁移，无删除操作）

CREATE TABLE IF NOT EXISTS plc_projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  program_family ENUM('siemens_tia','abb_rapid') NOT NULL DEFAULT 'siemens_tia',
  tia_version ENUM('V16','V17','unknown') NOT NULL DEFAULT 'unknown',
  cpu_model VARCHAR(120) NULL,
  plant_area VARCHAR(120) NULL,
  description VARCHAR(1000) NULL,
  platform_metadata JSON NULL,
  source_kind ENUM('openness_export','source_files','native_project') NOT NULL DEFAULT 'source_files',
  parse_status ENUM('ready','partial','requires_extractor','failed') NOT NULL DEFAULT 'ready',
  parse_message VARCHAR(500) NULL,
  item_count INT UNSIGNED NOT NULL DEFAULT 0,
  block_count INT UNSIGNED NOT NULL DEFAULT 0,
  tag_count INT UNSIGNED NOT NULL DEFAULT 0,
  io_count INT UNSIGNED NOT NULL DEFAULT 0,
  alarm_count INT UNSIGNED NOT NULL DEFAULT 0,
  protected_count INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_by_name VARCHAR(100) NOT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plc_projects_status_created (status, created_at),
  KEY idx_plc_projects_family (program_family,status,updated_at),
  KEY idx_plc_projects_version (tia_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plc_project_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(30) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL,
  parse_status ENUM('parsed','requires_extractor','skipped','failed') NOT NULL DEFAULT 'parsed',
  parse_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plc_files_project (project_id),
  CONSTRAINT fk_plc_files_project FOREIGN KEY (project_id) REFERENCES plc_projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plc_program_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('block','network','tag','io','alarm','document') NOT NULL DEFAULT 'document',
  name VARCHAR(255) NOT NULL,
  block_type VARCHAR(30) NULL,
  block_number VARCHAR(30) NULL,
  language VARCHAR(30) NULL,
  network_no VARCHAR(30) NULL,
  address VARCHAR(120) NULL,
  data_type VARCHAR(120) NULL,
  comment_text VARCHAR(1000) NULL,
  content_text MEDIUMTEXT NULL,
  source_path VARCHAR(500) NULL,
  source_ref VARCHAR(255) NULL,
  is_protected TINYINT(1) NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plc_items_project_type (project_id, item_type),
  KEY idx_plc_items_name (name),
  KEY idx_plc_items_address (address),
  FULLTEXT KEY ft_plc_items_search (name, comment_text, content_text),
  CONSTRAINT fk_plc_items_project FOREIGN KEY (project_id) REFERENCES plc_projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plc_analysis_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(2000) NOT NULL,
  answer MEDIUMTEXT NOT NULL,
  evidence_json JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  created_by_name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plc_analysis_project_created (project_id, created_at),
  CONSTRAINT fk_plc_analysis_project FOREIGN KEY (project_id) REFERENCES plc_projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
