# 2026-11-03 第二轮联合：穿模/画面与报障整体退役

用户本轮明确网页和App全部移除AGV报障/维修工单，车辆展示保留；又要求DSH与Codex联合。

## DSH独占范围（本轮请求，尚待确认接收）

- `spare-parts-web-release/src/utils/agv-model.mjs`
- `spare-parts-web-release/src/components/agv/AgvModelViewer.vue` 和 `.css`
- `spare-parts-web-release/src/views/AgvVehicles.vue`
- 必要的AGV展示纯工具与模型/工作台测试（先在此登记确切文件，不改报障测试）。

## 用户证据与明确问题

- 最新穿模截图 `.local/agv-retirement-20261103/intersection.png`：无屏端凹槽里蓝色内部电器穿出红内壁，侧罩/黑条与下层台阶交叠；不能只加黑色挡片。
- 最新整页截图 `.local/agv-retirement-20261103/layout.png`：两侧功能列表重复、面板过高，画布上部大量无意义空白、模型过小偏下，粗网格和大底环喧宾夺主，控制区与导航多层套框。
- 实物6图 `docs/agv-site-20261103/`，特别 `rear-recess-close.jpg` 与 `rear-side-step-close.jpg` 需要实际打开。忽略车号、二维码和设备管理贴纸。
- 当前代码已由Codex在18:17继续修改，不得覆盖回15:51/16:07旧源。当前SHA：
  - spare-parts-web-release/src/utils/agv-model.mjs: `ffec61bde4b3b305c9d9d059d1659abe4b74eb799a3dc2446b22919db9dbc1f1`
  - spare-parts-web-release/src/components/agv/AgvModelViewer.vue: `5e197d62e8fa19b864d818687b4c0702176798a707567ef160bdbaef37a5b1a6`
  - spare-parts-web-release/src/components/agv/AgvModelViewer.css: `e4d373622a3edaf335466dde253364fea8046fca7b02abdcc6ab0ec9c4d7539a`

## DSH任务

1. 对当前实际几何修正穿模：后端凹槽上壳/内壁/水平台阶/下壳要形成一致实体；检查后部电器、安装托架、线缆、控制器、储能与壳体边界，重新布置示意内部件，不能露在实物封闭位置或重叠穿出。黑腰线需要在实壳上连续，不能悬空跨凹口；新增射线/几何交叠检验，并从后侧低角度与正侧至少离线检查。新车437网格几何/材质/变换必须保持 `.local/agv-photo-correction-20261103/new-car-before.json` 基线。
2. 针对用户截图重整AGV展示布局：以大而完整的模型为主，缩掉无意义上方空白，统一简洁紧凑工具栏和字体层级，降低网格/底环存在感；消除两侧重复大列表（可采用左侧部件树+画布、系统操作收为紧凑工具区），不要恢复用户已删的说明/XYZ/状态条。保留真实拆装、聚焦、显隐、剖切、视角与电路切换交互，手机同样可用。沿现有配色系统，不做无关页面。
3. 只完成上述源码/纯数值或离线渲染检查与相应测试；交稳定SHA、真实结果、明确遗留后暂停这些文件，Codex独立复核后构建上线。

## Codex独占范围

网页/App/小程序AGV报障工单整个功能退役，含导航、业务入口、路由、API与权限、维修消息/QQ联动、数据管理和AI用途、原生菜单/推送、专用依赖/无效测试及说明；旧业务数据保留，废弃代码可恢复回收。另负责全局白边（index.html/styles/构建插件）、密钥与AI连通排查、整体集成、构建部署。DSH不得改这些文件、不构建部署打包、不动410GLB、API或私有配置。

继续禁止网页/真机UI自动操作。Computer Use仅用于当前DSH会话协作；离线几何/HTML渲染可用，不得据此称真机验收。


## 用户后续追加（本轮有效）

- 已明确恢复网页和App模拟器的界面自动检查授权（2026-11-03本轮文字回复），与旧停止指示不同；仍不代表授权提交生产业务测试数据。Codex将实际检查并共享截图，DSH可对照共同复核。
- 要求联合检查网页/App哪些需修复或重新美化，不限AGV一页。先完成本轮明确问题，DSH另做源码和截图的独立复核，列具体证据。
- 要求联合审查整体电脑无用/冗余（含旧清理记录、重复备份）并移回收站。Codex只读盘点候选与在用引用，DSH独立复核候选，不按文件时间或备份名称直接判废，不碰账号密码、在用开发环境、软件、有效业务资料与必要回滚。候选清单稍后补本文件。
- 备件模型颜色也须整改：新图`.local/agv-retirement-20261103/spare-colors.png`，白壳/浅背景融合、轮廓弱，模型和缩略图材质单一。DSH范围追加备件展示器/灯光/背景与模型材质（先登记确切文件，覆盖当前330目录及涉及的规格参考）；按来源和材质区分塑料壳、手柄、端子、DIN扣等，不随机上色，不篡改厂家色。无依据项保持示意边界。保留物料ID/URL/绑定和几何尺寸，先排查是不是统一材质覆盖/过曝导致，避免无根据批量改410GLB。此条明确取代前文DSH“不动410GLB”的材质范围限制；如确需改GLB先列文件和理由再改，Codex不并发写模型资源。


### 最新布局定案（用户授权布局由Codex决定）

用户新图 `C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-7a97c7c3-fb7c-4a4f-a317-c2e241fa05c9.png` 要求“尽量让这一整个都是模型，左右和下方都要调整”。采用画布占满工作区，取消左右常驻大栏；部件树/系统改按需打开的紧凑抽屉或浮层（不要遮住主要车身），底部合并紧凑拆装/视角工具条。默认整车放大居中，展开时动态适配不截断。无需等用户再选三方案。

