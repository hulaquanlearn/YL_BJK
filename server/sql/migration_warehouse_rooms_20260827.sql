-- 多车间库房几何配置。仅新增配置表和缺失的默认配置，不修改库存数据。

CREATE TABLE IF NOT EXISTS warehouse_rooms (
  workshop_code VARCHAR(30) NOT NULL,
  room_name VARCHAR(100) NOT NULL,
  width DOUBLE NOT NULL DEFAULT 19,
  depth DOUBLE NOT NULL DEFAULT 34,
  height DOUBLE NOT NULL DEFAULT 4.2,
  east_axis VARCHAR(10) NOT NULL DEFAULT '+z',
  entrance_wall VARCHAR(10) NOT NULL DEFAULT 'west',
  entrance_offset DOUBLE NOT NULL DEFAULT 0,
  entrance_width DOUBLE NOT NULL DEFAULT 2.4,
  updated_by INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (workshop_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO warehouse_rooms
  (workshop_code,room_name,width,depth,height,east_axis,entrance_wall,entrance_offset,entrance_width)
VALUES
  ('raw_grain','原粮车间备件库',18,32,4.2,'+z','east',11.8,2.4),
  ('qu_making','制曲车间备件库',20,28,4.2,'+z','west',0,2.6),
  ('brewing','酿酒车间备件库',20,28,4.2,'+z','west',0,2.6)
ON DUPLICATE KEY UPDATE room_name=VALUES(room_name);
