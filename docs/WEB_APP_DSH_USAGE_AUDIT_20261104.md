# 网页 / Android / 小程序 使用审查报告（DSH 只读）

## 接单与边界

- 项目：`D:\wx_xiangm\xiangmu`；只读审查网页、`android-app/`、`miniprogram/` 的操作路径、权限、加载/错误/取消/停止、手机可用性、失效入口。
- **本文件是唯一写入**；未改 CSS/Vue/API/模型/测试/程序/部署文件，未构建、未部署、未启动端口、未删除/移动文件、未操作浏览器或用户窗口。
- 审查方式：源码与样式静态审查 + 已有测试/构建结果核对；**没有做浏览器、原生模拟器或真机实际操作**。文中“P1/P2”是静态证据判断，不冒充实机验收；Codex 的浏览器/App 复核与修复为准。
- 不把既有 623/623、55/55、构建通过复述为新的实际使用验收。
- 重点复核了：程序运行/停续/倍速、示教器同步、PDF 自适应/手势、登录/现场操作/导航。Codex 已在修的“手机程序面板双层滚动、示教器速度与主速度未双向同步、打开技术资料暂停动画”单列为已知项，不重复当新发现。

## 结论摘要

**P1（建议本轮修复/上线前确认）**

1. PDF 在“工程知识 → 资料预览”弹窗内高概率只得到很矮的画布，未铺满弹窗；`Knowledge.vue` 的 `:has` 规则把 `.file-preview` 改回 `height:auto`，而 `PdfReader` 依赖 `.pdf-surface` 的可用高度计算 fit scale。
2. 小程序启动时 `verifySession()` 对**任何**错误（含网络超时/断网）都 `clearSession()`，一次网络抖动会把有效登录态清掉，现场用户被迫重新输密码。
3. 运行程序时打开技术资料，`AbbRobotViewer` 的渲染循环在 `guide==='technical'` 时直接 `return`，而 `AbbProgramSession.run()` 正等待 `move()` 的动画 Promise；可能让程序动作停在半途（Codex 已确认在修）。
4. 手机程序面板双层滚动（Codex 已确认在修）：外层 `.robot-program-pane` 与内层 `.program-actions/.program-signals/.program-events` 同时滚动，窄屏下容易“滚不动/滚错层”。

**P2（可用性/错误边界，建议本轮或下一批修）**

- PDF 大图预览只有键盘 Enter/Space 可打开，鼠标/触摸没有 click 绑定，手机用户实际无法使用 `previewPage`。
- 网页 `api/index.js` 的 viewer 写权限在 request 拦截器直接 reject，绕过统一错误 Toast；用户点击只读操作可能“没有任何提示”。
- 网页 401 直接 `location.assign('/login')`，丢失当前路径和未提交内容；登录页 catch 为空，`setSession` 失败（如存储不可用）也无提示。
- 程序面板普通 `status` 不在面板内渲染，只在 Viewer 底部 footer 显示；面板内只有 error/progress，用户看不到“正在执行/等待/已暂停”等文字。
- 程序 `stop()` 只递增 epoch/停动画，不取消正在等待的 simulate HTTP 请求；停止后旧请求仍占网络，慢网下会继续消耗。
- 小程序 `pages/webview` 的“重新打开”只清 error 数据，依赖 web-view 条件重建；若同一 `src` 被判缓存或微信未重建，用户没有明确的 reload 反馈；无 loading 状态。
- 小程序审批页对 viewer 仍渲染“通过/驳回”按钮（点击后才弹权限不足），权限状态应在 UI 直接禁用/隐藏。
- 小程序登录页品牌写“原粮车间备件管理”，但系统还有制曲/酿酒/管理员账号，角色文案不匹配。
- 网页 `AppShell` 手机目录把大量桌面功能过滤掉（只保留 `nativeFieldPaths` + 机器人程序），若现场手机需要“备件模型库/设备与备件/统计/数据检查”，属于入口缺失，需产品确认是否故意。
- 项目 `vite.config.js` 构建目标为 chrome80，但 `Knowledge.vue`/`ModelCatalogShowroom.vue` 使用 CSS `:has()`（Chrome105+ 才支持）；旧 Android WebView 会静默忽略，PDF/缩略图布局退化为另一套。
- Android 登录后自动检查并**后台下载**更新（`MainActivity:288` → `AppUpdater.check(...,false)`），未先询问用户是否使用流量；更新包较大时现场流量体验差。
- Android `onReceivedHttpError` 对所有主框架 HTTP 错误（401/403/404/5xx）统一显示“连接失败”，可能把登录失效/权限问题误报成网络问题。
- Android 返回键在没有任何表单内容时也弹“离开前请确认已保存”，增加现场操作摩擦。
- 小程序请求没有 `onUnload` 取消/忽略迟到回调，切页后仍可能 `setData`，弱网下出现旧页面数据覆盖。

