# 备件管理可视化网页

这是配套 `spare-parts-api` 的 Vue 3 管理网页，包含账号登录、用户/管理员权限、库存总览、低库存预警、出入库、盘点创建、审批、密码修改和账号管理。

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
