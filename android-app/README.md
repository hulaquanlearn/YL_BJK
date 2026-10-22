# 数字工作台安卓在线更新版

## 当前版本：1.9.10-android.5（2026-10-19）

正式安装包：[digital-workbench-1.9.10-android.5.apk](releases/1.9.10-android.5/digital-workbench-1.9.10-android.5.apk)，[手机下载](https://czsdsg.cn/app-updates/android/digital-workbench-1.9.10-android.5.apk)，[SHA256](releases/1.9.10-android.5/SHA256SUMS.txt)。包名 `cn.digitalworkbench.mobile`，versionCode=5，Android 8.0及以上，沿用备案正式签名。服务端不在APK里，默认连接 `https://czsdsg.cn`，可在连接设置中更换HTTPS根地址。

- 登录页新增可选“记住密码（仅此手机）”，默认不勾选。仅成功登录后通过Android Keystore密钥和AES-GCM在本机加密保存；下次自动填写，仍需点击登录。密码不写入网页localStorage、不注入网页脚本、不随备份迁移。
- 每个HTTPS服务器独立保存；退出账号保留记住的密码。取消勾选或“我的 / 更多 → 密码保存设置 → 清除保存的密码”可删除当前服务器的保存内容。更改密码后，下次用新密码成功登录即可替换。
- 已登录的老用户升级后会保留会话；如需首次保存密码，先退出账号，再在新登录页勾选并登录。本次原生功能需升级一次APK，之后网页业务仍随服务器更新。

- 业务详情、功能入口和权限复用现有网站/API；原生首页只读取当前账号的网页门户入口，不自行授权。增加“个人中心与账号管理”和“检查 App 更新”。不改小程序。
- 每日自动检查版本；“我的 / 更多 → 检查 App 更新”可手动检查。下载校验大小、SHA256、包名、递增版本及与已安装应用一致的签名。仅接受当前HTTPS服务器的安装包，不跟随跳转；更新请求不携带业务令牌。安装需用户确认，首次按系统提示允许本应用安装更新。
- 首次安装本版之后才具备在线升级。此前正式签名包可覆盖安装；debug体验版签名不同，应先导出必要本机资料再卸载体验版、安装正式版，之后使用原有服务端账号登录。服务器业务数据不随安装清空。
- 支持当前站点触发的Blob/HTTPS文件导出，使用系统文件选择器保存；认证留在当前网页内，不把登录令牌传给原生接口。文件按24KB片段读取，不把大文件整体转换为Base64；单次上限500MB。文件上传沿用系统选择器。未添加原生JavaScript桥。
- 网页/API部署后刷新业务页面即可使用新逻辑；原生代码、内置手机样式变化时发布新APK。正式签名文件必须独立备份，不能重新生成替代。不能静默安装，也不能用此正式包覆盖不同签名的体验版。

## 后续发布

1. 修改 `app/build.gradle` 中的安卓 versionCode（必须递增）与 versionName；整站 VERSION 不因此升级。
2. 运行 `./android-app/build-release.ps1 -SdkPath 'D:\Android\android-sdk'`，必要时传 `-JdkPath`。脚本使用用户私有目录中的原发布签名，执行正式构建与Lint。
3. 运行 `./android-app/tools/prepare-update.ps1 -Destination <新版本独立目录> -BaseUrl 'https://正式域名'`；工具验证正式签名、包名、非debug、生成APK/版本清单和SHA256。不得复用旧版本APK文件名替换不同字节。
4. 在服务器保留旧版APK/清单与回滚资料，先上传并核对新APK，再原子替换 `/opt/spare-parts/app-updates/android/latest.json`。仅上传APK与版本清单，不上传私钥、签名配置或业务数据。现有Nginx `/app-updates/`映射此独立目录，不会被网页构建覆盖。
5. 手机检查更新、下载并确认覆盖安装；用安装后的版本和数据保留情况验收。若清单发布错误可回退旧清单，已安装的更高版本需以更高versionCode修复，不强行降级或卸载业务应用。

备案完成后继续沿用当前发布证书和包名；若更换域名，部署HTTPS更新目录、重新生成清单中的同站APK地址，并在App连接设置切换服务器。后续发布不需要修改业务账号权限。详见 [验证记录](VALIDATION.md)。

## 历史：安卓体验版 02

独立 Android 工程，原生工作台首页、常用功能、我的页面及导航，业务详情暂时复用现有网站和 API。不修改线上网页、后端或数据库。
本轮按手机交互重做主页，并非全量业务原生化。设计参考与边界见 [DESIGN.md](DESIGN.md)。

## 打开和运行

1. Android Studio 选择 Open，打开本目录 `android-app`。
2. Gradle JDK 选择 **JDK 17 或 21**（可通过设置中的 Download JDK 下载）；本工程固定使用 AGP 8.9.2 / Gradle 8.11.1，不要使用 JDK 25 运行该 Gradle。
3. SDK Manager 安装 Android SDK Platform 35、Build Tools 35.0.0、Platform Tools；模拟器另需 Emulator 和系统镜像。
4. 等待 Gradle 同步。连接开启 USB 调试的安卓手机，选择 app 后 Run；也可使用模拟器。
5. 首次打开填写网站根地址，例如 `https://work.example.com` 或调试内网 `http://192.168.1.10:8502`。使用网页地址，不是 API 地址。需要子路径部署时须另行适配。
6. 手机必须能访问网站。不能使用 localhost / 127.0.0.1；本地开发时 Vite 需要通过 `npm run dev` 对局域网监听，电脑防火墙须允许相应端口。

命令行：先设置 JAVA_HOME 为 JDK 17/21，配置 SDK（Android Studio 自动生成本机 `local.properties`），执行 `./gradlew.bat :app:assembleDebug`。
也可在仓库根目录执行 `./android-app/build-debug.ps1 -SdkPath 'D:\Android\android-sdk'`。脚本优先使用指定 JDK 或 JAVA_HOME；两者均未设置时使用本次下载到 `.local/jdk21` 的本机 JDK。Android Studio 的 Gradle JDK 可手动选择该目录中的 JDK 子目录。
已生成试用安装包：`app/build/outputs/apk/debug/app-debug.apk`，可直接覆盖本机此前生成的体验版 01，保留服务器配置和原有网站登录状态。首次安装填写实际网站根地址，使用现有账号登录。校验见 `SHA256SUMS-preview.2.txt` 和 `VALIDATION.md`。此包不包含网站和后台，离开服务器网络不能离线使用。

## 当前能力与限制

- 新增原生首页、常用入口、我的与底部导航；移除旧版顶部三个灰色按钮，返回和更多操作收纳到业务标题栏。
- 已实现服务器地址输入及持久化、同站点页面浏览、刷新、返回和退出确认、连接失败提示、系统文件选择上传。
- 外站 HTTP(S) 链接交给浏览器；无 JavaScript 原生桥、不绕过 TLS 证书错误、不允许混合内容和本地文件访问。
- 仅 debug 允许 HTTP 内网联调；release 仅 HTTPS。HTTPS 证书必须被设备信任。
- 原生“我的 → 连接设置”或业务标题栏“更多 → 连接设置”可修改地址；切换地址会提示未保存内容可能丢失，各服务器的网页登录状态按 WebView origin 隔离保存。
- 文件下载（包括网页 Blob 导出）尚不支持，使用电脑网页导出；未实现原生扫码、拍照、定位、推送、离线同步。
- 现有网页弹窗、3D 模型、长表格、表单软键盘、上传及会话持续性需要真机逐项验证。网页 JavaScript alert/confirm/prompt 已转接原生对话框。
- App 初始 ID 为 `cn.digitalworkbench.mobile`；正式发布前确认应用 ID、图标、签名、发布版本及隐私说明，签名密钥不得入库。

## App 备案与正式签名

备案字段及公开证书在 `filing/`，填写参考 `filing/README.md`。构建脚本 `build-release.ps1` 使用本机私有目录的固定发布密钥，正式签名与 debug 签名不同，不能直接互相覆盖安装。私钥与密码不在仓库内，必须单独安全备份。

## 验证记录（2026-10-16）

APK 构建和 Lint 通过；使用 Android 15 模拟器本地演示数据验证原生首页、底部导航、常用与我的，以及小屏放大字体滚动。截图在 `previews/`，均不代表生产账号验收。
实际服务器登录、原生入口与线上门户衔接、业务操作仍需真机验证。详见 `VALIDATION.md`。未进行生产部署或数据库操作。
