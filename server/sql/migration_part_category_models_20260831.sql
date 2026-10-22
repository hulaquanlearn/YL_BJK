-- V1.1.0：可维护的备件类别模型与批量关联。
-- 执行前必须备份数据库；脚本为增量迁移，可重复执行。

CREATE TABLE IF NOT EXISTS part_category_models (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  keywords VARCHAR(500) DEFAULT NULL,
  description VARCHAR(500) DEFAULT NULL,
  model_url VARCHAR(500) NOT NULL,
  model_scale DOUBLE NOT NULL DEFAULT 1,
  built_in TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_part_category_model_name (name),
  KEY idx_part_category_model_active_name (active,name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 仅初始化空资源库；重新执行不能把管理员改名/停用的模型重新插回。
SET @seed_category_models := (SELECT COUNT(*)=0 FROM part_category_models);
INSERT INTO part_category_models (name,keywords,description,model_url,model_scale,built_in,active)
SELECT seed.name,seed.keywords,seed.description,seed.model_url,1,1,1 FROM (
  SELECT '轴承' AS name,'轴承,bearing' AS keywords,'滚动轴承通用示意模型' AS description,'/models/categories/bearing.glb' AS model_url
  UNION ALL SELECT '断路器','断路器,空开,breaker,mcb','小型断路器通用示意模型','/models/categories/circuit-breaker.glb'
  UNION ALL SELECT '阀门/电磁阀','阀门,电磁阀,valve','阀体与手轮通用示意模型','/models/categories/valve.glb'
  UNION ALL SELECT '传感器/开关','传感器,接近开关,光电开关,sensor,switch','圆柱传感器通用示意模型','/models/categories/sensor.glb'
) seed WHERE @seed_category_models=1;

SET @category_model_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='parts' AND COLUMN_NAME='category_model_id'
);
SET @category_model_column_sql := IF(
  @category_model_column_exists=0,
  'ALTER TABLE parts ADD COLUMN category_model_id BIGINT UNSIGNED DEFAULT NULL AFTER model_scale',
  'SELECT 1'
);
PREPARE category_model_column_stmt FROM @category_model_column_sql;
EXECUTE category_model_column_stmt;
DEALLOCATE PREPARE category_model_column_stmt;

-- 不以模糊关键词自动绑定；人工选择或预检确认后的资源计划才改变关联。