Codex补充独占文件：`spare-parts-web-release/src/views/Warehouse3D.vue`（仅修`:global(#app)`编译成裸`#app`导致全站8px白边及根高度污染）；DSH请勿并发修改此文件。

## DSH 接收登记（2026-11-03 18:5x）

已收到本文件、`AGV_DISPLAY_FOLLOWUP_20261103.md`、`FOLLOWUP_DELIVERY_20261103.md`及用户追加；已实际打开`intersection.png`（后部凹槽穿模/蓝色内部件穿出/侧壳台阶交叠）、`layout.png`（左右重复大列表、画布上部空白、模型偏小）、`spare-colors.png`（白壳与浅背景融合、轮廓弱）、`codex-clipboard-7a97c7c3…png`（全画布定案）与`docs/agv-site-20261103/rear-recess-close.jpg`、`rear-side-step-close.jpg`。当前四个AGV源SHA与本文件列出的`ffec61bd…/5e197d62…/e4d37362…`一致，未回退旧源。

**DSH本轮独占写入的确切文件（当前SHA，改完在本节补最终SHA并冻结）**

| 文件 | 当前SHA256 | 用途 |
|---|---|---|
| `spare-parts-web-release/src/utils/agv-model.mjs` | `ffec61bde4b3b305c9d9d059d1659abe4b74eb799a3dc2446b22919db9dbc1f1` | 后部凹槽/侧壳台阶穿模、内部件重新收容、连续腰线、离线几何检验 |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.vue` | `5e197d62e8fa19b864d818687b4c0702176798a707567ef160bdbaef37a5b1a6` | 全画布布局、紧凑工具栏、部件树/系统按需抽屉 |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.css` | `e4d373622a3edaf335466dde253364fea8046fca7b02abdcc6ab0ec9c4d7539a` | 全画布/抽屉/工具栏/响应式样式 |
| `spare-parts-web-release/src/views/AgvVehicles.vue` | `19fc7de191cce9c091418752113d72c9d96a1d47a62624ea023e7082eb258240` | 页头/车型/结构-电路工具条压缩为全画布服务 |
| `spare-parts-web-release/src/utils/agv-presentation.mjs` | `0a619244b712d59b7a355fbb5f16c723ed10e31b34eab79ee7d89d26792da6e6` | 仅在布局需要调整分组/文案时改 |
| `spare-parts-web-release/src/utils/agv-workbench.mjs` | `4925be031b6a47278f17d7cbd54afe272885584178d3ee2701cf636084d7624f` | 仅在布局/交互纯逻辑需要时改 |
| `spare-parts-web-release/src/components/ModelPreview.vue` | `7a02f4ee0bd9998818b316b2a9afda0a1dd5aadb31a2189dddf20199bdd6a1f8` | 备件展示器灯光/背景/材质呈现与轮廓可读性 |
| `spare-parts-web-release/src/components/ModelCatalogShowroom.vue` | `4a2379d2ae484a67c6ba35abcd37f443870ef174719cc66d9714914bd7f71191` | 展示台画布/信息区呈现（如需要） |
| `spare-parts-web-release/src/components/ModelThumbnail.vue` | `843aaa90523384f3d95934ffe882ee5f94a319cf24beb85fbbb99c2eaa418074` | 缩略图与浅背景融合 |
| `spare-parts-web-release/src/utils/showroom-stage.mjs` | `a041a250e6baf60d0ff570366095d21999bf0000e594b701e2d418ec2d08c442` | 展台/背景/雾/配色 |
| `spare-parts-web-release/src/utils/model-thumbnail.mjs` | `b307ee8d351d789d362695dd0a09e8dd99205055aa1328d6b6037f8fb57d264b` | 缩略图渲染背景/灯光/材质 |
| `spare-parts-web-release/src/utils/model-observation.mjs` | `fc3e0d69ee64662c209b823731e996a1f3b4c2b8e0c91b4950e8f95a090c1c57` | 仅在需按部件类别区分材质/部件映射时改，保持观察契约 |

**测试（必要时改/补，先列本表）**：`test/agv-site-photos-20261103.test.mjs`、`agv-model-internals.test.mjs`、`agv-envelope-20261102.test.mjs`、`agv-model-shape.test.mjs`、`agv-workbench-component.test.mjs`、`agv-workbench.test.mjs`、`agv-presentation.test.mjs`、`agv-model-selection.test.mjs`、`mobile-model-layout.test.mjs`、`spare-model-presentation.test.mjs`、`model-catalog-showroom.test.mjs`、`model-observation.test.mjs`、`reviewed-model-assets.test.mjs`、`model-display-status.test.mjs`。

**明确不碰（Codex独占）**：`src/views/Warehouse3D.vue`、报障/维修全端退役相关源码与测试、`index.html`/全局`styles.css`/构建插件/白边、`server/`与API/数据库/私有配置、410份GLB（如确需改先列文件与理由）、PDF/消防/AI/个人中心/数据管理、Android/iOS/小程序、部署与打包。不构建、不部署、不提交/推送、不开网页或真机UI自动操作；以离线CPU几何渲染、纯函数/组件测试和Codex共享截图做复核。

**实施顺序**：①模型后部凹槽/侧壳台阶一致实体+内部件收容+连续腰线，离线低角度/正侧复检并补射线/交叠测试；②全画布布局（画布占满、左右按需抽屉、底部紧凑工具条、默认放大居中、展开动态适配、手机可用）；③备件展示器背景/灯光/材质可读性（先诊断过曝/统一材质覆盖，避免无依据改GLB）；④跑AGV+展示相关测试，交稳定SHA/真实结果/遗留并冻结，等Codex复核构建上线。电脑清理候选与网页/App截图复核待Codex提供后另做。

状态：18:5x 已接收并开始实施；实施期间上述文件由DSH单方写入，Codex请勿并发修改。


## Codex 电脑清理候选，等待DSH独立复核

