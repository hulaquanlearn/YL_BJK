-- 分车间台账字段和库位层级配置。
-- 仅新增配置表，不删除、不改写现有备件、库存或历史流水。
CREATE TABLE IF NOT EXISTS workshop_inventory_settings (
  workshop_code VARCHAR(40) NOT NULL PRIMARY KEY,
  uses_warehouse_area TINYINT(1) NOT NULL DEFAULT 1,
  location_mode ENUM('rack','free','mixed') NOT NULL DEFAULT 'mixed',
  location_schema JSON NULL,
  part_field_schema JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_settings_workshop FOREIGN KEY (workshop_code) REFERENCES workshops(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO workshop_inventory_settings
  (workshop_code, uses_warehouse_area, location_mode, location_schema, part_field_schema)
VALUES
  ('raw_grain', 1, 'rack', JSON_ARRAY('货区','货架','方位','层位','货位'), JSON_ARRAY()),
  ('qu_making', 0, 'free', JSON_ARRAY('存放位置'), JSON_ARRAY()),
  ('brewing', 1, 'mixed', JSON_ARRAY('货区','存放位置'), JSON_ARRAY())
ON DUPLICATE KEY UPDATE workshop_code=VALUES(workshop_code);