## 证据与复现建议

### P1-1 PDF 预览弹窗高度不铺满

**证据**
- `spare-parts-web-release/src/views/Knowledge.vue:322`：`.file-preview{height:min(78vh,900px);display:grid;place-items:center;overflow:auto;...}`。
- 同文件 `:390`：`.file-preview:has(.pdf-reader){height:auto;display:block;background:#edf1f5}`，把 PDF 场景的高度改回 auto。
- 同文件 `:393`：`.knowledge-file-reader .el-dialog__body{...overflow:auto}`、`.knowledge-file-reader .pdf-surface{max-height:calc(85dvh - 150px)}` 只设 max，不设高度。
- `src/components/PdfReader.vue:38` 用 `surface.value.clientHeight` 计算 fit；`:84` 中 `.pdf-reader` 为 flex 列、`.pdf-surface{flex:1;min-height:0}`，父级高度 auto 时 surface 没有确定高度，初次 render 只能按很小的内容高度缩放；canvas 默认尺寸/1px 高度都可能导致 PDF 显示成一条窄条。

**复现（Codex 浏览器）**
1. 打开工程知识，进入一条 PDF 资料，点“在线阅读”。
2. 观察弹窗内 PDF 是否只占顶部很小高度、下方大片空白，或首屏极小；对比“PDF 本身页数正常/工具栏正常”。
3. 改窗口高度、旋转/手机 390px 再开一次，观察 fit 比例是否变化但不铺满。

**修复建议**
- 把 PDF 场景从 `height:auto` 改为有确定高度的 flex 容器，例如 `.file-preview:has(.pdf-reader){height:min(78vh,900px);display:flex}`，并给 `.pdf-reader{flex:1;min-height:0;height:100%}`；或去掉 `:has` 覆盖，仅通过 `.knowledge-file-reader .pdf-reader{height:100%}` 承载。
- 同时给 `.pdf-surface` 明确 `min-height:20rem`，避免初始 `clientHeight` 过小；Codex 需以实际浏览器截图确认，不只跑 fit 单测。

### P1-2 小程序一次网络错误清掉有效登录态

**证据**
- `miniprogram/pages/login/login.js:11-18`：`verifySession()` 的 `catch (_) { auth.clearSession(); }`，没有区分 HTTP 401 与网络/超时。
- `miniprogram/services/api.js:47-67`：`wx.request` 的 `fail` 只把 timeout/网络错误包装为普通 Error，不带 `statusCode`；`verifySession` 无法据此区分。
- `miniprogram/pages/login/login.js:8`：只有 token+user 才自动验证；`verifySession` 没有把 `loading` 置 true，验证期间用户可再次点登录。

**复现（微信开发者工具/体验版）**
1. 登录成功，杀掉网络（或设置超时）后重启小程序。
2. 登录页 `onLoad` 触发 `verifySession`，请求失败。
3. 观察 token 被清除、必须重新输入密码；恢复网络后也无法自动恢复。

**修复建议**
- `verifySession` 只在明确 401/403 时 `clearSession()`；网络错误保留 token，显示“网络不可用，重试”并可重试，不要强制退出。
- `verifySession` 开始/结束设置 loading，避免重复登录；加取消/超时提示。

### P1-3 运行中打开技术资料暂停动画（Codex 已知在修）

**证据**
- `spare-parts-web-release/src/components/agv/AbbRobotViewer.vue:277`：动画循环 `if(!visible||document.hidden||guide.value==='technical')return`，直接停掉渲染帧。
- `src/utils/abb-program-session.mjs:30`：`await this.move(prepareProgramMotion(...))` 依赖 Viewer 的动画 `moveRobot`/`done` 回调；渲染循环停掉后动作 Promise 不结束，程序停在半途。
- `AbbRobotViewer.vue:80` 的 `watch(guide,...)` 在非 pendant 时 `stopMotion()`，但没有同步停止/挂起程序会话；面板 `v-show` 隐藏而会话仍 running。
- Codex 已复现并修复该三项之一；本条只作为审查证据，修复归 Codex。

