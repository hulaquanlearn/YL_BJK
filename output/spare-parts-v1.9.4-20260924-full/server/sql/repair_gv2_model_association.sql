-- 定向修复：正式界面已确认 502000333 / GV2-ME06C 错误关联“减速电机”。
-- 本文件不是常规结构迁移，不自动执行。统一部署时先备份并核对下方 SELECT。
-- 没有准确的 GV2 模型时保持未关联，禁止用三极微型断路器冒充。
START TRANSACTION;
SELECT p.id, p.code, p.name, p.category_model_id, cm.name AS model_name,
       p.image_url, cm.image_url AS category_image_url
FROM parts p JOIN part_category_models cm ON cm.id = p.category_model_id
WHERE p.code = '502000333' AND p.name LIKE '%GV2-ME06C%'
  AND cm.name = '减速电机' AND COALESCE(p.active,1) = 1
FOR UPDATE;

-- 仅清除此物料的明确错误关联；若已人工修正、型号变化，则不再命中。
-- 自行上传的实物图保留；仅清理历史复制的同一类别参考图。
UPDATE parts p JOIN part_category_models cm ON cm.id = p.category_model_id
SET p.image_url = CASE WHEN p.image_url = cm.image_url THEN NULL ELSE p.image_url END,
    p.category_model_id = NULL
WHERE p.code = '502000333' AND p.name LIKE '%GV2-ME06C%'
  AND cm.name = '减速电机' AND COALESCE(p.active,1) = 1;
SELECT ROW_COUNT() AS corrected_rows;
COMMIT;
