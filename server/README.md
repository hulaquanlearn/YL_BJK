# 备件管理 API 部署

## V1.7.0 升级优先说明

以部署包根目录 `DEPLOY_V1.7.0.md` 为准；本节优先于下方历史首次部署说明。从 V1.5.0 / V1.6.0 升级无需新增 SQL；V1.4.1 需补 migration_v1_5_0.sql，V1.4.0 先补 migration_v1_4_1.sql 再补 migration_v1_5_0.sql。不得重放已应用迁移、旧布局或历史业务数据。先备份并停止 API，升级前后端后再启动。

V1.7.0：车间人员可见操作入口但写入仍返回403；GET /api/users 和 /roles 可读，账号列表仅返回基本字段。业务资源与数据不公开、不缓存；按账号及 IP 限流，默认禁止 AI 业务内容外传。Nginx 必须覆盖 X-Forwarded-For，API 和 web 均仅监听127.0.0.1。包内附完整部署与验证步骤。

V1.6.0 新增 POST /api/part-category-model-matches/preview 与 /apply：前者生成当前物料的候选预览，后者每批最多 500 条，锁定并重新验证权限、匹配快照和模型文件后写入类别关联。已有人工关联不覆盖。查看范围沿用全部车间，车间管理员只能变更本车间独占物料，只读账号不能使用该编辑流程。模型文件默认从相邻 web/dist 读取；非标准部署可将 MODEL_ASSETS_DIR 配置为含 models/ 子目录的静态根目录。

完整 Office 阅读需要 LibreOffice、Poppler、Tesseract 与 Bubblewrap，运行 `node scripts/check-document-service.js --require-full` 检查。缺依赖时是明确标注的兼容降级，不代表原件完整还原。文档原件继续鉴权读取；备件图片、上传模型及包内 models 也须经 API 鉴权读取，禁止使用 Nginx 静态 alias 绕过。完整能力与限制见包内 `docs/DOCUMENT_PREVIEW_V1.4.0.md`。

目标服务器：`49.234.185.199`，项目目录：`/opt/spare-parts/server`。

服务器已经存在 `spare_parts` 数据库及正式数据。不要运行整库建表、不要重新导入 Excel、不要删除或覆盖现有表。

## 数据库兼容方式

API 直接使用服务器现有结构：

- `parts`：物料主数据；新台账上线后启用536个物料编码
- `inventory`：库存与存放位置；新台账上线后启用536条
- `warehouses`：货区字典
- `categories`：品牌分类

以下总迁移只供从更早版本迁入的历史部署核对参考，不用于 V1.3.2 → V1.4.0 常规升级。先确认旧迁移历史及备份，不因脚本名含 all 就直接重跑：

```bash
cd /opt/spare-parts/server
mysql -u spareparts -p spare_parts < sql/migration_all.sql
```

总迁移入口按顺序执行盘点、运营、3D货架、四层布局修正、工程知识、程序分析及多车间权限迁移，所有子脚本均按增量方式执行：

1. 为 `inventory` 增加三个盘点时间字段（字段不存在时才添加）。
2. 新建 `inventory_orders` 盘点单表（表不存在时才创建）。
3. 新建 `inventory_order_items` 盘点明细与库存快照表（表不存在时才创建）。
4. 新建 `app_users` 账号表和 `app_sessions` 登录会话表（表不存在时才创建）。
5. 增加最高储备、订购点、备件类型、用途、自由位置和数据启停字段。
6. 新建 `spare_parts_import_runs` 导入审计表。
7. 新建 `stock_movements` 出入库与盘点差异流水表。
8. 新建设备与设备备件关系表，并补齐结构化流水字段；旧版采购、供应商表在末尾清理迁移中移除。
9. 新建3D货架布局与审计表，最后统一修正为现场四层货架布局。
10. 增加原粮、制曲、酿酒车间归属字段，并把存量数据回填为原粮车间。
11. 将账号角色扩展为 `admin/raw_grain/qu_making/brewing/viewer`，车间账号跨库可见、写入隔离。

