# 安卓界面修订 02

## 参考与取舍

参考 Google 官方开源样例的导航、信息密度和层级，不复制其源代码或资源：

- [Now in Android](https://github.com/android/nowinandroid)：清晰的顶层导航与状态分层。
- [Compose Samples / Reply](https://github.com/android/compose-samples/tree/main/Reply)：适合手机的导航和列表密度。
- [Compose Samples / Jetsnack](https://github.com/android/compose-samples/tree/main/Jetsnack)：卡片分组、统一触控区域与间距。

本工程目前使用 Android 原生 Views，并未迁移到 Kotlin / Compose，也没有引入整个样例项目。

## 本轮实现

- 原生工作台首页：浅灰背景、深蓝欢迎卡、紧凑业务卡片；红色作为主要强调色。
- 原生“工作台／常用／我的”底部导航；账号信息、连接设置、刷新和退出按任务分组。
- 原生业务标题栏：返回、页面标题、更多菜单；移除旧版三个默认灰色按钮。
- 状态栏与系统导航栏使用浅底深色内容，并保留系统安全区域与键盘避让。
- 使用 Canvas 绘制统一的线性图标，无远程图标资源。
- Android 独立样式资源适配登录、表单、页面间距与弹窗；不改动线上网站。

## 数据与权限边界

原生首页读取当前 WebView 已登录 `/portal` 页实际渲染的功能名称、入口和账号显示信息。不向原生侧读取登录 token，不新增 JavaScript 原生接口，不推导或扩大权限，不显示编造的库存/待办指标。业务权限仍由既有前端路由及 API 检查。

当前依赖线上 `.workbench .module-card` 等选择器；门户结构变化时应同步维护。读取失败保留现有页面，不阻止用户使用。后续完整原生化宜由 API 明确返回功能目录，并逐页替换业务界面。

## 尚未完成

登录及业务详情仍由 WebView 加载，库存列表、表单、3D 与资料页尚未全面改写为原生页面；本轮不是完整原生 App。扫码、原生定位、下载/导出、离线同步仍未实现。

`PreviewActivity` 仅随 debug 构建提供，用于本地模拟数据的布局检查，无网络请求、真实会话或业务写入；不会出现在正式 release 构建中，也不是启动入口。
