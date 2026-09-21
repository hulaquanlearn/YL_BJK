# V1.8.0 部署说明

## 本次更新范围与验收边界

- 包含此前尚未打包的程序智能分析修复，以及仓库轻量模型、详情按需精细模型、品牌和完整型号防错配规则。
- 新增5款尺寸参考模型（两款明纬电源、三款SKF轴承），每款含轻量和精细GLB。其余537条尚未完成资料研究与建模，不能按全库完成验收。详见 `docs/OPENCLAW_MODEL_MATCHING.md`。
- 从V1.7.4升级无需数据库结构迁移，不要执行批量关联或重置SQL。新模型通过网页规则匹配，不修改生产备件关联。
- 必须完整更新网页脚本及 `web-dist/models/`，新增资源位于 `models/evidence/`；不能只替换首页HTML。
- 模型下载继续使用已有登录保护，不开放匿名访问。不要为OpenClaw开启公网端口或取消数据保护。此前OpenClaw调用超时未解决，本包不保证AI服务恢复。
- 清单、厂家PDF缓存、账号配置和业务数据不在包内。源码侧排查/生成工具不属于服务器运行依赖。


本包完成本地修改和验证，尚未部署。部署说明、使用说明、验收记录均在包内；README 与源码同步。适用起点为 V1.5.0 / V1.6.0 / V1.7.0 / V1.7.1 / V1.7.2 / V1.7.3 / V1.7.4，本版无需结构迁移；已确认的GV2错误关联另有定向数据修复，见下文。V1.4.1 需先执行已有 migration_v1_5_0.sql；V1.4.0 需先补 migration_v1_4_1.sql，再补 migration_v1_5_0.sql。更早版本先按既有升级记录核对，禁止向业务库执行 schema.sql、migration_all.sql 或重复布局迁移。

## 1. 备份和校验

维护窗口先备份 MySQL、现有 API/web、生产 .env 与持久化 uploads/data，保留回滚版本。核对压缩包 SHA256 后解压，再校验包内所有文件：

```bash
tar -xzf spare-parts-v1.8.0-20260920.tar.gz
cd spare-parts-v1.8.0-20260920
sha256sum -c SHA256SUMS-V1.8.0.txt
```

压缩包不含生产配置、业务数据、上传附件、日志、node_modules 或 Git 数据。所有步骤失败即停止。示例根目录为 /opt/spare-parts，请先核对实际路径及 PM2 进程名。

## 2. 更新 API

运行 Node.js 24，或 22 系列的 22.13.0 及以上。

```bash
set -euo pipefail
PKG=/tmp/spare-parts-v1.8.0-20260920
test -f "$PKG/server/package-lock.json"
test -f /opt/spare-parts/server/.env
test "$(realpath /opt/spare-parts/server)" = /opt/spare-parts/server
pm2 stop spare-parts-api
for item in src scripts sql nginx; do
  install -d "/opt/spare-parts/server/$item"
  rsync -a --delete "$PKG/server/$item/" "/opt/spare-parts/server/$item/"
done
cp "$PKG/server/package.json" "$PKG/server/package-lock.json" "$PKG/server/README.md" /opt/spare-parts/server/
cd /opt/spare-parts/server
npm ci --omit=dev
```

从 V1.5.0 / V1.6.0 / V1.7.0 / V1.7.1 / V1.7.2 升级不执行结构迁移SQL（定向GV2修复另按下文核对）；其他版本仅执行升级起点中尚未应用的迁移，数据库名和凭据沿用现场配置。不得在部署时自动清空或批量重置 category_model_id。

## 3. 更新网页