除最后的废弃功能清理脚本外，其余迁移不删除业务数据。`migration_remove_procurement_suppliers_20260829.sql` 会永久删除已停用的采购、供应商及关联历史，并把旧“在途”数量归零；执行前必须备份数据库。

## 盘点一致性

- 提交盘点单时只创建“待审批”记录，不写 `last_inventory_*`。
- 服务端保存每条库存的提交时快照，同一库存行不能同时进入两张待审批盘点单。
- 有待审批盘点时，对应库存行禁止出入库和删除。
- 审批通过前会再次校验库存快照；库存被其他途径改动时拒绝覆盖。
- 审批通过后才写入盘点完成标记；驳回后可重新盘点。
- 盘点差异导致库存变化时，服务端同步写入库存流水，记录审批人、盘点单号和调整前后数量。

## 库存流水与停用

- 管理员出入库必须填写原因；服务端在同一事务中更新库存并写入 `stock_movements`。
- `GET /api/parts/:id/movements` 返回最近库存流水，普通用户可查看、不能修改。
- 删除接口已改为逻辑停用：只将 `inventory.active`（以及无其他启用库位时的 `parts.active`）设为0，不物理删除历史数据。
- `PATCH /api/parts/:id` 用于维护备件与所在车间库存配置，不直接修改库存数量；车间账号只能修改所属车间，总管理员可修改全部车间。共用物料的全局主信息仅总管理员可改，车间账号仍可维护本车间单位、库位、安全库存、最高储备和单价。
- `DELETE /api/parts/:id` 在库存不为0、存在待审批盘点或仍关联设备型号时返回409及具体原因；通过后仅逻辑停用，库存流水不会删除。
- 库存不为0或存在待审批盘点单时仍禁止停用。

## 统计口径

- `GET /api/stats` 在服务端聚合统计，库存数量按单位分组返回。
- “个、套、台、米”等单位不得直接相加；首页显示库存记录数，不再把混合单位总和作为核心指标。
- 只有设置了订购点的记录才参与低库存判断。

## 新版原粮车间台账

`data/original-workshop-spare-parts.v2.json`由新Excel规范化生成，共536条、536个唯一编码、总库存4894。运行：

```bash
npm run import:new-data:check
npm run import:new-data
```

第一条命令只读预检；第二条使用事务导入并在提交前核对记录数、唯一编码数和总库存。旧台账中未出现在新文件的记录只会停用留档，不会删除。存在待审批盘点单时导入会拒绝执行。

401条标准货架位置保存货架/方位/层数/货位；135条“六车间、破曲楼、备件库地面”等位置使用`location_type=free_text`和`location_note`保存，避免强行转成错误数字库位。

## 多货区库存

`POST /api/parts` 在物料编码已存在时会复用 `parts` 主数据，并按完整位置检查重复；界面同时支持标准货架库位和自由位置说明。

网页批量导入还会执行货位唯一性预检：同一 Excel 内重复使用六位库位码，或新物料占用其他现有物料的库位，都会返回具体行号并拒绝整批写入。原物料使用相同物料编码和相同库位进行更新不视为冲突。存在错误时可调用 `POST /api/parts/import-error-report` 下载保留全部原始行、并追加“校验结果、错误原因、修改建议”的修正台账。

## 环境变量

```bash
cp .env.example .env
chmod 600 .env
```

