-- V1.4.1：为全部 categories 类别模型回填参考图路径。
-- 增量迁移，可重复执行；只填补空值，不覆盖管理员在“编辑/替换”中上传的类别参考图。
-- 配套文件：web-dist/models/categories/*.jpg（含本次补齐的 bearing/circuit-breaker/sensor/valve 四张内置类别预览图）。

UPDATE part_category_models
SET image_url = REPLACE(model_url, '.glb', '.jpg')
WHERE active=1
  AND model_url REGEXP '^/models/categories/.+\\.glb$'
  AND (image_url IS NULL OR TRIM(image_url)='');

-- 部署后核对：categories 类别中仍无参考图的应为 0（无对应 JPG 文件的会显示出来）。
SELECT name,model_url,image_url
FROM part_category_models
WHERE active=1
  AND model_url REGEXP '^/models/categories/.+\\.glb$'
  AND (image_url IS NULL OR TRIM(image_url)='')
ORDER BY name;
