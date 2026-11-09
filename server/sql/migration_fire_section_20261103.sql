-- Add classification only. Existing IDs, permissions and inspection evidence stay.
SET @fire_section_sql = (SELECT IF(COUNT(*)=0,'ALTER TABLE fire_points ADD COLUMN section_name VARCHAR(100) NOT NULL DEFAULT '''' AFTER area_id','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fire_points' AND COLUMN_NAME='section_name');
PREPARE fire_section_stmt FROM @fire_section_sql;
EXECUTE fire_section_stmt;
DEALLOCATE PREPARE fire_section_stmt;