填写服务器现有数据库密码：

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=spare_parts
DB_USER=spareparts
DB_PASSWORD=服务器现有密码
DB_CHARSET=utf8mb4
```

MySQL 与后端在同一台服务器，不需要数据库 SSL，也不要开放 3306 到公网。

## 登录与权限

- `viewer`：可以查询全部车间的备件、库存统计、库位、知识和程序资料，不能修改。
- `raw_grain`、`qu_making`、`brewing`：可以查看全部车间，只能修改所属车间的备件、库存、盘点、货架和知识资料。
- `admin`：拥有全部车间最高权限，并负责盘点审批、知识彻底删除和角色管理。
- 网页不再提供账号管理板块；账号创建、删除、密码重置和角色调整统一通过独立 Windows 账号管理器完成。
- 密码使用 Node.js 内置 `crypto.scrypt` 加盐哈希，数据库不保存明文。
- 登录令牌为32字节随机值，数据库只保存 SHA-256 哈希；默认8小时过期。

环境变量：

```dotenv
SESSION_HOURS=8
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
BOOTSTRAP_ADMIN_PASSWORD=仅首次创建时临时填写
```

首次迁移完成后创建管理员：

```bash
npm run create-admin
```

创建成功后必须立即从 `.env` 删除 `BOOTSTRAP_ADMIN_PASSWORD` 并重启 API。后续账号统一通过独立账号管理器创建和分配角色，不要重复运行初始化脚本。

## OpenClaw

`POST /api/ai/chat` 在调用 OpenClaw 前会先做话题白名单校验。只允许简单问候，以及各车间设备维修、保养、巡检、故障处理、工程资料、备件和库存管理相关问题；股票、天气、旅游、娱乐等无关问题会由 API 直接拒绝，不会转发给 OpenClaw。每次提问会先从工程知识、备件库存和设备型号关系中检索证据，再把有限证据交给 OpenClaw；没有直接依据时必须明确说明，不能编造参数、库存或故障结论。服务端系统提示词还会再次限制回答范围，形成两层防护。

在 OpenClaw 配置中启用 Chat Completions：

```json5
{
  gateway: {
    http: {
      endpoints: {
        chatCompletions: { enabled: true }
      }
    }
  }
}
```

API 服务环境变量：

```dotenv
OPENCLAW_API_URL=http://127.0.0.1:14504/v1/chat/completions
OPENCLAW_GATEWAY_TOKEN=网关令牌
OPENCLAW_MODEL=openclaw/spare-parts-chat
```

不要把小程序连接到具备服务器操作权限的 `openclaw/main`。必须创建独立的 `spare-parts-chat` Agent，并为它设置 `tools.profile: "minimal"`、`skills: []` 和 `tools.elevated.enabled: false`。`minimal` 配置只保留只读的会话状态能力，不提供命令执行、进程、文件读写、浏览器、消息发送或子 Agent 工具。API 请求还会固定发送 `tool_choice: "none"`，作为第二层限制。

可以先创建专用 Agent：

```bash
openclaw agents add spare-parts-chat \
  --workspace ~/.openclaw/workspace-spare-parts-chat \
  --non-interactive
