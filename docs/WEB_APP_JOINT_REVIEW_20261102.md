# 网页与App联合排查（2026-11-02）

用户明确要求 Codex 与 DeepSeek Harness 联合检查网站/App，查到问题直接修改。沿用既有部署授权及数据保护、回收规则，不执行Git推送、微信发布或应用商店发布。未来车间布局/运货仍为计划，不在本次审查中新增。

## 协作范围

- Harness 负责独立审查并修复界面/原生操作流程：`spare-parts-web-release/src/views/app/`、`src/app/` 的界面组件与CSS（不改 surface.mjs、shared routing/auth），`android-app/app/src/main/java/cn/digitalworkbench/mobile/` 的登录、返回、拍照/文件与更新操作，必要时查iOS容器。具体写入文件先登记，相关专用测试可新增。发现其他范围问题记录给 Codex，避免交叉改。
- Codex 负责 `server/src`、`src/api`、`src/auth`、共享路由及业务页的会话/权限/异步请求与文件读取、业务数据一致性问题；统一合并回归、构建、服务器验证和部署。Harness 不改 dist，不部署，不发布新APK/IPA，不启动服务，不动业务数据/私有配置。
- 几何模型已交付冻结，本轮不改模型。没有复现依据的问题不能当成已确认缺陷；建议与真实问题分开记录。
- 用户此前停止页面自动操作的指示仍有效。本轮用源码、单元/隔离测试、构建及必要的只读线上API检查；不恢复页面UI自动操作，也不假称视觉、真实拍照扫码或真机验收完成。Computer Use仅用于授权的Harness协作消息。
- 网页侧重管理，App侧重现场操作，小程序保持轻量；涉及共享代码时核对三端影响，不把网页后台操作直接搬到App。

## 修复与证据要求

优先检查登录/退出与账号切换、返回/深链、权限边界、拍照扫码与取消、弹窗/键盘/提交、网络失败重试、PDF/图片读取与退出释放、更新/下载和无障碍标签。每项写触发步骤、源码位置、用户影响、复现/回归测试及修复范围。不得靠新增一堆按钮或笼统重构替代问题定位。

## Harness 接收与写入登记

已接收（2026-11-02 19:31，北京时间），仅工作于 `D:\wx_xiangm\xiangmu`。以下登记为本轮允许写入的候选文件，实际变更文件以最终交接为准；先复现再最小修复，不为凑清单修改正常代码。

- Lead 界面范围：[AppShell.vue](../spare-parts-web-release/src/app/AppShell.vue)、[AppFireInspection.vue](../spare-parts-web-release/src/app/AppFireInspection.vue)、[AppRobotToolbar.vue](../spare-parts-web-release/src/app/AppRobotToolbar.vue)、[app-layout.css](../spare-parts-web-release/src/app/app-layout.css)，以及新增专用 `spare-parts-web-release/test/app-joint-review-*.test.mjs`。
- Android 子任务候选范围：`android-app/app/src/main/java/cn/digitalworkbench/mobile/` 下 `MainActivity.java`、`NativeAuth.java`、`NativeLogin.java`、`FireScanActivity.java`、`NativeFireTools.java`、`WebExports.java`、`AppDownload.java`、`AppUpdater.java`、`UpdateProvider.java`；新增独立回归使用 `android-app/test/joint-review-*`。原生其余文件/iOS 先只读，确需写入会先补登记。
- 共享交接只更新本文 Harness 段；与 Codex 并发编辑前重读。模型及 `surface.mjs` 不改；Codex 正在修复的旧请求401、新旧账号 getMe、资料/改密码晚返回竞态不动。
- 只读源码与合成隔离测试，不读凭据存储、业务数据或私有配置，不开服务/UI自动操作/模拟器/ADB，不写 dist、不构建发布 APK/IPA、不部署。生产构建与上线统一交 Codex。

## Harness 最终交接：稳定可集成

**2026-11-02，本轮源码与隔离回归已复核，稳定可集成。Harness（含 Android 子任务）停止写入，等待 Codex 统一集成、构建与部署。此状态不是上线、APK/IPA发布或真机验收结论。**

### H1：App 异常列表请求失败被误报为“暂无待处理异常”

