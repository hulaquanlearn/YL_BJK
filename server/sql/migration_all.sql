-- 原粮车间备件系统完整增量迁移入口。
-- 请在 server 目录执行：mysql -u spareparts -p spare_parts < sql/migration_all.sql
-- 所有子脚本均为增量迁移；执行前仍必须备份正式数据库。

SOURCE sql/migration_existing.sql;
SOURCE sql/migration_operations_20260718.sql;
SOURCE sql/migration_warehouse_3d.sql;
SOURCE sql/migration_warehouse_3d_layout_fix_20260716.sql;
