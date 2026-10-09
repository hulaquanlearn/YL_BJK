# V1.9.10 部署说明（2026-10-09）

部署包：`spare-parts-v1.9.10-20261009-full-work-center.tar.gz`。同时升级 API 与网页，小程序使用本包源码重新编译、上传发布。

## 变更与迁移

- PLC / Siemens TIA 与 ABB RAPID 程序分析暂时停用，旧网页入口转到工程知识，`/api/plc` 和 `/api/program-agent` 返回 410。停止现场原有 Windows 解析代理进程及其自行配置的开机启动任务。保留历史程序表、资料和配置，不删除业务数据。
- 备件模型库采用独立编号目录：193 项名称，182 项外观示意，11 项名称不明确，保留待生成状态。示意模型不代表厂家尺寸。
- 必须把 `server/data/ledger-model-catalog.json` 安装到 API 的同一路径。API 启动时通过 ensureSchema 增量检查，创建 `part_models`、`model_catalog_versions`，补充 `parts.bound_model_id`，按目录版本首次初始化模型。后续启动不覆盖人工修改或已保存绑定。旧类别模型与历史字段保留，新名称绑定通过页面明确操作或导入。
- 本包不带库存台账、生产配置、用户上传、数据库备份或解析代理安装工具。不要批量运行历史 SQL、schema.sql、台账导入或模型自动关联脚本。

## 本次合并新增

- 工作中心包含考勤核查和资料管理。启动 ensureSchema 会加载 `server/sql/migration_attendance_storage_20261009.sql`，创建 attendance_reports、attendance_sources、attendance_notes、work_storage_audit，并补充工作照片/任务附件时间字段。考勤原件保存在数据库中；本包不含人员考勤或排班文件。
- 考勤仅 admin/raw_grain 可用，资料管理仅 admin 可用。清理必须在管理页面预览、确认；升级不会自动清理业务资料。详见 `docs/ATTENDANCE_REVIEW_20261009.md`。
- 新增货区接口及页面选择器，新增备件联动选择货架和层数。新增、导入及绑定模板同步更新；保留既有台账字段。
- 补充版本 missing-five-20261009-v1 新建 5 个模型，按物料编码 502005240、502006637、505024987、505026166、505026171，仅对仍未绑定的有效备件首次补充绑定；不会覆盖人工绑定，后续启动不会重新绑定。补充模型为外观示意，电气件接口和尺寸尚待实物核对。

## 升级前

1. 校验外层 SHA256，再解压并运行包内 `sha256sum -c SHA256SUMS-V1.9.10.txt`。
2. 备份现场数据库、API 与网页目录、现有 `.env`、uploads/data；保留上一版回滚包。
3. 先在生产数据库的测试副本验证启动迁移、模型目录首次初始化和再次启动、管理员与车间权限、既有库存/库位/价格及工作成绩。当前本机缺少可用 MySQL 账号配置，尚未完成真实数据库迁移验收。
4. 采用兼容依赖要求的 Node.js 版本（API 声明 `^22.13.0 || >=24.0.0`）；运行完整文档预览还需对应外部工具，见 `docs/DOCUMENT_PREVIEW_V1.4.0.md`。保留原有 AI 配置和数据外传策略。

## 文件更新示例

下列步骤由现场在备份与测试库检查通过后执行。目录、PM2 名称沿用既有部署，API 端口以现场配置为准。

```bash
set -euo pipefail
PKG=/tmp/spare-parts-v1.9.10-20261009-full-work-center
APP=/opt/spare-parts
test "$(realpath "$APP")" = /opt/spare-parts
test -f "$APP/server/.env"
test -f "$PKG/server/data/ledger-model-catalog.json"
test -f "$PKG/web-dist/index.html"
(cd "$PKG" && sha256sum -c SHA256SUMS-V1.9.10.txt)

pm2 stop spare-parts-api
for item in src scripts sql nginx; do
  install -d "$APP/server/$item"
  rsync -a "$PKG/server/$item/" "$APP/server/$item/"
done
# 仅安装运行时模型目录，保留现场 data 中的其他文件。
install -d "$APP/server/data"
cp "$PKG/server/data/ledger-model-catalog.json" "$APP/server/data/ledger-model-catalog.json"
cp "$PKG/server/package.json" "$PKG/server/package-lock.json" "$PKG/server/README.md" "$APP/server/"
cp "$PKG/server/.env.example" "$APP/server/.env.example"
(cd "$APP/server" && npm ci --omit=dev)

test ! -e "$APP/web/.dist-v1.9.10"
install -d "$APP/web/.dist-v1.9.10"
rsync -a "$PKG/web-dist/" "$APP/web/.dist-v1.9.10/"
test -f "$APP/web/.dist-v1.9.10/index.html"
cp "$PKG/web-runtime/server.js" "$PKG/web-runtime/package.json" "$PKG/web-runtime/package-lock.json" "$APP/web/"
(cd "$APP/web" && npm ci --omit=dev)
pm2 stop spare-parts-web
if test -d "$APP/web/dist"; then mv "$APP/web/dist" "$APP/web/.dist-previous-v1.9.10-$(date +%Y%m%d%H%M%S)"; fi
mv "$APP/web/.dist-v1.9.10" "$APP/web/dist"
test -f /opt/spare-parts/web/dist/index.html
pm2 restart spare-parts-api --update-env
pm2 restart spare-parts-web --update-env
pm2 logs spare-parts-api --lines 50 --nostream
```

网页运行器把 `/models` 和上传资源代理给鉴权 API；禁止用 Nginx 静态 alias 绕过权限。API 必须能读取更新后的网页 models（默认相邻 `web/dist`，自定义部署使用 MODEL_ASSETS_DIR）。使用 PM2 restart 即可，无需修改原有端口或进程配置。

## 上线检查与回滚

- 确认 `/api/health` 的数据库状态正常，旧分析 API 返回 410；网页无程序分析入口，旧书签进入工程知识。
- 管理员与普通账号分别检查模型列表、手动绑定/解除、模型名称 Excel 校验导入、跨车间拒绝，以及既有库存/价格/库位未变化。
- 检查考勤权限、排班/考勤导入校验、跨日班次、证据、备注与导出；管理员资料管理先预览，不以测试方式删除生产资料。核对新增货区、库位联动、5 个补充模型及已有绑定保留。
- 核对盘点分页、3D 库位、在线文档绑定、工作填报/考评与检查通报。小程序完成微信开发者工具和真机验收后上传发布。
- 失败时停止新进程，恢复升级前 API/网页目录及锁文件，重新安装原依赖后启动。保留新增表/列；若涉及业务写入后的数据库恢复，由现场按备份时间点核对，避免丢失升级后业务。不要直接删除新增表或覆盖业务库。

本次交付不包含生产部署操作；本地回归、合成浏览器检查和依赖审计不能替代现场数据库与真机验收。