只读盘点：`.local/agv-retirement-20261103/computer-inventory.json`；具体候选：`.local/agv-retirement-20261103/computer-cleanup-plan.json`。盘点覆盖C/D用户桌面、下载、安装包及本项目临时/发布区域；未将系统或安装目录判废。请逐项检查上述11个旧QA/退役工单资料目录是否有你当前任务依赖、唯一业务资料或必要回滚。若认可回收，在本节写明确结论；不同意的列保留原因。不要自行删除、不要把只读盘点称作全电脑已清完。Codex执行Windows系统回收，留当前一份清单，旧清理记录随旧QA一起回收。

补充集成进度：报障源码与原生提醒已移除；旧数据未删。`mobile-model-layout.test.mjs`仅已删除退役CSS路径引用，其余布局测试由DSH调整。全局白边修复已经Vue编译测试验证，实际1920桌面门户无白边，截图`.local/agv-retirement-20261103/portal-desktop.png`。服务器密钥两种传输均已恢复200真实回复，不再是503；实际业务调用下一步核验。Android23生产签名构建和lint通过，正在启动模拟器。

## DSH 交付（2026-11-03 19:0x）：模型穿模/全画布/备件材质（已冻结，未构建部署）

**状态**：DSH登记范围内完成并冻结；未改Codex独占文件（报障退役、`Warehouse3D.vue`、全局白边/`index.html`/`styles.css`/构建插件、PDF/消防/AI/个人中心/数据管理、server/API/DB、410 GLB/目录、Android/iOS/小程序）；未构建、未打包、未部署、未提交推送；Codex独立复核后构建上线。

### 稳定文件与SHA256（改完即冻结）

| 文件 | 行数 | SHA256 |
|---|---:|---|
| `spare-parts-web-release/src/utils/agv-model.mjs` | 489 | `bfad32eaa802b70396d578f10ea53bdabea55ddbd9eb75bb618e4ac62a2a5a40` |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.vue` | 313 | `361f1975706e3771dfc04dce3deb5ef04295d4390ccdab292f5bb68c28ffb027` |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.css` | 203 | `5605e79eff14581894d8469420ad068f032bd96fd7027df6205376b4425b5a37` |
| `spare-parts-web-release/src/views/AgvVehicles.vue` | 11 | `de8f8d08e23093bcd8bdc10fb9df63cae80dd466d117705f4a54af1780fa6e07` |
| `spare-parts-web-release/src/components/ModelPreview.vue` | 224 | `8e5c0c3c3e2f0ac8160c01aa503cd0d324f65cbb082587569a759287734c9b8d` |
| `spare-parts-web-release/src/utils/showroom-stage.mjs` | 53 | `258b815e234e9f46db0f74ed4229506de274b252ddb67ee187f1925967391c64` |
| `spare-parts-web-release/src/utils/model-thumbnail.mjs` | 74 | `fece98a213f2d81504112b3a7bba7a1cbbdd63134403f461167e779bd4b7c3c7` |
| `spare-parts-web-release/test/agv-site-photos-20261103.test.mjs` | 280 | `0684200a4c5a1656f185283bc4ac27831bb9a202907a8c3f9b525a84fe71ae8a` |
| `spare-parts-web-release/test/agv-workbench-component.test.mjs` | 268 | `d242756873cb3b2d309bc9fe9fc1d62a7356f0d756a68f163e910afd3825ee32` |
| `spare-parts-web-release/test/mobile-model-layout.test.mjs` | 81 | `e05000c29b1543b3c895a9739bcd935e68aa49f4a8c9e55d58a8fd9af60f86c5` |
| `spare-parts-web-release/test/spare-model-presentation.test.mjs` | 171 | `0bccf727981db60a8df4d6e52bc2deaa7d710bebb3258d88391c4238d5bbdf27` |
| `docs/AGV_SECOND_JOINT_20261103.md` | 本文 | 末尾记录 |

未改但登记：`agv-presentation.mjs`、`agv-workbench.mjs`、`model-observation.mjs`（无需统一材质覆盖，保留原SHA）；未改410 GLB/catalog/API/DB。

### 验证（本地实跑，未上线）

- `node --test test/*.test.mjs` → **553通过/0失败/0跳过**（报障退役后基线；DSH改前同口径553）。
- AGV子集 `node --test test/agv-*.test.mjs` → **54通过/0失败**；新增：后部凹槽/侧壳闭合、低后侧/侧向射线不露内件、裙板填充、腰线不跨轮口、抽屉布局/移动端。
- 新车基线：用Codex的`verify-models.mjs`逐网格比对`.local/agv-photo-correction-20261103/new-car-before.json`，**deepEqual通过**，437网格hash `5c86963331623ebd530d98394b4fe809ca723f2c556184bb0fbe175050db7963`与改前一致；旧车410网格、全车0 TorusGeometry、bounds 1370×459.97×720。
- 离线几何：`.local/agv-second-joint-20261103/geometry-views.png`（9视图：前/后/左右侧/顶/斜/后低角两侧/侧后低），纯CPU正投影，非浏览器截图。
- 未采集浏览器/App模拟器截图（本会话无浏览器自动化端口）；布局由SFC编译+SSR+行为测试+CSS规则断言验证，像素级视觉由Codex截图后DSH对照复核。

### 模型修正（`agv-model.mjs`）

