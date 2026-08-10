-- 原粮车间3D库位图增量迁移。
-- 仅新增货架布局与审计表，不删除、不清空、不覆盖现有业务数据。
USE spare_parts;

CREATE TABLE IF NOT EXISTS warehouse_shelves (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  layout_key VARCHAR(50) NOT NULL,
  shelf_no INT UNSIGNED DEFAULT NULL,
  display_name VARCHAR(60) DEFAULT NULL,
  workshop_group VARCHAR(30) NOT NULL,
  warehouse_code VARCHAR(30) DEFAULT NULL,
  is_vendor TINYINT(1) NOT NULL DEFAULT 0,
  position_x DECIMAL(8,3) NOT NULL,
  position_z DECIMAL(8,3) NOT NULL,
  rotation_y DECIMAL(8,3) NOT NULL DEFAULT 0,
  width DECIMAL(8,3) NOT NULL DEFAULT 4.000,
  depth DECIMAL(8,3) NOT NULL DEFAULT 0.900,
  height DECIMAL(8,3) NOT NULL DEFAULT 3.200,
  default_levels INT UNSIGNED NOT NULL DEFAULT 6,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_warehouse_shelves_layout_key (layout_key),
  UNIQUE KEY uk_warehouse_shelves_shelf_no (shelf_no),
  KEY idx_warehouse_shelves_group_order (workshop_group, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouse_shelf_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shelf_id BIGINT UNSIGNED NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NOT NULL,
  inventory_rows_affected INT UNSIGNED NOT NULL DEFAULT 0,
  operator_user_id BIGINT UNSIGNED DEFAULT NULL,
  operator_name VARCHAR(50) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_warehouse_shelf_audit_shelf_time (shelf_id, created_at),
  KEY idx_warehouse_shelf_audit_operator_time (operator_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO warehouse_shelves
  (layout_key, shelf_no, display_name, workshop_group, warehouse_code, is_vendor,
   position_x, position_z, rotation_y, width, depth, height, default_levels, sort_order)
SELECT seed.* FROM (
  SELECT 'shelf-01' AS layout_key, 1 AS shelf_no, NULL AS display_name,
         '蒸糠工段' AS workshop_group, '4150_D' AS warehouse_code, 0 AS is_vendor,
         -2.30 AS position_x, -7.20 AS position_z, 0 AS rotation_y,
         4.20 AS width, 0.90 AS depth, 3.20 AS height, 6 AS default_levels, 1 AS sort_order UNION ALL
  SELECT 'shelf-02', 2, NULL, '蒸糠工段', '4150_D', 0,  2.30, -7.20, 0, 4.20, 0.90, 3.20, 6, 2 UNION ALL
  SELECT 'shelf-03', 3, NULL, '蒸糠工段', '4150_D', 1, -2.30, -4.80, 0, 4.20, 0.90, 3.20, 6, 3 UNION ALL
  SELECT 'shelf-04', 4, NULL, '破曲工段', '4150_C', 0,  2.30, -4.80, 0, 4.20, 0.90, 3.20, 6, 4 UNION ALL
  SELECT 'shelf-05', 5, NULL, '破曲工段', '4150_C', 0, -2.30, -2.40, 0, 4.20, 0.90, 3.20, 6, 5 UNION ALL
  SELECT 'shelf-06', 6, NULL, '破曲工段', '4150_C', 1,  2.30, -2.40, 0, 4.20, 0.90, 3.20, 6, 6 UNION ALL
  SELECT 'shelf-07', 7, NULL, '五粮工段', '4150_B', 0, -2.30,  0.00, 0, 4.20, 0.90, 3.20, 6, 7 UNION ALL
  SELECT 'shelf-08', 8, NULL, '五粮工段', '4150_B', 0,  2.30,  0.00, 0, 4.20, 0.90, 3.20, 6, 8 UNION ALL
  SELECT 'shelf-09', 9, NULL, '五粮工段', '4150_B', 0, -2.30,  2.40, 0, 4.20, 0.90, 3.20, 6, 9 UNION ALL
  SELECT 'shelf-10', 10, NULL, '五粮工段', '4150_B', 0,  2.30,  2.40, 0, 4.20, 0.90, 3.20, 6, 10 UNION ALL
  SELECT 'shelf-11', 11, NULL, '五粮工段', '4150_B', 0, -2.30,  4.80, 0, 4.20, 0.90, 3.20, 6, 11 UNION ALL
  SELECT 'shelf-12', 12, NULL, '输送工段', '4150_A', 1,  2.30,  4.80, 0, 4.20, 0.90, 3.20, 6, 12 UNION ALL
  SELECT 'shelf-13', 13, NULL, '输送工段', '4150_A', 1, -2.30,  7.20, 0, 4.20, 0.90, 3.20, 6, 13 UNION ALL
  SELECT 'shelf-14', 14, NULL, '输送工段', '4150_A', 1,  2.30,  7.20, 0, 4.20, 0.90, 3.20, 6, 14 UNION ALL
  SELECT 'shelf-15', 15, NULL, '输送工段', '4150_A', 0, -6.40, -7.20, 0, 3.60, 0.90, 3.20, 6, 15 UNION ALL
  SELECT 'shelf-16', 16, NULL, '输送工段', '4150_A', 0, -6.40, -4.80, 0, 3.60, 0.90, 3.20, 6, 16 UNION ALL
  SELECT 'shelf-17', 17, NULL, '输送工段', '4150_A', 0, -6.40, -2.40, 0, 3.60, 0.90, 3.20, 6, 17 UNION ALL
  SELECT 'shelf-18', 18, NULL, '输送工段', '4150_A', 0, -6.40,  0.60, 0, 3.60, 0.90, 3.20, 6, 18 UNION ALL
  SELECT 'shelf-19', 19, NULL, '输送工段', '4150_A', 0, -6.40,  3.00, 0, 3.60, 0.90, 3.20, 6, 19 UNION ALL
  SELECT 'shelf-20', 20, NULL, '输送工段', '4150_A', 0, -6.40,  5.40, 0, 3.60, 0.90, 3.20, 6, 20 UNION ALL
  SELECT 'unnamed-01', NULL, '未命名', '未命名区域', 'UNASSIGNED', 0, -4.80,  9.60, 0, 3.80, 0.90, 3.20, 6, 101 UNION ALL
  SELECT 'unnamed-02', NULL, '未命名', '未命名区域', 'UNASSIGNED', 0,  0.00,  9.60, 0, 3.80, 0.90, 3.20, 6, 102 UNION ALL
  SELECT 'unnamed-03', NULL, '未命名', '未命名区域', 'UNASSIGNED', 0,  4.80,  9.60, 0, 3.80, 0.90, 3.20, 6, 103
) AS seed
LEFT JOIN warehouse_shelves existing ON existing.layout_key = seed.layout_key
WHERE existing.id IS NULL;