```bash
set -euo pipefail
PKG=/tmp/spare-parts-v1.8.0-20260920
install -d /opt/spare-parts/web/dist
test "$(realpath /opt/spare-parts/web)" = /opt/spare-parts/web
test "$(realpath /opt/spare-parts/web/dist)" = /opt/spare-parts/web/dist
cp "$PKG/web-runtime/server.js" "$PKG/web-runtime/package.json" "$PKG/web-runtime/package-lock.json" /opt/spare-parts/web/
rsync -a --delete "$PKG"/web-dist/ /opt/spare-parts/web/dist/
test -f /opt/spare-parts/web/dist/index.html
test -f /opt/spare-parts/web/dist/models/categories/muffler.jpg
test -f /opt/spare-parts/web/dist/models/categories/motor.glb
test -f /opt/spare-parts/web/dist/models/reference-20260904/manifest.json
cd /opt/spare-parts/web
npm ci --omit=dev
pm2 restart spare-parts-api --update-env
pm2 restart spare-parts-web --update-env
```

前后端必须一起更新。浏览器强制刷新后核对 V1.8.0 页面。模型和图片不存在时必须返回 404，不能返回 HTML 首页。

新匹配接口检查 API 服务器可读的实际模型文件：默认检查相邻 web/dist/models；上传模型沿用 PART_MODELS_UPLOAD_DIR。若静态文件部署在其他目录，在 API 环境配置 MODEL_ASSETS_DIR 为包含 models/ 子目录的静态根目录，确保 API 用户有读取权限。配置错误会列为“资源缺失”，不直接关联。

## 数据保护配置（本次必须核对）

1. 合并包内 server/nginx/czsdsg.cn.conf.example：保留现场证书路径，将 /api/、/uploads/part-images/、/uploads/part-models/、/models/ 全部反向代理到 API；不得配置公开 alias/root。API 和网页只监听127.0.0.1，不要将3000、8503或3306端口开放公网。
2. 入口 Nginx 的 X-Forwarded-For 必须覆盖为 $remote_addr，不能保留客户端自报的来源；API/web只信任loopback代理。如果现场使用CDN或其他反代，先按真实可信IP网段配置 real_ip，再验证来源识别，禁止无条件信任来访头。
3. 修改后执行 nginx -t，通过后 systemctl reload nginx。核查所有其他 location、CDN缓存或静态别名，移除可绕过鉴权的 uploads/models/data/备份目录映射，并清除旧资源公开缓存。未应用代理配置时，不能将源码保护视为线上已生效。
4. 保留 NODE_ENV=production 与 HTTPS；资源专用 Cookie 使用 HttpOnly、Secure、SameSite=Strict，分别限定 /uploads 和 /models。它只用于读取模型/图片；JSON业务接口依然要求Bearer令牌。升级后强制刷新或重新登录，以设置资源会话。
5. AI_CONTEXT_TRANSFER_ENABLED 默认 false，已有网关令牌也不会自动启用业务内容传输。不要直接设置true恢复旧效果；须先核实本机网关使用离线模型、没有云端转发，再由管理员明确开启。本版保护模式保留知识检索与程序证据，回答会注明未经AI生成。
6. MODEL_ASSETS_DIR 非标准部署时设置为包含 models/ 的静态根目录；默认生产位置 /opt/spare-parts/web/dist。API进程需只读访问包内模型，不要把部署根目录、上传目录或备份目录设成静态根目录。
7. 限额：来源IP每分钟1200请求；每个登录账号API每分钟180、每小时2400；模型/图片每账号每分钟600；资料预览/下载每账号每分钟30。超额返回429及Retry-After，日志事件为access_rate_limited。当前计数为进程内存；本例单API进程。多进程/多实例部署前必须使用共享限流存储或在统一网关限制，否则总限额会成倍增加。重启会重置计数。
8. 源站、数据库账号、系统补丁、防火墙、备份加密与恢复由现场部署验收；备份和.env不能进入Web目录。既有账号会话可在停用账号/重置密码后立即撤销；不要在浏览器地址、日志或截图中分享令牌。

上线后使用无登录的新浏览器检查：/api/parts、/api/part-model-library、实际知识下载地址以及 /models/categories/motor.glb 应返回401（或网关拒绝），不能返回业务JSON或文件。使用有效车间人员账号查看模型/图片应正常；账号停用后原链接不能继续读取；写API返回403。配置/.env、/.git/config、备份和源码映射路径不得返回文件。登录后正常业务查看仍须完整验收。

