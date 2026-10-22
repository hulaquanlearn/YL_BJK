# V1.9.10 部署说明（2026-10-19）

同日后续网页布局整理已单独同步：文件名完整换行、每卡编辑菜单、源码工具栏展开/收起、移除折叠及冗余代码。仅替换完整网页构建，API不重启；现场回滚网页在 `/opt/spare-parts/rollback/robot-layout-20261020/web-dist/`。独立APK和小程序均无需发布，整站压缩包未重打。

2026-10-20现网追加已直接部署：不可读置底、备份单行、失败跳过持续生成，以及累计注释保存/导出修复。改动仅完整网页和API的robot-library.js、robot-agent.js、robot-backup-export.js，无SQL/依赖变动，小程序不变；回滚副本在 `/opt/spare-parts/rollback/robot-continue-20261020/`。下述压缩包未重打，不包含本次追加。恢复旧API时应保留32MB记录读取兼容，不能截断已产生的大记录。

> 后续独立App更新：android.5新增本机加密记住密码，已发布正式HTTPS更新渠道。该次未重打下方完整包（其中仍为android.4），不用重部署网页/API或执行SQL。现有App从“我的→检查App更新”升级；独立成品与校验见 [Android README](../android-app/README.md)。

正式文件：spare-parts-v1.9.10-20261019-full-robot-reader-current-attendance.tar.gz。本次交付完整部署包：缺少可靠增量核验工具，API、完整网页成品/运行器和模型成套同步。现网已通过SSH应用本轮修复，本次交付不重复部署。小程序源码保持原功能/权限，本轮无需重新发布。

## 本轮追加

机器人源码阅读与智能体面板已重新排版，网页/App同步，不需要重装APK。考勤仅保留当前成功导入；新导入在同一事务中替换旧报告、源文件和备注，不保留历史选择入口，失败时回滚。原粮考勤读取/管理权限不变。

现网已完成旧记录清理。其他既有环境升级时，先备份并预览，再仅对考勤执行一次定向清理（无需 SQL 迁移，不运行历史SQL）：

~~~bash
cd /opt/spare-parts/server
node scripts/retain-current-attendance.js
# 核对保留当前一份及待移除旧ID后，使用新的私有回滚路径：
node scripts/retain-current-attendance.js --apply --backup /opt/spare-parts/rollback/current-attendance/attendance-before.json.gz
~~~

脚本与导入共用数据库锁；回滚快照不得放在网页静态目录，也不得随发布包分发。业务数据库的其他表、履职、库存、知识、机器人库和上传保留。旧版本代码没有当前导入保留规则；回滚代码时应重新核对该规则。

## 内容与保留边界

包内 server/ 是 API 源码与锁文件，web-dist/ 是完整网页，web-runtime/ 是网页 Node 运行器，miniprogram/ 为小程序源码，docs/ 为功能、清理及历史参考。app-updates/android/ 含正式APK、latest.json和SHA256SUMS.txt；android-app/含使用和验证说明，不含Android源码或签名私钥。

不得覆盖现场 .env，不整目录同步 server/data 或 uploads。只更新 data/ledger-model-catalog.json；模型目录按既有幂等批次补齐，不覆盖人工绑定或库存。备份并保留：
- MySQL 业务库、历史表/审计、台账、所有上传与现场配置。
- ROBOT_LIBRARY_DIR，包括 .usage 次数、.deleted 私有归档及删除标记。旧默认 server/uploads/robot-program-library 若已有数据，沿用该路径；需搬迁时先停 API、完整复制并核对后才修改路径。
- AI_AUDIT_DIR，包括 .knowledge-usage 次数和调用审计；升级或回滚均不能用空目录替换。
- 私有供应商凭据和只含脱敏数据的 Codex 用量快照，不复制 Codex 登录文件到服务器。

本轮新功能无需 SQL 迁移。启动仅执行当前 ensureSchema 必要幂等检查（既有原粮履职、考勤/清理审计、身份字段、账号大小写规则与模型批次）；升级不得重跑 schema.sql、migration_all.sql、历史 SQL、台账导入或自动改绑脚本。首次安装须另行在空库规划现存基础结构及管理员初始化，不把新装流程用于业务库。MySQL 要求 8.0+，用户名规则 utf8mb4_0900_as_cs；先用真实库的测试副本验证启动和大小写账号。原粮员工仅备件查询/详情/库位和本人维护，不能借升级扩大权限。

## 升级前核对

1. 比对外层 SHA256SUMS-V1.9.10.txt 后解压，在包根目录运行 sha256sum -c SHA256SUMS-V1.9.10.txt。
2. 备份现场数据库、API/网页整套目录、配置、上传和上述持久目录。上一版包在本机 output/rollback/；现场若不是该版本，以现场实际完整备份为回滚基线。
3. 先在测试库验收结构、角色、历史照片查询、清理事务、额度持久化和模型目录。本轮知识检索/追问、权限拒绝与机器人批次已通过现网MySQL/API实测；其余业务不据此视为全部验收。
4. 使用 Node.js ^22.13.0 或 >=24.0.0；npm ci --omit=dev 使用包内锁文件。文档转换/OCR 外部工具见 docs/DOCUMENT_PREVIEW_V1.4.0.md。
5. 记录现有 PM2、端口、Nginx 路径及运行用户。机器人库/额度/知识额度使用本地文件，API 必须单实例单进程（PM2 fork、instances=1）；多服务器不能直接共用文件台账冒充事务存储。