- **后部穿模**：上层端梁开槽（y≈.275–.335）容纳扫描头上盖；上下端梁间为约72mm进深的封闭浅凹槽（背板/顶/底/侧/台阶齐全，深红内壁），删除旧`rear-gap-recess`大内衬、43cm深台阶与内墙；控制器/储能/逆变器等内部件重新收容到背板以内，低后侧与侧向射线首个命中必为车壳。
- **侧壳后段**：原开放“抽屉”缺口改为上壳+约27mm凹腔+下层红台阶；补内侧壳板、台阶平台/凹腔顶/前端回板/底部裙板与短裙填充，黑腰线随实壳连续、不跨凹口；消除台阶/黑条交叠与透光缝。
- **导航**：黑上盖入槽、红透明扫描窗对外无遮挡；前后TIM各1保持；包络/说明同步（`geometryRevision` rev3）。
- 测试覆盖反向断言：不再露内件、凹槽有背板、侧凹腔由壳板封闭、腰线不跨轮口。

### 全画布布局（viewer/CSS/AgvVehicles）

- 单画布占满工作区（`.agv-model-viewer`高度 clamp，顶/底工具条浮层），取消左右常驻栏；**部件树+系统/剖切合并为一个按需抽屉**（互斥标签；桌面打开时模型水平避让，手机为底部浮层）。
- 底部单条紧凑工具条：拆解滑杆/百分比 + 一键拆开/继续暂停/一键复位 + 速度 + 俯视/侧视/查看全车；顶栏仅车型标题+部件/系统/标签/旋转；隐藏“部件功能说明”常驻底栏，改为选中时浮层说明。
- 默认放大居中：相机适配扣除顶/底工具条与抽屉占位（margin 1.03/1.12），展开/聚焦动态适配不截断；网格12格半透明、删除大底环；保留真实拆装/聚焦/显隐/剖切/视角/标签/旋转交互；电路页未改。
- 手机：顶栏堆叠、44px 按钮、抽屉 bottom 160px 浮层；旧WebView无`@container`时有`@media`等价规则。

### 备件材质（ModelPreview/showroom-stage/model-thumbnail）

- **诊断**：抽查`/models/ledger-20261008/5.glb`（微型断路器3P）确有5种材质（绝缘壳体/操作手柄/接线端×2/DIN卡扣），`normalizeShowroomModel`不覆盖资产材质；白壳融合的**主因是展示灯光/环境/浅背景/雾过曝**，不是统一材质覆盖。
- **修正（仅展示层，未改GLB/目录/尺寸/绑定/厂家色）**：降低exposure与半球/平行光强、环境强度.5、加轮廓补光、加深描边；背景/雾/展台/地台改中性偏深一档钢蓝灰；缩略图改中间调背景+ACES+补光、相机拉近；预览相机拉近（8.8/6.4）。塑料壳/手柄/金属端子/DIN扣在现有材质下可区分，不随机上色。
- 未改`model-observation.mjs`；未批量改410 GLB。

### 遗留与待复核

1. 浏览器/App模拟器实际截图未由DSH采集（本会话无浏览器自动化）；Codex共享截图后DSH对照复核像素级布局，尤其抽屉避让与手机底部工具条高度。
2. 后凹槽/侧台阶高度、凹深、TIM层位、操作器比例仍为照片比例估计，非毫米标定；侧台阶为简化直角体。
3. 备件材质为展示层修正；若仍需更强逐类材质区分，可基于GLB已有材质名/部件映射做预设，需另批且不改厂家色/410GLB。
4. 未构建/部署/打包；线上仍是Codex上一批（18:17后），本轮文件冻结待Codex复核。

## DSH 对 Codex 清理候选的独立复核结论（只读，未删除）

已读`.local/agv-retirement-20261103/computer-inventory.json`与`computer-cleanup-plan.json`，逐项检查11个候选目录内容、当前源码/测试/文档引用、唯一业务资料与必要回滚；**未执行任何删除、未清空回收站**。

**认可回收（10项）**：`attendance-qa`、`agv-app-20261028`、`agv-floor-input-20261028`、`agv-reader-20261102`、`agv-viewport-20261103`、`agv-refresh-20261102`、`agv-workbench-20261102`、`app-login-20261027`、`mobile-layout-20261102`、`user-fixes-20261024`。
- 依据：均为旧QA截图/日志、已退役功能工件、旧`before/`源码或旧清理回执；当前源码/测试无引用（仅历史文档提到路径）；服务器回滚与当前部署回滚保留；无当前任务依赖。
- `attendance-qa/real-analysis.json`含2026-09考勤分析（83人、姓名等），考勤路由已退役（`feature-access.mjs`对`/attendance`返回false），数据库仍为权威；回收后仅Windows回收站可恢复。
- `agv-reader-20261102`、`agv-app-20261028`、`user-fixes-20261024`含旧清理回执/`before`；`CLEANUP_HISTORY.md`与`AGV_APP_UPDATE_20261028.md`引用其路径，回收后历史链接失效但摘要保留。**执行前建议**把`user-fixes-20261024/recycle-*.json`与`extra-cleanup-summary.json`、`agv-reader-20261102/cleanup-local.json`、`agv-app-20261028/recycled-final.json`/`recycled-icons.json`复制到本轮清单目录留档（体积很小），再回收目录。

**不同意回收（保留1项）**：`.local/app-ui-20261027`。原因：根`README.md`、`docs/PROJECT_DECISIONS.md`、`output/DEPLOY_V1.9.10.md`仍把它写成该批“测试与验收证据”；虽属历史批次，仍是唯一本地证据链，体积约2.1MB，回收收益小、断链风险更明显。若确需回收，先把被引用的`android-final-screenshots/`等证据复制到保留目录并同步更新上述3处文档，再回收，不能直接丢。

**重复项**：plan中robot-library `backup.zip`两份SHA相同；`review-20261018`在保留清单、`robot-program-qa`非本批候选，本轮均不动；将来去重需先确认无测试读取再保留一份。

**边界**：本节只是独立复核结论，不代表已回收或全电脑已清理；Windows系统回收由Codex执行，执行时保留本轮清单与回收回执（原路径/时间/恢复方式），业务数据、上传、现场配置、有效回滚与账号密钥不动。

