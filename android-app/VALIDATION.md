# 安卓工程验证

## 当前交付：正式在线更新版 1.9.10-android.5（2026-10-19）

- 正式构建与Lint通过，0 errors、1 warning（既有业务WebView JavaScript）；versionCode=5、minSdk=26、targetSdk=35，仅INTERNET及REQUEST_INSTALL_PACKAGES，无debug标记。正式主APK不包含Instrumentation；隔离测试放在独立测试APK。
- APK SHA256 `40c2fc8c04b90f51da2f138d0d8a62c87a615c9c95dd0b60774b232a7cd8192e`；继续使用备案证书 SHA256 `9791ff38e629e11c29065d4dbf1fab15763a42b36da7937c71748f90c1ad4cc8`。
- Android 15模拟器安装正式android.4后，以相同证书正式android.5覆盖安装成功，原有私有目录测试标记保留。此前2→3→4已实测线上更新下载与系统安装，本轮4→5覆盖使用ADB安装，未冒称手机端完整OTA操作验收。
- 正式APK上的独立Instrumentation以合成账号和.invalid隔离来源完成40项检查：默认不保存、成功后保存、恢复自动填入、失败不覆盖旧值、取消及清除、AES-GCM密文、篡改拒绝、来源隔离、HTTPS来源及响应校验、原生登录到网页会话/原生门户衔接、保留viewer角色、密码不写网页存储、跨来源拒绝写入。
- 另以独立进程写入测试密文、强制结束App后重新启动测试读取及清除，验证Keystore跨进程持久性。无生产账号、真实密码、业务写入或权限变更。真实HTTPS登录页原生界面已检查；各厂商真机及真实账号完整业务仍需实测。
- 当前用户升级后原有登录会话保留；首次保存需退出后勾选“记住密码”并成功登录。当前HTTPS服务器的保存内容可在“我的/更多→密码保存设置”清除。
- 正式APK与清单已SSH发布到独立app-updates目录，发布前保留latest.v4.json及旧APK，先校验APK后原子替换latest.json；未重启API或更改业务数据库。
- 发布后公开HTTPS清单versionCode=5及完整APK下载的SHA256、大小与本地成品一致。模拟器覆盖升级后的原私有测试标记仍存在。独立测试APK卸载清理被自动审批拦截，未执行，测试包未包含在发布物中。

## 历史交付：正式在线更新版 1.9.10-android.4（2026-10-19）

- `assembleRelease`、`lintRelease`通过，0 errors、1 warning（业务WebView所需JavaScript）；发布签名校验通过，仍为备案证书 SHA256 `9791ff38e629e11c29065d4dbf1fab15763a42b36da7937c71748f90c1ad4cc8`。
- 最终APK SHA256 `e1dce72e5b4408c693452d09a3d60b8307c5bc4a159a68b224eb8b9892092da5`。版本/包名/SDK/权限已通过aapt检查，正式包只申请INTERNET和REQUEST_INSTALL_PACKAGES；无debug测试Activity或调试签名。
- 正式更新地址已通过HTTPS发布，清单不缓存；独立APK目录不随网站构建替换。清单中APK大小、SHA256、版本与本地正式包一致。
- Android 15模拟器：先以同发布签名构建带更新功能的低版本测试基线versionCode=2，经正式域名检查/下载/校验，系统授权安装后覆盖到versionCode=3，再手动检查并从正式地址升级到最终versionCode=4。安装器明确成功，dumpsys确认最终versionName；应用私有目录的测试标记仍保留。此为更新机制实测，不代表旧版debug包可与正式签名互相覆盖。
- App复用网页功能和API权限；生产实际普通账号分别以web/android来源请求知识AI，均返回403。该检查不代表所有角色所有业务都已完成真机操作验收。未修改用户账号或密码，临时诊断会话已删除。
- 业务网页通过196项测试，API通过292项测试；使用合成API对1440/390宽度的生产构建验证问题显示、追问历史、刷新恢复、每轮引用、新对话和无横向溢出，均通过。AGVEKK检索及追问在真实MySQL/DeepSeek通道中均命中知识#36。
- 小程序本轮涉及过的四个文件已与2026-10-18正式包逐一核对，功能源码一致（忽略换行编码和末尾空白）；静态验证仍为29 JS/17页/191事件/675表达式。未重新发布小程序。
- 3D库位加载状态：最终生产构建通过受控浏览器验证，覆盖布局、暂存点、备件、模型0/2→1/2、失败占位与重试成功，无页面异常；显示实际完成数量，不模拟百分比。已SSH部署完整网页构建，457个非构建资源与原现场逐字节一致；HTTPS首页与构建一致，5个入口资源均成功，公开APK下载SHA256复核一致。网页回滚副本为服务器 `/opt/spare-parts/rollback/warehouse-progress-20261019/web-dist`。
- Blob/HTTPS导出已实现分片保存并通过编译与Lint；500MB边界、PDF预览、各厂商真机权限/文件管理器/3D表现仍需真机验证，未宣称全部验收。取消的模型防复制限制未部署。