- **问题/位置**：[AppFireInspection.vue:4–13](<../spare-parts-web-release/src/app/AppFireInspection.vue#L4-L13>) 原先只展示点位列表的 `listError`，未展示异常列表独立的 `issuesError`；空态条件也未排除请求/初始化错误。共享控制器原本已记录异常请求错误，本轮不改它。
- **触发**：App 选择点检周期并打开“异常整改”，异常列表请求超时/失败且没有旧列表；点位请求可以正常完成，因此 `listError` 仍为空。初始化失败时，保留的周期配合空列表也能出现错误提示与成功空态并列。
- **影响**：现场人员把“异常数据没有读到”误认为“没有待处理异常”；切换未点检/已完成列表时，还可能看到不属于当前列表的错误。
- **修复**：[AppFireInspection.vue:24](<../spare-parts-web-release/src/app/AppFireInspection.vue#L24>) 按当前列表选择错误源，错误区和空态共同使用；有当前错误或初始化错误时不显示成功空态。继续使用原有刷新动作，不增加按钮，不改API、共享控制器、路由或会话逻辑。
- **复现/回归**：[专用 App 回归](<../spare-parts-web-release/test/app-joint-review-fire.test.mjs>) 将真实 Vue SFC 编译并在内存执行其渲染函数。最初4项在旧实现为 **3失败/1通过**；最终扩展至 **6/6通过**，覆盖异常错误、既有刷新重试、三种列表错误隔离、真实 `loadIssues` 函数配合合成API的失败/恢复、初始化失败及正常/加载中空态。无浏览器、DOM自动化、真实请求或业务数据。

### H2：Android 取消导出后立即重试，旧回调破坏新导出

- **问题/位置**：[WebExports.java:36–91](<../android-app/app/src/main/java/cn/digitalworkbench/mobile/WebExports.java#L36-L91>) 原先异步回调只检查共享 `busy/closed`；导出A取消后导出B已置 `busy=true`，A迟到的准备/元数据/分块回调便被误当作B处理。
- **触发**：A在准备或分块阶段按返回取消，立即启动B，随后释放A的旧 WebView 回调。测试分别重排导出开始、元数据错误、分块错误和 FileReader 开始四类回调。
- **影响**：旧任务对新任务发起额外轮询，或把新任务清为失败/取消、关闭B的进度提示；第二次导出不能可靠完成。测试确证的是这些状态/回调错误，不把文件正向字节复制声称为已实测。
- **修复**：每轮捕获不可变 `expected` 任务ID，轮询、延迟任务、分块入口及其回调均校验当前任务，脚本键也固定用该ID；旧取消监听和[保存完成回调](<../android-app/app/src/main/java/cn/digitalworkbench/mobile/WebExports.java#L95-L110>) 同样校验，清理时作废 `job`。旧任务直接返回，不能调用 `fail` 清掉新任务。保存线程继续使用原有局部 `source/target`，不改授权、接口或文件复制策略。
- **复现/回归**：[原生专用 runner](<../android-app/test/joint-review-native.test.mjs>) 使用真实三份生产Java源码及合成 Android ports；[JVM helper](<../android-app/test/joint-review-jvm-probe.java>) 仅在内存编译/加载字节码。旧实现 **4失败/8通过/3明确跳过**，修复后 **12通过/0失败/3明确跳过，30断言**；Android 子任务已复跑，Lead独立复跑结果相同。四个竞态均先红后绿，不是源码正则断言。

### 测试范围与未验证边界

- App相关隔离回归 **67/67通过**（含上述新增6项）：

```powershell
# 工作目录 D:\wx_xiangm\xiangmu\spare-parts-web-release
node --test test/app-joint-review-fire.test.mjs test/app-surface.test.mjs test/mobile-workspace.test.mjs test/mobile-spare-interactions.test.mjs test/fire-inspection.test.mjs test/fire-inspection-form.test.mjs test/fire-asset-workorders.test.mjs test/fire-camera.test.mjs test/fire-session-cleanup.test.mjs
```

- 原生在本地JDK21下 **12通过/0失败/3跳过**；脚本语法检查、相关 `git diff --check` 通过。保留的旧API提示和Git换行提示不是测试失败。

```powershell
# 工作目录 D:\wx_xiangm\xiangmu；可用 JOINT_REVIEW_JAVA_HOME 指定已有完整JDK，不下载工具
node --check android-app/test/joint-review-native.test.mjs
node android-app/test/joint-review-native.test.mjs
```

- 原生通过范围：四种旧导出回调及旧取消监听、跨域导出拒绝、权限拒绝后重试/换号后授权不启动相机、文件选择URI过滤、扫码取消只完成一次且可重试/换号丢弃旧结果/扫码值校验、登录响应与地址及错误脱敏的纯逻辑。不是Android系统UI、扫码硬件或实际登录验收。
- **明确跳过3项**：导出缓存/SAF成功字节复制；相机取消时真实照片创建清理及URI授权；缺少相机应用时的真实启动路径。登录UI/WebView交接、返回栈、更新下载/签名/安装未做真机验证；iOS仅源码审阅，无新增修复或设备验收结论。
- **工具限制，不作为业务缺陷**：常规Java class目录输出曾报 `could not create parent directories`；内存编译成功后，旧fixture的JVM目录创建明确报 `AccessDeniedException`，对象为 `C:\Users\Lenovo\AppData\Local\Temp\joint-review-native-6z1BxN\fixture-*`。已停止JVM文件写入；未改权限/ACL、未换目录重试，限制对象保留原样，原因未诊断。最终runner由Node只写合成源码到临时目录，Java只读源码并在内存编译/执行允许的回调子集，无 `.class` 落盘；跳过项不计通过。
- 全程未启动服务、UI自动操作、模拟器或ADB，未读真实凭据存储、业务数据或私有配置，未写dist、未做生产构建、APK/IPA构建发布或部署。上述真实文件/设备路径由Codex集成时另行安排验证，不能拿本报告替代。

### 本轮实际交付文件与冻结校验

生产源码仅两处最小修复，新增三份专用测试/辅助文件，另更新本文。其余预登记候选文件没有为凑清单而修改；工作区原有其他改动保留，不计为本轮成果。

| 实际文件 | 本轮变更 / SHA256（交接时文件字节） |
| --- | --- |
| [AppFireInspection.vue](<../spare-parts-web-release/src/app/AppFireInspection.vue>) | 当前列表错误与空态；`29E429D1D98A424485C8C9F3A0A9123E8D4D7C8C15C5741753702AA668C124E1` |
| [app-joint-review-fire.test.mjs](<../spare-parts-web-release/test/app-joint-review-fire.test.mjs>) | 新增6项真实SFC/控制器离线回归；`A2F383700AA3698A1350204DA456234C862AB0E340CC00233120033B66A9FE8A` |
| [WebExports.java](<../android-app/app/src/main/java/cn/digitalworkbench/mobile/WebExports.java>) | 导出回调任务隔离；`FAEDDB7A6E815EF927A6E30CE78A23760D587D6696A044C54F5BDAF5D610A50D` |
| [joint-review-native.test.mjs](<../android-app/test/joint-review-native.test.mjs>) | 新增原生合成隔离runner；`D3ED2F0983D112A278069BD2E4C066D3277C3AB72C0F3888D40CBB8DCEDC6ED0` |
| [joint-review-jvm-probe.java](<../android-app/test/joint-review-jvm-probe.java>) | 新增内存Java编译/加载helper及只读诊断入口；`725F38785A01C42CB038BD9FDB2C44C2E1DEC07178B983F3DF67844C2C304243` |
| [本交接记录](<WEB_APP_JOINT_REVIEW_20261102.md>) | 写入登记、触发/影响/最小修复/红绿证据/边界与最终交接；共享文档不计算自引用哈希 |

几何保持既有冻结值，Lead已重新校验：[agv-model.mjs](<../spare-parts-web-release/src/utils/agv-model.mjs>) 为 `D64E0D42E2A81E8E62CE37502F091A5C2692E919B784F6E99CAEAC94DBF3CEB1`；[agv-forklift-model.mjs](<../spare-parts-web-release/src/utils/agv-forklift-model.mjs>) 为 `85C3FEA590839ABEA1E2812E684A719CC87C9C676D60D7FEF701805C463DA1D5`。不改几何、不改surface或Codex的共享会话/业务修复；后续集成与发布由Codex统一负责。

## Codex 记录

已确认并修复，已于北京时间2026-11-02 19:57:46随网页上线；原生导出修复随20:00:26发布的android.21提供：

1. **旧请求跨账号返回**：账号A请求未结束时切换B，旧成功结果仍可进入B界面；旧401还会清除B登录并跳登录页。HTTP请求捕获所属token，成功和失败回调只处理当前会话；Blob错误解析等待后再次校验。当前会话的真实401仍照常退出。
2. **路由校验晚返回恢复旧账号**：`getMe`等待时退出/切换，旧管理员信息可能重新写入本地会话。路由在返回及错误后校验token，旧导航取消，不恢复旧账号。
3. **个人中心保存/改密码竞态**：请求A完成后可能把A资料搭配B的token写入本地，或把B退出；切换账号时旧密码输入也没有清除。加入页面存活/请求/账号token归属校验，切换身份清空密码并解除旧忙状态，离开页面不再提交本地会话。
4. **离开登录页后仍被登录回调拉走**：登录请求完成后可能在下载页等其他页面建立会话并跳转；失败Promise直接上抛。登录页离开后忽略完成，失败由既有HTTP提示处理，保留重试且拦截重复提交。
5. **PDF文件/渲染竞态与页码误导**：旧文档getPage在新文档加载期仍可能绘制；旧渲染成功清掉新错误；99/-3/小数页码未显示为真正渲染的合法整数。开新文档即时作废旧渲染，每次提交校验文档与请求代际，页码显示与实际一致。
6. **跨标签会话不同步与旧退出误伤新登录**：其他标签页登录/退出后，本页未收到项目自定义会话事件；旧退出确认及请求结束还会退出新账号。监听相关localStorage变更并合并事件，刷新本页身份/缓存；退出确认前后按原token核对；个人中心提交前也校验表单所属会话，避免storage通知到达前提交旧表单。

证据：`test/session-boundary.test.mjs`11项通过；初始9项中8项在修复前失败（其余为当前401控制用例）。`test/pdf-reader-lifecycle.test.mjs`3项修复前全失败、修复后全通过。使用延迟响应、实际Axios拦截链与组件脚本隔离运行，没有读取真实凭据、账号资料或操作生产业务。完整回归、构建与统一同步结果见下。

补充：`test/session-storage-logout.test.mjs`5项，修复前4失败/1正常退出控制通过，修复后全部通过。Harness冻结文件哈希已核对；同签名安卓更新已提供，用户安装android.21后原生导出修复才生效，未声称现有设备已更新。

## 统一验证与上线结果

本轮共确认并修复上述Codex六类问题和Harness两类问题。没有根据建议清单做无依据的大改；未改几何模型、API业务逻辑、小程序源码或iOS原生代码。共享网页会话及PDF修复适用于网页与App在线业务页；Android导出修复单独进入原生更新。

| 检查 | 实际结果与边界 |
| --- | --- |
| 网页完整回归 | 428/428通过，包含本轮异步会话、PDF和消防列表回归 |
| API完整回归 | 411/411通过，本轮API源码不变 |
| 原生隔离回归 | JDK17下12通过、0失败、3明确跳过，30断言；不等于真实SAF、相机或系统UI验收 |
| 生产构建 | Vite生产构建、Android签名Release及Lint通过 |
| 并发协作一致性 | Harness冻结文件哈希一致；762份生产源文件从最终检查至构建、同步后保持一致 |
| 线上验证 | 4类实际角色、55项页面/API/权限与文件检查通过；未调用业务模型、未新增测试工单，临时会话按精确hash清理 |
| 最终服务 | 北京时间20:08:55健康接口200，网页两实例online；API及同机其他项目PID保持 |

网页于19:57:46同步702份完整构建文件，API进程未重启，数据库、上传及现场私有配置保留。线上55项检查于19:58:52通过。本轮没有恢复页面自动操作，因此不能据此认定页面观感、键盘/返回栈、真实拍照扫码或iOS签名安装已经验收。

### Android 21

- [下载android.21](https://czsdsg.cn/app-updates/android/digital-workbench-1.9.10-android.21.apk)；[统一下载页](https://czsdsg.cn/app-download)。版本为`1.9.10-android.21`，versionCode=21，大小2,024,930字节。
- SHA256：`b3e4ada794bfc52b5d6975d5fe551b6070c9a19bf0b272ac4ce5e8a97d6bad4b`。公网上传文件及latest.json、SHA256SUMS.txt均核验；20版与21版签名证书一致，旧20版APK保留。
- 新版包含导出任务隔离及此前已在源码完成的消防只拍照原生入口。没有发布应用商店、操作用户设备安装或生成IPA；苹果仍可使用既有Safari主屏幕版，原生iOS未编译/签名/真机验收。
- 本地正式文件：`android-app/releases/1.9.10-android.21/`内APK、latest.json及SHA256SUMS.txt。没有新整站归档包，历史整站包不含本轮变更。

### 回滚与回收

- 本轮服务器回滚目录：`/opt/spare-parts/rollback/web-app-joint-20261102`。保留`web-before`、部署清单、验证回执与恢复脚本；网页回退应按该目录记录原子替换完整dist并仅重载网页进程，不修改API或数据库。
- Android发布前清单及校验文件在`native-before/`；如回退下载推荐，需同时原子恢复`latest.json`与`SHA256SUMS.txt`，保留两版APK。已经安装21版的设备不能静默降级，需要更高versionCode的修正版。
- 服务器20:05:30将5个暂存项、27,162,822字节移入`/opt/spare-parts/recycle-bin/web-app-joint-20261102/staging/`，有原路径清单和恢复说明。本地20:06:31将本轮5项暂存中的190文件、29,188,285字节移入Windows回收站；未清空回收站。
- 本地保留生产成品、正式21版和20版回滚、源码及测试/构建证据，受限的JVM临时夹具未删除或更改ACL。本轮未开启8534测试服务，结束时无该端口监听。
- 未执行Git提交/推送、SQL迁移、微信发布；不将工作区已有其他改动计为本轮修复。
