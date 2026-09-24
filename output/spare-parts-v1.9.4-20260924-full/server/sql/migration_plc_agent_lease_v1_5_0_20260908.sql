-- V1.5.0 increment only; preserve project data and existing export results.
SET @lease_column_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='plc_projects' AND COLUMN_NAME='extracting_claim_hash');
SET @lease_sql := IF(@lease_column_exists=0,
  'ALTER TABLE plc_projects ADD COLUMN extracting_claim_hash CHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE lease_stmt FROM @lease_sql;
EXECUTE lease_stmt;
DEALLOCATE PREPARE lease_stmt;
