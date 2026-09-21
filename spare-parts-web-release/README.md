# 备件管理可视化网页

当前已交付版本为 V1.7.1（2026-09-12），包含本轮体验改善，尚未部署上线。版本、交付与验证状态以仓库根 README 为准。正式部署只阅读对应部署包内说明，下方构建命令仅用于完整源码环境。

这是配套 spare-parts-api 的 Vue 3 工作台，提供备件管理、3D 库位、模型库、设备关系、盘点审批和工程知识等页面；车间人员保留现有功能入口，业务写操作提示权限不足。

本轮完成库存搜索前置、手机卡片、3D 取景、模型分页和知识列表精简。构建成功，71 项本地回归通过；未部署线上，小程序真机验收待完成。详见仓库根 README 与 output/ux-improvements-20260912/改善验证.md。

## 3D 模型资源

- `public/models/categories/`：44个分类GLB示意模型（4个原有 + 40个2026-09-05新增），每个新增模型配有AI生成的预览JPG。覆盖轴承、断路器、阀门、传感器、接触器、变频器、继电器、电机、PLC模块等46种备件类型。
- `public/models/reference-20260904/`：7个精细参考GLB模型，每个配有PNG预览图。
- 生成脚本：`tools/generate-category-models.mjs`（原有4个）、`tools/generate-reference-models.mjs`（7个参考）、`tools/generate-extra-category-models.mjs`（40个新增）。
- 汇总目录：`output/all-models/`（categories/ + reference/）。

## 本地构建

```bash
npm ci
npm run build
```

## 服务器运行

网页服务默认只监听 `127.0.0.1:8503`，API 默认连接 `127.0.0.1:3000`。

```bash
npm ci
npm run build
npm prune --omit=dev
pm2 start server.js --name spare-parts-web
pm2 save
```

更新时：

```bash
npm ci
npm run build
pm2 restart spare-parts-web --update-env
```

Nginx 将网页域名代理到 `http://127.0.0.1:8503`。不要开放 8503 公网入站端口。

每次更新必须先成功执行 `npm run build`，不得复用旧版本 `dist`。普通用户只能查询与盘点，管理员才可出入库、审批和管理账号；服务端仍会再次强制校验权限。

网页端与小程序统一使用登录后的Bearer会话令牌，不需要也不应在前端保存额外API Key。
