-- Only this additive migration is needed for an existing fire-inspection install.
-- Never infer the inspection month from a deadline. Existing NULL values retain
-- a read-only fallback to the cycle creation month in Asia/Shanghai.
SET @fire_photo_month_sql = (SELECT IF(COUNT(*)=0,'ALTER TABLE fire_cycles ADD COLUMN inspection_month CHAR(7) DEFAULT NULL AFTER deadline','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fire_cycles' AND COLUMN_NAME='inspection_month');
PREPARE fire_photo_month_stmt FROM @fire_photo_month_sql;
EXECUTE fire_photo_month_stmt;
DEALLOCATE PREPARE fire_photo_month_stmt;