## DSH 回执与截图交叉复核（2026-11-03 19:1x）

**清理候选**：已在上一节完成11项逐项复核：认可回收10项，保留`.local/app-ui-20261027`（根README/PROJECT_DECISIONS/DEPLOY_V1.9.10仍引用其为验收证据，约2.1MB）；未删除、未清空回收站。执行前建议先留档`user-fixes-20261024/recycle-*.json`等小体积旧回执，再回收对应目录。

**Codex共享截图交叉复核**（已实际打开）：
- `agv-parts-desktop.png`：确认新全画布布局在真实浏览器生效——单画布、顶栏紧凑（标题+部件树/系统剖切/标签/旋转）、部件抽屉按需覆盖左侧且模型自动右移不被遮挡、底部单条拆解/视角工具条、无左右常驻列表、无大底环/粗网格；模型明显放大居中；此侧后视角下后侧台阶与黑腰线连续，未见蓝色内部电器穿出。**仍需一张正后/低后视角截图**确认凹槽内扫描窗、上盖入槽与上下端梁细节（本会话无浏览器自动化，无法自截）。
- `portal-desktop.png`、`warehouse-desktop.png`：左右/上下边缘未见8px白边，内容满幅；与Codex白边修复结论一致（属Codex范围，DSH仅交叉复核）。
- 共享截图文件名为`.png`但实际是JPEG字节；DSH另存转换副本用于查看，未改共享原文件。

**冻结与SHA（19:0x交付后未再改源码）**：
- 模型：`agv-model.mjs` `bfad32eaa802b70396d578f10ea53bdabea55ddbd9eb75bb618e4ac62a2a5a40`
- 布局：`AgvModelViewer.vue` `d9000414b0d411ce336b558407089288a76a4f6d6ab6975e4c57259afa851d65`；`AgvModelViewer.css` `3381ecfb636b7565d93af4df282117f50f573e316454bed28a74c646c7fe2338`；`AgvVehicles.vue` `de8f8d08e23093bcd8bdc10fb9df63cae80dd466d117705f4a54af1780fa6e07`
- 备件材质：`ModelPreview.vue` `8e5c0c3c3e2f0ac8160c01aa503cd0d324f65cbb082587569a759287734c9b8d`；`showroom-stage.mjs` `258b815e234e9f46db0f74ed4229506de274b252ddb67ee187f1925967391c64`；`model-thumbnail.mjs` `fece98a213f2d81504112b3a7bba7a1cbbdd63134403f461167e779bd4b7c3c7`
- 测试与其他文件SHA见上方交付表；以上文件冻结，等待Codex独立复核构建。

**边界**：Codex侧API385测试、Android23签名/lint、三项AI业务真实调用成功、模拟器netsimd拒绝访问等均属Codex范围，DSH未独立复跑，不据此自称已验收；DSH未构建/未部署/未打包，如Codex截图指出差异再解冻对应文件修改。

## Codex 像素复核追加（19:12，需DSH再调整手机布局）

桌面截图：`.local/agv-retirement-20261103/agv-parts-desktop.png`、`agv-exploded-desktop.png`、`agv-section-desktop.png`，抽屉打开时模型确已向右避让，0→100→0拆装/复位与剖切开关均实际操作通过。新车437独立指纹通过。网页553/API385最终测试通过。

手机截图 `.local/agv-retirement-20261103/agv-app390-before.png`：这是浏览器390×844的App UA/触屏模拟，不冒充原生模拟器。发现`.agv-stage`仅58vh，整页下方约250px空白，模型有效空间偏少；请在你登记的viewer/CSS和相关测试范围内，再收紧手机底栏（可将视角/速度收进按需选单，维持44px触摸目标），画布使用剩余可视高度，同时抽屉不要整片挡车。不得裁切完整整车。请对照截图独立复核后改、交新SHA并再冻结；Codex本轮暂不构建，等待手机修正版。无需修改API/原生/全局CSS。

清理结论已收到：按DSH意见保留app-ui-20261027，其他10项在本批交付核验后回收。旧清理记录先合并恢复映射到本轮一份清单，不另保留散乱重复副本。三项AI业务代码真实合成调用全部成功见`.local/agv-retirement-20261103/business-ai-check.json`。原生签名/lint通过；当前电脑模拟器qemu在ucrtbase.dll异常0xc0000409，已试官方稳定37.2.13、新隔离AVD和有/无界面，尚不能启动，不声称原生视觉已通过。

## DSH 手机布局修正（2026-11-03 19:2x，回应 Codex 19:12 像素复核）

已实际打开`agv-app390-before.png`（390×844 App UA 触屏模拟）复核：舞台仅58vh、页底约250px空白、底栏3行偏高、模型有效空间偏少；桌面截图确认抽屉避让/拆装复位/剖切已通过。按登记范围只改 viewer/CSS 与相关测试，模型/备件材质/`AgvVehicles.vue`未动。

**修正**：
1. 手机画布填满剩余视口：`.agv-model-viewer`改为`height:calc(100dvh - 132px)`（含`vh`回退、`min-height:540px`），`.agv-stage`改回`position:absolute; inset:0`；删除58vh/420px固定舞台。390×844下画布约712px高，页底空白消除。
2. 底栏3行→2行：第一行拆解滑杆（100%宽）；第二行`.agv-controls`横向排列拆开/暂停/复位/速度/俯视/侧视/查看全车（溢出可横向滑动）；顶栏按钮、抽屉tab/关闭、搜索、底栏按钮统一44px触摸目标。
3. 手机抽屉不遮整车：底部sheet `bottom:118px`、`max-height:35%/280px`；抽屉打开时相机按“工具栏+sheet”重算`padBottom`，把整车适配到sheet上方并居中（关闭恢复全画布），不裁切完整整车。
4. 桌面布局不受影响：`.agv-controls`在桌面仍单行内联，抽屉避让/拆装/剖切交互未改。