## 历史：安卓试用工程验证（2026-10-16）

## 当前交付：体验版 02

- 版本 `1.9.10-android-preview.2` / versionCode 2；原生工作台、常用、我的与底部导航，详情仍为 WebView。设计说明见 `DESIGN.md`。
- `:app:assembleDebug :app:lintDebug` 成功；Lint 为 0 errors、1 warning（Vue 必需 JavaScript）。已修复绘图期间对象分配和 Android 8.0 主题兼容问题。
- APK `app/build/outputs/apk/debug/app-debug.apk`，54707 字节；SHA256 `bc6ebc1a10dcbab5dacab3065dae8f88766f175d62f6f165ec77bdfcd4124649`。
- Android 15 / API 35 模拟器已安装运行此包，覆盖安装成功。模拟器及系统镜像均来自 Google 官方并核对仓库校验值。
- 原生演示 Activity：1080×2400、420 dpi 下视觉检查通过，三板块可见、底部标签居中、状态栏深色图标可读。
- 点击“常用”“我的”可切换对应原生页面；点击备件卡片返回预期 `/inventory` 演示回调。
- 900×1600、400 dpi、字体 1.15 倍下，底部导航可见，首页可滚动到工作管理及全部入口；测试后恢复显示设置。
- 截图 `previews/home.png`、`profile.png`、`small-font.png` 均为带演示标记的本地模拟账号，无生产数据；未将其当作生产验收。
- 本地 HTTP 夹具的 WebView 连接未打通，因此未据此宣称门户自动切换、真实登录、退出及线上权限衔接已完成运行验证。真实服务器、生产账号及真机业务操作仍待验证。
- 已检查最终包签名、版本、应用名及仅 INTERNET 权限；未改动网页、API、小程序、数据库和生产部署；未提交或推送。

## 历史记录：体验版 01（已被当前 APK 替代）

- Java 源码：使用 Android 35 android.jar、`javac --release 17` 编译通过；存在 Android 兼容接口废弃提示，无编译错误。
- 主 manifest 和 debug manifest：XML 解析通过。
- build-debug.ps1：PowerShell 语法解析通过。
- Gradle Wrapper JAR：SHA256 与 Gradle 官方发布值一致：`2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`。
- Gradle 8.11.1 分发包：已由 Wrapper 下载及校验，并成功使用本地 JDK 21 启动。
- 已在本机 `D:\Android\android-sdk` 补齐 Build Tools 35.0.0 和 Platform Tools 37.0.1，均下载自 Google 官方并比对仓库 XML 中的 SHA1；未安装模拟器。
- 官方工具下载及依赖最初遇到 TLS／代理 403；最终通过直连下载及 Maven Central 直连完成，无替换为第三方仓库。
- `:app:assembleDebug :app:lintDebug` 最终 **BUILD SUCCESSFUL**。Lint：0 errors、1 warning（SetJavaScriptEnabled：Vue 页面必需，未暴露原生 JavaScript 桥）；Android 12+ 备份及设备迁移已显式排除本地应用数据。
- 最终 APK：`app/build/outputs/apk/debug/app-debug.apk`，19594 字节；SHA256 `48918da2cc325fe75fa2043da9c581e37bf268e3c78a7ea18dd398e04f3f2339`。
- 修改备份配置后，另以 `:app:lintDebug --offline --rerun-tasks` 强制重跑全部相关检查，最终报告为 0 errors、1 warning，避免使用旧增量检查结果。
- 包名 `cn.digitalworkbench.mobile`，应用名称“数字工作台”，版本 `1.9.10-android-preview.1`，最低 Android 8.0 / API 26，target API 35，仅申请 INTERNET 权限。使用本机 Android debug 签名，尚非正式发布签名。
- 最终包使用 apksigner 验证 v2 签名；aapt 检查应用名、图标、启动 Activity、版本、SDK 和权限。
- `adb devices` 设备列表为空，未验证实际服务器、生产账号、文件上传、3D、页面交互或登录持续性。
- 本次仅新增 android-app 目录，未修改现有网页/API/小程序，未迁移数据库，未部署生产，未提交或推送。
