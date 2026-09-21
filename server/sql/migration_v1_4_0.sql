-- V1.3.2 -> V1.4.0 only; preserve every inventory record and fixed room layout.
-- From /opt/spare-parts/server: mysql --login-path=spareparts spare_parts < sql/migration_v1_4_0.sql
-- Always back up the database first. SOURCE is relative to this working directory.
SOURCE sql/migration_model_assets_20260905.sql;
SOURCE sql/migration_knowledge_revisions_search_20260905.sql;
