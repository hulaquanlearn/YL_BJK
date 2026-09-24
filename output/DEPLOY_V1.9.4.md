# V1.9.4 完整部署说明（供 OpenClaw / 运维执行）

包名：`spare-parts-v1.9.4-20260924-full.tar.gz`。这是完整运行包，含 API、网页构建、网页运行器、小程序源码和说明文档。小程序本版未改，不需要重新上传。本文是部署指令，**打包方未执行生产部署、数据库迁移或线上数据修改**。

## 发布前核对

1. 确认现场应用根目录、PM2 服务名、Node 版本、反向代理和数据库备份方式与下面示例相符；不同则改用实际路径，不能盲目覆盖。API 依赖要求 Node 22.13+ 或 24+。
2. 核对压缩包外层 SHA256（随包交付的 `SHA256SUMS-V1.9.4.txt` 位于压缩包旁），解压后在包根目录运行 `sha256sum -c SHA256SUMS-V1.9.4.txt`；任何一项失败立即停止。
3. 完成并验证数据库、现有 API 代码及锁文件、网页静态目录、生产 `.env`、上传目录和数据目录备份。保留可回滚点；不要以旧数据库覆盖发布后产生的新记录。
4. 在测试库先验证 `server/sql/migration_work_assessment_20260923.sql` 和 `server/sql/migration_inspection_notice_20260924.sql`。应用启动 `ensureSchema()` 会幂等建表并补兼容列；需要相应数据库权限，或由 DBA 预先执行。检查新增 `work_reviewers`、`inspection_notices`、`inspection_sources`、`inspection_events` 及 `work_photos.task_key`。不要执行 `migration_all.sql`、台账导入或清理脚本。
5. 新增通报原图和审计快照存数据库，纳入备份、容量监控及恢复演练。20 GB 限额仅统计原图，不等于数据库总容量；保留日期不会自动删除数据。

## 更新文件示例

仅在上述核对完成后由现场执行。示例假设解压到 `/tmp/spare-parts-v1.9.4-20260924-full`，应用位于 `/opt/spare-parts`。包中没有生产密钥、台账、用户记录或数据库备份。

```bash
set -euo pipefail
PKG=/tmp/spare-parts-v1.9.4-20260924-full
APP=/opt/spare-parts
test "$(realpath "$APP")" = /opt/spare-parts
test -f "$APP/server/.env"
test -f "$PKG/server/src/routes/inspection-notices.js"
test -f "$PKG/server/src/routes/work.js"
test -f "$PKG/server/sql/migration_work_assessment_20260923.sql"
test -f "$PKG/server/sql/migration_inspection_notice_20260924.sql"
test -f "$PKG/web-dist/index.html"
test -f "$PKG/web-runtime/server.js"
(cd "$PKG" && sha256sum -c SHA256SUMS-V1.9.4.txt)

pm2 stop spare-parts-api
for item in src scripts sql nginx; do
  install -d "$APP/server/$item"
  rsync -a "$PKG/server/$item/" "$APP/server/$item/"
done
cp "$PKG/server/package.json" "$PKG/server/package-lock.json" "$PKG/server/README.md" "$APP/server/"
cp "$PKG/server/.env.example" "$APP/server/.env.example"
(cd "$APP/server" && npm ci --omit=dev)

install -d "$APP/web/.dist-v1.9.4"
rsync -a "$PKG/web-dist/" "$APP/web/.dist-v1.9.4/"
test -f "$APP/web/.dist-v1.9.4/index.html"
cp "$PKG/web-runtime/server.js" "$PKG/web-runtime/package.json" "$PKG/web-runtime/package-lock.json" "$APP/web/"
(cd "$APP/web" && npm ci --omit=dev)
if test -d "$APP/web/dist"; then mv "$APP/web/dist" "$APP/web/.dist-previous-v1.9.4-$(date +%Y%m%d%H%M%S)"; fi
mv "$APP/web/.dist-v1.9.4" "$APP/web/dist"
test -f /opt/spare-parts/web/dist/index.html
pm2 restart spare-parts-api --update-env
pm2 restart spare-parts-web --update-env
```

不要整包覆盖 `/opt/spare-parts`，不要覆盖生产 `.env`、上传/数据目录、数据库或 PM2 配置。网页以 `web-dist/` 为源，整目录切换到 `/opt/spare-parts/web/dist/`。确认运行正常后按现场流程清理临时目录，不清理业务材料或回滚点。

## 上线验收

- `spare-parts-api`、`spare-parts-web` online；`/api/health` 返回 200 且数据库已连接；网页首页和既有备件库存、导入导出、权限操作正常。检查错误日志、Node/Linux 下 `sharp` 图片处理及 `multer` 文件上传。
- 原粮车间管理员可创建通报、追加多张截图、人工编辑和导出带照片的八列 `.xlsx`；非原粮人员不可访问通报和受保护原图。检查重复/交叉截图、裁切与配对、待核对阻止导出、修改后重新确认、合并冲突及失败重试。核对原图没有公开直链。
- 制曲车间组长（车间人员账号）仅填报和查看本人事项；获授权班长仍是车间人员账号，可复核、评分、发布、导出本车间组长考评，却不能配置评分规则、人员或备件写权限；管理员可配置。分别使用正式账号核对，尤其要验证组长不能给自己评分。照片必传事项提交及发布前均应检查证据。
- 手机真机核对组长拍照/相册、长列表操作、通报核对滚动和首屏性能；桌面核对 Excel 在 Excel/WPS 中的照片对应、比例、打印排版。
- AI 业务传输默认关闭。只在确认本机 OpenClaw/视觉模型的外部转发、日志和网络出口符合资料保护要求后，才配置生产 `.env` 的 `AI_CONTEXT_TRANSFER_ENABLED=true`、本机 `OPENCLAW_API_URL`、`OPENCLAW_GATEWAY_TOKEN`、`OPENCLAW_MODEL` 和能识图的 `OPENCLAW_VISION_MODEL`，然后重启 API。没有视觉模型时，通报只可人工整理；不得把合成接口测试当作真实识别成功。
- 检查生产 TLS、数据库最小权限、备份加密与恢复；对截图材料确定到期处置流程。考评的夜班跨日、调休、请假、代班和停产日应填规则须由业务负责人确认，不能直接把自然日当作应履职日期。

## 回滚

如验收失败，恢复部署前 API 文件、锁文件及旧网页静态目录，按旧锁文件重装依赖并重启。新增数据库表及发布后形成的通报/考评记录必须保留，不得删表或用旧库覆盖。排查时保留日志、备份与回滚目录。本包的本地证据和未完成事项详见 `QA_V1.9.4.md`、`docs/LOCAL_AUDIT_REMEDIATION_20260924.md`。
