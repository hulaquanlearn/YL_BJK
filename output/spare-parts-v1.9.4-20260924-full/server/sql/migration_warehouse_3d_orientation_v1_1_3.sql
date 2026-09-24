-- V1.1.3 原粮车间 3D 方位与现场 2D 平面图统一。
-- 画面上方为东；01-14 号中间双列，15-20 号左侧单列，上端为三组未命名货架。
-- 仅更新布局配置，不删除备件、库存或流水数据。

USE spare_parts;

START TRANSACTION;

UPDATE warehouse_rooms
SET east_axis = '+z',
    entrance_wall = 'east',
    entrance_offset = 11.8,
    entrance_width = 2.4
WHERE workshop_code = 'raw_grain';

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
      ELSE position_x END,
    position_z = CASE layout_key
      WHEN 'shelf-01' THEN -10.500 WHEN 'shelf-02' THEN -10.500
      WHEN 'shelf-03' THEN -7.100 WHEN 'shelf-04' THEN -7.100
      WHEN 'shelf-05' THEN -3.700 WHEN 'shelf-06' THEN -3.700
      WHEN 'shelf-07' THEN -0.300 WHEN 'shelf-08' THEN -0.300
      WHEN 'shelf-09' THEN 3.100 WHEN 'shelf-10' THEN 3.100
      WHEN 'shelf-11' THEN 6.500 WHEN 'shelf-12' THEN 6.500
      WHEN 'shelf-13' THEN 9.900 WHEN 'shelf-14' THEN 9.900
      WHEN 'shelf-15' THEN -10.500 WHEN 'shelf-16' THEN -7.100
      WHEN 'shelf-17' THEN -3.700 WHEN 'shelf-18' THEN -0.300
      WHEN 'shelf-19' THEN 3.100 WHEN 'shelf-20' THEN 6.500
      WHEN 'unnamed-01' THEN 13.400
      WHEN 'unnamed-02' THEN 13.400
      WHEN 'unnamed-03' THEN 13.400
      ELSE position_z END,
    rotation_y = 0,
    width = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-9]|20)$' THEN 4.900
      WHEN layout_key IN ('unnamed-01','unnamed-02','unnamed-03') THEN 4.900
      ELSE width END,
    default_levels = 4,
    position_overridden = 0
WHERE workshop_code = 'raw_grain'
  AND layout_key IN (
    'shelf-01','shelf-02','shelf-03','shelf-04','shelf-05','shelf-06','shelf-07',
    'shelf-08','shelf-09','shelf-10','shelf-11','shelf-12','shelf-13','shelf-14',
    'shelf-15','shelf-16','shelf-17','shelf-18','shelf-19','shelf-20',
    'unnamed-01','unnamed-02','unnamed-03'
  );

COMMIT;

SELECT workshop_code, east_axis, entrance_wall, entrance_offset, entrance_width
FROM warehouse_rooms WHERE workshop_code = 'raw_grain';

SELECT layout_key, shelf_no, position_x, position_z, rotation_y, width, default_levels
FROM warehouse_shelves
WHERE workshop_code = 'raw_grain' AND active = 1
ORDER BY sort_order, id;