**验证**：`node --test test/*.test.mjs` → **554通过/0失败/0跳过**；新增手机390×844（含抽屉打开）相机不裁剪、整车中心在sheet上方、关闭后回中；手机CSS断言更新为`calc(100dvh)`、`position:absolute`、两行底栏、44px触摸、抽屉118px。AGV子集与桌面截图行为不变。

**新SHA（4文件冻结；模型/材质/AgvVehicles不变）**：
- `AgvModelViewer.vue` `1f90dd80aab111f0cdab1c48f786b4a3a31eb3ed12a80896df6c0e54af44610f`
- `AgvModelViewer.css` `1a610ab32d28fa1eb3b4db9734a57ee2027d1986a4f373e4d060c2525141e394`
- `test/agv-workbench-component.test.mjs` `f5a0f4968e50281899ebe69cf18f41f77d120da0d8d407a267819d2b7fa07984`
- `test/mobile-model-layout.test.mjs` `5b282df8c3c1f5b2e42d0e9b66b86880aad40129932668ee521d0438a7fc0e6f`
- 模型`agv-model.mjs`仍`bfad32eaa802b70396d578f10ea53bdabea55ddbd9eb75bb618e4ac62a2a5a40`；材质三文件SHA同上一节；`AgvVehicles.vue`仍`de8f8d08e23093bcd8bdc10fb9df63cae80dd466d117705f4a54af1780fa6e07`。

**遗留**：DSH无浏览器自动化端口，390×844为离线CSS/相机断言，不是像素截图；请Codex构建后补一张手机AGV页截图（抽屉开/关两态）供对照。如仍有页底空白、整车裁切或底栏超宽，按截图再解冻对应文件。DSH未构建/未部署；本轮文件再次冻结，等待Codex手机版构建。

手机整改补充：当前`fitCamera`固定`padTop=72,padBottom=98`，而390截图上栏约86px、底栏约154px。请同步按实际浮层占位/手机布局适配相机，开抽屉也要留模型可视空间，不能只把画布加高后将车挡在抽屉后。手机部件抽屉开态截图马上补充。

## DSH 手机底栏修正（2026-11-03 19:3x，回应实机像素反馈）

已实际打开`agv-app390-final.jpg`（文件实际为375×812）复核：画布已填满；但底栏靠横向滚动访问俯视/侧视/查看全车，默认看不到后面按钮，点击俯视后滚动位置使左侧一键拆开被裁掉。关于追加的`padTop/padBottom`：19:2x起相机已改为手机自适应（`padTop=104`；`padBottom=底栏约100 + 抽屉打开时的sheet高度`），非固定72/98；本次沿用并补开抽屉断言。

**修正（仅viewer/CSS/相关测试）**：
1. 去掉手机底栏横向滚动：第二行固定为 `一键拆开 / 暂停 / 一键复位 / 更多▾` 四个44px按钮；`.agv-controls`改`overflow:visible`，不再有滚动导致的按钮被裁。
2. 新增“更多”向上弹出的紧凑菜单（`<details>`，240px宽、44px触摸）：包含**视角（俯视/侧视）+ 查看全车 + 拆解速度**；选择后自动收起；全部功能仍可访问。
3. 桌面保持原内联控制条（速度/俯视/侧视/查看全车直接可见），`.agv-more`仅在手机显示；桌面布局与已通过的抽屉避让/拆装/剖切不变。
4. 相机占位与浮层一致：手机`padTop=104`、底栏约100；抽屉打开时`padBottom=底栏+sheet`，整车适配到sheet上方，不遮挡、不裁切。

**验证**：`node --test test/*.test.mjs` → **554通过/0失败/0跳过**；手机CSS断言更新为`.agv-controls overflow:visible`、隐藏内联`.agv-extra`、显示`.agv-more`、菜单绝对定位；组件断言“更多/俯视/侧视/查看全车/拆解速度”均在DOM；390×844抽屉开/关相机不裁剪与回中测试保持通过。

**最终SHA（4文件再冻结；模型/材质/AgvVehicles不变）**：
- `AgvModelViewer.vue` `9b4a960ef0eb995946bbfb0da50a9660fa147cd094cbd16d4bd7b66c1861429a`
- `AgvModelViewer.css` `7f42320a1fde71e9871252f3faf9d5733819b93b719355dfc913f4950a40ff19`
- `test/agv-workbench-component.test.mjs` `fc8c5a46c66508f78efd84bc23681e4bb41bb967edea72575c996a5c7ca5ab69`
- `test/mobile-model-layout.test.mjs` `fe3a7a0d37a862056505cbc2d71c6947b180ac90c62bfc1684c23e5bcfac085c`
- 模型`agv-model.mjs`仍`bfad32eaa802b70396d578f10ea53bdabea55ddbd9eb75bb618e4ac62a2a5a40`；材质三文件SHA同前；`AgvVehicles.vue`仍`de8f8d08e23093bcd8bdc10fb9df63cae80dd466d117705f4a54af1780fa6e07`。

**遗留**：请Codex构建后补手机截图（底栏默认、更多菜单展开、部件抽屉开态）供DSH对照；本会话无浏览器自动化，以上为CSS/DOM/相机断言，不冒充像素截图。DSH未构建/部署，文件已再次冻结。

## DSH 联合总检与剩余美化/边界（2026-11-03 19:4x）

已只读`docs/AGV_RETIREMENT_DELIVERY_20261103.md`（Codex独占，未改），并实际打开本轮共享截图：`spare-material-desktop.jpg`、`raw-detail-app390.jpg`、`replenishment-app390.jpg`、`account-app390.jpg`、`statistics-desktop.jpg`、`movements-desktop.jpg`，另复核AGV的`agv-app390-menu.jpg`、`agv-app390-drawer-final.jpg`、`agv-rear-final.jpg`。

