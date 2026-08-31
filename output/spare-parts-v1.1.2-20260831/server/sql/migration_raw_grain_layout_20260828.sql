-- 修正原粮车间现场平面：恢复旧版货架尺度、坐标与入口方向。
-- 仅覆盖系统曾写入的错误默认库房参数；管理员已自定义的房间参数不受影响。

UPDATE warehouse_rooms
SET width=18,
    depth=32,
    height=4.2,
    east_axis='+z',
    entrance_wall='east',
    entrance_offset=11.8,
    entrance_width=2.4
WHERE workshop_code='raw_grain'
  AND width=19
  AND depth=34
  AND entrance_wall='west'
  AND entrance_offset=12.4;

-- 未人工拖拽的系统货架恢复现场确认坐标；人工调整过的货架位置不覆盖。
UPDATE warehouse_shelves
SET position_x = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-4])$'
        THEN IF(MOD(CAST(SUBSTRING(layout_key,7,2) AS UNSIGNED),2)=1,-2.30,2.30)
      WHEN layout_key REGEXP '^shelf-(1[5-9]|20)$' THEN -6.40
      WHEN layout_key='unnamed-01' THEN -4.80
      WHEN layout_key='unnamed-02' THEN 0.00
      WHEN layout_key='unnamed-03' THEN 4.80
      ELSE position_x END,
    position_z = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-4])$'
        THEN -7.2 + FLOOR((CAST(SUBSTRING(layout_key,7,2) AS UNSIGNED)-1)/2)*2.4
      WHEN layout_key='shelf-15' THEN -7.2
      WHEN layout_key='shelf-16' THEN -4.8
      WHEN layout_key='shelf-17' THEN -2.4
      WHEN layout_key='shelf-18' THEN 0.6
      WHEN layout_key='shelf-19' THEN 3.0
      WHEN layout_key='shelf-20' THEN 5.4
      WHEN layout_key IN ('unnamed-01','unnamed-02','unnamed-03') THEN 9.6
      ELSE position_z END,
    rotation_y = 0,
    width = CASE
      WHEN layout_key REGEXP '^shelf-(0[1-9]|1[0-4])$' THEN 4.2
      WHEN layout_key REGEXP '^shelf-(1[5-9]|20)$' THEN 3.6
      WHEN layout_key IN ('unnamed-01','unnamed-02','unnamed-03') THEN 3.8
      ELSE width END,
    depth = 0.9,
    height = 3.2,
    default_levels = 4
WHERE workshop_code='raw_grain'
  AND COALESCE(position_overridden,0)=0
  AND (layout_key REGEXP '^shelf-(0[1-9]|1[0-9]|20)$'
       OR layout_key IN ('unnamed-01','unnamed-02','unnamed-03'));