openclaw config get agents.list --json
```

随后在 `agents.list` 中找到 `id` 为 `spare-parts-chat` 的准确数组下标，只修改该项（不要修改 `main`）：

```bash
openclaw config set 'agents.list[准确下标].tools.profile' minimal
openclaw config set 'agents.list[准确下标].tools.elevated.enabled' false
openclaw config set 'agents.list[准确下标].skills' '[]' --strict-json
openclaw config validate
openclaw gateway restart
```

在 OpenClaw Control UI 的 `/agents` → `spare-parts-chat` → Tools → “Available Right Now” 中确认没有 `exec`、`process`、`read`、`write`、`edit`、`apply_patch`、`browser`、`web`、`message` 或 `sessions_spawn`。如果出现任意一项，不得上线小程序对话接口。

14504 端口只能监听本机或私有网络，禁止开放公网。

按 OpenClaw 官方配置，`gateway.bind` 应使用模式名 `loopback`，不要填写 `127.0.0.1`：

```bash
openclaw config get gateway.bind
openclaw config set gateway.bind loopback
openclaw gateway restart
ss -lntp | grep ':14504'
```

最后一条必须显示 `127.0.0.1:14504`，不能再显示 `0.0.0.0:14504`。如果仍监听全部网卡，运行 `openclaw gateway status` 检查服务启动参数；命令行 `--bind` 的优先级高于配置文件，应移除 `--bind lan` 或其他非本机绑定覆盖。同时从腾讯云安全组删除 14504 的公网入站规则。

官方参考：[OpenClaw Gateway 配置](https://docs.openclaw.ai/gateway/configuration-reference)。

## 智能工程中心附件与程序解析

智能工程中心与备件管理共用统一账号。车间角色只能向所属车间上传资料；总管理员可彻底删除任意知识，其他可编辑账号只能删除自己创建或上传的知识，其余知识只能查看。知识删除不是“下架”，删除后数据库记录和对应物理文件均不保留。

允许上传的 PDF、Word、Excel、PowerPoint、文本和常用图片均支持登录后的站内阅读。`.docx/.xlsx/.pptx` 生成带基础版式的安全 HTML；旧版 `.doc/.xls/.ppt` 采用文字或表格优先的兼容预览，复杂动画、宏和精确排版不会执行。上传时会抽取 Office 文本写入知识检索字段，浏览器误解码的中文文件名会在页面与下载响应中修复。

## 设备型号与备件关系

- 页面和接口只按“车间 + 设备型号”维护常用备件，不要求用户输入具体设备编码；数据库内部编码由服务端自动生成，仅用于兼容旧表唯一约束，不对用户展示。
- 统一模板列为 `设备型号、物料编码、单台用量、所属工段、备注`。设备型号必填，物料编码选填；仅填写型号会创建型号，填写物料编码时同时建立关系。
- 导入先调用 `/api/equipment/import-preview` 整批校验，存在任一问题时不写入；`/api/equipment/import-error-report` 返回带错误原因和修改建议的修正台账。
- 型号详情支持手工关联和解除备件关系。所有账号可查看；总管理员可修改全部车间，车间账号只能修改所属车间。

生产环境必须配置持久化附件目录：

```env
KNOWLEDGE_UPLOAD_DIR=/opt/spare-parts/uploads/fermentation-knowledge
KNOWLEDGE_MAX_FILE_SIZE=524288000
PLC_UPLOAD_DIR=/opt/spare-parts/data/plc-programs
PLC_MAX_FILE_SIZE=52428800
PLC_AGENT_TOKEN=使用 openssl rand -hex 32 生成
```

首次部署前创建目录并授权给API运行用户：

```bash
mkdir -p /opt/spare-parts/uploads/fermentation-knowledge
chown -R $(id -un):$(id -gn) /opt/spare-parts/uploads
chmod 750 /opt/spare-parts/uploads/fermentation-knowledge
mkdir -p /opt/spare-parts/data/plc-programs
chown -R $(id -un):$(id -gn) /opt/spare-parts/data/plc-programs
chmod 750 /opt/spare-parts/data/plc-programs
```

附件目录不在网页静态目录中，也不应提交Git。服务器备份时需要将该目录和MySQL中的`fermentation_knowledge_entries`表一起备份，否则附件和条目会失去对应关系。

程序文件目录同样不得放入网页静态目录或Git。备份时需同时备份 `PLC_UPLOAD_DIR` 和 `plc_projects`、`plc_project_files`、`plc_program_items`、`plc_analysis_runs` 四张表。AI请求固定使用 `tool_choice: none`，只发送当前项目检索出的程序证据；服务端不提供PLC或机器人在线连接、下载、强制或写入接口。

TIA 自动解析需在 V17 实机和 V16 虚拟机分别运行 `tools/tia-openness-exporter/Start-ProgramAnalysisAgent.ps1`。两个节点使用与服务器一致的 `PLC_AGENT_TOKEN`，只主动访问网站 HTTPS，不开放入站端口。ABB RAPID 文件由服务器静态解析，不需要安装 RobotStudio。

## 离线知识库快照

Dify不再调用本服务的HTTP接口。需要更新内网知识库时，由服务器从正式MySQL生成Markdown快照：

```bash
cd /opt/spare-parts/server
npm run export:knowledge -- --output=/opt/spare-parts/output/spare-parts-knowledge.md
```

生成文件只包含启用中的备件和库位，并预计算备件类型、货区分类及缺料补货清单。将该Markdown人工导入内网Dify知识库即可；API服务不保存Dify令牌，也不提供任何Dify HTTP接口。

## 备件与类别模型

- `parts.model_url` 是保留供回滚的历史字段，当前 API 不再启用专用模型；`parts.category_model_id` 关联可复用的 `part_category_models`。
- 执行 `sql/migration_part_category_models_20260831.sql` 后，四个初始类别模型会登记到数据库，并为现有常见备件完成首次关联。
- `/api/parts/batch-model` 和 `/api/parts/batch-category-model` 会逐个校验备件所属车间，单次最多处理500个备件。
- `/api/part-category-models` 的查询对登录账号开放；新增、修改、替换和删除只允许 `admin`。
- 用户上传的类别模型保存在 `PART_MODELS_UPLOAD_DIR`（生产建议 `/opt/spare-parts/uploads/part-models`），必须与数据库一起备份；部署包不携带该目录。
- 2026-09-05新增40个程序化生成的分类GLB模型（`tools/generate-extra-category-models.mjs`），覆盖接触器、变频器、继电器、软启动器、皮带轮、联轴器、编码器、电机、PLC模块、仪表、制动电阻、辅助触头、开关按钮、接线箱、链条、气缸、刮板、软连接、滤网、紧定套、网络交换机、气动元件、RGV部件、齿轮链轮、料位计、密封件、管接头、离合器、电缆、制动器、电源、条码扫描器、风机、电动缸、5G CPE、熔断器、消声器、HMI触摸屏、控制板、减速机。每个模型配有AI生成的真实感预览JPG。连同原有4个分类模型和7个参考模型共51个GLB覆盖46种备件类型。全部汇总在 `output/all-models/` 目录，可通过API手动上传或部署时放入 `public/models/categories/`。

## 安装与 PM2

```bash
cd /opt/spare-parts/server
npm ci --omit=dev
pm2 start src/app.js --name spare-parts-api
pm2 save
```

更新代码后：

```bash
pm2 restart spare-parts-api --update-env
pm2 logs spare-parts-api --lines 100
```

重启前应先运行增量迁移、创建首个管理员（仅首次）并测试：

```bash
mysql -u spareparts -p spare_parts < sql/migration_all.sql
npm test
```

服务只监听 `127.0.0.1:3000`，由现有 Nginx 将 `https://czsdsg.cn/api/` 反向代理到 `http://127.0.0.1:3000/api/`。