### AGV 截图复核与再修正

- `agv-app390-menu.jpg`：底栏已是 `一键拆开/暂停/一键复位/更多▾`，无横向滚动；“更多”向上菜单含视角（俯视/侧视）、查看全车、拆解速度，44px触摸，功能可达——上轮“横滚隐藏视角/拆开被裁”已解决。菜单展开时会临时覆盖滑杆行，属瞬态浮层，可接受。
- `agv-app390-drawer-final.jpg`：**发现抽屉打开时整车仍被sheet遮住大半**（只露顶板）。已在本轮修正：手机sheet上限降为`30%/240px`，相机`padBottom=118(底栏)+sheet+10`，整车适配到sheet上方；新增断言“整车包围盒最低点NDC>0.05（在sheet上方）”。需Codex用新构建重拍开态截图确认。
- `agv-rear-final.jpg`：实际是前右视角（右侧可见操作屏），**仍看不到后端凹槽/扫描窗**；请补一张正后或低后视角截图。离线九视图与射线/交叠测试仍是当前几何证据。
- 桌面`agv-final-desktop.jpg`/`agv-side-final.jpg`与此前桌面抽屉避让/拆装复位/剖切通过结论一致；桌面对`.agv-more`隐藏，控制条保持内联。
- 联合记录结论：AGV布局/手机底栏/抽屉遮挡已修；剩余仅“真实后视截图确认”。

### 备件模型库

- `spare-material-desktop.jpg`：已有材质层次可见（白壳、蓝色操作/端件、金属螺钉与DIN件能区分），模型不再与背景融成一片；GLB颜色/材质、410份资源、目录ID/尺寸/绑定未改。
- **仍可美化（不阻塞本批）**：展台背面仍是较大一块平灰背景，白壳与浅灰背景对比仍偏弱；后续可加轻微渐变/暗角或接触阴影，并折叠右侧较长的厂家证据/绑定说明。**边界**：本轮只验证合成目录7项中的三极断路器，未逐个验收330目录所有型号；精确厂家配色仍需对应型号实物/厂家资料，不能把通用示意当实物核验。

### 其他业务截图（仅独立复核，未改其源码）

| 截图 | 观察 | 结论/边界 |
|---|---|---|
| `raw-detail-app390.jpg` | 周表为宽表，手机需横向滑动，列头被裁切，文字偏小 | 与Codex美化建议一致：后续加“按天卡片视图”并保留周表；本批不改 |
| `replenishment-app390.jpg` | 卡片布局清晰，搜索/筛选/库存详情/3D定位可用 | 合成数据中“预计金额未配置”是数据状态，不是布局故障 |
| `account-app390.jpg` | 基本资料/账号安全卡片正常；保存按钮呈浅色（预览账号无改动/受控） | “未分配”为合成预览账号数据；非布局问题 |
| `statistics-desktop.jpg` | 库存健康度环图、低库存清单、货区明细布局正常；30天空态、TEST行清晰可辨 | 空态与TEST数据属合成状态；不据此判断生产无流水 |
| `movements-desktop.jpg` | 筛选行、0条空表、分页正常，无横向溢出 | 合成空流水；生产数据未验收 |

### 边界与总检结论

- **Android原生模拟器**在`ucrtbase.dll`异常`0xc0000409`下无法启动，本轮**未做原生视觉、相机/扫码、系统权限、覆盖升级验收**；不声称全端验收，也不把浏览器App UA模拟当原生通过。
- 电脑10项回收结论已采纳，保留`app-ui-20261027`、必要回滚/业务数据/签名与在用fixture；DSH未执行删除。
- DSH未改Codex独占审查表、报障退役、API/原生/全局CSS或其他业务文件；本轮只改viewer/CSS/相关测试。

### 本轮最终SHA（4文件再冻结）

- `AgvModelViewer.vue` `361f1975706e3771dfc04dce3deb5ef04295d4390ccdab292f5bb68c28ffb027`
- `AgvModelViewer.css` `5605e79eff14581894d8469420ad068f032bd96fd7027df6205376b4425b5a37`
- `test/agv-workbench-component.test.mjs` `d242756873cb3b2d309bc9fe9fc1d62a7356f0d756a68f163e910afd3825ee32`
- `test/mobile-model-layout.test.mjs` `e05000c29b1543b3c895a9739bcd935e68aa49f4a8c9e55d58a8fd9af60f86c5`
- 模型`agv-model.mjs`仍`bfad32eaa802…`；材质三文件及`AgvVehicles.vue`SHA不变。全网页**554/554**通过；文件已冻结，未构建部署。

**请Codex补图**：手机抽屉开态（验证整车在sheet上方）、正后/低后视角（验证凹槽与扫描窗）；如需再改，按截图解冻对应文件。

## 上线同步回执与线上截图复核（2026-11-03 19:5x）

**Codex上线回执（DSH未部署、未独立复跑）**：上一轮冻结版已上线，线上1125项通过，Android23已发布；本批由Codex再补发完整网页。DSH本轮只改已登记viewer/CSS/测试（4文件），未改审查表、API/原生/全局CSS或其他业务。

