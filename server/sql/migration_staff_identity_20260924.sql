-- 车间岗位仅用于账号身份展示；viewer 的备件权限仍为只读。
-- 在已有数据库上执行前备份；旧账号保持未分配岗位，不推断班组身份。
ALTER TABLE app_users ADD COLUMN staff_workshop_code VARCHAR(30) NULL AFTER role;
ALTER TABLE app_users ADD COLUMN staff_position VARCHAR(30) NULL AFTER staff_workshop_code;