robots.txt和X-Robots-Tag只是拒绝搜索引擎收录；真正的数据保护依靠服务端鉴权、只读边界和限流。限流不能杜绝低速抓取，已获准查看的账号仍可复制内容；本版不作绝不泄露的保证。

## 定向纠正已确认的GV2错误关联

这不是数据库结构迁移。备份parts中该物料的category_model_id、image_url后，先单独运行server/sql/repair_gv2_model_association.sql中的SELECT，确认仍是物料502000333、GV2-ME06C误关联减速电机，再执行完整文件。正常命中应为1条，已人工纠正则0条；不符合时停止检查。脚本只清除该错误关联及同源类别图片，保留独立实物图；没有准确GV2模型时显示未关联，后续补适配模型。回滚时从该行备份恢复关联和图片，不覆盖库存。其他历史错误关联仍需逐项核对，新防误匹配规则不会自动改写既有关联。本次打包未执行生产SQL。

## 4. 模型关联核对

1. 系统管理员进入“备件模型库 → 备件模型关联”，选择车间及物料搜索范围，点击“按关键词匹配”。
2. 核对四组结果：可直接关联、需要核对、未匹配、资源缺失。已有人工关联保持不变，查看范围沿用所有车间；车间管理员仅可修改本车间独占物料。
3. 查看候选 3D 后确认适合的项目，点击“关联所选”。默认选择唯一、无已知形状风险且文件可用的候选；多候选和形状差异必须手动选择。文件存在不等于型号精确相同。
4. 每批最多 500 条，事务锁定后重新核对权限与匹配快照。单批失败不写入该批；跨批失败保留已成功批次，并显示完成数。重新预览后再处理剩余项目。
5. 检查类别关联数、物料参考图和 3D 库位显示。未匹配/资源缺失项目需补充合适模型或修复资源，不能以通用示意认定覆盖完成。

可运行 `node scripts/audit-model-coverage.js` 获取正式库的只读覆盖清单。源码中历史台账报告含业务描述，不在部署包中；历史候选匹配率不是线上覆盖率。本次没有执行正式业务数据关联。

## 5. 上线验收

- 管理员和只读账号登录正常；车间人员可见匹配/修改入口，点击提示权限不足且不提交业务写请求；直接调用写接口返回 403；跨车间共用物料仍只有系统管理员能关联。
- 中文与英文模型按 A–Z 排序，“消声 / xiaosheng / xsq”可搜索消声器；类别管理搜索不会缩减关联下拉选项。
- 已人工关联项目不被覆盖；修改关键词后旧预览提交返回 409；未知候选、缺失文件不能通过接口直接关联。
- 参考图失效可回退，全部失败显示占位；上传实物图优先，回退类别图不误标为实物图。
- 3D 定位卡片显示名称、编码、货架、侧别、层数、货位和可打开的二维码；指定的独立通用模型说明已移除。
- 检查 360/390px 手机页面无整页横向溢出，宽表格在内部滑动；补充真实 iOS、Android、微信浏览器手势与流畅度验收。本次仅完成桌面浏览器尺寸模拟。

V1.5.0 之前的安装还需同步更新 plc-agent/Start-ProgramAnalysisAgent.ps1 为协议 2，保留原 bin/V16、bin/V17 和本机项目；PLC_AGENT_TOKEN 沿用现场配置。V1.5.0 已完成该升级时无需再次操作。本次必须更新包内 miniprogram/ 源码，在微信开发者工具编译、核验车间人员可见与写入提示，并完成真机验收后重新发布。

## 6. 回滚

停止 API，恢复备份的前后端和依赖后重启。从 V1.5.0 / V1.6.0 / V1.7.0 / V1.7.1 / V1.7.2 升级没有新增数据库结构，已确认的类别关联可以继续保留；需要撤回关联时，按部署前导出的具体物料记录由管理员恢复，不清空全部关联或覆盖库存。恢复整个数据库备份前先处理备份后产生的业务写入，避免丢失流水。