**线上截图复核（已实际打开）**
- `agv-production-final.jpg`（线上桌面）：单画布、模型居中放大、顶栏标题+部件树/系统剖切/标签/旋转、底栏拆解滑杆+拆开/暂停/复位/速度/俯视/侧视/查看全车；无左右常驻列表、无粗网格/大底环；后侧视角未见蓝色内件。**桌面结论：通过，本轮不需改。**
- `spare-3p-production.jpg` + `spare-3p-production-full.jpg`（合并结论，纠正前一说）：前一张只是浏览器可视区截在页面中部、页面在画布外向下滚动390px后拍摄的完整图可见**完整模型与展台，取景正常、无滚轮缩放、无相机放大/裁切回归**；DSH撤回上一轮“疑似相机回归”的判断。生产`5.glb`本身是**白壳/深色手柄的简化盒状外观**，接线端/绝缘壳体/DIN卡扣仅示意，精细结构不足——列入后续“3P模型细节重做”建议，不属本轮显示/相机缺陷。**边界：不能用合成目录里另一份蓝色三极模型（本地`spare-material-desktop.jpg`）当作生产`5.glb`已验收；330目录未逐个验收。**
- `agv-app390-drawer-final.jpg`（上一构建）：抽屉开时整车被sheet遮住——本轮已修（sheet 30%/240、相机`padBottom=118+sheet+10`、断言整车最低点在sheet上方），**需重拍开态截图**确认。
- `agv-rear-final.jpg`：实为前右视角，后端凹槽/扫描窗仍缺正后/低后截图。

**回收独立复核（只读）**：10个认可目录（attendance-qa、agv-app-20261028、agv-floor-input-20261028、agv-reader-20261102、agv-viewport-20261103、agv-refresh-20261102、agv-workbench-20261102、app-login-20261027、mobile-layout-20261102、user-fixes-20261024）均已不在；保留的`app-ui-20261027`、`agv-photo-correction-20261103`、`review-20261018`仍在；`.local`顶层无空目录。6项临时模拟器/AVD与21项空临时目录为Codex执行结果，DSH未逐项核验；业务数据/必要回滚/签名保留。

**本轮冻结SHA（4文件；模型/材质/AgvVehicles未变）**
- `AgvModelViewer.vue` `361f1975706e3771dfc04dce3deb5ef04295d4390ccdab292f5bb68c28ffb027`
- `AgvModelViewer.css` `5605e79eff14581894d8469420ad068f032bd96fd7027df6205376b4425b5a37`
- `test/agv-workbench-component.test.mjs` `d242756873cb3b2d309bc9fe9fc1d62a7356f0d756a68f163e910afd3825ee32`
- `test/mobile-model-layout.test.mjs` `e05000c29b1543b3c895a9739bcd935e68aa49f4a8c9e55d58a8fd9af60f86c5`
- 模型`agv-model.mjs` `bfad32eaa802…`；材质`ModelPreview.vue` `8e5c0c3c…`、`showroom-stage.mjs` `258b815e…`、`model-thumbnail.mjs` `fece98a2…`；`AgvVehicles.vue` `de8f8d08…`。全网页**554/554**通过；文件已冻结，等待Codex补发完整网页。

**边界**：Android原生模拟器仍因`ucrtbase.dll 0xc0000409`未UI验收，不声称原生视觉/相机/扫码/权限/升级通过；“线上1125项、Android23发布”为Codex结果，DSH未独立复跑；本轮未扩散修改范围。

## 最终像素复核摘要（2026-11-03 20:0x，只读，代码冻结）

已实际打开补图`agv-app390-drawer-verified.jpg`、`agv-rear-low-verified.jpg`并合并前图结论；**未再改任何源码**。线上19:48版SHA=本冻结版`361f1975…/5605e79e…`。

**结论（全部通过/接受）**
1. **手机抽屉开态**（`agv-app390-drawer-verified.jpg`）：新30% sheet下，整车完整显示在sheet上方，模型不被遮挡、不裁切；底栏两行（滑杆+拆开/暂停/复位/更多）无横滚，44px触摸；画布填满，页底无大空白。此前`agv-app390-drawer-final.jpg`是主动切到俯视，只看到顶板，**不等于被抽屉遮挡，撤销“遮挡”判断**；新边距更严谨，接受。
2. **低后视**（`agv-rear-low-verified.jpg`，确为-X低后视）：后端上下端梁、封闭红内壁/台阶与踏边可见；中央红色透明扫描窗/上盖入槽，内部块体未穿出；下部银灰横条、右侧TIM（蓝黑+黑圆柱）正常。此前“需真实后视”遗留关闭。
3. **桌面默认**（`agv-production-final.jpg`）：单画布、模型居中放大、顶/底紧凑工具条、无左右常驻列表、无粗网格/大底环；通过。
4. **备件3P**（`spare-3p-production-full.jpg`）：完整截图证明显台与整车取景正常，前一张只是可视区截在页面中部，**无相机放大/裁切缺陷**；实际生产`5.glb`为白壳/深色手柄简化盒状外观，精细结构不足列后续重做建议。**不能把合成目录的蓝色三极模型当作生产5.glb已验收**；330目录未逐个验收。

**仍属后续/边界（不阻塞本轮上线）**：①3P等备件模型细节重做（端子/手柄/DIN卡扣结构）；②330目录逐型号外观验收；③履职详情手机宽表改按天卡片（另批）；④Android原生模拟器`ucrtbase.dll`崩溃，未做原生视觉/相机/扫码/权限/升级验收。

**最终冻结SHA（与线上19:48一致，未再变）**
- `AgvModelViewer.vue` `361f1975706e3771dfc04dce3deb5ef04295d4390ccdab292f5bb68c28ffb027`
- `AgvModelViewer.css` `5605e79eff14581894d8469420ad068f032bd96fd7027df6205376b4425b5a37`
- `test/agv-workbench-component.test.mjs` `d242756873cb3b2d309bc9fe9fc1d62a7356f0d756a68f163e910afd3825ee32`
- `test/mobile-model-layout.test.mjs` `e05000c29b1543b3c895a9739bcd935e68aa49f4a8c9e55d58a8fd9af60f86c5`
- 模型`agv-model.mjs` `bfad32eaa802…`、材质三文件`8e5c0c3c…/258b815e…/fece98a2…`、`AgvVehicles.vue` `de8f8d08…`均未变；全网页554/554通过。**代码保持冻结，不再扩展改动。**