**复现**：机器人程序运行中，打开“技术资料/完整手册”再关闭，观察机器人是否停在半途、进度是否继续；或打开后等待程序状态是否超时。

**修复建议**：打开技术资料前 `programControl.stop()` 或暂停 session；或动画循环不要因 guide 直接停帧，改为低帧/暂停会话并显式 resolve 当前 move；Codex 统一实现。

### P1-4 手机程序面板双层滚动（Codex 已知在修）

**证据**
- `AbbRobotViewer.vue:319`：`.robot-program-pane{...overflow:auto}`。
- `AbbProgramControl.css` 内 `.program-actions/.program-signals/.program-events` 各自 `max-height`/`overflow:auto`；同时 Viewer `:320` 在 ≤900px 把 pane 限高 `min(46vh,360px)`。
- 窄屏下手指在事件/动作列表内滚动到边界后，外层 pane 是否继续滚动取决于浏览器链式滚动，容易出现“卡住/忽上忽下”。

**修复建议**：Codex 统一一层滚动（pane 或组件内二选一），内层详情改为 `max-height:none` 或 `overflow:visible`，并用 390px 设备复现。

### P2-1 PDF 大图预览没有鼠标/触摸入口

**证据**：`src/components/PdfReader.vue:1` 的 canvas 只绑定 `@keydown.enter.space="previewPage"`；`previewPage()` 在 `:48`；模板没有 `@click`/`@dblclick`。`el-image-viewer` 和 `previewPage` 存在但只能键盘触发。
**复现**：桌面打开 PDF，鼠标点击页面/双击页面；手机点 PDF，均不会进入大图预览；键盘 Tab 到 canvas 后 Enter 才会打开。
**建议**：canvas 加 click/dblclick（区分拖动：记录 pointer 移动距离，小于 4px 才触发），并给按钮/提示；保留键盘。

### P2-2 viewer 写权限请求静默失败

**证据**：`src/api/index.js:18-22` 在 request 拦截器构造 403 并 `Promise.reject(error)`；统一的 `ElMessage.error` 在 response 拦截器 `:42-55`，不会处理 request 拦截器拒绝。页面若没有 catch 提示，用户点击“新增/盘点提交”等只读操作时没有反馈。
**复现**：viewer 账号进入备件列表，打开新增/编辑入口（若按钮未隐藏）并提交；网络请求不会发出，界面无 Toast。
**建议**：request 拦截器拒绝前直接 `ElMessage.error(PERMISSION_MESSAGE)`，或把错误交给统一错误边界；同时检查所有入口是否用 `$showControl` 隐藏。

### P2-3 401/登录失败丢失上下文与提示

**证据**
- `src/api/index.js:51-54`：401 → `clearSession()` + `window.location.assign('/login')`，没有 `redirect` 参数，也未保存当前表单。
- `src/views/Login.vue:27-34`：`catch { /* HTTP boundary already reports ... */ }` 为空；`setSession` 抛存储异常时无内联提示。
- 直连 `/account?tab=users` 等受保护 tab，viewer 会被 `allowedTab` 回退 profile（`Account.vue:45-47`），不会泄露管理 UI，但会被静默改 tab；建议给“无权访问”提示。
**建议**：401 保存当前 fullPath 到登录 redirect；登录页 catch 显示 `e.message` 并处理 localStorage 失败；路由/账号 tab 用统一 403 提示。

### P2-4 程序面板普通状态不在面板内

**证据**：`AbbProgramControl.vue:20` 只有 `v-if="error"` 的 `.program-error`；`:21` 的 progress 仅 `v-if="cell"`；普通 `status` 只在 `AbbRobotViewer.vue:28` footer 的 `.robot-program-status` 渲染。面板内空档时用户看不到“正在执行/已暂停/等待信号”。
**建议**：在 progress 前增加 `<p v-if="!error" class="program-status" role="status" aria-live="polite">{{loading?'正在读取程序…':status}}</p>`，CSS 已由 DSH 提供。

### P2-5 停止不中止 simulate 请求

**证据**：`src/utils/abb-program-session.mjs:11` `stop()` 只 `epoch++/running=false/stopMotion`；`:49` 的 `await this.request(...)` 没有 AbortSignal。停止后请求仍会完成并占用连接。
**建议**：session 保存 AbortController，`stop/clear` 时 abort；API 层支持 signal；页面 catch 忽略 CanceledError。

