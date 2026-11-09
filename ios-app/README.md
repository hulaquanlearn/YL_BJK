# 数字记录工具 · 苹果端

2026/11/2 14:22:06三端排查修复已同步：手机个人中心补退出登录；苹果原生容器及手机主屏幕模式横屏保持App界面；小程序盘点增加所属车间选择、按车间查询/提交与越界校验，并容错包含“%”的筛选文字。API409/409、网页390/390、安卓Debug构建/Lint、小程序17页脚本/事件检查通过；生产5类账号46项接口与701份网页、92份小程序源码核验。小程序仅更新源码留档，尚未微信上传/发布；沿用正式android.20，无新APK/IPA、SQL迁移或Git提交。真实手机相机/扫码、Safari与微信真机仍未验收。

当前可用入口：https://czsdsg.cn/app-download → 苹果。苹果主屏幕版与网页、安卓共用账号、权限和数据，无需重新导入业务资料。Safari 打开系统后，分享 → 添加到主屏幕；如果有“作为网页 App 打开”，保持开启。业务需要联网，没有实现后台离线通知。

本目录另外提供原生 iOS 工程 `DigitalWorkbench.xcodeproj`，最低 iOS 15，UIKit + WKWebView；现有手机网页负责业务、登录和权限。工程支持持久网页登录、相机/照片选择、系统文件分享、返回手势、连接失败重试、同站 HTTPS 限制。没有内嵌账号、密码、私钥或 Android 安装包。

截至2026-11-02，已核实当前电脑为Windows；尚未取得可用的Mac构建环境及Apple Developer签名条件。原生工程尚未经过 Xcode 编译、签名、模拟器及真机验证，不能当作已发布 iOS 安装版。没有提供 IPA、TestFlight 或 App Store 链接。网页主屏幕版也不等于原生安装包。

后续有 Mac 后，用 Xcode 打开工程，选 DigitalWorkbench target，在 Signing & Capabilities 中选择自己的 Team；如包名已被占用，更换唯一 Bundle Identifier。先选 iPhone 模拟器 Build，再用个人开发 Team 真机运行。对外分发需要合适的开发者资格、签名和发布流程；App Store 审核结果不能由源码或构建代替。

发布前须按实际数据处理补全隐私披露、支持/隐私链接及 App Store Connect 信息。`PrivacyInfo.xcprivacy` 当前仅声明原生壳未引入跟踪 SDK；业务服务中的照片、人员与工单仍按现有系统处理，不能据此填写“业务不收集数据”。

Mac 未签名模拟器构建示例：

```sh
xcodebuild -project DigitalWorkbench.xcodeproj -scheme DigitalWorkbench -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

验收：现有账号登录/退出、车间权限、个人资料返回、盘点详情/创建/审批、消防拍照与上传、AGV车辆展示（报障/工单已整体移除）、库存扫码及3D、文件导出、弱网重试、iPhone安全区与键盘、iPad文件分享。上述操作应使用隔离验收资料；当前未对生产创建测试记录。

苹果主屏幕安装依据：[Apple 官方说明](https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/ios)。
