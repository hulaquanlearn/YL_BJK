-- V1.1.2 原粮车间货架间距修复。
-- 只恢复未人工拖拽的系统货架；不修改库存、货位编码、名称或人工位置。

START TRANSACTION;

UPDATE warehouse_shelves
SET position_x = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-4])$'
        THEN IF(MOD(CAST(SUBSTRING(layout_key,7,2) AS UNSIGNED),2)=1,-1.25,-6.35)
      WHEN layout_key REGEXP '^shelf-(1[5-9]|20)$' THEN 6.35
      WHEN layout_key='unnamed-01' THEN 6.35
      WHEN layout_key='unnamed-02' THEN 1.25
      WHEN layout_key='unnamed-03' THEN -3.85
      ELSE position_x END,
    position_z = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-4])$'
        THEN -10.5 + FLOOR((CAST(SUBSTRING(layout_key,7,2) AS UNSIGNED)-1)/2)*3.4
      WHEN layout_key='shelf-15' THEN -10.5
      WHEN layout_key='shelf-16' THEN -7.1
      WHEN layout_key='shelf-17' THEN -3.7
      WHEN layout_key='shelf-18' THEN -0.3
      WHEN layout_key='shelf-19' THEN 3.1
      WHEN layout_key='shelf-20' THEN 6.5
      WHEN layout_key IN ('unnamed-01','unnamed-02','unnamed-03') THEN 13.4
      ELSE position_z END,
    rotation_y = 0,
    width = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-9]|20)$' THEN 4.9
      WHEN layout_key IN ('unnamed-01','unnamed-02','unnamed-03') THEN 4.9
      ELSE width END,
    depth = 0.9,
    height = 3.2,
    default_levels = 4
WHERE workshop_code='raw_grain'
  AND COALESCE(position_overridden,0)=0
  AND (layout_key REGEXP '^shelf-(0[1-9]|1[0-9]|20)$'
       OR layout_key IN ('unnamed-01','unnamed-02','unnamed-03'));

SELECT ROW_COUNT() AS corrected_shelves;

COMMIT;
