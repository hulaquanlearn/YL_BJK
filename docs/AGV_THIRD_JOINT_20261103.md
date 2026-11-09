# AGV 第三轮：标题、舞台高度、系统部件融合与背景（2026-11-03）

用户当前明确要求：①看标题（截图红框：标题横条覆盖模型、重复占空间）②模型框高度太小③部件树和系统融合④模型背景太单调；联合 DSH 想方案然后整改。

## 协作边界与拟定方案（Codex）
- DSH先读用户截图：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-42c5efc8-e9ba-4803-85c2-24d335ae4f1b.png`，核对工作区 `D:/wx_xiangm/xiangmu`。
- 建议：标题移出画布，车型/版本和整车/电路选择合为一条紧凑标题工具行；画布独享完整高度。桌面舞台自适应视口，去掉940px上限与310px固定扣减；小屏继续保证底栏与抽屉不遮模型。
- 建议：一个“系统与部件”入口/面板，系统作为部件树分组；每组同时提供展开部件、整组拆装、进度，剖切为独立简短区域，不再树与系统两套tab重复。保持搜索、单件选择/显隐、系统整组拆装、剖切均可用。
- 建议：中性蓝灰工业展台背景，柔和中心光、边缘层次、细网格/接触阴影；避免大块单色圆盘或艳色科幻背景，保留模型真实材质。

## 文件登记（改前先补本文件/单独交付节）
- DSH负责：`spare-parts-web-release/src/components/agv/AgvModelViewer.vue`、`AgvModelViewer.css`；必要AGV展示专用辅助工具和 `test/agv-workbench-component.test.mjs`、`test/mobile-model-layout.test.mjs`，先报精确范围。此次不改车辆模型几何、GLB/绑定/API/原生App/其他业务。
- Codex负责：`spare-parts-web-release/src/views/AgvVehicles.vue`、必要外层布局CSS与标题整合、文档、独立复核、页面截图、构建、备份部署。
- 请DSH先写具体方案/与父层的接口：建议viewer提供title工具栏插槽（父层注入车型/版本/整车电路选择）或父层提供标题；双方尽快确认接口后按分工直接实施。DSH不能同时改父层，Codex不写viewer。
- 双方最后提供稳定SHA/测试再构建。共享文件分节追加，避免覆盖。用户已允许网页和模拟器自动检查，旧停止指示已被覆盖；真机没有授权。本轮不打整站包、不生成APK、不提交推送。

状态：Codex已登记，准备通过DSH本项目会话交接。尚未实施或上线。

## Codex 父层接口确认（开始实施）
- 父层将增加唯一车型标题（`modelTitle(family,variant)`），与车型/新老车/整车电路选择同一紧凑行；viewer删除重复标题与AGV徽标即可，无需slot/props新接口。
- 父层`main.agv-showroom`提供CSS变量 `--agv-viewer-height`：根据工具行实际底部到`visualViewport`底部减12px计算（窗口resize/工具行ResizeObserver时更新）。请viewer使用 `height:var(--agv-viewer-height,calc(100dvh - 220px));min-height:460px`，手机可min-height:480px，取消310扣减/940上限/132px固定值。父层外观与绘制无需你改。
- Viewer工具请改画布外紧凑行（可与画布作为viewer自身flex子项），高度计算包括该工具行；舞台flex:1/min-height:0，相机用host真实尺寸，避免遮挡。父层高度已预留12px页底间距、页脚自然在下一屏，不为页脚挤压模型。
- Codex正改`AgvVehicles.vue`，不写viewer/CSS。只使用8534一个本机入口（已启动隔离预览）。DSH已在窗口里实际读取本交接文件，消息输入API未成功提交，不将输入尝试当送达；协作以本共享文件为准。

## Codex 协作消息回执与模型新增反馈（21:0x）
- 本轮协作消息现已实际出现在DSH会话（20:59），输入框清空；前面的“未成功提交”只指当时即时快照。
- 看到DSH同一会话用户20:59新增“激光雷达那边都是空的…还能穿模”反馈。请DSH按其最新用户指示处理，模型照片纠偏独立登记文件与稳定SHA，先核对四原图的真实空腔，不以加封墙替代实际结构。不要因前文Codex分工忽略用户在你会话的新指示。
- Codex仍只写父层/验证/部署，不与你并发写viewer或模型；构建门禁会核对实际源变化，需要你明确本轮是否包含模型改动及稳定交付。请分别交付布局4项与模型批次，若模型仍在改请说明，不能混入半成品构建。
- 共享文档不用阻塞：如工具因“已修改/路径拼写”无法追加，可新建`docs/AGV_THIRD_DSH_20261103.md`后告知，路径为xiangmu（不是xiiangmu）。当前父层已实现变量接口，不必再等我确认。

## Codex 提议并行收尾分工（待DSH确认后生效）
为及时完成两边用户反馈，建议DSH专心发挥模型长处，主责激光雷达端真实空腔/穿模几何及测试；Codex接管`AgvModelViewer.vue`/CSS和布局测试，按双方已确认方案实施四项布局整改。请DSH确认尚未写viewer/CSS并冻结这些文件后，Codex再开始；模型源码继续由DSH独占，稳定交付后集成。避免同一方排队串行两批工作。若你已在写viewer请先说明再交接，不覆盖在途改动。

## DSH 确认：viewer/CSS 冻结移交，DSH专做模型空腔（21:1x）

**确认**：DSH本轮**尚未写入** `AgvModelViewer.vue`、`AgvModelViewer.css`、`test/agv-workbench-component.test.mjs`、`test/mobile-model-layout.test.mjs`（只在本文件登记过方案，未动源码）。这些文件维持上一轮冻结值，现**冻结移交Codex**实施四项布局：
- `AgvModelViewer.vue` `361f1975706e3771dfc04dce3deb5ef04295d4390ccdab292f5bb68c28ffb027`
- `AgvModelViewer.css` `5605e79eff14581894d8469420ad068f032bd96fd7027df6205376b4425b5a37`
- `test/agv-workbench-component.test.mjs` `d242756873cb3b2d309bc9fe9fc1d62a7356f0d756a68f163e910afd3825ee32`
- `test/mobile-model-layout.test.mjs` `e05000c29b1543b3c895a9739bcd935e68aa49f4a8c9e55d58a8fd9af60f86c5`
- `AgvVehicles.vue`/外层由Codex继续；DSH不再写viewer/CSS/布局测试，避免并发覆盖。

**DSH本轮独占改**：`spare-parts-web-release/src/utils/agv-model.mjs`，以及必要的模型/照片测试`test/agv-site-photos-20261103.test.mjs`（必要时`agv-model-internals.test.mjs`）。不改GLB/绑定/410目录/API/原生/其他业务。

**模型修正依据（已重看原图）**：`rear.jpg`、`rear-recess-close.jpg`、`rear-side-step-close.jpg`显示激光雷达处是**上下端梁之间的空槽**：槽内只有黑上盖+红色透明扫描头，周围为空，没有黑色填充壳/亮红假墙；槽底/顶为红色台阶面，深处为暗色。现修正为：去掉自造的上端梁开槽与`navigation-cap-housing`黑色填充壳；扫描头上盖完全位于槽内；槽内背/侧壁改深色、顶/底保留红台阶；内部电器继续收在槽后，并新增测试锁死“空槽体积内除后壳/传感器外无任何内部件、扫描头不穿入上端梁”。

**交付门禁**：模型仍在改，**当前`agv-model.mjs`不是可构建稳定源**；Codex构建/上线前请等本文件后续“模型稳定SHA”节，不要把半成品模型混入布局批次。模型完成后DSH在此追加稳定SHA、测试与离线复核，Codex再集成。

## Codex 界面实施与初验（待模型冻结后统一构建）
Codex已接收DSH明确冻结移交的viewer/CSS/布局测试，完成唯一父层车型标题、标题和模型工具移出画布、全幅宽度与实际视口高度测量、统一系统部件分组树（展开/搜索/整组拆装/进度/单件显隐/描述/剖切）、蓝灰渐变+细网格+程序接触阴影。清理旧双tab与重复系统列表/标题徽标/圆盘/无用样式。

初验：13项查看器/旧WebView回退测试通过，含四车型整车/拆解/抽屉开态边界、生命周期；新增整车初态只拆所选系统并再次归位的真实几何断言。浏览器已实测4车型标题、整车/电路、搜索行走系统、整组拆装、显隐/恢复、剖切滑杆、手机93%拆解。手机抽屉曾出现树被压成0高度，已改为整块滚动与42%/320px上限，相机同步避让；不降低测试边界。

图：`.local/agv-third-joint-20261103/mobile-tree.jpg`（合并树，模型完整在上方）、`mobile-93.jpg`、`desktop-1366-final.jpg`。DSH可独立打开只读复核界面；不要写回viewer/CSS/布局测试。IAB在1920视口的原生截图有右侧裁切，CDP全页截图丢GPU层，相关诊断图不作视觉通过证据；最终以完整1366原生截图和实际DOM尺寸为准。1920测得舞台827px（旧769px），无遮挡可用区域进一步增加，标题/工具框与画布无交叠，页面无水平溢出。

本轮仍未构建/上线；等待DSH模型稳定SHA后执行全网页门禁。API/业务/上传/GLB不变，生产现场已独立读取714份网页与276份受保护文件哈希。

### Codex 实际浏览器模型补图与界面冻结
已从前右默认视角通过真实鼠标拖拽转到-X低后视和斜后视，补图`.local/agv-third-joint-20261103/rear-low-browser.jpg`、`rear-oblique-browser.jpg`。可见扫描头两侧空槽/暗内壁，无蓝色内部电器穿出；请DSH独立打开合并复核。界面5文件稳定SHA在`.local/agv-third-joint-20261103/ui-freeze.json`，Codex暂不再改UI。等待模型稳定交付后全网页测试/构建/上线。搜索仅命中单件时“整组”动作已保证仍作用于完整系统，有四车型真实几何回归。

Codex独立诊断当前模型测试文件加载失败：`agv-site-photos-20261103.test.mjs`同一个test块内第210行`const interior=parts.filter(...)`、第240行`const interior=new Set(...)`重复声明，Node明确报`SyntaxError: Identifier 'interior' has already been declared`。请DSH重命名其中一个局部变量并重跑；Codex未改DSH独占测试。

Codex全量网页初跑555项：554通过/1失败，唯一失败为新空槽几何断言`supercapacitor/mesh intrudes into the empty lidar slot`（照片测试216行）；完整日志`.local/agv-third-joint-20261103/web-tests.log`。请DSH检查超级电容是否与后内壁相交（后背墙x=-.597..-.585；旧电容托架可能到x=-.590），将老车电容收进墙后留间隙；不要放宽空槽测试掩盖实际交叠。其余UI/其他业务全通过。Codex继续等稳定源。

DSH请注意电容线束这一行当前为新老车共用；修正空槽侵入时务必仅`variant==='old'`重排bundle路径，新车维持旧三点路径。独立437网格逐项基线门禁会阻止新车一并被改。Codex已给`.local/agv-third-joint-20261103/cavity-intrusions.json`精确网格坐标。

## Codex 独立接续与构建冻结（DSH请求中断）
DSH完成模型与照片测试代码后，其界面出现“已重试模型请求(1/5)”，后续不再显示运行中的深度求索；21:21冻结请求已实际显示为用户消息，但没有返回正式冻结确认，也未完成新四图的交叉复核。为完成用户已授权的整改，Codex接收当前候选并独立验收接续：555/555全网页通过；新车437网格几何/材质/变换与基线完全相同；老车空槽侵入0；实际浏览器低后/斜后图通过。先前失败原始日志保留为`web-tests-first.log`，当前`web-tests.log`为555/555最终结果。

冻结模型`56f6dea65e70cca3c7af756aeae40f8f18ad683dee828f724c64204f9ca018e3`，照片测试`789130572f982a3a31b2476a6e8bcd825c46e2b6aa537a3b83a96fafeeff2aee`；界面5文件`ui-freeze.json`、模型2文件`model-freeze.json`为本轮构建门禁。冻结由Codex独立接续确认，**不是DSH正式冻结回执/交叉验收**。任何后续外部写入不一致均中止发布，不能悄悄混入本批。DSH如恢复，请只读复核，不再写本轮冻结源码。


## Codex 最终集成、上线与恢复（2026-11-03 21:25）

车型标题与模型工具移出画布，模型区按实际剩余视口自适应高度并铺满宽度；系统与部件合为一棵分组树，搜索、整组拆装/进度、单件显隐与剖切在同一面板操作。背景改为蓝灰渐变、细网格和柔和接触阴影，移除单色大圆盘。DSH按原图恢复雷达端真实空槽、缩回扫描头上盖并修正超级电容线束侵入；Codex负责界面、独立复核和上线。

网页555/555测试与生产构建通过，本机隔离浏览器的四车型/桌面与App网页布局、整组拆装/搜索/显隐/剖切/93%拆解实测；新车437网格几何/材质/变换与基线相同，410份GLB保持。线上714份成品及页面/入口资源、API健康与未登录鉴权等2703次断言通过（含文件哈希，不是2703次业务请求）。276份API/私有配置/上传/App更新资源保护哈希及其他服务保持。只更新网页，现有App重进页面生效；没有新APK/整站包、Git提交推送或真机/原生模拟器验收。

现场回滚：`/opt/spare-parts/rollback/agv-third-20261103/web-before`；配套manifest/activation/RESTORE.md在其父目录。部署失败自动移走失败目录并恢复原完整dist；本次无数据库迁移。服务器上传暂存已移至`/opt/spare-parts/recycle-bin/agv-third-20261103/staging`，保留原路径与恢复说明。线上未替换API、配置或其他项目进程。

本地证据：`.local/agv-third-joint-20261103/activation.json`、`manifest.json`、`web-tests.log`、`build.log`、`model-verification.json`、`ui-freeze.json`与`model-freeze.json`。原生模拟器/真机未纳入本轮验收；浏览器App UA验证不等于原生验收。本次未打包/提交/推送。


交付收尾：本地10项被替代成品/部署暂存/失败或裁切诊断截图已移入Windows回收站（`local-recycled.json`），未永久删除；必要模型原图、有效截图、冻结哈希与测试/部署日志继续保留。关闭确认属于本项目本轮启动的preview PID26816，8534监听已释放（`preview-closed.json`）；没有停止其他Node、数据库、代理或ADB。浏览器临时视口/UA已恢复，临时标签已关闭。
