-- 已废弃采购与供应商功能清理。执行前必须备份正式数据库。
-- 本迁移会永久删除采购单、供应商及备件供应商关系历史数据。
USE spare_parts;

-- 采购模块退出后，不再保留由采购单推导的“在途”数量。
UPDATE inventory SET in_transit=0 WHERE COALESCE(in_transit,0)<>0;

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS replenishment_order_items;
DROP TABLE IF EXISTS replenishment_orders;
DROP TABLE IF EXISTS part_suppliers;
DROP TABLE IF EXISTS suppliers;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