### P2-6 小程序 webview 重试/加载状态

**证据**：`miniprogram/pages/webview/webview.js:12` `retry()` 只清空 error/detail/domainBlocked；`webview.wxml` 用 `wx:if` 重建 `<web-view src="{{src}}">`，没有 loading 状态，也未更新 src 时间戳；若微信/缓存不重建，用户只能看到“重新打开”后仍失败。
**建议**：重试时给 src 加时间戳或 `this.setData({src:''})` 后 nextTick 再赋值，并显示 loading；必要时调用 `wx.reLaunch` 重开页面。

### P2-7 小程序审批按钮权限表现

**证据**：`miniprogram/pages/approve/approve.js:56-61` 设置 `canApprove`，但 `approve.wxml:66-68` 操作区按钮只用 `disabled="{{processingOrderId}}"`，没有 `wx:if="{{canApprove}}"`；viewer/无权限用户仍看到“通过/驳回”，点击后才由 `requireWrite` 弹窗。
**建议**：按 `canApprove` 隐藏或禁用按钮并显示“仅查看”；服务端已有 `requireRole('admin','raw_grain','qu_making','brewing')`（`server/src/routes/inventory.js:176`），UI 应一致。

### P2-8 小程序登录品牌/admin 路径

**证据**：`miniprogram/pages/login/login.wxml:4` 固定“原粮车间备件管理”；`miniprogram/services/work-features.js:1-13` 只暴露“工段长履职/备件管理”两个入口；`miniprogram/pages/portal/portal.js` 未展示 3D 库位等 Web 功能。
**判断**：小程序“轻量查询”定位下功能少是产品取舍，不是必然缺陷；但品牌文案对制曲/酿酒/管理员账号不准确，需统一“数字工作台”或按角色显示。
**建议**：登录标题改中性名称；若保留原粮专属 App，则入口/文案与账号范围一致；不要在小程序恢复已退役的 PLC/TIA。

### P2-9 `:has()` 与构建目标

**证据**：`spare-parts-web-release/vite.config.js` `build.target:'chrome80'`；`Knowledge.vue:390` 与 `ModelCatalogShowroom.vue:120` 使用 `:has()`。Chrome80/旧 Android WebView 不支持，规则被忽略。
**建议**：关键布局（PDF 弹窗、缩略图）不要依赖 `:has()`；用条件 class（Vue 绑定）或父组件 class 表达，保留兼容。

### P2-10 Android 更新/错误边界

**证据**
- `MainActivity.java:288`：登录页 `updater.check(origin,false)` 自动检查；`AppUpdater.java:180` 发现新版立即 `state="downloading"` 并在 `download`（`:224`）后台下载，未先询问是否使用流量。
- `MainActivity.java:144-149`：`onReceivedError/onReceivedHttpError` 对主框架错误统一 `showConnectionFailure()`；401/403/404 也可能显示网络失败。
- `MainActivity.java:507-510`：无表单内容时按返回也弹“离开前请确认已保存”，属摩擦。
**建议**：自动更新改为 Wi-Fi/用户确认或仅在设置页手动；HTTP 错误区分 401（回登录）、403（权限）、404（入口失效）、5xx/网络；返回确认只在 dirty 状态提示。

## 操作路径核对（供 Codex 实机复核）

### 网页
- 登录 → Portal → 备件/工程/工作三卡；`router/index.js:38-56` 先 `getMe` 再按 feature 允许；`/app-download` 是唯一无鉴权业务路由（`:10`），其余 public 只有 `/login`。
- 手机入口：`AppShell.vue` 的 `catalogGroups` 仅保留 `nativeFieldPaths` + `/robot-program`；`Portal.vue` 桌面三卡不经过该过滤。Web 手机与 Android 原生入口集合不同，需确认是否为产品预期。
- 程序面板：`AbbRobotViewer.vue:19` 只在 `programOpen && !guide` 显示；示教器走 `AbbRobotGuide`，已传 `program-*` props；面板 `v-if="programMounted"` 保留会话。
- PDF：`Knowledge.vue:114` 弹窗内 `PdfReader`；`AbbDocumentReader.vue:6` 技术资料也复用；两条路径的父容器高度规则不同，需分别截图。