## 私有配置合并

合并到现有 .env，不用模板覆盖。密钥由现场安全配置，本包不携带。当前三个业务模型通道均直连 DeepSeek，不依赖 OpenClaw：

~~~dotenv
DEEPSEEK_API_KEY=<现场已有Key>
KNOWLEDGE_AI_ENABLED=true
KNOWLEDGE_AI_MODEL=deepseek-flash
ROBOT_AGENT_ENABLED=true
ROBOT_AGENT_MODEL=deepseek-flash
ROBOT_LIBRARY_DIR=/opt/spare-parts/data/robot-program-library
AI_AUDIT_DIR=/opt/spare-parts/data/ai-call-logs
# 原粮周总结沿用现场已授权的开关；需要时启用
RAW_DUTY_AI_SUMMARY_ENABLED=true
RAW_DUTY_AI_MODEL=deepseek-flash
CODEX_USAGE_LOCAL_ENABLED=false
~~~

路径只是示例，已有库/日志须指向原实际目录。通过运行 API 的同一用户创建新持久目录，权限 700，.env/凭据文件 600，不对静态服务开放。

个人中心用量仅系统管理员可访问：
- DeepSeek 使用上述 Key 读 API 余额，GLM 使用 GLM_API_KEY 读普通 API 余额；不是 GLM Coding Plan。
- 混元个人套餐使用只读 hunyuan:DescribeTokenPlanUsage 权限；配置 TENCENT_HY_USAGE_SECRET_ID、TENCENT_HY_USAGE_SECRET_KEY，或 TENCENT_HY_USAGE_CREDENTIALS_FILE 指向服务端私有 SecretId,SecretKey CSV。不能把模型调用 Key 当云账户凭据，不把桌面文件放入网页/包。
- 服务器默认不运行本机 Codex 登录查询。若需显示个人电脑额度，在本地仓库执行 node tools/sync-codex-usage.cjs <本地输出路径>，仅将脱敏 JSON 安全同步到服务端私有目录，再设置 CODEX_USAGE_SNAPSHOT_FILE；该本地工具不在服务器包内。快照无自动定时同步，上游失败如实显示不可用。

旧本站 OPENCLAW_*、PLC_AGENT_TOKEN、PLC_UPLOAD_DIR、PLC_MAX_FILE_SIZE、ROBOT_AGENT_TRANSPORT/API_URL/ID 不再读取。现场先核对其他项目后再清理本站专用 agent/cron/hook/轮询，详见 docs/RETIRED_FEATURES_20261018.md。仍使用的混元模型、个人套餐和共享网关不关闭；本轮未操作生产 OpenClaw。

## 配套更新示例

由现场在备份和测试库验收后执行。例子沿用 /opt/spare-parts 和 spare-parts-api/spare-parts-web，先核对实际部署。包中 web-dist/ 内容须放到 /opt/spare-parts/web/dist/，不能平铺 web/。

~~~bash
set -euo pipefail
PKG=/tmp/spare-parts-v1.9.10-20261019-full-robot-reader-current-attendance
APP=/opt/spare-parts
test "$(realpath "$APP")" = /opt/spare-parts
test -f "$APP/server/.env"
test -f "$PKG/server/data/ledger-model-catalog.json"
test -f "$PKG/web-dist/index.html"
(cd "$PKG" && sha256sum -c SHA256SUMS-V1.9.10.txt)

pm2 stop spare-parts-api
# 只在这四个受发布管理的代码目录清理旧文件，不能对 APP/server 或 data/uploads 使用 --delete。
for item in src scripts sql nginx; do
  install -d "$APP/server/$item"
  rsync -a --delete "$PKG/server/$item/" "$APP/server/$item/"
done
install -d "$APP/server/data"
cp "$PKG/server/data/ledger-model-catalog.json" "$APP/server/data/ledger-model-catalog.json"
cp "$PKG/server/package.json" "$PKG/server/package-lock.json" "$PKG/server/README.md" "$APP/server/"
cp "$PKG/server/.env.example" "$APP/server/.env.example"
(cd "$APP/server" && npm ci --omit=dev)

test ! -e "$APP/web/.dist-v1.9.10-online-app-ai-progress"
install -d "$APP/web/.dist-v1.9.10-online-app-ai-progress"
rsync -a "$PKG/web-dist/" "$APP/web/.dist-v1.9.10-online-app-ai-progress/"
test -f "$APP/web/.dist-v1.9.10-online-app-ai-progress/index.html"
pm2 stop spare-parts-web
cp "$PKG/web-runtime/server.js" "$PKG/web-runtime/package.json" "$PKG/web-runtime/package-lock.json" "$APP/web/"
(cd "$APP/web" && npm ci --omit=dev)
if test -d "$APP/web/dist"; then mv "$APP/web/dist" "$APP/web/.dist-previous-v1.9.10-$(date +%Y%m%d%H%M%S)"; fi
mv "$APP/web/.dist-v1.9.10-online-app-ai-progress" "$APP/web/dist"
test -f /opt/spare-parts/web/dist/index.html
pm2 restart spare-parts-api --update-env
pm2 restart spare-parts-web --update-env
pm2 logs spare-parts-api --lines 50 --nostream
~~~

