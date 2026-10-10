# V1.9.10 部署说明（2026-10-10）

部署包：`spare-parts-v1.9.10-20261010-full-model-cards.tar.gz`，替代先前 full-audit-fix、full-work-center 和 full-pending-models 包。同时升级 API 与网页，小程序使用本包源码重新编译、上传发布。

## 本轮排查修复

- 3D 备件正面统一朝向默认观察方向，抵消货架旋转；手动旋转视角可查看侧面和背面。
- 修复快速切换车间时旧布局、货区和货架选项覆盖当前范围，清除定位后旧详情重新选中备件，以及连续定位时旧请求重新打开详情。
- 3D 备件列表按稳定顺序收集完整分页，重复或不完整分页明确报错，避免重复模型被误判为完整列表；连续点击盘点单仅保留最后请求的详情。
- 库存概况改为紧凑指标卡和独立分单位数量区；详情标题直接展示绑定名称与 ID，绑定按钮移到底部；库存列表常规操作改为钢蓝。
- 补齐原目录 11 个待生成模型的通用示意资源，保留名称、ID 和备件绑定。131 个按编码细分的示意模型只加入可选目录，不自动改绑；5 个 missing-five 补充模型和工作中心功能保留。
- 后端 296/296、网页 121/121 和生产构建通过；本轮 1440px/390px 卡片、模型详情与绑定入口合成浏览器检查通过。此前小程序、模型工具、库房/入口/班组/检查通报与生产依赖审计通过。真实 MySQL 与微信真机仍需现场验收。

## 变更与迁移

- PLC / Siemens TIA 与 ABB RAPID 程序分析暂时停用，旧网页入口转到工程知识，`/api/plc` 和 `/api/program-agent` 返回 410。停止现场原有 Windows 解析代理进程及其自行配置的开机启动任务。保留历史程序表、资料和配置，不删除业务数据。
- 备件模型库原 193 项名称和 ID 保留，全部具备通用外观示意；台账“模型名称”与模型库准确名称匹配，保存对应 ID。通用模型不代表具体型号的厂家尺寸或安装外形。
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
PKG=/tmp/spare-parts-v1.9.10-20261010-full-model-cards
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

## 名称模型资源补齐与既有绑定

同步安装 server/src/model-catalog-schema.js、server/data/ledger-model-catalog.json 和本包全部 web-dist/models 资源，然后重启 API。named-model-assets-20261009-v1 使用独立批次，已装过其他补充批次的环境仍会执行：按准确模型名称，仅填充启用的内置空模型 URL、说明与质量，不改名称、ID、备件绑定、库存或库位；人工上传资源和自定义模型保留。

截图中的 505018953、505019300 如仍绑定“带座外球面轴承”（ID 86），重启后使用其补齐资源，不需要按编码新建绑定。若现场已更名、停用或手工绑定其他模型，本包不强制恢复；通过模型名称导入或页面明确更换。

pending-ledger-20261009-v1 的 131 项仅保留为可选细分模型，新安装取消按编码自动改绑。已执行旧包自动关联的环境保留已保存绑定，不自动撤销，以免覆盖后续人工选择；如需恢复台账对应关系，校验并导入准确“模型名称”。本包不带原始台账，所有示意资源未核实厂家尺寸。
