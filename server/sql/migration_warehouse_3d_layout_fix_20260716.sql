-- 原粮车间备件库 3D 布局修正
-- 按现场布局图调整货架位置，保留货架名称、编号、库存及审计数据。
-- 不包含删表、清表或删除业务数据的操作。

USE spare_parts;

START TRANSACTION;

UPDATE warehouse_shelves
SET position_x = CASE layout_key
      WHEN 'shelf-01' THEN -1.250 WHEN 'shelf-02' THEN -6.350
      WHEN 'shelf-03' THEN -1.250 WHEN 'shelf-04' THEN -6.350
      WHEN 'shelf-05' THEN -1.250 WHEN 'shelf-06' THEN -6.350
      WHEN 'shelf-07' THEN -1.250 WHEN 'shelf-08' THEN -6.350
      WHEN 'shelf-09' THEN -1.250 WHEN 'shelf-10' THEN -6.350
      WHEN 'shelf-11' THEN -1.250 WHEN 'shelf-12' THEN -6.350
      WHEN 'shelf-13' THEN -1.250 WHEN 'shelf-14' THEN -6.350
      WHEN 'shelf-15' THEN 6.350 WHEN 'shelf-16' THEN 6.350
      WHEN 'shelf-17' THEN 6.350 WHEN 'shelf-18' THEN 6.350
      WHEN 'shelf-19' THEN 6.350 WHEN 'shelf-20' THEN 6.350
      WHEN 'unnamed-01' THEN 6.350
      WHEN 'unnamed-02' THEN 1.250
      WHEN 'unnamed-03' THEN -3.850
      ELSE position_x
    END,
    position_z = CASE layout_key
      WHEN 'shelf-01' THEN -7.500 WHEN 'shelf-02' THEN -7.500
      WHEN 'shelf-03' THEN -5.200 WHEN 'shelf-04' THEN -5.200
      WHEN 'shelf-05' THEN -2.900 WHEN 'shelf-06' THEN -2.900
      WHEN 'shelf-07' THEN -0.600 WHEN 'shelf-08' THEN -0.600
      WHEN 'shelf-09' THEN 1.700 WHEN 'shelf-10' THEN 1.700
      WHEN 'shelf-11' THEN 4.000 WHEN 'shelf-12' THEN 4.000
      WHEN 'shelf-13' THEN 6.300 WHEN 'shelf-14' THEN 6.300
      WHEN 'shelf-15' THEN -7.500
      WHEN 'shelf-16' THEN -5.200
      WHEN 'shelf-17' THEN -2.900
      WHEN 'shelf-18' THEN -0.600
      WHEN 'shelf-19' THEN 1.700
      WHEN 'shelf-20' THEN 4.000
      WHEN 'unnamed-01' THEN 9.400
      WHEN 'unnamed-02' THEN 9.400
      WHEN 'unnamed-03' THEN 9.400
      ELSE position_z
    END,
    rotation_y = 0,
    width = 4.900,
    default_levels = 4
WHERE layout_key IN (
  'shelf-01', 'shelf-02', 'shelf-03', 'shelf-04', 'shelf-05',
  'shelf-06', 'shelf-07', 'shelf-08', 'shelf-09', 'shelf-10',
  'shelf-11', 'shelf-12', 'shelf-13', 'shelf-14', 'shelf-15',
  'shelf-16', 'shelf-17', 'shelf-18', 'shelf-19', 'shelf-20',
  'unnamed-01', 'unnamed-02', 'unnamed-03'
);

SELECT ROW_COUNT() AS updated_shelves;

COMMIT;

SELECT layout_key, shelf_no, display_name, position_x, position_z,
       rotation_y, width, default_levels
FROM warehouse_shelves
WHERE active = 1
ORDER BY sort_order, id;