## 正式域名与微信发布

1. 等待 `czsdsg.cn` 备案审核完成，不能只凭“已提交备案”发布。
2. 为域名安装有效的受信任 HTTPS 证书，80端口强制跳转443，启用 TLS 1.2/1.3。
3. Nginx 将 `https://czsdsg.cn/api/` 代理到 `http://127.0.0.1:3000/api/`，不要公开3000端口。
4. 微信公众平台“开发管理 → 开发设置 → 服务器域名”中，把 `https://czsdsg.cn` 加入 `request合法域名`。平台填写域名，不带 `/api` 路径。
5. 小程序已启用域名与HTTPS校验，正式代码不再使用服务器IP。

## 验证

```bash
curl http://127.0.0.1:3000/api/health
curl https://czsdsg.cn/api/health
```

除 `/api/health` 和 `/api/auth/login` 外，其他接口必须在无令牌时返回401。登录后使用 `Authorization: Bearer <token>` 验证查询；`viewer` 调用新增、编辑、删除、出入库、审批和账号管理接口必须返回403；车间账号只能修改所属车间，总管理员可修改全部车间并负责审批和账号管理。

确认新明细表已就绪：

```bash
mysql -u spareparts -p -D spare_parts -e 'SHOW CREATE TABLE inventory_order_items\G'
```

验证查询返回数据后，再测试新增、出入库、盘点和审批。不要直接在正式库中测试删除接口。

V1.5.0 角色列表：管理员访问 GET /api/users/roles。viewer 显示“车间人员（只读）”。只读角色即使是知识原作者，也不能修订或删除；问答查询仍可使用。程序解析助手协议 2 支持续租、释放和租约令牌校验，旧助手须升级。