保持原 Nginx HTTPS/API/模型资源授权代理，不把知识附件、上传或私有目录改为公开静态 alias。API 先检查数据库/结构再监听；失败时停止升级并按原备份回滚，不反复运行历史初始化 SQL。依赖安装失败则恢复旧代码/依赖，不能混用新旧网页文件。

## 小程序与安卓

本轮小程序功能/权限与上一正式包一致，不需要重新发布。以后确有小程序变更时，使用现场 AppID/project 配置，核对request/upload/download合法域名及业务域名，经微信开发工具/真机验证后重新编译、上传发布；不得因部署网页/App而改动小程序权限。

安卓正式版为1.9.10-android.4，App与网页使用相同业务与服务端权限。首次安装包内 app-updates/android/digital-workbench-1.9.10-android.4.apk；旧debug体验版需先处理签名不一致，不能直接覆盖正式签名。正式同签名版本支持“我的/更多→检查App更新”，由系统确认安装。网页/API修复不必重新安装App。

Android更新文件部署到独立 /opt/spare-parts/app-updates/android/，不得放进会整体替换的web/dist；先校验APK与SHA256SUMS.txt、同签名及版本递增，复制带版本号APK后最后原子替换latest.json。保留旧APK/清单供诊断，禁止用较低versionCode冒充可覆盖回滚。现网已发布本包APK，无需重复操作。

新服务器需在HTTPS站点中添加以下独立静态位置（先备份现有配置，nginx -t通过后reload，不覆盖已有API/模型授权规则）：

~~~nginx
location ^~ /app-updates/ {
    alias /opt/spare-parts/app-updates/;
    autoindex off;
    add_header Cache-Control "no-store" always;
    types { application/json json; application/vnd.android.package-archive apk; text/plain txt; }
    limit_except GET HEAD { deny all; }
}
~~~

以包内latest.json指定的同源HTTPS地址为准。换域名或备案后切域名须重新生成匹配域名的更新清单，并核对App连接地址和证书；不能将旧清单直接用于其他域名。

## 升级后与回滚

按 QA_V1.9.10.md 使用真实账号核对权限、当前正文/版本、引用、计次、各端共享额度、原粮状态、照片清理事务和用量凭据。不要用正式资料试删；历史凭证永久清理需管理员核对确认。

旧 /api/work、/api/plc、/api/program-agent、旧采购等登录后返回通用 404，无登录仍按统一鉴权；未知网页回工作台。新 /api/robot-program、原粮、考勤、库存和工程知识必须仍可用。废弃实现和待现场清理项见 docs/RETIRED_FEATURES_20261018.md 与 docs/TOOLBAR_CLEANUP_REVIEW_20261018.md。

回滚：停止新进程，恢复现场升级前整套 API 源码/锁文件、网页运行器与完整 dist，重新安装原锁文件依赖并恢复原配置。保留数据库新增结构、全部上传、机器人库（含额度/删除标记）、知识额度及审计，不用旧空目录覆盖。升级后已有业务写入，数据库是否回退须按备份时间点评估，不能直接覆盖业务库或 DROP 新表。旧版可能重新露出已废弃功能，回滚后按旧权限限制访问。

本包生成不等于再次部署。现网本轮修复已应用，保留服务器回滚副本；本次仅生成交付。Android 15模拟器覆盖升级通过；微信/安卓各厂商真机全业务未验收，现架构无需生产OpenClaw。


## 2026-10-20：机器人逻辑与统一数据管理（已同步现网）

本轮仅更新8个API实现文件与完整网页构建，不执行SQL、不覆盖.env和上传。代码回滚目录：`/opt/spare-parts/rollback/robot-overview-data-20261020/`，保留原API、web-dist及新文件列表；当前代码与网页哈希清单同目录。清理7个旧部署暂存目录223,157,176字节，123份业务/私有文件清理前后哈希不变，保留当前版本和回滚资料。

仅系统管理员生成/继续/补充注释，管理数据；车间管理员问答按原配额。新总览/批次/对话字段可兼容原记录；回滚不截断记录，不删除新增总览字段。清空分析、删除资料与彻底清理归档属于用户在数据管理内确认的业务操作，不由部署脚本执行。

Codex每日09:00本机快照计划已建立：`tools/sync-codex-usage-server.ps1`，先脱敏采集再SSH校验原子替换，失败保留旧快照；电脑需开机。当前真实接口已核验今天采集时间。网页/App业务刷新生效；原生APK仍android.5、小程序未发布。归档整站包未重打。
