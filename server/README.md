# 备件管理 API（V1.9.10，2026-10-18）

当前为 spare-parts-v1.9.10-20261018-full-knowledge-admin-cleanup-r1 完整包。部署/验收/回滚以包根 DEPLOY_V1.9.10.md、QA_V1.9.10.md、USER_GUIDE_V1.9.10.md 为准（仓库对应 output/）。

## 当前功能与权限

库存、补货、盘点、出入库、模型名称绑定、设备资料、工段长履职、考勤、工程知识和独立 /api/robot-program 保留。个人中心提供本人维护，系统管理员集中管理账号、资料、API/Codex/混元用量和全员记录。原粮员工仅查备件/详情/库位和本人维护，身份/车间变更仍受后端限制。

知识与 ABB 直连 DeepSeek：管理员不限业务次数，车间管理员每账号各模块每日成功最多 3 次，各端共享。完整分批注释计 1 次，原任务续跑不重复，正常失败不扣。知识和机器人额度独立，其他人员不能调用模型。

制曲履职、旧 PLC/TIA/ABB 分析/代理、旧采购供应商/模型匹配及 Dify 导出已删除。旧 API 登录后通用 404，不保留 410。不要用旧安装说明恢复代理/定时任务或批量 SQL。

## 配置和持久化

Node.js ^22.13.0 或 >=24.0.0，MySQL 8.0+。首次配置参考 .env.example；已有环境须合并而非覆盖 .env。DB_HOST/PORT/NAME/USER/PASSWORD 使用现场配置，Key 不放客户端/静态目录/Git。

~~~dotenv
DEEPSEEK_API_KEY=<现场私有Key>
KNOWLEDGE_AI_ENABLED=true
KNOWLEDGE_AI_MODEL=deepseek-flash
ROBOT_AGENT_ENABLED=true
ROBOT_AGENT_MODEL=deepseek-flash
ROBOT_LIBRARY_DIR=/opt/spare-parts/data/robot-program-library
AI_AUDIT_DIR=/opt/spare-parts/data/ai-call-logs
CODEX_USAGE_LOCAL_ENABLED=false
~~~

已有库默认 server/uploads/robot-program-library 时先沿用或停服完整迁移后改路径，不能指向空目录后重复导入。库内 .usage/.deleted、审计目录 .knowledge-usage、原 ZIP/分析和上传持续备份。文件额度要求单 API 实例/进程，不能直接 PM2 cluster 多开。

原粮总结沿用 RAW_DUTY_AI_SUMMARY_ENABLED/RAW_DUTY_AI_MODEL 和共享 DeepSeek Key；本站三个业务通道无需 OpenClaw。旧专用任务对照见 docs/RETIRED_FEATURES_20261018.md，不停止其他项目共享网关/混元。

GET /api/personal-usage/providers 仅管理员：
- DeepSeek API 余额用已有 Key；GLM_API_KEY 查普通 API 余额，不混用 Coding Plan。
- 混元用只读 hunyuan:DescribeTokenPlanUsage，配置 TENCENT_HY_USAGE_SECRET_ID/SECRET_KEY 或 TENCENT_HY_USAGE_CREDENTIALS_FILE 私有 SecretId,SecretKey CSV。
- 生产 Codex 默认关闭本机查询，可用 CODEX_USAGE_SNAPSHOT_FILE 指向个人电脑生成/安全同步的脱敏 JSON，不能上传登录文件。供应商读数缓存 30 秒，失败如实展示。

## 更新与运行

在现场备份、测试库验收及配套文件更新后：

~~~bash
cd /opt/spare-parts/server
npm ci --omit=dev
pm2 restart spare-parts-api --update-env
pm2 logs spare-parts-api --lines 50 --nostream
~~~

首次安装在空库另行规划基础结构，仅首次 npm run create-admin；临时 BOOTSTRAP_ADMIN_* 密码成功后移除。升级无需手工 SQL 迁移，启动执行必要幂等检查；禁止批量 schema.sql/migration_all.sql/历史 SQL/台账导入或自动改绑。完成数据库与结构检查后监听 127.0.0.1，保留现有 Nginx HTTPS 授权代理。

按 DEPLOY 同步清理 src/scripts/sql/nginx 受管理代码，安装 ledger-model-catalog.json 和完整网页成品/运行器，不对 API 根目录/data/uploads 删除式同步。目录初始化保留人工绑定与库存。

管理员资料清理事务核对版本，允许删除历史/关联履职照片而保留文字/原状态/审计。普通角色不能统一清理，不能拿正式资料试删。调用审计只存账号/来源/模型/状态/Token 元数据，不存 Key/问题/回答全文；额度和审计升级/回滚保留。

本地 API 287/287、网页 193/193、模型 14/14、构建/小程序静态检查通过；真实 MySQL/生产账号/微信工具和安卓/微信真机未验收。包不含 .env/台账/业务上传/node_modules/个人凭据或 Codex 登录文件；未部署生产。
