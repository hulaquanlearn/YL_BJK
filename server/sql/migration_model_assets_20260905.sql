-- V1.4.0：类别模型同时维护参考图与默认正面方向。
-- 增量迁移，可重复执行；不会覆盖备件自己的 image_url，也不会替换管理员已上传的类别参考图。

SET @category_image_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='part_category_models' AND COLUMN_NAME='image_url'
);
SET @category_image_column_sql := IF(
  @category_image_column_exists=0,
  'ALTER TABLE part_category_models ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER model_url',
  'SELECT 1'
);
PREPARE category_image_column_stmt FROM @category_image_column_sql;
EXECUTE category_image_column_stmt;
DEALLOCATE PREPARE category_image_column_stmt;

SET @category_front_column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='part_category_models' AND COLUMN_NAME='front_rotation_y'
);
SET @category_front_column_sql := IF(
  @category_front_column_exists=0,
  'ALTER TABLE part_category_models ADD COLUMN front_rotation_y DECIMAL(9,6) NOT NULL DEFAULT 0 AFTER model_scale',
  'SELECT 1'
);
PREPARE category_front_column_stmt FROM @category_front_column_sql;
EXECUTE category_front_column_stmt;
DEALLOCATE PREPARE category_front_column_stmt;

-- 仅在首次新增方向字段时写入随包模型的已确认基准方向；后续重复执行不覆盖管理员保存的正面。
SET @reference_front_seed_sql := IF(
  @category_front_column_exists=0,
  'UPDATE part_category_models SET front_rotation_y=CASE WHEN model_url=''/models/reference-20260904/proximity-sensor.glb'' THEN -1.570796 ELSE 0 END WHERE active=1 AND model_url REGEXP ''^/models/reference-20260904/(proximity-sensor|circuit-breaker-3p|deep-groove-bearing|spherical-roller-bearing|pneumatic-solenoid-valve|flanged-gate-valve|gearmotor)\\.glb$''',
  'SELECT 1'
);
PREPARE reference_front_seed_stmt FROM @reference_front_seed_sql;
EXECUTE reference_front_seed_stmt;
DEALLOCATE PREPARE reference_front_seed_stmt;

-- 七个随部署包交付的参考模型使用同目录同名 PNG。仅填补空值，保留管理员后续上传的图片。
UPDATE part_category_models
SET image_url = CASE
      WHEN image_url IS NULL OR TRIM(image_url)='' THEN REPLACE(model_url,'.glb','.png')
      ELSE image_url
    END
WHERE active=1
  AND model_url REGEXP '^/models/reference-20260904/(proximity-sensor|circuit-breaker-3p|deep-groove-bearing|spherical-roller-bearing|pneumatic-solenoid-valve|flanged-gate-valve|gearmotor)\\.glb$';

-- 旧版关联脚本曾把类别参考图路径复制进 parts.image_url，导致它被误判为备件实物图，
-- 类别资源替换后也不会联动。只清理由同一个当前类别、同名 GLB/PNG 严格证明的七个旧复制值；
-- /uploads/part-images 下的实物图及任何不一致的人工选择均保持不变。
UPDATE parts p
JOIN part_category_models cm ON cm.id=p.category_model_id
SET p.image_url=NULL
WHERE p.image_url=cm.image_url
  AND p.image_url REGEXP '^/models/reference-20260904/(proximity-sensor|circuit-breaker-3p|deep-groove-bearing|spherical-roller-bearing|pneumatic-solenoid-valve|flanged-gate-valve|gearmotor)\\.png$'
  AND cm.model_url=REPLACE(p.image_url,'.png','.glb');

SELECT id,name,model_url,image_url,front_rotation_y
FROM part_category_models
WHERE active=1
ORDER BY built_in DESC,name ASC;
