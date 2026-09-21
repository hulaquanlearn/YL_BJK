-- V1.4.1：补齐 7 个备件类别模型（三角带、筛网、畚斗、止逆器、托辊、橡胶弹簧、万向轮），
-- 并为已有类别补充检索关键词，覆盖 2026-09-08 台账分析中未建模的 99 条备件（覆盖率约 97%）。
-- 增量迁移，可重复执行；不覆盖管理员已维护的类别定义、参考图与正面方向，
-- 也不修改任何备件记录、库存与历史流水。

-- 7 个新增类别模型；名称冲突时保持既有定义，不替换模型文件。
INSERT INTO part_category_models (name,keywords,description,model_url,model_scale,built_in,active,image_url) VALUES
  ('三角带/V带','三角带,V带,V型带,同步带,齿楔带,v-belt,timing belt','三角带与同步带通用示意模型','/models/categories/v-belt.glb',1,1,1,'/models/categories/v-belt.jpg'),
  ('筛网/筛片','筛网,筛片,筛格,钢丝布,sieve mesh,screen plate','冲孔筛网与筛片通用示意模型','/models/categories/sieve-mesh.glb',1,1,1,'/models/categories/sieve-mesh.jpg'),
  ('畚斗','畚斗,料斗,提升机斗,elevator bucket','斗式提升机畚斗通用示意模型','/models/categories/bucket.glb',1,1,1,'/models/categories/bucket.jpg'),
  ('止逆器','止逆器,逆止器,单向离合器,backstop,one-way clutch','斗提机止逆器通用示意模型','/models/categories/backstop.glb',1,1,1,'/models/categories/backstop.jpg'),
  ('托辊','托辊,辊筒,滚筒,idler roller,conveyor roller','皮带输送机托辊通用示意模型','/models/categories/idler-roller.glb',1,1,1,'/models/categories/idler-roller.jpg'),
  ('橡胶弹簧','橡胶弹簧,减振弹簧,rubber spring,vibration damper','橡胶减振弹簧通用示意模型','/models/categories/rubber-spring.glb',1,1,1,'/models/categories/rubber-spring.jpg'),
  ('万向轮','万向轮,脚轮,caster wheel,castor','工业万向轮通用示意模型','/models/categories/caster-wheel.glb',1,1,1,'/models/categories/caster-wheel.jpg')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 关键词追加：仅把缺失词拼到末尾，NOT LIKE 防重复，保留管理员已有关键词。
-- 类别名称按 V1.4.0 部署清单匹配；名称不一致的 UPDATE 影响 0 行，不产生副作用。
UPDATE part_category_models SET keywords = CONCAT(keywords, ',空气开关') WHERE active=1 AND name='断路器' AND (keywords IS NULL OR keywords NOT LIKE '%空气开关%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',功率模块') WHERE active=1 AND name='变频器' AND (keywords IS NULL OR keywords NOT LIKE '%功率模块%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',通讯模块,接口模块,分站模块,分布式IO,通讯处理器,称重模块,网络耦合器,数字量输出模块') WHERE active=1 AND name='PLC模块' AND (keywords IS NULL OR keywords NOT LIKE '%通讯模块%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',磁性开关,跑偏开关,热电阻,热电偶') WHERE active=1 AND name='传感器/开关' AND (keywords IS NULL OR keywords NOT LIKE '%磁性开关%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',变送器,电流表,多功能表') WHERE active=1 AND name='仪表' AND (keywords IS NULL OR keywords NOT LIKE '%变送器%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',操作面板,薄膜按键') WHERE active=1 AND name='HMI触摸屏' AND (keywords IS NULL OR keywords NOT LIKE '%操作面板%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',主控板,显示板,脉冲控制器') WHERE active=1 AND name='控制板' AND (keywords IS NULL OR keywords NOT LIKE '%主控板%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',二联件,三联件') WHERE active=1 AND name='气动元件' AND (keywords IS NULL OR keywords NOT LIKE '%二联件%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',液压缸,纠偏装置') WHERE active=1 AND name='气缸' AND (keywords IS NULL OR keywords NOT LIKE '%液压缸%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',取电器,整流模块') WHERE active=1 AND name='电源' AND (keywords IS NULL OR keywords NOT LIKE '%取电器%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',钢丝绳') WHERE active=1 AND name='电缆' AND (keywords IS NULL OR keywords NOT LIKE '%钢丝绳%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',滤袋,布筒') WHERE active=1 AND name='滤网' AND (keywords IS NULL OR keywords NOT LIKE '%滤袋%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',爆破片') WHERE active=1 AND name='阀门/电磁阀' AND (keywords IS NULL OR keywords NOT LIKE '%爆破片%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',盘根') WHERE active=1 AND name='密封件' AND (keywords IS NULL OR keywords NOT LIKE '%盘根%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',回转式减速器') WHERE active=1 AND name='减速机' AND (keywords IS NULL OR keywords NOT LIKE '%回转式减速器%');
UPDATE part_category_models SET keywords = CONCAT(keywords, ',操作件,封闭式开关') WHERE active=1 AND name='开关按钮' AND (keywords IS NULL OR keywords NOT LIKE '%操作件%');

-- 部署后核对：新增 7 类别是否入表，关键词是否按需追加。
SELECT id,name,keywords,model_url,image_url,built_in,active
FROM part_category_models
ORDER BY built_in DESC,name ASC;
