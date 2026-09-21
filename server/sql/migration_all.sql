-- 原粮车间备件系统完整增量迁移入口。
-- 请在 server 目录执行：mysql -u spareparts -p spare_parts < sql/migration_all.sql
-- 所有子脚本均为增量迁移；执行前仍必须备份正式数据库。

SOURCE sql/migration_existing.sql;
SOURCE sql/migration_operations_20260718.sql;
SOURCE sql/migration_warehouse_3d.sql;
-- migration_warehouse_3d_layout_fix_20260716.sql 为旧版兼容脚本，
-- 新安装已由 migration_warehouse_3d.sql 直接创建正确初始布局。
SOURCE sql/migration_fermentation_knowledge_20260821.sql;
SOURCE sql/migration_plc_ai_20260821.sql;
SOURCE sql/migration_program_analysis_20260824.sql;
SOURCE sql/migration_knowledge_process_stages_20260825.sql;
SOURCE sql/migration_multi_workshop_20260826.sql;
SOURCE sql/migration_warehouse_rooms_20260827.sql;
SOURCE sql/migration_inventory_workshop_overrides_20260827.sql;
SOURCE sql/migration_raw_grain_layout_20260828.sql;
SOURCE sql/migration_raw_grain_shelf_spacing_20260831.sql;
SOURCE sql/migration_warehouse_3d_orientation_v1_1_3.sql;
SOURCE sql/migration_knowledge_tags_equipment_scope_20260828.sql;
SOURCE sql/migration_remove_procurement_suppliers_20260829.sql;
SOURCE sql/migration_workshop_import_settings_20260830.sql;
SOURCE sql/migration_part_category_models_20260831.sql;
SOURCE sql/migration_v1_4_0.sql;

SOURCE sql/migration_v1_4_1.sql;
SOURCE sql/migration_v1_5_0.sql;
