# 原粮车间备件管理系统

项目已从云开发迁移为“微信小程序 + 自建 API + MySQL”。微信开发者工具打开本目录，实际上传内容位于 `miniprogram/`。

## 目录

- `miniprogram/`：微信小程序正式代码与图片资源。
- `server/`：Node.js/MySQL API 服务端源码、迁移脚本和测试。
- `spare-parts-web-release/`：Vue网页管理端源码；发布前必须重新构建 `dist/`。
- `output/`：内网Dify知识库工作流及知识库Markdown生成要求。
- `project.config.json`：微信开发者工具项目配置。

旧 CloudBase 云函数、云开发规则、编辑器配置、根目录 npm 测试工程及临时网页构建目录均已移除。当前版本使用自建账号登录与用户/管理员角色权限。

## 小程序

所有环境统一使用 `https://czsdsg.cn/api`。网站备案和公安备案已完成；微信公众平台仍需保留 `https://czsdsg.cn` 为 request 合法域名。

## 服务端测试

```bash
cd server
npm ci
npm test
```

服务端部署说明见 `server/README.md`。

Dify不再访问公网API。服务器只负责从正式MySQL导出离线知识库Markdown，内网Dify绑定本地知识库后独立运行。
