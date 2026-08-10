# 备件管理 API 部署

目标服务器：`49.234.185.199`，项目目录：`/opt/spare-parts/server`。

服务器已经存在 `spare_parts` 数据库及正式数据。不要运行整库建表、不要重新导入 Excel、不要删除或覆盖现有表。

## 数据库兼容方式

API 直接使用服务器现有结构：

- `parts`：物料主数据；新台账上线后启用536个物料编码
- `inventory`：库存与存放位置；新台账上线后启用536条
- `warehouses`：货区字典
- `categories`：品牌分类

首次部署或本次更新后执行增量迁移（脚本可安全重复执行）：

```bash
cd /opt/spare-parts/server
mysql -u spareparts -p spare_parts < sql/migration_all.sql
```

总迁移入口按顺序执行盘点、运营、3D货架及四层布局修正，所有子脚本均可安全重复执行：

1. 为 `inventory` 增加三个盘点时间字段（字段不存在时才添加）。
2. 新建 `inventory_orders` 盘点单表（表不存在时才创建）。
3. 新建 `inventory_order_items` 盘点明细与库存快照表（表不存在时才创建）。
4. 新建 `app_users` 账号表和 `app_sessions` 登录会话表（表不存在时才创建）。
5. 增加最高储备、订购点、备件类型、用途、自由位置和数据启停字段。
6. 新建 `spare_parts_import_runs` 导入审计表。
7. 新建 `stock_movements` 出入库与盘点差异流水表。
8. 新建供应商、采购、设备与设备备件关系表，并补齐结构化流水字段。
9. 新建3D货架布局与审计表，最后统一修正为现场四层货架布局。

脚本不包含 `DROP` 或 `TRUNCATE`，不更改现有唯一索引，不删除业务数据。执行前仍应先备份数据库。

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

- 普通用户：查询备件、库存统计、AI咨询、库位导览和提交盘点。
- 管理员：拥有普通用户权限，并可新增/删除备件、出入库、盘点审批和账号管理。
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

创建成功后必须立即从 `.env` 删除 `BOOTSTRAP_ADMIN_PASSWORD` 并重启 API。后续普通账号和管理员账号统一在小程序“账号设置 → 账号管理”中创建，不要重复运行初始化脚本。

## OpenClaw

`POST /api/ai/chat` 在调用 OpenClaw 前会先做话题白名单校验。只允许简单问候，以及原粮车间设备维修、保养、巡检、故障处理、备件和库存管理相关问题；股票、天气、旅游、娱乐等无关问题会由 API 直接拒绝，不会转发给 OpenClaw。服务端系统提示词还会再次限制回答范围，形成两层防护。

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

## 离线知识库快照

Dify不再调用本服务的HTTP接口。需要更新内网知识库时，由服务器从正式MySQL生成Markdown快照：

```bash
cd /opt/spare-parts/server
npm run export:knowledge -- --output=/opt/spare-parts/output/spare-parts-knowledge.md
```

生成文件只包含启用中的备件和库位，并预计算备件类型、货区分类及缺料补货清单。将该Markdown人工导入内网Dify知识库即可；API服务不保存Dify令牌，也不提供任何Dify HTTP接口。

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

除 `/api/health` 和 `/api/auth/login` 外，其他接口必须在无令牌时返回401。登录后使用 `Authorization: Bearer <token>` 验证查询；普通用户调用新增、删除、出入库、审批和账号管理接口必须返回403，管理员调用才允许继续。

确认新明细表已就绪：

```bash
mysql -u spareparts -p -D spare_parts -e 'SHOW CREATE TABLE inventory_order_items\G'
```

验证查询返回数据后，再测试新增、出入库、盘点和审批。不要直接在正式库中测试删除接口。