### Android
- 原生登录页 `NativeLogin.java`（加密存储 `CredentialVault`：AES-GCM/Keystore，不存明文）；登录后 token 只写入当前 WebView localStorage（`MainActivity.java:302-319`）。
- 原生首页 `NativeHome` 数据来自 `window.__WORKBENCH_MOBILE__`（`App.vue:98`），导航契约 `__WORKBENCH_NAVIGATE__/__WORKBENCH_BACK__`（`App.vue:153-154`）；`MainActivity:402-427` 有 legacy 回退。
- 文件/拍照/扫码：`NativeFireTools.choose` 只在 fire 页面拍照（`:69`），其他文件走系统 picker；相机权限按需请求（`:70-73`），拒绝后明确提示（`:102`）；`onShowFileChooser` 只委派给 `fireTools`（`MainActivity:199-201`）。
- WebView 错误/更新：见 P2-10；WebView 禁止文件访问/混合内容（`MainActivity:124-126`），下载校验当前 origin（`WebExports.java:44`）。

### 小程序
- 登录：`pages/login` 自动验证；Portal 仅两项功能；备件页有 `requireLogin({editor:true})`、`requireWrite`；API 对 raw employee/viewer 有路径/方法白名单（`services/api.js:12-22`）。
- 权限双保险：小程序 UI `requireWrite/canApprove` + 服务端 `requireRole`；但审批页按钮未按 `canApprove` 隐藏（P2-7）。
- 现场拍照/扫码：当前小程序没有消防/AGV/程序面板入口；不要按 Web 功能判断“缺失”，以“轻量查询”定位为准。若用户要求小程序也要拍照点检，需要另立范围，不在本轮。

## 清理候选（只登记，未执行）

下列仅根据本地静态证据列出，**DSH 未移动/删除任何文件**；具体是否可回收由 Codex 核对引用、进程、回滚需求和用户授权后执行。

1. **旧发布包**：`output/spare-parts-v1.9.10-20261019-full-robot-reader-current-attendance.tar.gz`（16.5 MB，2026-10-19）与当前 23:56 的部署/QA 文档并存；需确认线上/回滚基线后再判定，不能按日期直接删。
2. **旧构建产物**：`spare-parts-web-release/dist/` 属于可重建产物；若线上直接使用该目录或部署暂存仍引用，必须保留/先切新构建；不得先删后构建。
3. **本地协作临时目录**：`.local/abb-*`、`.local/agv-*` 等历史证据/临时脚本。`abb-program-*`、`abb-workcell-controls-*` 含机器人真实程序/本轮验证资料，可能仍被 Codex 使用；先只读核对，不批量移回收站。
4. **Windows 临时/下载目录**：本轮 DSH 未扫描/未操作；Codex 已自行盘点，回收前需保留个人资料、安装源、其他项目数据。
5. **服务器**：`/opt/spare-parts/server/.private` 的机器人程序 ZIP 是**在用程序备份库业务资料，必须保留**；数据库、上传、`.env`、账号、其他项目运行文件、必要回滚资料同样保留。历史部署/重复发布包/临时缓存只有在核对进程、软链接、定时任务和回滚需求后才可移入服务器私有回收目录。
6. **已退役旧 GLB**：`public/models/abb-irb6700/` 当前已不见 `feeding-buffer.glb`/`supply-conveyor.glb`，无需再按旧资产清理；若其他位置仍有副本，先搜索引用再处理，不能删除 `tool-640/700`、`irb6700`、`flexpendant`、`gujing-pot` 等在用资产。

## 未验证边界与冻结

- 本报告没有实际打开浏览器、原生模拟器或真机；没有截图、没有新端口、没有部署、没有改代码。P1/P2 中涉及视觉/手势的结论需要 Codex 在浏览器/设备上复现/截图确认，特别 P1-1、P1-4、P2-1。
- 已有测试/构建通过只能说明回归覆盖，不等于实际使用验收；本轮不重复宣称 623/55 为新增实测。
- Codex 正在修的三项（手机面板双层滚动、示教器速度双向同步、技术资料暂停动画）归 Codex 修复；本报告只提供证据和复现条件，不与其并发改文件。
- 报告文件：`docs/WEB_APP_DSH_USAGE_AUDIT_20261104.md`。SHA256 见交付回复（写入后冻结）；此后本报告不再修改，若 Codex 修复/复测请以新报告或本文件的追加状态为准。
