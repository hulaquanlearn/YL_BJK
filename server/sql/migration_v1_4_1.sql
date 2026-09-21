-- V1.4.0 -> V1.4.1 only; preserve every inventory record, knowledge entry and program evidence.
-- From /opt/spare-parts/server: mysql --login-path=spareparts spare_parts < sql/migration_v1_4_1.sql
-- Always back up the database first. SOURCE is relative to this working directory.
SOURCE sql/migration_plc_agent_claims_20260908.sql;
SOURCE sql/migration_category_models_v1_4_1_20260908.sql;
SOURCE sql/migration_category_images_v1_4_1_20260908.sql;
