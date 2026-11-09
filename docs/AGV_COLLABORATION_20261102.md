# AGV 联合开发交接

用户已于 2026-11-02 授权 Codex 与 DeepSeek Harness 协作。共享工作区内不同时改同一文件，不覆盖已有未提交改动。以下为协作提议，Harness 尚未确认接收。

## 文件负责人

- Harness：`spare-parts-web-release/src/utils/agv-model.mjs` 潜伏车老/新几何；`agv-forklift-model.mjs` 平衡重、翻曲车几何。后者已有 Codex 初稿，尚未接入上线。
- Codex：`AgvModelViewer.vue`、`agv-presentation.mjs`、`AgvVehicles.vue`；电路导览；维修车号分类；消防界面；测试、合并与部署。
- Harness 开始模型修改前，请在下方记录接收、文件范围与状态；Codex 暂停几何文件修改。若需修改共同接口，先记录提议再合并。
- 生产构建及服务器部署只由 Codex 统一执行，双方不要同时构建覆盖 dist 或部署。

## 模型接口

`buildAgvModel({variant:'old'|'new',family:'latent'|'counterweight'|'flipping'})` 返回 `{root,parts,materials}`。`parts` 为 root 的直接子 Group，每项 `name` 唯一；`userData` 包含 `label`、面向使用者的简短 `description`、`sourceKnowledgeId`。可选 `presentationOffset:[x,y,z]` 只用于显示拆解。底架 name 固定 `chassis`，不能隐藏。

车辆坐标建议 x 为长度/前方、y 向上、z 为宽度。单位米。不要在三维车体中画车外无线供电站。潜伏车要有取电板、TPM、EKK、EKV；平衡重与翻曲车按各自电池/液压资料制作，不能照搬潜伏车。

## 已确认的业务事实

- 55、56、57 号潜伏车为新车，其余已登记潜伏车为老车。
- 未标“新车”的资料按老车；型号不明确的实物照片不用于断言新老差异。
- 潜伏老车：说明书知识 #21、电路 #20；新车电路 #26。
- 平衡重：说明书 #14、电路 #24（27 页），外形 2957×1042×2114mm，双货叉、高门架。
- 翻曲：说明书 #13、电路 #25（28 页），外形 2702×1284×2111mm，上下夹持叉、翻转机构、前支腿。
- 平衡重/翻曲说明书中的个别文字复制错误，以对应总装、尺寸、部件图与电路图核对。无原始 CAD 的细节明确为结构示意，不编造精确布线/制造尺寸。

## 参考资料（本机，勿打包 .local）

`.local/gpt-usage-20261102/vehicle-references/entry-{13,14}.docx`、`entry-{24,25}.pdf`；同目录有提取的文字与 `13-image*.png` / `14-image*.png`。`13-image7.png` 是翻转夹持机构；`14-image1.png` 是平衡重总装，两个 `image2` 为尺寸图。

## 用户最新交互要求（Codex 负责）

标题“潜伏式AGV（老）/（新）”；点击车身拆开全部，增加一键复位；按功能按钮明确写“归位/拆开 N 件”，镜头聚焦、相关零件自身高亮、其余淡显；部件功能说明移至模型下方整行；不支持下载模型。潜伏/平衡重/翻曲入口紧凑，潜伏再分老/新；电路图和车型对应。无线供电流程桌面一行展示，图纸入口合并，版本差异放可展开资料说明。

## Harness 接收与交付记录

- 已接收并交付，以下最终冻结记录为准。

## Codex 状态

- 第一批修复已部署；本次后续改动尚未部署。
- 消防台账操作一行、设置改居中弹窗已修改本地；其他交互工作进行中。
- 潜伏模型已有 Harness 精细内部结构，Codex 保留原几何。新增叉车型初稿是结构示意，需要按图复核后交付。
- 用户已要求停止 Computer Use 检查；继续采用代码测试、构建、权限及 HTTP 检查，未经用户改变指示不恢复 UI 自动操作。
- 2026-11-02 联调中：查看器通过 `agv-model-catalog.mjs` 适配调用，叉车型直接调用 `buildForkliftAgvModel(family)`，因此无须修改潜伏 builder 的 family 接口。功能分组已适配初稿部件 ID；新增 ID 请在交付记录列出。
- 中途只读测试发现正在编辑的叉车几何曾出现 `mx` 重复声明（约第42行），暂不将中途测试视为最终失败；请交付前运行 Node 导入/构造几何检查。Codex 不改你负责的几何文件。
- Codex 交互集成已完成：标题按用户改为“潜伏式AGV（老）/（新）”，增加一键复位，功能按钮写明归位/拆开数量，镜头聚焦并淡化非选中零件，说明移到整行；手机全车视图不堆叠引线标注，完整部件名在下方清单，选择后再显示对应标注。用户停止的页面UI检查保持停止，本次仅用窗口向 Harness 发送协作消息。
- 尺寸纠正：交接前文的翻曲车2114mm是 Codex 提取时的记录，并非用户指定尺寸。若复核说明书/尺寸图实际为2111mm，请按原始资料更正元数据，不要写成“用户要求2114mm”。不确定项写明资料差异；Codex 不会为遵守旧记录而覆盖有依据的纠正。
- API 411/411 通过；新旧车号映射及 AI 跨代资料限制已接入。7个修改组件编译通过，交互/图纸/车型9项专项通过。待 Harness 完成并确认几何文件暂不再写入后，统一跑最终全测、构建、备份同步。无需 Harness 执行构建或部署。
- 拆解显示偏移：潜伏车继续由 Codex 的 `agv-presentation.mjs` 全部件展示偏移表控制（保持底架不动），不直接套用几何原 `explodeOffset` 的零值；这样内部部件也全部可见。叉车型采用各组的可选 `presentationOffset`。不会为交互改写几何静态坐标。
- 已接收 Harness 关于液压回路的纠正：电路导览不再声称存在两台独立实物油泵，改为“起升与翻转/夹紧分别有对应控制图页，查看泵组和阀输出关系”；保留第13页原图标题“翻转泵控制”。没有充分实物证据的安装/数量不从图名推断。

### Harness 接收记录 · 2026-11-02 18:22（北京时间）

- 已读本交接和根 [AGENTS.md](../AGENTS.md)，接受此轮文件分工，状态：**已接收，几何复核开工**。
- 本轮写入范围仅 [潜伏几何](../spare-parts-web-release/src/utils/agv-model.mjs)、[叉车型几何](../spare-parts-web-release/src/utils/agv-forklift-model.mjs) 及本文的 Harness 交接记录；保留既有未提交结构，先记录当前基线再增量完善。
- 不修改查看器、展示配置、车型目录、车辆页、电路/业务或测试文件；不运行生产构建、不写 dist、不部署。此前的界面协作建议尚未实施，没有本轮展示文件修改需要停止或撤回。
- 保持 root/parts/materials、稳定部件 ID、label/description/sourceKnowledgeId；几何与交互分离，底架 chassis 保持可用。
- 先核对老/新潜伏资料边界和两类叉车图片/提取文字；55/56/57 属新潜伏车的业务映射由 Codex 维护。无证据的新老几何差异不编造。仅运行无服务、无 UI 自动操作的几何/接口检查，结果随后追加。

### Harness 进度 · 潜伏已校验，叉车仍进行中

- 接手基线已原样保留至本机私有 `.local/agv-collab-20261102/baseline-1822/`；潜伏 SHA256 `946ce413c4793f7ea21abe596e6465a33d0a8c507538803cfcf9ab7b6e1a5521`，叉车 `081ca271bd9ff705a6de34446de287521312961aabb30eaa23c524e3bc75a9ea`。两份原为未追踪文件，不能仅凭普通 git diff 声称完成审查。
- 潜伏统一补可选 `presentationOffset`，保留 `explodeOffset`。老车 15 个 ID、新车原有 17 个 ID 不变；新车 A7 顶升驱动壳体在已有 `control` 组，不新增根部件 ID。
- #26 图中正确对应为 A5/M9/E1/Y1（左）及 A6/M10/E2/Y2（右）；提取文字顺序不能作为左右依据。PDF 12/13/14/23 页分别为印刷图纸 9/10/11/20 页，已分别保留页码元数据。
- 新车左右驱动移至后侧示意托架以避开原摆臂、EKK/TPM；辅助电源示意移位，不再叠放老车通用驱动器。缺少新车机械总装图，车身仍沿用 #21 老车参考；#26 仅支持电气组成差异，不用于断言新车壳体尺寸/安装坐标。
- 潜伏针对性检查 `node --test test/agv-model-internals.test.mjs test/agv-model-shape.test.mjs` **5/5 通过**，未改测试文件。附加 Node 检查确认老车网格/变换/材质指纹与接手基线一致。老/新分别检查 **1913/4469 对选定命名硬件的跨部件静态 AABB**，无相交；不是全车干涉或运动验收。老/新为 398/433 网格、15/17 部件。
- 潜伏整模型外缘约 1387×720×460mm（含既有保险杠/探头/附件），1310×700×460mm 为原说明书标注车身参考，二者并非完全一致；本轮未缩放或牺牲既有外观细节强凑整模型边界。
- **尺寸纠正已接收并转达叉车子任务**：翻曲 #13 图文为 2111mm，原交接 2114mm 属 Codex 提取误录，并非用户指定。正在按原图将翻曲元数据和局部最高点统一为 2111mm；平衡重仍为 2114mm。此前将 2114mm 归因用户的表述作废。不画车外充电站，保持原导出；最终复测后另追加“稳定可构建”标识。
- 给 Codex 的电路说明纠错提示：#25“翻转泵控制”页展示夹抱流程及阀输出，电路标题不足以证明实物第二台独立油泵。几何已将翻曲 `pump` 标题/说明改为“起升油泵与翻转/夹紧阀组”，第二电机示意改为阀分配器，ID/偏移不变。请复核你负责的 [电路导览](../spare-parts-web-release/src/utils/agv-electrical.mjs) 中“起升泵与翻转泵分别驱动”等推断性描述；原图第13页标题应原样保留，不必篡改图纸标题。

### Harness 最终交付 · 稳定可构建（2026-11-02）

**两份几何已冻结，稳定可构建。Harness 及叉车子任务均暂停写入这两份几何，请 Codex 按以下哈希统一执行最终回归、构建和上线。** 本节替代前述进行中状态与中间统计；“可构建”表示几何语法、导入与构造检查通过，不表示 Harness 已运行生产构建。

#### 冻结文件与 SHA256

| 文件 | 最终 SHA256 |
| --- | --- |
| [潜伏老/新几何](../spare-parts-web-release/src/utils/agv-model.mjs) | `D64E0D42E2A81E8E62CE37502F091A5C2692E919B784F6E99CAEAC94DBF3CEB1` |
| [平衡重/翻曲几何](../spare-parts-web-release/src/utils/agv-forklift-model.mjs) | `85C3FEA590839ABEA1E2812E684A719CC87C9C676D60D7FEF701805C463DA1D5` |

#### 已完成及稳定契约

- 保留 `buildAgvModel({variant})`、`buildForkliftAgvModel(family)` 和 `{root,parts,materials}` 返回结构；未知 variant/family 拒绝构造。部件仍为 root 的直接 Group，原有 ID/顺序保留，无重名根部件；潜伏老/新为 15/17 件，平衡重/翻曲为 13/16 件。`chassis` 保留，叉车固定标记已补；展示拆装仍由 Codex 维护。
- 潜伏保留 `explodeOffset` 并补兼容 `presentationOffset`；叉车原 `presentationOffset` 不变。老潜伏全部网格、世界变换、几何属性/索引及材质指纹与接手基线一致，没有为本轮改写老车细节。
- 新潜伏保留原 `kinco-left/right` 两个根 ID；电路 A5/M9/E1/Y1 为左、A6/M10/E2/Y2 为右，A7 位于既有 `control` 内。调整新车示意驱动位置、辅助电源及支撑，去掉重复旧式通用驱动器。#26 确认电气组成，不能据此断言这些功能只在新车存在或确认新机械安装形式。
- 叉车完善空心机罩/检修门、C形导轨、链轮/链节、滑架/滚轮、油缸、锥形货叉、行走/承重轮、电池/泵阀/电气板与操作箱；翻曲另含回转支承、夹紧油缸、上夹叉、支腿、轮叉和薄侧挡板。无车外充电站、无潜伏式无线取电组件混入叉车。
- **翻曲按 #13 原图为 2702×1284×2111mm**。原交接 2114mm 为提取误录，不是用户要求；仅局部调整翻曲雷达总成/支座 3mm，元数据同步纠正。平衡重仍为 #14 的 2957×1042×2114mm。两族都没有整车缩放或拉伸圆轮。
- 翻曲 `pump.label` 有意改为“起升油泵与翻转/夹紧阀组”，`pump.description` 改为“起升油泵与翻转/夹紧阀控回路；独立电路不等于已确认第二独立油泵”；这两项是纠正原初稿错误文本，不应作为基线回归失败。保留 `pump` ID/偏移，模型呈现一个油泵电机和示意阀分配器；不以电路页标题推定第二实物油泵。

#### 最终只读验证结果

两模块 `node --check` 通过，下列现有测试 **8/8 通过**，未改任何测试文件：

```powershell
node --test test/agv-model-internals.test.mjs test/agv-model-shape.test.mjs test/agv-families.test.mjs test/agv-model-selection.test.mjs
```

Lead 另运行内存几何检查，按实际顶点和世界矩阵计算包络。下表是模型数值计算值，**不是实车测量精度**；L×W×H 对应 x×z×y。

| 车型 | 根部件 | Mesh | 三角形 | 展示包络 L×W×H（mm） |
| --- | ---: | ---: | ---: | --- |
| 潜伏（老） | 15 | 398 | 35604 | 1387.000000 × 720.000029 × 460.000005 |
| 潜伏（新） | 17 | 437 | 36304 | 1387.000000 × 720.000029 × 460.000005 |
| 平衡重 | 13 | 506 | 28500 | 2956.999898 × 1041.999999 × 2114.000007 |
| 翻曲 | 16 | 480 | 27988 | 2701.999903 × 1284.000000 × 2111.000007 |

- 全部几何属性、索引、世界矩阵为有限值；根及子物体 scale 保持 1。原字段、直接父子关系、稳定 ID 和偏移检查通过。叉车各四个圆形轮胎接地，底板与轮胎选定静态配对不相交。
- 潜伏老/新共检查 **1913/4781** 对选定命名硬件的跨部件静态 AABB；平衡重/翻曲另检查 **29/36** 对电池、油箱、泵电机、驱动器等主要壳体跨组配对，均无所选实体重叠。此为限定集合的静态检查，**不是全车无碰撞、完整运动或安全验证**。
- 修正翻曲支腿/侧耳侵入滚轮的问题；两侧轮胎与支腿 x 方向间隙均约 **30mm**，与两侧耳 z 方向间隙均约 **4.5mm**。轮轴/轮毂安装接触保留，整体包络未受影响。这些间隙仅为示意模型验证值，不能作为实车安装公差。
- 基线与当前合计 7 份构造对象的 **2421 个 geometry / 144 个 material dispose 事件**覆盖检查通过；此为资源释放路径检查，不是浏览器/GPU性能实测。子任务也完成重复构造及资源销毁检查。
- 两份几何原本即未追踪，当前仍为未追踪；Lead 已与显式基线对照并复核最终源码，不能以普通 git diff 为空当作未修改。未执行提交/推送。

#### 证据边界与 Codex 后续

- 新潜伏电气 #26：PDF 12/13/14/23 页分别对应印刷 9/10/11/20 页；电机/编码器左右以原图排列为准。其中 PDF23 页确认 TPM/EKK/EKV 和两块 THM；EKV 是超级电容而不是电池。六块分组外观不代表已确认新车模块/电芯数量，旧资料 #19 的型号也未冒充新车型号。
- 新潜伏尚无新车机械总装图，外壳/顶升采用 #21 老车参考，器件外形及全部安装坐标为示意。1310×700×460mm 是 #21 车身标称参考；含原有突出附件的整模型外缘约 1387×720×460mm，本轮保留原外观而未强行缩放。
- 叉车轮廓/系统组成参照 #13/#14 总装、尺寸及机构图；电气功能参照 #25/#24。局部壁厚、链节节距、传动形式、软管、端子与安装坐标没有原厂 CAD 级证据。#13 故障文本 47/52V 与 #25/#24 电池24V文字存在冲突，未据此给模型标电压或推断电池架构。
- 请 Codex 同步复核自己负责的目录/展示尺寸记录及上述电路“双泵”说明，保留原图“翻转泵控制”标题，但不要扩展成第二独立物理油泵的断言；现有测试名称中的 separate rotation pump 同样不构成机械证据。
- Harness 未改查看器、展示、目录、业务/电路或测试源码；未执行生产构建、写 dist、部署、启动服务、UI自动操作或视觉验收。完整回归、实际显示/交互/性能核验以及备份构建上线由 Codex 统一负责；模型仅为结构示意，不用于制造、接线、维修安装定位或运动安全判断。

### Codex 集成交付 · 已上线

已接收并核对 Harness 冻结的两份几何哈希；几何没有被查看器改写。网页403/403、API411/411、修改组件编译与生产构建通过；619份源码/资源在回归、构建、上传前一致。北京时间2026-11-02 18:49:43已同步702份网页及3份API源码；18:52生产4类账号55项检查通过。私有配置、业务数据、上传和其他项目保持，回滚位于 `/opt/spare-parts/rollback/agv-joint-20261102`。

工单自动车型、四类图纸关联、功能按钮明确动作、聚焦高亮/淡显、一键复位、整行功能说明、供电一行/资料说明及消防布局均已接入。保留原图“翻转泵控制”标题，去掉第二独立实物油泵推断；手机全车不堆叠引线，清单保留全部名称。没有恢复浏览器/真机UI检查，仍需用户实际查看视觉与手机使用效果；不以源码/HTTP检查冒充视觉验收。

双方本轮停止写入已交付版本；后续修改先另记文件范围，勿直接覆盖现场或各自重新构建部署。回滚及原始参考保留。部署暂存可恢复回收，未动业务数据、配置、上传或同机其他项目。

## 新一轮：参考图部件矩阵工作台（2026-11-02 20:21起）

用户要求按提供的工业数字孪生参考图改造“部件矩阵”，并让Codex配合Harness；随后明确不喜欢参考图背景色。借鉴分组部件树、中央模型、右侧系统信息和底部拆解控制，不照搬发动机、虚构参数或黑蓝配色。用户已选择“浅灰白＋钢蓝”，采用明亮模型背景、石墨文字和少量钢蓝强调，不使用近黑科技大屏背景。Codex子代理两次启动均报产品错误且无产出，纯状态/测试因此改由Harness协作代理完成；此失败不代表外部桌面Codex状态，外部本轮范围确认见下节，不能混称为Codex子代理交付。

### 本轮写入登记（此前冻结交付保留为历史）

- Harness Lead：接手 [AgvModelViewer.vue](<../spare-parts-web-release/src/components/agv/AgvModelViewer.vue>) 的工作台布局与真实渲染/交互联动；新增专用 `spare-parts-web-release/src/components/agv/AgvModelViewer.css`；新增 `spare-parts-web-release/test/agv-workbench-component.test.mjs`，使用真实SFC编译/setup/render与Three几何、合成渲染端口验证交互和清理，不启动网页或浏览器；更新本文本轮记录。外部Codex会话请勿同时改这两个界面文件。
- Codex配合子任务：新增纯状态/分组工具 `spare-parts-web-release/src/utils/agv-workbench.mjs`、新增 `spare-parts-web-release/test/agv-workbench.test.mjs`；必要时仅适配 [既有选择回归](<../spare-parts-web-release/test/agv-model-selection.test.mjs>) 的新导入注入，不删旧断言、不改现有业务语义。原定通过Codex子代理执行，但两次调用均在产品启动阶段失败、无文件产出；不再重复调用，现改由Harness的workbench-state协作代理实现这组独立范围。登记时尚无外部桌面Codex本轮确认；现已收到下节的范围确认，外部Codex仍负责最终集成发布。冻结文件接收、构建和上线结果须另记，范围确认不等于已经发布。
- [现有展示配置](<../spare-parts-web-release/src/utils/agv-presentation.mjs>)、[车型目录](<../spare-parts-web-release/src/utils/agv-model-catalog.mjs>)、[车辆页](<../spare-parts-web-release/src/views/AgvVehicles.vue>)、几何、API/会话/业务及原生文件本轮保持不写。若确需扩大范围，先另记。
- 保留现有潜伏老/新、平衡重及翻曲车型、稳定部件ID、功能说明、点击车身拆解、按功能归位/拆开、聚焦高亮与一键复位。数量来源于真实模型；无证据的质量、电压、实时工况不显示为实测数据。
- 先以无服务、无UI自动操作的源码/真实组件脚本与几何隔离回归验证。仍不恢复浏览器/真机UI自动操作，不重复构建或部署；外部Codex统一集成、生产构建与服务器同步。尚未承诺视觉验收或上线。

### 外部 Codex 本轮配合确认

用户在Codex明确：模型由DSH主要修改，Codex配合；同时要求修复App登录页版本/更新入口及多余账号提示、隐私入口位置、手机能量流程箭头与“图纸目录”PDF报错，并继续验证App功能。

- 已读本轮Harness写入登记。Codex不修改`AgvModelViewer.vue`、`AgvModelViewer.css`、`agv-workbench.mjs`及其专用回归/几何；这部分由Harness及其子任务负责。保留已确认车型、部件ID及布局选择，等待稳定交接再统一集成。
- Codex负责`PdfReader.vue`、`utils/pdf-document.mjs`及必要PDF资源/兼容加载；`AgvElectrical.vue`、`AgvWirelessPower.vue`的图纸打开和手机能量流程；`NativeLogin.java`及`MainActivity.java`中对应登录页更新绑定、必要App更新元数据和相关回归；必要时同步手机网页登录页。不会把DSH在改的备件模型/查看器混入未经冻结的构建。
- Harness请继续主改AGV部件工作台及用户在你会话提出的模型内容；有新扩展范围先登记。请另派独立只读审查App现场流程，确认可复现缺陷后写入本节下的“Harness App补充”，不要和上述Codex文件同时写；测试边界维持无UI自动操作/模拟器/ADB、无新服务、无凭据/业务数据读写、不部署。需要改其他App组件时先登记具体文件。
- 已上线的上一轮网页428/API411/原生12通过3跳过及android.21是基线；不要重新覆盖它们。稳定后交付实际文件、哈希、回归结果和未验收项，由外部Codex统一构建同步。本文为共享交接，协作消息不代表用户偏好或确认可被代答。

### Harness 本轮工作台稳定交付（2026-11-02，已冻结待集成）

已读外部Codex上节的范围确认，本轮不混写对方正在修复的PDF、能量流程、登录及原生文件。下列六份源码/测试已完成，可按哈希接收；后续需要再改，先在本文另记，不能覆盖该冻结清单。

| 文件 | SHA256 |
| --- | --- |
| [AgvModelViewer.vue](<../spare-parts-web-release/src/components/agv/AgvModelViewer.vue>) | `9FC91EE5FF53CEC188C88880381E83D8BADD0167F045EC25B5BB7550BD6DF1BA` |
| [AgvModelViewer.css](<../spare-parts-web-release/src/components/agv/AgvModelViewer.css>) | `05F4A1DC9D20B7602625D6E88B2073C7177042BB68D149E76B543452EE5E2623` |
| [agv-workbench.mjs](<../spare-parts-web-release/src/utils/agv-workbench.mjs>) | `626CCAB9145FED24CE6ABE42F90B0B644CAE925CD7B4156844ED5AC21290B101` |
| [agv-workbench-component.test.mjs](<../spare-parts-web-release/test/agv-workbench-component.test.mjs>) | `B9169EBCE822D524F1DAB47D66F9B7CC8DF986BD37705D97C1FA48587D04CA29` |
| [agv-workbench.test.mjs](<../spare-parts-web-release/test/agv-workbench.test.mjs>) | `1F3AA66BDF5D3E8983ADF15378CBE4340E9CA3C67205E40133675D177AA4F5F1` |
| [agv-model-selection.test.mjs](<../spare-parts-web-release/test/agv-model-selection.test.mjs>) | `BABDF94B07A53AD84D0F01DF707715621EE8216382462A8610C66A63DC0DE511` |

#### 实际界面与联动

- 浅灰白背景、白色分组面板、石墨文字、钢蓝强调。左侧真实分组部件树与搜索/收起/显隐，中间现有AGV模型与透视/顶/侧视，右侧功能系统/显示设置/图例，底部拆解进度、速度、暂停继续与复位；整行部件说明位于工作台下方。窄容器改为下置系统区，手机优先展示模型，部件名称完整换行可查。
- 保留四种车型组合、既有部件ID、点击车身拆解、部件/功能归位或拆开、实体高亮与其他部件淡显、一键复位。树的数量与功能按钮从当车型真实部件生成，未分配项有兜底组；底架始终显示且不拆解。
- 搜索、眼睛显隐、模型剖切、标签、自动旋转、播放速度、拖动进度均接实际状态，不是装饰按钮。剖切范围覆盖装配态及完全拆开态，100%不再误裁外移零件；切换高亮仍保留剖切平面。双指手势、右键平移、取消指针不误触拆解。
- 数字仅为结构示意和演示状态；系统进度/数量明确为目标值，不显示无依据的质量、电压、实时工况。WebGL不可用时禁用播放控件，仍可读取真实部件说明，不伪称正在三维演示。
- 按需RAF，空闲/暂停/离屏/后台页停转；OrbitControls变化期间不重复排队；尊重减少动态效果偏好。卸载移除监听与观察器、取消RAF、去重释放几何/材质及渲染器。

#### 已执行验证及限制

- 最终网页目录下执行以下命令：**68通过、0失败、0跳过**。其中纯状态25项、真实组件编译交互7项、原AGV回归36项；既有选择断言未删除。组件测试使用真实Vue SFC编译/setup/render与SSR HTML、真实Three几何/Raycaster；WebGL/Canvas/RAF/观察器仅为合成端口，不是真实浏览器渲染。

```powershell
node --test test/agv-recycle-interactions.test.mjs test/agv-members.test.mjs test/agv-electrical.test.mjs test/agv-lifecycle.test.mjs test/agv-model-shape.test.mjs test/agv-model-internals.test.mjs test/agv-reader.test.mjs test/agv-presentation.test.mjs test/agv-families.test.mjs test/agv-workbench.test.mjs test/agv-model-selection.test.mjs test/agv-workbench-component.test.mjs
```

- 四车型组件回归涵盖真实部件分组/SSR内容、实际射线点击、双指/右键/取消隔离、暂停/继续与速度、拖动进度、按功能归位、搜索/无结果、显隐/标签、剖切100%及高亮保持、视角/旋转、单RAF、后台/离屏恢复、复位及资源释放；另测减少动态偏好及WebGL失败只读说明。
- 独立协作代理只读复核了工具契约、四车型交互、单RAF、剖切高亮及清理，报告的剖切边界问题已由Lead修复并纳入回归；CSS为编译与响应规则静态复核，**未进行浏览器/手机视觉验收**。
- Lead对保存的原查看器基线审查了本轮差异，并核对几何未变：[潜伏模型](<../spare-parts-web-release/src/utils/agv-model.mjs>) `D64E0D42E2A81E8E62CE37502F091A5C2692E919B784F6E99CAEAC94DBF3CEB1`；[叉车模型](<../spare-parts-web-release/src/utils/agv-forklift-model.mjs>) `85C3FEA590839ABEA1E2812E684A719CC87C9C676D60D7FEF701805C463DA1D5`。纯工具和新组件测试的Node语法检查通过；限定路径的git diff --check无输出，但这些路径尚未跟踪，未把它当成完整差异核验。
- 新组件测试首跑发现测试暴露方式不适配Vue inlineTemplate，已改成编译前仅添加defineExpose、无生产逻辑替写；最后一次全量命令曾因在仓库根目录执行找不到相对测试路径，改回网页目录重跑后得到上面的68项通过。没有把这两次失败计为通过。
- 本轮未启动服务、浏览器/真机/模拟器/ADB，未生产构建、写dist、部署、打包或Git提交推送，未读取凭据或业务数据。请外部Codex按冻结哈希接收后，结合其独立App修复统一回归、构建、备份并同步服务器，再记录实际接收/上线结果；**目前仅范围确认，不声称冻结清单已被接收或已上线**。

#### Harness App补充

本轮工作台回归没有新增App现场流程审查结论，不把上述AGV离线用例当作Codex正在修复的登录/PDF/手机能量流程的验收。上一轮App/native冻结交付保持；若需新增缺陷修复，另记具体文件范围后再做，避免与Codex当前范围重叠。

## Harness 备件模型资料复核与浅色展台（2026-11-02，进行中）

用户新增要求：结合备件信息检查现有3D备件模型，修改与实物资料不符处，同时调整背景。按上一轮已选浅灰白＋钢蓝延续。与上述AGV冻结交付分开，不重新修改AGV/App/native/PDF范围。

- **修改前登记**：Harness负责 `spare-parts-web-release/src/components/ModelPreview.vue`、`ModelCatalogShowroom.vue`、`PartModelBinding.vue`、`src/views/ModelLibrary.vue`、`src/utils/showroom-stage.mjs`、对应新增/定向测试 `test/spare-model-presentation.test.mjs`、`test/spare-model-evidence-boundary.test.mjs`，以及本轮报告 `docs/SPARE_MODEL_AUDIT_20261102.md`。路径省略处均相对 `spare-parts-web-release/`。主要为浅色背景/展台/对比度及资料与核对状态显示一致性；几何审查尚在进行，明确几何与资源范围后另登记，**不执行全量历史生成/绑定计划**。
- 两名Harness子代理分别只读审查几何资料与展示边界。几何代理只可写 `.local/spare-model-audit-20261102/audit-geometry.mjs`、`geometry-audit.json` 本地证据；不读取凭据/整份业务台账，不发送私有资料。现有目录330、可观察229、待核对101是历史本地目录状态，不能当作本轮实物核验或现网实时统计。
- Codex请暂勿并发写上述文件；继续持有既定App/接口修复和统一集成/构建/服务器同步范围。Harness不启动服务、UI自动检查/真机/模拟器/ADB，不构建或部署；稳定后给逐文件哈希及真实离线验证记录。本段是范围通知，**尚无本轮Codex接收回执**。

## Codex 接手续作备件模型展示（2026-11-02）

用户已明确“Dsh没做的你继续做”；Harness因额度暂停，由Codex续作上节已登记的备件展示五份源码、两份专用测试与审查报告。当前没有并发写入；不修改AGV已冻结六文件或其几何，不修改PDF、原生与库存范围。

- 修改前已保存Harness半成品快照到 `.local/spare-model-audit-20261102/codex-takeover/dsh-partial/`，接收存在性和SHA256见同目录 `takeover-manifest.json`。
- 本次只修复可确认的浅色展台/雾色/界面对比度与资料状态不一致问题，按真实函数和组件离线回归。已有几何审查输出作为线索逐项核对；资料不足的几何保留待核对，不凭型号名称推断精确外观，不运行历史全量生成或自动绑定。
- 本次完成后提供冻结哈希、实际测试及未实物核验边界，由主Codex统一集成、构建与服务器同步。

### 资料状态最小纠正（Codex补充范围）

- 主Codex确认接手 `src/utils/reviewed-model-catalog.json` 的21项资料状态。另登记 `src/utils/model-display-status.mjs` 及 `ModelPreview.vue` 的待核检查，专用测试纳入 `test/spare-model-evidence-boundary.test.mjs`。
- 保留现有重建网格、分组标注与人工核对接口；使用独立 `requiresReview` 标记资料待核，显式核对预览仍可打开，不把路径含pending当成状态证据。5个联轴器只确认本地描述与网格比例不一致，参数原始出处尚未独立证实；16个减速机只记录图纸不足与贯通轴疑点。均不修改GLB或自动绑定。

### 备件参考图放大（Codex补充范围）

- 物料卡实物照片已进入独立大图弹窗，并用el-image继续缩放，模型缩略图单独打开三维预览；这条既有行为保留。
- 另登记 `src/components/ModelReferenceImage.vue` 与 `test/model-reference-image.test.mjs`，为模型编辑/预览中的资料参考图添加显式zoomable能力。默认不改变父级点击/库存导航；只在需要放大的实例中使用可键盘触发的按钮并阻止该放大点击冒泡，放大层沿用el-image-viewer。

## Codex备件收尾冻结交付（2026-11-02，交回Harness）

用户确认Harness已恢复，并要求其继续精细化备件与AGV模型。Codex停止继续模型优化，下列文件已冻结待主Codex接收，再交Harness。85项限定离线回归通过、五份SFC独立编译通过，398份GLB哈希与接手前一致；没有生产构建、部署或真机/UI视觉验收。

21项用独立requiresReview标记保留原分组与显式核对预览，5个联轴器只确认本地描述与网格不一致、原始尺寸出处未证实；16个减速机只记录厂家图纸不足及贯通关系疑点。普通入口不再把它们当资料已核实；服务器有效当前版本人工核对仍优先。不可按pending文件夹名称判断结论，不得仅凭型号重建/批量绑定。详情见 docs/SPARE_MODEL_AUDIT_20261102.md。照片放大只在ModelReferenceImage的zoomable实例中消费点击，默认不影响父级导航。

| 文件 | SHA256 |
| --- | --- |
| `spare-parts-web-release/src/components/ModelPreview.vue` | `6f7396860934e7bdf4c811788ac889e087a3c15009a00761ae735380de95dd38` |
| `spare-parts-web-release/src/components/ModelCatalogShowroom.vue` | `4a2379d2ae484a67c6ba35abcd37f443870ef174719cc66d9714914bd7f71191` |
| `spare-parts-web-release/src/components/PartModelBinding.vue` | `722d142bb14845d592e0a11334d8de5371d39fde92458d863c7b095c30155382` |
| `spare-parts-web-release/src/components/ModelReferenceImage.vue` | `84ab89c4d79aac03752777b4ad4383ea301595ca5fef66543f0b440d0cafc1c0` |
| `spare-parts-web-release/src/views/ModelLibrary.vue` | `e31c831dfad01114a71cc5694fdb3003bee34209063e68a26547b207606f4fa3` |
| `spare-parts-web-release/src/utils/showroom-stage.mjs` | `a041a250e6baf60d0ff570366095d21999bf0000e594b701e2d418ec2d08c442` |
| `spare-parts-web-release/src/utils/model-display-status.mjs` | `a3083c43a9cb378e50123d4b89b7305d7bc7293e769a7cdc0dec0e3da16f1267` |
| `spare-parts-web-release/src/utils/reviewed-model-catalog.json` | `c79f197d8cb1efb3a5942760cfe0ad66056446a7295374c7e2aa377e05bbfa61` |
| `spare-parts-web-release/test/spare-model-presentation.test.mjs` | `55e3179d47d899f9ab58a63a344969cb009424ff4dd8c4a5197adf8467257e6b` |
| `spare-parts-web-release/test/spare-model-evidence-boundary.test.mjs` | `6bec93369120ff3dfbb5ec97933ad04e44a23e92cfe733e66597fc967e223a93` |
| `spare-parts-web-release/test/model-reference-image.test.mjs` | `ab22862a36bf7a15871287525984357f524cd8e6bda2ab6fd2a8ebc7e055ab77` |
| `docs/SPARE_MODEL_AUDIT_20261102.md` | `ccf7256f652e3fb82193dcad5b6d167a98064065a5f421e02fe3beae713a5116` |

原始快照、独立测量与回归记录在`.local/spare-model-audit-20261102/codex-takeover/`，仅当前工作证据，由主Codex统一按回收要求清理。本节写入交接范围，不代表Harness已经接收或已上线。

## Harness 恢复后模型精细化（2026-11-02 22:00 起，本轮）

用户确认Harness恢复并指定：备件与四类AGV模型（潜伏老/新、平衡重、翻曲）的几何、内部结构、材质、部件标注及必要交互由Harness主导，Codex继续App/PDF/native/业务修复与统一回归、构建、部署、回收。收到上述Codex冻结交付后已逐份重算SHA256，12份与冻结表一致，未回退、未覆盖。

- **本轮写入范围**（相对`spare-parts-web-release/`，先登记后修改）：`src/utils/reviewed-geometry.mjs`、`tools/modeling/apply-model-review.mjs`、`tools/modeling/model-review-plan-20261023.json`、`src/utils/reviewed-model-catalog.json`、联轴器与空心轴减速机对应GLB（`public/models/pending-20261009/*.glb`）、`public/models/evidence/*.glb`与`manifest.json`、`test/spare-model-geometry-20261102.test.mjs`；AGV侧`src/utils/agv-model.mjs`、`agv-forklift-model.mjs`、`agv-presentation.mjs`、`agv-model-catalog.mjs`、对应`test/agv-*.test.mjs`。文档只改本文件与`docs/SPARE_MODEL_AUDIT_20261102.md`。**不动** Codex 的App/PDF/native/业务源码、`.env`、台账与上传。
- 证据优先级：①项目内已保存的备件描述原文（如联轴器`ZL6 减速机端Φ80x140 头轮端Φ90x150`）与现有说明书/图纸参数；②知识库#13/#14/#19/#21/#26已记录的事实；③厂家公开资料。型号名只能支持类别判断，不能据此编造孔径、键槽、内部电芯或安装坐标；资料不足保持待核。
- 边界：不启动服务/浏览器/真机/模拟器/ADB，不生产构建、不写dist、不部署、不打包、不推送；不批量运行历史生成/自动绑定；不改业务数据。几何回归用离线Three解析+射线/包围盒校验，不能替代视觉或实物验收。
- 本节为范围通知，完成后在本文件补逐文件SHA256、实际命令结果与剩余资料/视觉边界，交Codex统一集成。

### 本轮交付（已冻结，待 Codex 统一集成）

按用户 2026-11-02 分工完成第一批有资料依据的模型修正，未改 Codex 的 App/PDF/native/业务源码，未启动服务/浏览器/真机/模拟器/ADB，未生产构建、写 dist、部署、打包或推送；未批量运行历史生成或自动绑定。Codex 交回的 12 份冻结文件哈希已逐份复算一致，未回退。

#### 备件几何（相对 `spare-parts-web-release/`）

| 项目 | 内容 | 依据与边界 |
| --- | --- | --- |
| 联轴器 298–302 | 两端轮毂改为不同孔径/轴向长度：298 Φ80×140 / Φ90×150，299 Φ105×210 / Φ90×150，300 Φ120×210 / Φ90×150，301 Φ140×250 / Φ90×150，302 Φ100×170 / Φ90×150 | 取值来自原 GLB 节点 `extras.sourceDescription` 继承文本；该文本尚未独立确认来自厂家图纸或现场实测，`requiresReview` 保留，UI 仍提示“外形待核对”。外径（Φ500 示意）、法兰、销、无键槽、颜色、±0.2 轮毂位置未推断 |
| 空心轴减速机 16 项（217/218/219/220/226/229/249/252/259/260/261/262/267/268/269/274） | 输出法兰贴靠箱体（原先悬空 25–125 mm）；右角型（KA/KAZ/SAF）开出贯通示意孔，实测沿轴射线 0 命中 | 仅按型号 A 型空心轴的类别关系纠正“盲盖/悬空”这一自相矛盾，孔径 Φ170、键槽、收缩盘未证；FA77/G、FA57/G 两件平行轴型仍为封闭孔，已在 note 与 `userData.hollowShaft` 注明需图纸；`requiresReview` 保留 |
| 明纬 NDR-240-24 / NDR-480-24 精简 LOD | 外廓由 113.4/128.4 mm 修正到既有描述值 113.5/128.5 mm（DIN 卡扣厚度 3.1→3.2 mm、后端后移 0.1 mm，前缘与端子结构不变）；detail 两份字节未变 | 依据为项目内已保存的厂家规格描述，未重新在线核验厂家原文；端子、倒角、内部细节仍为示意 |

改动清单：`tools/modeling/reviewed-geometry.mjs`（`7b19e669cb167a68218fc8263e7320cb0a39db6cc3e11e28d7cf0a92152393b2`，含 coupling ends 与 reducer 空心轴）、`tools/modeling/model-review-plan-20261023.json`（`a69a6434fe4b2e4a07bc9a32db34d6e49fc4573ba0a4a657186a0f37ec2fa324`，仅 298–302 与这 16 项 note/spec）、`tools/modeling/generate-evidence.mjs`（`31ed08c7898729fe9b5a93647f465102f87e24f72036e78991283d5bd8e8df42`）、`src/utils/reviewed-model-catalog.json`（`80e592cd5b1075306eb09e7419798d040d3e463c54872caf7a0a173dcef35cf5`，仅上述条目变化，其余逐条保持，21 项 `requiresReview` 全保留）、5 份联轴器 GLB（`23f8df18…`、`0d3d10bd…`、`650434e1…`、`754c4157…`、`3bf9178b…`）、16 份减速机 GLB（见下）、2 份 NDR low GLB（`5b329f6a…`、`fb95ba52…`）与 `public/models/evidence/manifest.json`（`66e024c2…`）。未使用 `apply-model-review.mjs` 全量重建路径；改用白名单脚本只重建上述文件，465 份 `public/models` 改前/改后哈希对比确认其余资产字节未变。

减速机 GLB SHA256：505018939 `ea8d21c4c381896163e5f5bcb675ac967f86df2f50fc0b0843db03dc03349791`、505018940 `d2ad687d5461edd5c999da54db452d710fef100924138a63456c283bc4bbe6c4`、505018941 `0c56995e6a74649634cb8f8125cfcb83d40aa2ff3dc7ae34aa1eca3ebdc238a9`、505018942 `468038abc4b3c0a8ab2c3191bf0f37e0c6f7a021b379cf1cf7974fe34ee40b4a`、505018968 `1362ea385e2e835731a39b3a6aad68571f689bf45d7829ae09a1560f6953f592`、505018971 `b8a729226645aae84d8e2cb4091c130d30ebfadffe70c5c43522cd97f5ff2ba8`、505019400 `22ad6155bbbe3f1f9c1bfe1378362b3d22035ac3d4781a384d9ec93bda601d68`、505019424 `1b29a5358f45b66f0194e6e80b40966f17eb2c23adfa599e33dc3d0d97122fb5`、505020151 `906443554d0dd1b5df50e7eb76c16f9a6decc12c3fa0d755c5d0c0f37e530131`、505020152 `ee874cb3db44c74f8429d6a280be6dfcaa157d20eb3c869c8506254ace4a171b`、505020153 `e5c8ada1c6ca91e100711b7e5cd2e170357c8353b6611c0f5e136d28c12b212a`、505020155 `e69da95968986b36c5d546dad1cbc6d996155c4ae5d8442145e0741e59820292`、505020161 `78df0494a4b0988c9355f7dc1e3d2167b2a35321f828a3558dca3cb989ddab24`、505020162 `0a3460ade0b7632b68008552fa019294964b4cc6d9e73a64e1f045cc1292a9a2`、505020163 `1fa0037cdf9da48b4d7a7d0e8588ff025af31b3fef60070a101716c07a0f6a6f`、505020168 `773c74368cb060c122c39608cd4289fd45c9e461fe643451a923da1fddbf5fec`。

备件新增测试：`test/spare-model-geometry-20261102.test.mjs`（`362bb62c96efa80e9d777918b9b99afd269adf4c02f6c82a4414e89db7954a95`，真实 GLTFLoader 解析）、`test/spare-hollow-shaft-20261102.test.mjs`（`2dcae25e9f5d3d80aed11a26db128ce0e03b83725281f15f6dffa23b98746a0c`，贯通孔/法兰贴合/资料字段）。

#### AGV 模型

- 四类车型（潜伏老/新、平衡重、翻曲）几何、部件 ID、材质、分组标注与拆解交互保持不变；本轮只补包络记录：`bodyEnvelopeMm` 之外新增 `overallEnvelopeMm` 与 `envelopeNote`，明确潜伏车 1310×700×460 是车体名义包络，模型拖拽环/橡胶缓冲使整体实测 1387×720×460，是否为图纸公差未核实；平衡重 2957×1042×2114、翻曲 2702×1284×2111 实测与图纸包络一致（±1 mm）。未按名义尺寸缩放整车，未新增车型业务入口（55/56/57 映射由现有 API/工单维护）。
- 文件：`src/utils/agv-model.mjs`（`2f514f1a23cdd06e667aab9c0f5bcf0f590f318c2571983739e2e5d1619998f4`）、`src/utils/agv-forklift-model.mjs`（`ef0092c3598c7e6dfc2a1fd1faeccb5378e4572dff4477b77c76bc10a73c52c2`）、新增测试 `test/agv-envelope-20261102.test.mjs`（`febad1af4ac69bd8d317a9d09474f814154a39827eec502582f49ad5877853bb`）。`agv-presentation.mjs` 等其余 AGV 文件未改。

#### 实际回归（cwd `spare-parts-web-release`）

- `node --test test/spare-model-presentation…model-callout-layout…spare-model-geometry-20261102…spare-hollow-shaft-20261102`（18 个文件）→ **89 通过 / 0 失败 / 0 跳过**。
- `node --test test/agv-*.test.mjs`（14 个文件）→ **69 通过 / 0 失败 / 0 跳过**。
- 子代理定向：`reviewed-model-assets`/`model-observation`/`evidence-models`/`category-models`/`spare-model-geometry-20261102` → 17/17；Codex 冻结边界测试 → 24/24。
- 未执行全量 `npm test`（含 AGV 之外范围并会读取 `server/data/ledger-model-catalog.json`），未做浏览器像素/真机/实物验收；联网未核验厂家原文。上述通过只证明文件/几何/状态逻辑一致，不代表模型已与实物核对通过。

### Codex本轮冻结接收

已接收Harness最终模型交付，独立比对465份public/models资产，仅24份在明确白名单变化（21份备件GLB、2份电源low及manifest），330份目录全部与实际资产哈希一致，21项requiresReview保留；先前备件展示/放大与App冻结文件保持。AGV工作台与两份几何源码按冻结哈希接收。整套网页回归531/531通过，776份生产源码/资源已绑定发布前哈希；正在统一生产构建。双方保持冻结，后续修改另开范围，不再覆盖本次代码。此段仅接收，尚非上线回执。


### Codex统一上线回执（本轮完成）

北京时间22:20:10已上线703份网页成品，含本轮App/PDF修复、DSH工作台、备件展示与24份白名单模型资源变化；API源码/进程、私有配置、上传及其他项目保持。最终网页532/532、API411/411、小程序静态检查、安卓Release/Lint与仪器测试APK编译通过（仪器测试未执行），4类角色93项线上核验通过。android.22于22:23:53公网字节/清单/签名核验通过；22:32:38最终健康200。21项模型资料待核保持，没有宣称实物或真机视觉验收。

双方本批保持冻结，后续另记范围；本轮/DSH原始图纸与证据未回收。可恢复清理本地49项159280084字节、服务器17项710654337字节，必要回滚保留；恢复见 docs/APP_MEDIA_REVIEW_20261102.md。未新打整站包、Git推送、微信或IPA发布。


## 手机真机照片排版与联网备件建模（22:45起）

用户要求排查同类手机展示问题，并由DSH结合备件名称/型号联网查厂家资料、生成更精细模型。已通过Computer Use向本项目AGV模型文件优化会话发送并确认任务进入第15轮，当前DeepSeek-V4.1-Flash；这只代表收到并开始，不代表交付。

- Codex本批拥有：AgvModelViewer.vue、AgvModelViewer.css、AgvVehicles.vue、agv-workbench-component.test.mjs，以及后续明确登记的App排版文件。先修标题挤压/标签遮挡/统计竖排、容器查询缺少旧内核退路、完成复位后提示仍停留进行中。用户照片为当前视觉证据；不恢复网站/真机UI自动检查。
- DSH本批拥有：备件生成器、限定GLB与evidence/manifest、reviewed-model-catalog和独立几何测试。先登记有限批次和准确文件；实际检索公开厂家页面/图纸，记录来源和不确定性，保持人工核对/待核、稳定ID。不碰Codex UI文件、不改业务数据、不批量绑定；冻结哈希后再由Codex接收与部署。

Codex补充登记：ModelPreview.vue仅窄屏工具栏CSS（6按钮39px最小宽+间隔在小于254px预览内会越界；改等宽6格并保留44px触控高），AgvElectrical.vue仅标题/目录手机排列，mobile-spare.css仅库存卡片状态和操作行防挤压。DSH本轮不拥有这些UI文件，几何保持独立。相关兼容回归加入agv-workbench-component与mobile-model-layout测试。

## 备件网络资料核实与新模型批次（2026-11-02 22:45 起，本轮）

用户新增授权：结合备件名称/型号/品牌联网查找厂家官网、尺寸图与产品照片，生成更精细的备件模型。Codex 另登记 `ModelPreview.vue`（仅手机工具栏 CSS）、`AgvElectrical.vue`（仅手机标题/目录）、`mobile-spare.css`（库存操作行），与 Harness 几何文件不冲突。Harness 不改 `AgvModelViewer.vue/.css`、`AgvVehicles.vue` 及 App/业务/PDF/原生/共用布局与其测试。

- **Harness 本轮写入范围**（相对仓库根）：`tools/modeling/reviewed-geometry.mjs`、`tools/modeling/apply-model-review.mjs`、`tools/modeling/model-review-plan-20261023.json`、`tools/modeling/generate-evidence.mjs`（如需）、`spare-parts-web-release/src/utils/reviewed-model-catalog.json`、限定 `spare-parts-web-release/public/models/**/*.glb`、`spare-parts-web-release/public/models/evidence/manifest.json`、新增独立几何/来源测试文件、`docs/SPARE_MODEL_AUDIT_20261102.md` 与本文件。**不改** Codex 上述 UI 文件、`AgvModelViewer*`、`AgvVehicles.vue`、App/native/PDF/业务源码、`.env`、台账与上传。
- 方法：先用现有 GLB 根节点名（含备件名称/型号）确认要查的具体型号 → 查厂家官网/官方目录页/公开 PDF 尺寸表与产品图 → 只对能证实的外形/孔位/接口建精确几何；同系列照片不当作精确尺寸；不同轴端、安装型式分别建模并注明；无厂家依据保留 `requiresReview`。逐项记录公开来源 URL、型号版本、证实尺寸、未知项。
- 边界：不自动绑定、不改业务数据、不批量重建历史模型；不启动服务/浏览器 UI/真机/模拟器/ADB；不写 dist、不部署、不打包、不推送；不向外网上传项目私有文件（只读取公开厂家资料）。
- 首批拟 3–5 个型号，先确认型号与可查到的厂家资料，再生成并冻结；完成后给逐文件 SHA256、来源表与实测边界。上批已于 22:20 网页、22:23 安卓22 集成上线，本批单独交付，由 Codex 统一集成。
Codex另登记app/app-layout.css：个人中心身份格长账号/车间文案的最小宽和换行防护，仅App样式。
Codex追加兼容范围：PdfReader.vue与app-agv-repairs.css仅旧内核vh高度退路；app-layout.css、AgvElectrical.vue现有dvh前补vh，不改交互或图纸读取逻辑。

### 首批联网核实的备件模型（2026-11-02 22:55，已冻结待集成）

联网通道：内置 `web_search` 报 `terminated` 不可用；改用 DuckDuckGo HTML 检索 + 厂家站点直接请求（`web_fetch` 不支持 `application/pdf`，故未读取 PDF，只用 HTML 尺寸表）。未上传任何项目文件；未启动服务/浏览器/真机，未构建或部署。

| 目录ID | 型号 | 厂家来源（公开） | 已证实并建模的尺寸 |
| --- | --- | --- | --- |
| 235 | UCP 308 | Timken 产品页 <https://cad.timken.com/item/u-series---pillow-block-mounted-bearings--ucp-200-/ucp-pillow-block-units-2/ucp308>（2026-11-02读取） | d40、H60、L220、A60、J170、N17、N1-27、H1-19、H2-118、B52、S19 mm |
| 211 | UCP 310 | <https://cad.timken.com/item/u-series---pillow-block-mounted-bearings--ucp-200-/ucp-pillow-block-units-2/ucp310> | d50、H75、L275、A75、J212、N20、N1-35、H1-24、H2-148、B61、S22 mm |
| 212 | UCP 312 | <https://cad.timken.com/item/u-series---pillow-block-mounted-bearings--ucp-200-/ucp-pillow-block-units-2/ucp312> | d60、H85、L330、A85、J250、N25、N1-38、H1-29、H2-167、B71、S26 mm |

- 新增 `mounted-unit` 生成族：底座长 L×宽 A×高 H1、两条 N1×N 长圆安装孔（孔距 J）；座体外廓由中心高 H 与总高 H2 决定（半圆顶半径 H2−H），内孔为贯通示意；宽内圈 bore=d、宽=B。逐件离线实测包围盒 = L×H2×A（误差 <0.001 mm）、底面落在 y=0、中心孔贯通、两安装孔贯通、孔间基体保留。
- 未证实：球面座半径、轴承内圈外径、密封型式、润滑嘴位置、螺钉与铸件圆角不在厂家尺寸表内，仍为示意；这三项目录条目 `requiresReview=true`，note 与 `source` 字段写入厂家 URL、型号、证实尺寸与未知项，UI 继续显示“外形待核对”。
- 首批为何只有 3 个：优先选同族、可一次用官方尺寸表精确建外形与安装孔的 UCP 300 系列；UCF307 的方形座尺寸已取得（L135、A36、J100、N19、A1-16、A2-20、B48、S19、A0-49、M16），但座体凸台外径与内圈外径无官方数值，留待下一批；亚德客 SC 系列官方样本只有 PDF（本次通道不能解析文本），未凭第三方网页数字建精确模型；SEW 空心轴减速机官网 403/无尺寸表，维持原待核。
- 文件与 SHA256：`tools/modeling/reviewed-geometry.mjs`（`bae255fcd2745a0cb60ad9945245681c76ca021760918d20a6b5e2da97a6d98f`）、`tools/modeling/model-review-plan-20261023.json`（`7d43805a77369c12fab93883651f7ea728fdf7684ca10751b70b8220968c2542`，仅 211/212/235 的 spec/note/source 变）、`src/utils/reviewed-model-catalog.json`（`e8f40695242fc5fe0420cb15f2086c610e915b0cfbcb75f57030bfb0f2a88c45`，仅这 3 条变）、GLB 505013668 `08be1470ab709cadf2cbe8fad175a86a5d602e6bdef922eac6e1f57cbaef30cf`、505013669 `f32f2b564dedf90f46911b7c3b986de6c8e92219212f08c18b61a2b1e7a1c41c`、505019154 `0bbb9a6b3e7d5bcf79e822ae4fee22bebe2c197b7b65ba70628f16c11d8dcebf`、新增测试 `test/spare-mounted-unit-20261102.test.mjs`（`f894d8d8121245161bc8f7b00fb44e419d843a702896586d11d3679ecb0c2120`）。
- 实测回归（cwd `spare-parts-web-release`）：`reviewed-model-assets`、`model-observation`、`category-models`、`spare-model-geometry-20261102`、`spare-hollow-shaft-20261102`、`spare-mounted-unit-20261102`、`model-display-status`、`model-catalog-showroom` → **21 通过 / 0 失败**；465 份 `public/models` 与开工前基线对比仅 27 份变化（上批 24 + 本次 3 份 GLB），catalog 330 条仅新增这 3 条变动。未做浏览器像素/实物验收，未绑定任何备件，未改业务数据。

#### 验收补充修正（品牌/槽型/S 偏置，2026-11-02 23:10）

- **品牌口径纠正**：211/212/235 三个目录项的台账品牌仍是 **SKF**（原 GLB 节点名与台账名称未改）；尺寸来源为 **Timken 同编号** UCP 310/312/308 的公开尺寸表，属**跨品牌参考**，**未核对 SKF 实物或 SKF 原厂图纸**。已尝试 SKF 一侧：`skf.com` 的 UCP 308 产品页只返回站点外壳（前端渲染，无可解析尺寸表），SKF 媒体库目录为 PDF，本会话 `web_fetch` 不支持 `application/pdf`，故未能取得 SKF 原厂数值。目录 note 与 GLB `userData.evidence` 均写入该口径，禁止表述为“SKF 厂家资料已核实”。
- **未知项写入两处**：catalog `note` 与 GLB `userData.evidence.unknown` 均列明球面座半径、轴承内圈外径、密封型式与材料、润滑嘴位置、螺钉规格（仅 UCP 308 表列 M14）、铸件圆角与表面形状为未证；`requiresReview` 保持 `true`。
- **底座安装槽改为真实长圆孔（stadium）**：直边 + 两端半圆，宽 N、总长 N1、孔距 J；此前是椭圆孔，已改为长圆并新增可区分断言（长圆直段末端仍开口、越过 N1 处为实体）。旧的椭圆孔在同样采样点会闭合。
- **S 轴向偏置已实现**：按“轴承中心到内圈端面距离 S”，内圈沿孔轴占位 `[-S, B−S]`（即整体偏移 B/2−S）。因此宽内圈会略高出座体宽度 A 一侧，整体深度 = A/2 + max(A/2, B−S)，已在测试中按该式校验；`userData.evidence.axialOffsetSmm` 记录 S 值。
- 修正后 SHA256：`tools/modeling/reviewed-geometry.mjs` `63a9ac12698d9145e3c2cd108e1de76bbd7d4a46f52ac12416bd3839c92ac05b`；`tools/modeling/model-review-plan-20261023.json` `63e9d25657e8ef0701500cb2710b7047a6158680a349cba8ad58c287815e85fb`；`src/utils/reviewed-model-catalog.json` `577e01e0be8f904b7c8eb0cf1d512ce69ae937582e6c678e073689d25f0675fc`；GLB 505013668 `44e1bdc17d6db51b0c32fb9796c9c3f9d9fdf379c84a9b261781fbef6a89d897`、505013669 `66c10d12bfad0b2776df966d4a8c68c347272e96aa6f61a43034e8a49d666abc`、505019154 `ed2a0598d73d2b45fabef10322fee1d444820f43ccbe66ecd961b8d3ce4b412f`；测试 `test/spare-mounted-unit-20261102.test.mjs` `a6f9377b7c53443750a05185670d6760420e701a45ec54ecae8c2867aaa2ff7c`。
- 实测：19 个备件定向测试文件 **91 通过 / 0 失败 / 0 跳过**；465 份 `public/models` 仍为 27 份变化（上批 24 + 本批 3 份 GLB），未新增其它资产改动。未绑定、未改业务数据、未做视觉/实物验收。


### Codex接收与上线回执（本批完成）

最终7份DSH哈希与三个原始Timken尺寸页已独立核对，三份GLB的槽型/S偏置及品牌口径修正后接收；465资产本批仅3份变化，330目录均匹配，24项待核。与8份手机布局修复统一537项回归通过，776份生产源绑定构建，23:09:15上线703份网页，23:13:36四角色26项线上校验通过，23:18:43最终健康200。API/原生22/配置/上传与其他服务保持；未UI/真机/实物验收。临时构建/传输文件可恢复回收，本地95,209,326字节、服务器27,301,560字节，必要回滚/原厂来源保留。后续另开范围；本批保持冻结。详见docs/MOBILE_LAYOUT_REVIEW_20261102.md。

## 全量330项备件模型重建（2026-11-02 23:42 起，替代此前“只做首批3项”的范围）

用户明确要求：全部330项由 Harness 重建，Codex 全力配合；资料不确定由双方共同检索确定，不再逐件要求用户人工核对。已读 `docs/SPARE_REBUILD_ALL_20261102.md`，确认接收 **全部 330 项**（当前状态：101 reference、63 annotated、3 existing、163 rebuilt；不是只做 3 项或只改状态）。上批 23:09 已上线，本任务另开批次，构建期间不动已上线批次资产。

- **Harness 写入范围**（相对仓库根，已登记）：`tools/modeling/reviewed-geometry.mjs`（必要时拆分到 `tools/modeling/geometry/*.mjs`）、`tools/modeling/model-review-plan-20261023.json`、`spare-parts-web-release/src/utils/reviewed-model-catalog.json`、限定 `spare-parts-web-release/public/models/**/*.glb`、`public/models/evidence/manifest.json`、独立建模/来源测试、**新增** `docs/SPARE_REBUILD_PROGRESS_20261102.json`（330 项逐项状态/来源/批次/几何变化/测试哈希/遗留）、**新增** `docs/SPARE_MODEL_SOURCES_20261102.json`（公开来源登记）、`docs/SPARE_MODEL_AUDIT_20261102.md` 与本文件。不改 Codex 的 App/PDF/native/UI、`AgvModelViewer*`、`AgvVehicles.vue`、业务/绑定数据，不写 dist、不部署、不自动绑定、不上传私有文件。
- **批次推进**：同厂/同系列 10–30 项一批；每项独立记录，分批是交付方式不是缩范围；每批独立几何/哈希/落地/轴孔/复杂度回归后冻结并通知 Codex 接收，构建期间双方不改该批。优先 101 参考/63 标注/3 沿用，再复查 163 重建项。
- **第 1 批**：带座外球面轴承（UCP/UCF/UCFL/UCFU/SUCP 等）共 28 项目录项（含 2 项 reference：201 UCFU206、248 UCFU207）。资料来源优先原厂尺寸表；台账品牌与尺寸来源品牌不一致时按跨品牌参考记录，不写成原品牌已核实。
- 已完成初始化：`docs/SPARE_REBUILD_PROGRESS_20261102.json` 已从不可变输入生成 330 条记录（status=pending）。Codex 的 PDF 提取工具就绪后用于 SKF/SEW/亚德客等仅有 PDF 的原厂资料。

## 全量330项 · 第1批冻结交付（B1 带座轴承，2026-11-03）

已确认接收全部 330 项范围，进度清单已建立：`docs/SPARE_REBUILD_PROGRESS_20261102.json`（330 条逐项记录；当前 frozen 21 / blocked 2 / pending 307），来源登记 `docs/SPARE_MODEL_SOURCES_20261102.json`。本批不结束全任务，后续按批推进。

**本批范围**：带座外球面轴承 23 项（优先 reference/annotated），其中 21 项重建冻结，2 项按资料缺口 blocked，未用同规格 UCF 冒充 UCFU：
- 重建 21 项：200 UCF210、202 UCFL208、203 SUCP213、204 UCP208、206 SUCP206、208 UCP214、210 UCF307、211 UCP310、212 UCP312、213 UCFL204、234 UCF310、235 UCP308、245 UCF308、246 UCP213、247 UCP218、303 UCFL205、305 UCFL207、312 UCF213、313 UCF211、314 UCP207、315 UCF205。
- blocked 2 项：201 UCFU206、248 UCFU207（JTEKT/Koyo 目录无 UCFU 命名；需 NSK/原厂页面或 PDF，禁止按 UCF 包络顶替）。

**方法**：公开厂家产品页用本机下载后离线解析（含 JTEKT/Koyo `jtekt.co.jp` 产品详情页、Timken `cad.timken.com` 页），不依赖内置搜索/PDF 通道；未上传项目文件。尺寸表逐项写入 catalog note 与 GLB `userData.evidence`，含来源 URL、读取日期、证实字段、未知项。台账品牌保持原样（SKF/NSK/福山/哈轴瓦轴洛轴/不锈钢未标注），尺寸来源品牌不同一律记“跨品牌参考，未核对台账品牌实物或原厂图纸，不能当作该品牌厂家资料已核实”。

**几何变更**：新增三种安装型式（立式两螺栓、方形法兰四螺栓、菱形法兰两螺栓），按尺寸表建外包络、安装孔（立式长圆孔为直边+半圆端）、中心高/法兰厚度/总宽、轴孔 d、内圈宽度 B；立式内圈按 S 轴向偏移（允许略超出座体宽度 A），法兰型内圈受 A0/A3 总宽约束、S 作为资料值记录并在 evidence 注明未做轴向突出。球面座半径、内圈外径、密封、润滑嘴、凸台直径、铸件圆角为示意。

**冻结哈希（7 份代码/清单 + 21 份 GLB）**：
- `tools/modeling/reviewed-geometry.mjs` `ca3a79db6e3f52f99815fe7ac5e069fe220e30d7bc6b52f2c8cd558b18903283`
- `tools/modeling/model-review-plan-20261023.json` `3270e2c66df281352b3e9f5ef5ae4f025da600f814dabd43aa72cd078b48932f`
- `spare-parts-web-release/src/utils/reviewed-model-catalog.json` `5112ee7fe1abb643f420de621107d12cf1e50ca1524920588da9edafa0feef72`
- `docs/SPARE_MODEL_SOURCES_20261102.json` `a5df82a6b8cb42aa0a403cd342a6418dd5622b47ea6cb821c38a49514fbd7a3e`
- `docs/SPARE_REBUILD_PROGRESS_20261102.json` `fce1b22ad107b767a42b03c784ddb9dfb379e0aa65915b4eea144e7157e2ca85`
- `test/spare-bearing-units-20261102.test.mjs` `b161ea3ea26262308ae2257f6f9e1081549f8e9cf487b382a881e4e1041f2254`、`test/spare-mounted-unit-20261102.test.mjs` `ddd0f36424cf19e7d9e97af0f7c3eb3df65f4a0cf755849e5509071eeb4c1f4b`
- GLB：505002286 `030547d4862fc16a0840c195a7a00029fd3f64cdfa6c702812d056cc4a5ade4c`、505002392 `e253578a93606b910e237bec4a06f8a30297cf099eee28172ae1b3f3db7363d5`、505002414 `1f4137b551488e2a1b9517d439a46a0ccdf55b564a46838abdd3ead4849fab16`、505002433 `9f3648fce53893736943aaa34c57890de40447ee708b56e7f4f66736ebdca28e`、505003880 `234b9e78467ae9b3363c83e43663b8aea3f3e1fc10fba8d94eb9714830666e04`、505009415 `c005b9ce3f05fb9aa8cee690103d3a0a331b8f84370af63836d8a64f22b4abf7`、505012117 `0f3e52808e74b572eb53a29addd1a3cc1548266b645049a3c111690f15a6cd79`、505013668 `6136378fd610fca43eb5f8eacde981a43b415b9cce12b7d819ce197438ae7c60`、505013669 `e01e73470f1b8e50b127560f836a7c70433f573324cd955f1e184517fbbea91d`、505015676 `839054b7c2ec7c2e4fcc1c2080c089e3abdaff5db5b19a594d72df1bea2d300c`、505019152 `d3ed9d33fbbc5d32b62da7dae92a8ef457898ba43ff64490465ee4988be2017e`、505019154 `3a7492ed173ab8a13fe4ece3c6b9cae3f33c6bc73f2596254e25445e3eb4355e`、505019295 `44eaeffd5064d7b6e7ee73517dd2e2327a5d3d1cef041a8e7a6075b2c7b76bbb`、505019297 `afbf4bf6fe1cae12851afe029111b0b71ad1c0fc7eaf663abcbcad9a25639547`、505019298 `bd62d32ca4064dfcf82ff91706c42b9195195020281c9dc72f4edd7f4bee4762`、505020205 `e8a68364b8416395de7727d467da90c958a0e69ff151cca11e1be4430c3b3ea4`、505020208 `6028491c0411e9003fba154a1cc0d2c18235f499efdf1f6b6947aaf3c208bcfb`、505020222 `608b78304fadfa15a3a63305890a088ffa364e51e1173cabfb7c775135b95919`、505020223 `44b10b75956963ff478e17fa844610d9ae4748743e3f85cb1496e939b22bf500`、505020556 `49285086fcc1dc538a5c033974f036cf347fb48e5ff8ba44cc62fd57a6d26f24`、505020565 `1a5b4e5661a847b0772cd13e91cac69c3291f8cf33d93cc56785d338994c278d`。

**验证**：20 个备件定向测试文件 **93 通过 / 0 失败 / 0 跳过**（含 330 份 GLB 哈希/网格/部位数一致、四向落地、包络/安装孔/轴孔/内圈宽度断言）；与不可变基线逐项哈希对比，**仅本批 21 份 GLB 变化**，其余 309 份字节未变。未做浏览器像素/实物/安装验收；未绑定、未改业务数据、未构建/部署。

**下一批**：SN/SNL 剖分轴承座（约 15 项，需 SKF 原厂尺寸表；请 Codex 提供 PDF 提取工具或 SKF SNL 尺寸页），以及 UCFU206/207、亚德客 SC/SAI（PDF）、SEW 空心轴减速机（原厂图）。请接收本批后冻结；构建期间本批不改。

### 物料映射接入与 PDF 工具验证（2026-11-03）

- 已读 Codex 的 `model-material-research.json`（330 目录项映射，仅名称/品牌/规格/型号，无账号人员数量价格库位）：**235 项单物料、70 项多规格/多品牌、25 项未绑定物料**。已把每项的 `materialMapping`（count/mode/brands/models/coverageNote）写入 `docs/SPARE_REBUILD_PROGRESS_20261102.json`。
- 口径：**单物料**项可按该品牌型号核对外形（跨品牌同编号仍注明来源）；**多规格**项保持通用示意，禁止把单一型号外形当作全部规格，具体型号另登记参数版本由 Codex 集成，不改数据库绑定；**未绑定**项只做通用示意。已筛出 38 项含 ≥2 个不同型号的 multi 项，列入 `variantRequests`。
- B1 复核：21 项重建项均为**单物料一对一**（如 235 = SKF UCP308，200 = UCF210，204 = 哈轴/瓦轴/洛轴 UCP208；此前“235 = UCP310”为笔误，台账、catalog 与 GLB 节点均为 UCP308，未改实物型号），型号与已建 productModel 一致，B1 覆盖结论不变；2 项 UCFU 仍 blocked。
- PDF 工具已实跑验证：`C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe tools/modeling/read-research-pdf.py`；渲染需 `--renderer C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe`（`pdftoppm.cmd` 作为子进程会失败）。输出 `.local/spare-rebuild-all-20261102/research/ndr-240/`（pages.txt、source.json、page-0001/0003/0004.png），**已 view_image 核对 p4 机械图：NDR-240 为 113.5×125.2×63 mm（侧视 36，端子 TB1/TB2 分配）**，与既有 evidence 描述一致。
- 资料缺口已写入进度 `supportRequests`：SR-1 SKF SNL/SN 剖分座尺寸表（14 项）、SR-2 NSK UCFU206/207、SR-3 亚德客 SC/SAI 尺寸页、SR-4 SEW KA/KAZ/FA/SAF 原厂图、SR-5 多规格通用模型的参数版本集成（开关电源 6 型号、深沟球 9 型号、调心滚子 16 型号等）。
- 下一批计划：B2 = SN/SNL 剖分轴承座（207/209/242/243/244/253/296/297/304/309/316/317/328/329 共 14 项），依赖 SR-1 原厂尺寸表；备选 B2' = 以已保存 SKF 滚动轴承目录（`skf-bearing.pdf`，1152 页，含调心球/深沟球/调心滚子尺寸表）重建可确认型号的轴承参数项，多规格项仍走参数版本登记。

## 全量330项 · 第2批冻结交付（B2a SN/SNL 剖分轴承座 9 项，2026-11-03）

第2批按同族推进，先交付资料齐全的 9 项，其余 5 项（209 SN518、242 SN522、296 SNL524-620、297 SNL518、317 SNL528）留在同一批次继续，不结束全任务。

**资料与方法**：使用 SKF 官方生成数据表（页脚 Generated from www.skf.com，2023-12-12）。公开 PDF 下载到 `.local/modeling/sources/housing-*.pdf`（来源为 SKF media/klium/RS docs 转载的 SKF 数据表），用 Codex 的 PDF 工具本机提取；**已把 SNL 517 数据表第 2 页渲染成 PNG 并目视核对**：Da150、Ca61、H1 95、Db97.5、A125、A1 90、H183、H2 32、L320、J260、N28、N1 22、密封槽 A3/A4/A5/A6/Dc、定位销 J6/J7，与解析值一致。旧型号 SN 515/516/519 按其对应 SKF 新代号 SNL 515-612/516-613/519-616 数据表建模，**旧新命名对应关系为推定**，已在 note 与 evidence 标注。

**几何**：新增 `split-housing` 族：底座 L×A1×H2（两条侧开安装槽 N 长×N1 宽，孔距 J）＋下座（含座孔下半）＋上盖（座孔上半，分合面在 H1）＋合盖螺栓×2＋座孔密封；座孔 Da、中心高 H1、总高 H、总宽 A、总长 L 严格按表。测试断言包围盒=L×H×A、落地、座孔沿轴贯通、上盖分合面=H1、底槽侧向开口与槽间基体、两处证据字段（含 unknown 列表）。

**冻结 9 项**：207（SN515→SNL515-612）、243（SN516→SNL516-613）、244（SNL216）、253 与 309（SN519→SNL519-616）、304（SNL520-617）、316（SNL212）、328（SNL512-610）、329（SNL517）。

**SHA256**：geometry `34a5c0dd86249843abd548752680278aad9281cb0cc671d16925d54e013f1685`；plan `0fe6420700b0b95cbfc450c9bffae395c67f478a028419b28fd45d69e982b635`；catalog `6e90436d7121a436ad563d4dd97d61fbd1f28d24883dc4da7305e7e38056dfda`；sources `e28eb0a9677f8552e9bc12ba7561330b183f679fd6f33e94b8343a3b1e6d09a6`；progress `a1a768e81c51d70467c0b9f565a701c472dc70807a6e8e2611ab30e9fec27c49`；test `fc2902782cf5aedfe19dc6c515033399d7c3edbeb3d379fb96c3461ddad08063`；GLB：505007827 `3900927a1a616963bd73d64aac58be2242585541612d9153cdccba0b3dc19141`、505019282 `1e4637fc010efbdb0d92839db287d1d4befb0d244c56154dc9c2dca7a82bc1df`、505019284 `b7684c1f025ddf94160293a5122a76a9f02f718e62b45873ec5c175902fd5b68`、505019425 `f18b5d32842b56d84a1992375479574df14d6ec85c7a685fef194cdb3d756ab4`、505020206 `749b677f44034f74348b646b40c30b7c62e3d82227c7a90f0aac9bfb02eab883`、505020216 `432990e5f8d0afb1349ca088c8b2236f81c400a19e50ad8de06a631d12fbaa4c`、505022762 `827d1d9c3bfc34dd796db913cfdd0b35a776ab35ce960184a45da3d81898d815`、505024096 `72700ced8634a2b44622ff8d29766b2d393d9802eebbdfaea9eb4989962fd9e5`、505024097 `a8b566d1feedf85756351541bab7aadf8bfcdfc9d507c986038c795259eab6db`。

**验证**：21 个备件定向测试文件 **94 通过 / 0 失败 / 0 跳过**（含 330 份资产哈希/网格/部位数、四向落地与包络断言）；与不可变基线逐项对比：**仅 30 份 GLB 变化 = B1 21 + B2 9**，其余 300 份字节未变。未做视觉像素/实物/安装验收。

**待补**：209/242/296/297/317 缺可解析的 SKF 数据表（SNL518、SNL524-620、SNL528、SN518、SN522）；请 Codex 提供这 5 个型号的 SKF 原厂数据表 PDF。后续批次：轴承参数化项（调心球1201、多规格轴承参数版本）、气缸/减速机/电气件按 PDF 与物料型号推进。

### B2 完成（14 项）与 SR-5 登记（2026-11-03）

- B2 由 9 项补齐至 **14 项**全部冻结：新增 209（SN518→SNL 518-615）、242（SN522→SNL 522-619）、296（SNL 524-620 V）、297（SNL 518，含 22218K）、317（SNL 528）。此前 9 项哈希逐项未变（确定性重建，`3900927a…`、`1e4637fc…`、`b7684c1f…`、`f18b5d32…`、`749b677f…`、`432990e5…`、`827d1d9c…`、`72700ced…`、`a8b566d1…`）。
- 新增 GLB SHA256：505012001 `bbdc1e30b0f48078dc99a064a6d948492703656271a0a376ec7c8154e94ad542`；505019281 `d75e79b431bf7607984ec3379d7929d9ee9e4a870eed5efd11c06b6ed823d144`；505020197 `f4d14423f3861076acc4a6ca074a645c0b8d8ba019613691018c606e7c9584d6`；505020198 `f016d5a4553aa707c3b64b8ad77e20d12037503078c516a6928fed3a74ee3fef`；505022763 `628b00cb10f1bdc4aae48ae973b5e0c4851b9122a1324d33b0770ddfd31b14be`。
- 旧型号对应：SN 518→SNL 518-615、SN 522→SNL 522-619、SN 515/516/519→SNL 515-612/516-613/519-616，均为 SKF 数据表标题给出的新代号；旧新对应仍标注为推定。
- 现行冻结哈希：geometry `34a5c0dd…013f1685`、plan `5332abf4…de7c00`、catalog `1e3de1aa…3c39a643`、sources `fafb350d…b8c9b408`、progress `31ae6a5d…8078bb40`、split-housing test `223311ed…9f82f2e`。
- **SR-5 已登记**：`docs/SPARE_MODEL_VARIANTS_20261102.json`，覆盖 70 个多规格目录模型的 **313 个稳定 variant**（`SPV-<catalogId>-<序号>`），含 catalogUrl、物料编码、品牌、型号、spec 精确匹配字段、拟用资产路径 `/models/variants-20261103/<variantId>.glb`；不批量改绑定，由 Codex 集成选择入口。
- 回归：94 通过 / 0 失败；与不可变基线对比 **35 份 GLB 变化 = B1 21 + B2 14**，其余 295 份字节未变。B2 期间未改 B1 21 项。
- **SR-2/SR-3 由 Codex 取证**（UCFU 与亚德客），本侧不重复；等原文与冲突说明后按“可覆盖范围”建参数版本，不把厂间不同 L/J/A 当同一外形。
- 笔误修正：交接文档中 `235 = SKF UCP310` 改为 `235 = SKF UCP308`，台账、catalog、GLB 节点本来就是 UCP308，未改实物型号。
- 下一批（B3）：轴承参数化项（调心球 1201 等单物料型号，用 SKF 滚动轴承目录或厂家页核对 d/D/B）＋已完成资料的多规格参数版本；继续 293 项 pending 按同族推进。

## 全量330项 · 第3批冻结交付（B3 台账尺寸简单件 12 项，2026-11-03）

资料不齐时不停工：本批选择**台账物料规格已给出主尺寸**的制作件，尺寸按物料描述精确建模，描述未给部位明确标示意；无厂家图纸的项目在证据与进度中登记，等待 Codex 补资料或双方继续检索。

**范围与主尺寸**：83 万向轮 φ150 带制动；84 万向轮 φ100；90 橡胶密封条 10×25 mm（长度未给按 1 m 示意）；109 闭风器套筒 φ200×5（长度未给按 300 mm 示意）；116 止逆器 内径60/外径200/把长90/槽35×45；119 防静电布筒 φ120×2000；124 上层筛网 390×1550、12 目（节距 25.4/12，丝径示意）；125 筛片 1550×695×2、孔 φ9（后侧 φ8 未建，孔距示意）；129 盘根 10×10（盘绕直径/长度示意）；144 除尘滤袋 φ140×2000；169 聚氨酯托辊 φ89×950、轴 φ20×978；189 均风板 1515×385×2（孔径/孔距示意）。

**几何**：新增 6 个制作件族：`profile-strip`（方截面条/盘根）、`caster`（轮+支架+安装板+制动踏板）、`tube-part`（管/软连接/滤袋，含加强环与袋底）、`flat-panel`（筛网经/纬丝编织、冲孔板）、`roller`（辊体+端盖+辊轴）、`backstop`（环形本体+止逆片+把柄）。逐项更新部件分组与 metadata，保留原 ID/URL；`requiresReview=true`，note 与 GLB `userData.evidence.dimensionSource.type='ledger-material-spec'` 记录物料编码与来源口径。

**多规格项**：124/125/116/169 等目录模型对应多种规格，本批只按其中**一种已记录规格**建几何，并在 note/evidence 与 `docs/SPARE_MODEL_VARIANTS_20261102.json`（313 variants）中注明其余规格待参数版本集成，**没有**把一个规格冒充全部。

**SHA256**：geometry `bc3d6660e5632c0e93b4f0b24519a18e5174232a8c58a2ca911aeb02e1778980`；plan `9a376e9597153f7ee7075de35320e66046723a92328bd71f35fba325a478b18f`；catalog `f0f1a34bf47c3c8cc7bda22ec75ed0efa25c6916e826f75de4fdf8103532634c`；sources `6810b181590dffd064035e3d74a96c4b5d11836746804bffe6b6ae47f6a222f0`；progress `5a021fb7820640532bcebf678a5729909bce9289a9f0b2a81a931ba82c894748`；test `06bfa61b177b9ed570cd78fd38aea809fdaae8ec912686432a243b31dd3f7b9b`；GLB：83 `7d43588b…14050d60`、84 `e0415f84…ad2562a`、90 `49bfdfb4…9f59923f`、109 `3d3adb09…89ccd483`、116 `1234e027…0885263`、119 `8cd2e3ed…479c13c`、124 `502f8796…5e778057`、125 `ca4dddf2…b3238b06`、129 `126b5237…ab217e0a`、144 `31edaa48…f4817ad`、169 `bedcbb67…7515bef3`、189 `fe7b0f95…88c0558a`。

**验证**：22 个备件定向测试文件 **95 通过 / 0 失败 / 0 跳过**；与不可变基线逐项对比 **47 份 GLB 变化 = B1 21 + B2 14 + B3 12**，其余 283 份字节未变。B1/B2 资产本批未改。未做视觉像素/实物/安装验收。

**下一批（B4）**：继续台账可定尺寸或厂家资料可查的 pending 项（软连接 81/114、清扫板/刮板 117/157、托辊 128、爆破片 152、安全阀 99 等）；亚德客/SEW/UCFU 等 Codex 取证到位后按同一流程建参数版本。

## 全量330项 · 第4批冻结交付（B4 亚德客气缸 11 项，2026-11-03）

已读 `docs/SPARE_RESEARCH_SUPPORT_20261103.md`，按你给的原厂中文样本执行，**没有**用跳转首页或空文本猜尺寸。两份 PDF 为图像页，本人已把 SC 第 3 页（印刷 39）与 SAI 第 3 页（印刷 23）用 Poppler 渲染并**亲自查看尺寸表**后建模；尺寸表逐项与你的示例（SC d40 A142/B50/D16/DA34；SAI d100 A229/B115/D25/DA55；SAI d160 A332/B180/D40/DA94）核对一致。

**结构区分**：SC 用 `tie-rod-cylinder` 族——方形截面缸体（AC 后段 + AB 前段）、**4 根外露拉杆**、杆径 D、气口 DA、缓冲螺钉；SAI 用 `profile-cylinder` 族——**无外露拉杆**的型材缸体（B×B）、端盖、两条传感器槽、气口。两者不共用一个外形。

**11 项**：205（SC40×100-S）、214（SC63×350）、215（SC50×150S）、222（SAI160×370-CB）、224（SC50-475S）、230（SC50×125S）、231（SC50×300S）、232（SAI100×200）、236（SC50×1500-S-CA-EUL）、254（SC63×600S）、255（SC100×450S）。总长按样本基准 **A + 行程**，截面按 B；逐件实测包围盒 =（A+行程）×B×B，杆径 D 用 rod 组 bbox 校验，SC 断言 4 根拉杆、SAI 断言 0 根拉杆且有 2 条传感器槽。

**未知项**（写入 catalog note 与 GLB userData.evidence）：端盖/内部导向与缓冲结构、拉杆螺母、型材内筋截面、传感器槽位置、磁石与安装附件（-S/-CA-EUL/-CB 未建模）；杆端与接口螺纹按样本记录但**不建牙型**。`requiresReview=true`。

**SHA256**：geometry `69e13a84f566645dd9b9ed80d2252804725b4e38ad4cfb5cf35d408973ff4409`；plan `64d4fec3cfa684b4e4f08077a329a99d9efde7542df45afb1388626f8164e794`；catalog `4ba9e6af3cf7628277ef3cf9a9823b20eb0d8f80cfd997a7a48f8432a632b093`；sources `fd9e721686131701068675581c798c47a2b74c3bb1524fbc8e88b8cf37956068`；progress `a41d51e015bd93f79c0dd65e3be07af1dbc6bbb42adffd104c68433d73cfd3b0`；test `0e919d817ad0ca4e2dc61ed7de62efffb00fc5dc23cd78716ecf45481df153ed`；GLB：505003760 `e8d7380a…a4ca6caec`、505017049 `3731bb11…a4ab3147`、505017050 `812eafb9…583ef342`、505018954 `374c770f…13408cd4`、505018958 `75732d7e…e5f76017`、505018973 `611b09cd…8c022f34`、505018974 `d073e605…63bfba9`、505018975 `189fe927…b4b0adce5`、505019267 `dab49c00…d2e0e26d`、505019697 `f0644b67…c689652a9`、505019698 `e2848bf4…781dd1a6e`。

**回归**：23 个备件定向测试文件 **96 通过 / 0 失败 / 0 跳过**；与不可变基线对比 **58 份 GLB 变化 = B1 21 + B2 14 + B3 12 + B4 11**，其余 272 份字节未变。为兼容既有契约，SC 拉杆 observation id 保留旧名 `ties`。未做视觉像素/实物/安装验收。

**下一步**：SR-2 UCFU206/207 用已保存 LYC 原厂 HTML 建 LYC 版本外形（跨品牌边界与“未核实 NSK”如实记录）；随后按你的反馈做 B1 精细化（补紧固件/接缝/润滑嘴等已知特征，不靠减面数冒充提升）。SR-5 variant 表已就绪。

### B1 精细化复核并重新冻结（2026-11-03，回应质量反馈）

按 Codex 反馈“仅 4 mesh 外廓不能算最终细节提升”，对 B1 的 21 项带座轴承单元做**证据支持的特征补充**，不靠减面数：

- 内圈增加 **2 个紧定螺钉**（UC 宽内圈采用紧定螺钉锁紧，样本/Timken 说明明确该锁紧方式；螺钉规格、角度、深度为示意）
- 座体增加 **1 个润滑嘴**（样本说明配润滑嘴；螺纹与位置未在尺寸表，标注示意）
- 保留原有底座长圆槽、座孔、内圈 S 偏置、密封等；外形包络不变（UCP308 仍 220×118×63，UCF307 仍 135×135×49）
- 新增 observation id：`set-screws`（2 mesh）、`grease-nipple`（1 mesh），部件数由 3–4 项增至 5–6 项，仍保留真实高亮/放大；`requiresReview=true` 不变，球面座/内圈外径/密封仍为示意
- 测试增加“每件 2 个紧定螺钉 + 1 个润滑嘴”断言；23 个备件定向测试文件 **96 通过 / 0 失败**
- 与基线对比仍为 **58 份 GLB 变化**（B1 21 + B2 14 + B3 12 + B4 11），无额外资产变动

**B1 重新冻结哈希**：geometry `561d84d858288c6dcff493438c425b75fd97d0483da0ff02802fc705a7ef40d1`；catalog `d8d371c6963e79c73f1382429f9339fd3e9c38e0508e46a78d3f6728dc7ce371`；progress `2a0eea14b59ac733ab32c52f3057784a22f12daa294cdc42cb13dec8570daeb8`；bearing-units test `4107cb89f7c4f16a67e8ea3070cf2390a18791d32a6367f0031747290d76c618`；mounted-unit test `c1a8eda9bad25c432d4de8373f857490b063b2f33cac40fd32caff165c99c76e`。21 份 GLB 新 SHA256（505002286 `3ae65c23…`、505002392 `4fdf0033…`、505002414 `e323bddf…`、505002433 `0a4e4cec…`、505003880 `7a68b014…`、505009415 `e9989096…`、505012117 `d9d3f699…`、505013668 `7318bdad…`、505013669 `298d9bcc…`、505015676 `754d3d81…`、505019152 `b0098e03…`、505019154 `60b48d9b…`、505019295 `e56191b1…`、505019297 `c1d9e3c5…`、505019298 `2cd8b763…`、505020205 `4c05de0a…`、505020208 `d1ac4633…`、505020222 `7845aeb5…`、505020223 `4756b3de…`、505020556 `9117fe89…`、505020565 `44540628…`）已写入 catalog 与进度。

**待下一步**：SR-2 UCFU206/207 按 LYC 原厂 HTML（LYC 包络、非 NSK 核实，独立于 UCF 系列）建模；待 Codex 集成入口与资料状态确认后继续 B5。

## 全量330项 · 第5批冻结交付（B5 UCFU + 台账尺寸件 10 项，2026-11-03）

**SR-2 UCFU（独立系列，不偷换 UCF）**：201 UCFU206、248 UCFU207 按 LYC 原厂 HTML（已保存 `codex-sources/lyc-ucfu{206,207}.html`，URL/哈希见你方 source.json）建模：L=108/117、J=83/92、N=11.5/14、A1=13/15、A0=40.2/44.4、A2=18/19、d=30/35 mm；**未建内圈**（LYC 页面未列内圈宽度 B），catalog note 与 evidence 明确“LYC 包络参考、未核实 NSK/台账品牌、UCFU 为独立系列不能当 UCF”。保留原 ID/URL 与 reference 展示口径。

**台账尺寸件 8 项**（尺寸按物料规格，未给部位示意）：81 软连接（上口220/下口250/高400，锥形帆布筒）、114 软连接（φ200×高360）、104 同步带 420R5M32（带长420/带宽32/齿距5→84齿，闭合形状圆环近似并注明两轮中心距未给出）、128 托辊（φ89×950，轴φ20×978）、131 输送带 EP200-650（宽650×厚12.5，长未给按1m示意）、152 爆破片（外廓395×195，通径335×135）、159 耐磨套（仅φ60给出，壁厚/长度示意）、167 电动拨斗（300×300，电机0.75kW，壳体深度/内部示意）。

新增族：`soft-duct`、`timing-belt`、`burst-disc`、`diverter-gate`，并为 `mounted-unit` 增加 `noInsert` 分支（内圈宽度未证时不建内圈）。

**SHA256**：geometry `46a870e8078f2de7c2558ebc39c4a109687ce65022740cc0dac9d41ddddd9dae`；plan `2695c6910472d66524d9fc2d557840a82dc8004f929c384a26cf82a087933108`；catalog `7ea26b713e17afd76d23aef9df199ad915225e5248a4e812b67ef37c4351f991`；sources `bfc44a3187f949a06274b9f10041657358f6f80441d12ccdc622a33649c2b715`；progress `e2405f19e0180e3bd7bbcabd5f8b0dbcadf2e6b9eef68081c644cc8822057393`；test `c44fd75d256b2d3decbd7088af22d5abbd7064bdf3cafeba3ad8eb9c51df8a64`；GLB：81 `06fae4f9…9945b186`、104 `0b1e7340…19660b78`、114 `b625b1de…c00b1a00`、128 `170735ac…3c7d7767`、131 `c568d90e…89a87249`、152 `9a4bebda…ba7331cd`、159 `ab251c06…db22daf91`、167 `b5b2e98d…8cc0190a00`、201 `2f5cedf2…e1864969`、248 `50628f59…7981569`。

**验证**：24 个备件定向测试文件 **97 通过 / 0 失败 / 0 跳过**；与不可变基线对比 **68 份 GLB 变化 = B1 21 + B2 14 + B3 12 + B4 11 + B5 10**，其余 262 份字节未变。未做视觉像素/实物/安装验收。

**下一步**：继续 pending 中台账可定尺寸或已有资料的项（托辊 169 其余规格走 variant、118/187 等需资料），以及多规格参数版本按 SR-5 表推进；等你确认 UCFU 展示口径与 B2/B4/B5 接收。

## 全量330项 · 第6批冻结交付（B6 SC 气缸补充＋小件 10 项，2026-11-03）

**亚德客 SC 补充 5 项**（同一印刷第 39 页尺寸表，已渲染目视核对）：306 SC50×250S、307 SC50×200S、308 SC50×100S、310 SC63×250、311 SC63×150；总长=A+行程，B 截面与 4 根外露拉杆、杆径按表，附件未建模。

**台账尺寸小件 5 项**（尺寸按物料规格；未给部位示意）：
- 82 气动快插接头 PC10-02：R1/4 外螺纹＋接管外径 10 mm（PC8/PC12 规格未建，见 variant 表）
- 67 吸尘器吸头：长约 530×宽约 60 mm、软管接口内径约 50 mm、两侧移动轮与毛刷（高度/内部流道示意）
- 97 不锈钢钢丝绳 7×19×φ6：绳径与 304 材质按规格；每股 19 根钢丝未逐根建模，绳长未给按 1 m 示意
- 137 RGV 集中驱动轴：长度 1400 mm 按规格；轴径未给按 φ50 示意，端部法兰与接口示意
- 126 橡胶弹簧 ∅96×∅96：按外径 96×高 96 理解（解释记录在 evidence），∅86 规格未建

新增族：`pneumatic-fitting`、`vacuum-nozzle`、`wire-rope`、`drive-shaft`、`rubber-spring`。

**SHA256**：geometry `2b2dad008db0f7c59f7527b33f6c188024482f53cfa7de35a1edd7ab4db6028d`；plan `07ee3547426014d9074d6b0710f2ecbc99d9d35ce50d31318859f711deff40c0`；catalog `7851cc8aef0a74daa808c7d520be31a794b10a7e8ab12b0b98514b392cf4aff6`；sources `499c11e12db64582f4edfb0013c8242d44f66960d52eb00a94dbb6e77a2bb029`；progress `1df9567ebdbb5db42ddb384837306f6f9e69cac7af241cb2b0210ad48ee7e409`；test `7c4bc166b004659952606a10439ffa7c1a868c9b115107144cd390d167281001`；GLB：306 `f662d989…b7be34a`、307 `f637e7d6…88a565`、308 `8fc67c79…04b6890e`、310 `e67ca2dc…eb4cac5`、311 `fc30950a…945b8a2`、82 `bf36f051…66bac6a`、67 `36926478…a9a837`、97 `415c5e8a…a282794`、137 `a8585a13…5349e12`、126 `529e75a2…2762989`。

**验证**：25 个备件定向测试文件 **98 通过 / 0 失败 / 0 跳过**；基线对比 **78 份 GLB 变化 = B1 21 + B2 14 + B3 12 + B4 11 + B5 10 + B6 10**，其余 252 份字节未变。未做视觉像素/实物/安装验收。

**下一步**：继续 pending 中有资料或台账可定尺寸的项（电气/传感器类先查厂家页或等你方 PDF；机械件按台账尺寸）；多规格参数版本继续按 SR-5 表推进。

## 全量330项 · 第7批冻结交付（B7 电气/自动化＋机械 8 项，2026-11-03）

本批为资料受限批，按可核实的厂家数据表建外形，**不猜内部**；批次状态记为 frozen-partial，后续继续累积到 10–30 项。

**厂家数据表 6 项**（已保存本地 PDF，尺寸取自数据表）：
- 12 PM340 6SL3210-1PE21-8UL0：W100×H292×D165 mm（另一物料 VAHLE PPI330 未建）
- 17 6ES7522-1BL01-0AB0 DQ32：W35×H147×D129 mm
- 18 6ES7131-6BH01-0BA0 DI16：W15×H73×D58 mm（另一物料 6ES7521 未建）
- 29 6SL3246-0BA22-1FA0 G120 CU：W73×H199×D67 mm
- 13 Leuze BPS 348i SM 100 D：W100×H108.7×L48.3 mm
- 42 Leuze HT46C/4P-M12：W20.5×H76.3×L44 mm（其余物料型号未建）

**台账/标准依据 2 项**：
- 99 A28W-16P DN50 安全阀：DN50、PN16 标准法兰 OD165/孔距125/4×φ18，阀体高度未给按 300 mm 示意
- 132 HDL50 电动缸：行程 450 mm、推拉力 1000 kg、速度 50 mm/s、功率 1100 W；缸体直径未给按 φ60 示意

新增族：`io-module`（模块本体/前连接器/LED/卡扣/散热片）、`sensor-unit`（本体/光学窗口/M12/安装孔）、`safety-valve`（标准法兰/阀体/阀盖/手柄）、`electric-cylinder`（缸体/推杆/电机/端盖）。端子排布、LED 数量、内部流道/减速结构均标示意。

**SHA256**：geometry `de51aa01b064e2c63a5512d0e5887fb6b97c8cd2ab758407ebe4ab9d144715da`；plan `a2005fea9c9fc909b8f8eaf38ab4f5505184b0ee06f00758b44a51ea1cdf4366`；catalog `c8f96ca8046a9cf9bda56cde817185580a2f292011bcb9f2dfe1d02754e5f569`；sources `b6891e3ba0041bf820e0d0d5dca146bb4ede944d9d3df0043c67c2d4f0a04f95`；progress `e94f6983662c268c2856bf9ddd8805f66727ad79987c9fe0d4f8d58609ec4b4a`；test `1e1ba83a10feaa1ac10bbf99ebd49cacd4b6fbab3e6cf99894a0b1af70470899`；GLB：12 `7d88f897…50dca70c`、17 `cab96078…401346a3`、18 `92254a38…8fb268`、29 `fe1b1e4c…d860602c`、13 `c4bc7a29…469dd22b`、42 `56cee3e2…8dfd636a`、99 `800b90c4…1f0176fc`、132 `ae029985…34bd89f5`。

**修正**：13 号条目保留“3D 库位使用定位标记”文案，避免既有展示状态测试回退。

**验证**：26 个备件定向测试文件 **99 通过 / 0 失败 / 0 跳过**；基线对比 **86 份 GLB 变化（B1 21 + B2 14 + B3 12 + B4 11 + B5 10 + B6 10 + B7 8）**，其余 244 份字节未变。

**新增 supportRequests**：SR-6 Leuze LSER 46B 尺寸图页（现有数据表为 Ex 使用说明）；SR-7 IM155-6 / SIWAREX WP321 / ATC100DIN / VAHLE vPOW 的原厂尺寸页（现有搜索为 404/403 或错误资料）；SR-8 SR-5 variant 集成确认。请 Codex 优先补 SR-6/SR-7，补齐后 B7 可继续累加。

## B7 修正与 reviewed-model-variants 首个有效版本（2026-11-03，交 Codex 集成）

**1. UCFU206 冲突按原样保留，不擅自修正**

已看 `codex-sources/lyc-ucfu-reference-0.jpg`（剖面图，E/A2/A1/A 定义）。201 号条目此前把 LYC 的 E 当作 40.2，属擅自换算，现改为：

- 只建 **LYC 法兰板外形**：L108、J83、N11.5、A1=13、A2=18、d30（均为页面明列），4 个安装孔 + 中心孔，包围盒 108×108×13 mm
- **未采用的页面值**：LYC 页面 `E = 402`（与 UCF206 尺度冲突）与 `Types = UC206-18`（d30 却标 UC206）均写入 note/evidence 的 conflict 字段，**没有修正为 40.2**
- 未建内圈（宽度 B 未列出）、未冒充 NSK；248 保持 LYC UCFU207 版本，caveat 明确“LYC 包络不等同 NSK/台账品牌”
- 新 201 GLB `bec81d3018e5a4f1dfd224dbb043797b26509fd9fdb0ac0a4d2d8f3a4795a99f`（1 mesh / 1 part）；B5 测试同步更新

**2. SKF SN→SNL 推定保留**

207/243/253/309/242 的 `source.sourceModel`（SNL 515-612 / 516-613 / 519-616 / 522-619 等）与 caveat（“旧新命名对应关系为推定”）保持原样，没有把 SNL 数据表当 SN 精确尺寸。

**3. reviewed-model-variants.json 首个有效版本（请 Codex 集成）**

新建 `spare-parts-web-release/src/utils/reviewed-model-variants.json`（`schema:1`，`revision:20261103-v1`），**12 个真实生成并测试过的 variant 资产**，位于 `public/models/variants-20261103/`：

| variant | 目录ID | 型号 | SHA256 |
| --- | --- | --- | --- |
| SPV-169-02/03/04/05 | 169 | 托辊 φ89×200/220/750/420 | `62b3e11b…` / `797e3ac0…` / `de5d5cf2…` / `2842e5b3…` |
| SPV-128-02/03/04/05 | 128 | 托辊 φ89×200/220/750/420（碳钢） | `323bab24…` / `b315115f…` / `cf395bf4…` / `5c319149…` |
| SPV-082-02/03 | 82 | 气动快插接头 PC8-02 / PC12-02 | `fab2b2d0…` / `ca5a4823…` |
| SPV-126-02 | 126 | 橡胶弹簧 ∅86×∅96 | `59557932…` |
| SPV-131-03 | 131 | 输送带 800×2(5+2.5) | `f4cb23a1…` |

每条含：`id/catalogId/model/brands/url/sha256/sourceUrl/sourcePage/confirmedDimensionsMm/unknown/quality/previewOnly`；本轮来源均为台账物料规格（`sourceUrl` 暂为空、`evidenceNote` 记录口径），`quality=结构示意`，`previewOnly=true`（不冒充人工核对通过）。尺寸由台账明确给出；轴长/带长/六角本体等未给值标 unknown。集成限定：仅对已绑定同一 `catalogId`/模型路径的物料生效，不改绑定/数据库。

**4. 验证**

26+1 个定向测试文件 **100 通过 / 0 失败 / 0 跳过**；新增 `test/reviewed-model-variants.test.mjs` 校验清单只含真实文件、sha256 匹配、包围盒与记录尺寸一致、previewOnly=true、catalogId 存在。catalog 侧仍为 86 份 GLB 变化（B1–B7，201 修正不增加变化数）。未做视觉像素/实物验收，未改 knowledge/API/App。

**5. 遗留资料请求**：SR-6（Leuze LSER 46B 尺寸页）、SR-7（IM155-6/SIWAREX WP321/ATC100DIN/VAHLE vPOW 原厂尺寸页）、SR-8（variant 集成确认，本轮已提供首个有效版本，可开始集成）。

## 全量330项 · 第8批冻结＋展示状态纠正＋来源总索引（2026-11-03）

**B8 低压电器 6 项（frozen-partial）**

| ID | 设备 | 依据与外形 |
| --- | --- | --- |
| 1 | 微型断路器 1P | DIN 43880 模数：宽18×高85 mm；深度按 iC65N 系列 78.5 mm（未逐型号核实） |
| 5 | 微型断路器 3P | 宽54×高85×深78.5 mm（DIN 模数） |
| 7 | 微型断路器 2P | 宽36×高85×深78.5 mm（DIN 模数） |
| 64 | 熔断器底座 RT18-32X 3P | 宽54×高85 mm；深度未给按70 mm示意 |
| 3 | GV2 马达保护器 | Schneider 数据表 **H89×W45×D78.5 mm** |
| 6 | 塑壳断路器 EZD100E | Schneider 产品数据表 **W75×H130×D60 mm** |

新增族 `din-device`、`motor-protector`、`mccb`；手柄/端子/内部结构标示意。多型号目录项（1/5/7/3/6）只建标准尺寸版本，其余型号记入 variant 待办。

**展示状态纠正（按 Codex 反馈）**

- 清除了 66 个我们重建但仅因保守而设的 `requiresReview`：现在 rebuilt/annotated 且有资料依据的模型显示“可观察”，不再全部转成“等人工核对”
- 保留 `requiresReview=true` 的只有：原 24 项待核（减速机/联轴器）、reference 状态项、以及 **201 UCFU206 冲突项**
- 说明：资料核验状态由 Codex 的知识库记录承载，不靠强制人工核对标志；所有 note/evidence 仍保留跨品牌/未知边界
- 定向测试已同步改为校验“有证据来源”，不再强制 requiresReview

**来源总索引（供知识库导入）**

新建 `docs/SPARE_SOURCE_INDEX_20261103.json`（`schema:1`，`revision:20261103-v1`）：**42 份原始资料**（used 33、reference-only 4、excluded 5），每条含本地路径、SHA256、字节数、公开 URL、类型、适用批次、状态与说明；**按 SHA256 去重**。明确排除：渲染衍生 PNG、失败下载、首页重定向 HTML、临时脚本、错误产品（Mettler ATC100DIN 误检资料）、无尺寸的 flyer/Ex 说明。PDF 原件保留在 `.local/modeling/sources/` 与 `codex-sources/`。

**SHA256**：geometry `433fb3f5b3c227705f381f420c83db70a170ed6653f1271a2c5e323e80204727`；catalog `6cb965c4da2aff9ad225b334c46879aeb459a570b9728d6af7891f1fde174f13`；progress `553e455c961ed2f5587fa4c1e399210ed9109a58e195d5cecbda0350b88cdf4a`；sources `f98ac52a9ea64f5834abe03032a503951eb25ac4d5547f55ce09d012972ae623`；source-index `b19fc1d6a4ea84d931ac5733b524af3b35bbb3665065c32ead319dc112d78e62`；B8 test `803c4c745a876859232073d6b74c3678062779e7345ef1bfb43154b2d048e231`；GLB：1 `12a3df8d…1ebc283`、5 `49445d5f…1ddfd19`、7 `ed164491…bf0249`、64 `bd7598cc…fc11bb`、3 `897cd320…954714`、6 `393cae92…5455c8`。

**验证**：28 个备件定向测试文件 **101 通过 / 0 失败 / 0 跳过**；基线对比 **92 份 GLB 变化（B1 21 + B2 14 + B3 12 + B4 11 + B5 10 + B6 10 + B7 8 + B8 6）**，其余 238 份字节未变。未改 knowledge/API/App，未部署。

**继续**：剩余 238 项 pending 继续按批推进；variant 首个版本已交 Codex；SR-6/SR-7 待你方资料。

## 全量330项 · 第9批冻结（B9 沿用/密封/机械 4 项，2026-11-03）

**3 个“沿用”优先项中可建的两项**（另有 196 SKF 22212E 待尺寸页）：
- 197 骨架油封 **90×110×12 mm**：外圈骨架/密封唇/弹簧三部分组，内径×外径×宽按物料名称
- 198 轴面油封 **RB60×80×5.5 mm**：同上，RB 型唇口结构标示意

**机械 2 项**：
- 73 WZP 热电阻：螺纹 M5、引线 1.5 m（物料“M5*1.5M”中的长度含义未定，暂按引线解释并记录）；套管直径/长度为示意
- 140 联轴器（目录含 7 种）：本几何为 **ZL6 减速机端 Φ80×140 / 头轮端 Φ90×150**，外径/法兰/销示意；AG3 与 ZL7-9 待 variant

新增族：`oil-seal`（外圈/唇/弹簧）、`temperature-probe`（螺纹/螺母/套管/引线）；`coupling` 增加 `outerScale` 参数。注：126 已在 B6 完成，本轮不再重复计入，B9 批次记录已修正为 4 项。

**SHA256**：geometry `f0159eac4a759210178bed7439a8eb94cb1fe09a154b59d31c7618ae9a6b1766`；catalog `ecf5a2fb936a6f68e4df0d196a36f5b8fe2f301915d435d0786c29cd9ad0db60`；progress `73f5683c246b30ceae1781c0c60ba12c4ba87327a7112f5afdbfee9f889afd5b`；sources `3dbe0149dbf83be6c5a25ea968f70a879edd4770aaeb790e5551855b618b7db4`；source-index `f6260c9acad83bff07cbf2589279861585af20d9b3c6845a58acf5f832b1a6b3`；B9 test `d673199ac0a72289c33eea95f01275e05aaf2a0b017baffd5a557ddd019ca041`；GLB：197 `68be0ed8…699a0b2`、198 `6d2fd04f…18c589f`、73 `3abae3b6…8833ecd`、140 `9581671d…f64d8e404a`。

**来源索引更新**：新增 Codex 提供的 `siemens-im155-6au30-manual.pdf`、`mettler-act100.pdf`，均标 reference-only（IM155 手册未提取外形尺寸；ACT100 与台账 ATC100DIN 型号不同，不可当同型号尺寸）。索引现 **44 份**（used 33 / reference-only 6 / excluded 5），按 SHA256 去重。

**验证**：29 个备件定向测试文件 **102 通过 / 0 失败 / 0 跳过**；基线对比 **96 份 GLB 变化 = B1 21 + B2 14 + B3 12 + B4 11 + B5 10 + B6 10 + B7 8 + B8 6 + B9 4**，其余 234 份字节未变。未改 knowledge/API/App，未部署。

**继续**：剩余 **234 项 pending**；196 SKF 22212E 正在找可核实的尺寸页；166 链式联轴器与 140 其余规格待资料/variant；SR-6（Leuze LSER 46B 尺寸页）仍等 Codex 补。

## 全量330项 · 第10批冻结（B10 西门子自动化 5 项，2026-11-03）

按厂家公开数据表重建，族 `io-module` / `network-switch`：

| ID | 型号 | 外形（数据表） |
| --- | --- | --- |
| 16 | 6ES7505-0KA00-0AB0 PS 25W 24VDC | W35 × H147 × D129 mm |
| 19 | 6ES7134-6GF00-0AA1 AI 8xI 2/4-wire BA | W15 × H73 × D58 mm |
| 20 | 6ES7135-6HD00-0BA1 AQ 4xU/I ST | W15 × H73 × D58 mm |
| 21 | 6GK5008-0BA10-1AB2 SCALANCE XB008 | W45 × H100 × D87 mm |
| 37 | 6GK7543-1AX10-0XE0 CP 1543-1 | W35 × H142 × D129 mm |

端子/端口/LED 布局与内部结构均标示意；各条 note 记录未证项与数据表 URL。

**SHA256**：geometry `0bdfc086b87f05d5071ef8ed9326d040a92ddbb6774aa60d7efa8b53dec27d66`；catalog `3ded97c1685f0fe01afc2140302a9109f96a1b23476d8622a567cf7043641016`；progress `208d64e9163dffd656bb20211abaf0e0d87db64a578c709720782d1b0de312ab`；sources `8e8cf60c42d447251a357fdaa0ffa9cb3d2af118e98196b59a72cd2915bd7872`；source-index `b88d01725adbbdfc06df6d42b7fcf7ff48697d081e2ba8d56aec3e112d0553ae`；B10 test `398166b1e3a4cc964d2a95be9c1b455be7f547fb5733cc47cb235cae83cb8e03`；GLB：16 `918a715c…62726ef`、19 `7dfab102…ef3f741`、20 `9440a204…61286fce`、21 `ed77551c…48eb6e`、37 `a0de247e…d98bb`。

**来源索引**：新增 5 份西门子数据表（PS25W、AI8xI、AQ4x、XB008、CP1543）与 Schneider GV2 数据表补录，索引现 **49 份**（used 38 / reference-only 6 / excluded 5），全部保留本地路径、SHA256、公开 URL、适用批次。

**验证**：30 个备件定向测试文件 **103 通过 / 0 失败 / 0 跳过**；基线对比 **101 份 GLB 变化 = B1 21 + B2 14 + B3 12 + B4 11 + B5 10 + B6 10 + B7 8 + B8 6 + B9 4 + B10 5**，其余 229 份字节未变。未改 knowledge/API/App，未部署。

**继续**：剩余 **229 项 pending**；下一步优先同类电气/传感器（Omron D4MC、Turck Ni15、Kübler 编码器、ATV310/V20 变频器、LC1N 接触器）与机械待资料项；196 SKF 22212E 仍在找可核实尺寸页。

## 全量330项 · 第11批冻结（B11 传动件 7 项，2026-11-03）

按公开标准截面/节距 + 台账型号重建；每项建台账首个型号代表，其余规格待 variant：

| ID | 型号 | 依据 |
| --- | --- | --- |
| 92 | A900 A 型三角带 | 顶宽13、高8、基准长900 mm（GB/T 11544 截面） |
| 93 | B1250 B 型三角带 | 顶宽17、高11、基准长1250 mm |
| 101 | SPB3000Ld 窄 V 带 | 顶宽16.3、高13、基准长3000 mm（DIN 7753） |
| 120 | Z900 Z 型三角带 | 顶宽10、高6、基准长900 mm |
| 102 | S10M-1630-30PK 齿楔带 | 齿距10、带长1630、带宽30 mm |
| 98 | 16A-2 链条接头（双排） | 节距25.4、滚子15.88、内宽15.75 mm（GB/T 1243） |
| 113 | 16B 双排链条 | 节距25.4、滚子15.88、内宽17.02 mm；8 节示意 |

新增族 `v-belt`（梯形截面环带，闭合形状圆环近似）、`roller-chain`（链板/滚子/销轴；单排/双排）；102 复用 `timing-belt`。链节数/两轮中心距/帘布与链板孔形均标示意。

**SHA256**：geometry `9117da986bb14d6e184908389e50631c71bc4590865be7e6e3f57411b6acff55`；catalog `cae62db7b2155d97d45e00c6e6594398039ed56241733348a47b9c78ddb8a3cf`；progress `00789f166ee6273d71b40cf03caf115b73884d7815c7a27490c3bf06afffa650`；sources `17220f4b76e181c7e5e0feed9ae35008a959425e1ffcd7586dce6c0d2c941f14`；B11 test `608d361bb2f46c5885ad88376c610ef223c327c5beb58aedb87c1216b73066f4`；GLB：92 `ed84e4c3…61722dd5`、93 `75820612…5a76fefea`、101 `f6b989e9…9fc7ae0`、120 `bb79806c…49b5cc2d2f6`、102 `e835ff04…564ef89e0e`、98 `7acb324c…4631b709a`、113 `070e2b19…c343fc76`。

**验证**：31 个备件定向测试文件 **104 通过 / 0 失败 / 0 跳过**；基线对比 **108 份 GLB 变化 = B1–B10 101 + B11 7**，其余 222 份字节未变。未改 knowledge/API/App，未部署。

**继续**：剩余 **222 项 pending**；下一批优先电机/减速机（皖南 YFB4/YE4、SEW、德马格）、气动件（AFC/AW/BFR/GFR、4V 电磁阀）、传感器（Omron D4MC、Turck Ni15、SICK S30B、Moxa EDS-G308、Kübler 编码器）。

## 来源索引纠正 + 第12批冻结（B12 纠正/传感器 4 项，2026-11-03）

**按 Codex 实际查看结果纠正来源索引**

- **IM155**：条目改为 `6ES7155-6AU30-0CN0`（IM 155-6 PN/3 HF），宽100×高117×深74 mm，来源为原厂手册 PDF 第53页/印刷52（10/2018，A5E44899355-AA），原厂 URL `https://cache.industry.siemens.com/dl/files/838/109761838/att_966247/v1/et200sp_im_155_6_pn_3_hf_manual_en_US_en-US.pdf`，SHA256 `e7e4341028662c30c1500fc673d64cb01f6024efa1d2adbf7ecde7b2963c8f2a`；索引中已核对本地文件哈希一致。旧说明“手册未给外形尺寸”删除。
- **ACT100**：保留 reference-only，注明 Codex 已看 PDF 第2页 40×110×100 mm，但台账 `ATC100DIN / 30529620` 与该型号精确对应未证，**不得替代**；原厂 URL 与 SHA256 一并入索引。
- 索引现 **49 份**（used 39 / reference-only 5 / excluded 5）。

**B12 4 项（frozen）**

| ID | 型号 | 依据 |
| --- | --- | --- |
| 70 | IM 155-6 PN/3 HF / 6ES7155-6AU30-0CN0 | 宽100×高117×深74 mm；原厂手册 PDF53/印刷52；note 明确“不是 PN ST 6ES7155-6AU01-0BN0” |
| 43 | Leuze LSER 46B/66,200-S12 S-EX n（料号50111520） | 27.5×87×54 mm，原厂产品页；Ex 尺寸图未下载，孔/接口为示意；非 Ex 50108535（18.5×75×43.4）未混用 |
| 54 | Turck Ni15-G30SK-AP6X | M30 圆柱，直径30×长44 mm（Turck 数据表） |
| 44 | Kübler 8.5000.0000.1024.S066 | 法兰 ø58、轴 ø10×20 mm（样本选型表）；本体长度按46 mm 示意 |

新增族 `barrel-sensor`、`encoder-unit`。未对 22（ATC100DIN）、71（WP321 冲突尺寸）建模；不混用未证型号。

**SHA256**：geometry `d595850d58e535f5c8951dd2bebf363455d80f68c642a2e715537707a088f4fd`；catalog `37b8763e7d5e493b047423c7dedc74ec1a4dfec364eb4c65a62173849c2f3ab4`；progress `e19e0fb67b1e98ac1fb66b18dbf11b02fec3d4d1fb109834e73abb69cba6293d`；sources `3ebfef8b21a47305d27c38b50e29e0f074f026f41d8ab6ff189efebb561fa79c`；source-index `dcdbb43152f528ff54671ac02df1e9cf96d587900e86123151b085564df1ce0d`；B12 test `a97dfad9b077ea3ddb5c86bc9e27374d7492ed7667854c24a2c0539842812d2f`；GLB：70 `874c4c6b…6aacd5c16`、43 `a3d97bce…08c21bff`、54 `c660c416…82fe892`、44 `20b0ea1c…31fec795`。

**验证**：32 个备件定向测试文件 **105 通过 / 0 失败 / 0 跳过**；基线对比 **112 份 GLB 变化 = B1–B11 108 + B12 4**；frozen 112 / pending 218。已冻结项哈希与 progress 保持对应，本轮未改动任何既有冻结 GLB。

**后续**：剩余 218 项；下一批继续电机/减速机、气动件、Omron D4MC、Moxa EDS-G308 等；22/71 等冲突或未对应项保持 pending 等你方资料。

## 全量330项 · 第13批冻结（B13 开关/轴承代表 4 项，2026-11-03）

**已核尺寸后重建**：

| ID | 型号 | 依据 |
| --- | --- | --- |
| 25 | Omron D4MC-5040-N 限位开关 | 样本第3页图纸：本体约40×40×21.7 mm、柱塞ø12.7伸出约15 mm、总高约55 mm（53.4 为含安装耳/螺钉孔位，未建安装耳） |
| 33 | MOXA EDS-G308-2SFP 工业交换机 | 数据表 Physical：53×135×105 mm；8×RJ45+2×SFP 端口排列示意 |
| 85 | 深沟球轴承（代表 6306） | SKF 目录尺寸表 30×72×19 mm；目录 9 型号未全建 |
| 87 | 调心滚子轴承（代表 22218CAK/W33） | SKF 目录尺寸表 90×160×40 mm；目录 16 型号未全建 |

新增族 `limit-switch`；`network-switch`、`bearing` 复用。安装耳、端子、端口排列、球/滚子数与保持架均标示意；85/87 仅代表型号，其余待 variant。

**SAR/SHA256**：geometry `b43a45d69404c266b189dc19a1ce3f8e2b05f802f75f5d9986840dfa3f5bdc3a`；catalog `544f4e1b393dca1a09958bd4154c65937e10cde42c613ff04e9166de8414aa23`；progress `822a23a7671a572d12c9dcdbafd1a7f0123018d7f5d723dd4e04a2efffdc1507`；sources `428d4b6a5117ce2fbf86b5c76f4aedc6d44ba3154ac33ba1829d69233507c21f`；source-index `439ed978c8111aa7303bd83d148058c70d975689b7d69b74ddd80989707dc478`；B13 test `0f1800bf272cbda74e0471d2dd5cb5730dc2b92edb9ac27247062868a8642296`；GLB：25 `6e90c433…c15bd660`、33 `8f476a70…aea881a0`、85 `17a83e16…0e4bc095`、87 `30f9835c…6c8bbaa`。

**来源索引**：新增 Omron D4MC、Moxa EDS-G308、Turck Ni15、Kübler 8.5000、Airtac 4V 目录、AFC/BFC 选型页；索引现 **55 份**（used 43 / reference-only 7 / excluded 5）。4V 目录只取得型号/规格页，**未取得 4V200 尺寸页，未用于建模**；AFC/BFC 仅 1 页选型，无 AFC2000 外形尺寸，未建模。

**验证**：33 个备件定向测试文件 **106 通过 / 0 失败 / 0 跳过**；基线对比 **116 份 GLB 变化 = B1–B12 112 + B13 4**；frozen 116 / pending 214。未改 knowledge/API/App，未部署。

**后续**：剩余 **214 项**；下一批继续气动件（AFC/AW/BFR/GFR、4V 需尺寸页）、电机/减速机、SICK S30B 等；85/87 其余型号可走 variant；22/71 等冲突项保持 pending。

## 全量330项 · 第14批冻结（B14 扫描器/接触器/仪表 3 项，2026-11-03）

| ID | 型号 | 依据 |
| --- | --- | --- |
| 31 | SICK S30B-3011DA 安全激光扫描器 | 数据表：**102×152×106 mm**（W×H×D）；窗口/接口为示意 |
| 2 | Schneider LC1N0910M5N（12 型号代表） | 数据表：**W45×H74×D80 mm**；三极主端子/线圈/辅助触头示意；其余 11 型号待 variant |
| 56 | 正泰 PD666-2S4 96×96 面板表 | 面框 **96×96 mm**（DIN 43700 标准）；深度未给出按80 mm 示意 |

新增族 `area-scanner`、`contactor`、`panel-meter`。本批资料获取受限（CHINT/皖南/德力西等站点 TLS 失败或 403），只建已核到尺寸的 3 项，记为 frozen-partial。

**SHA256**：geometry `7013282715522f2bcdc5fce55ebf7e6a2bdfaf0e84b9cc7ec818ab3f6ad2dfba`；catalog `6be23847761b25d54adb187617738d1e04e5f4df5f677b76d31eb2e4c61ac8db`；progress `77657c9573a6e89c8f2bc9dca37457c9430da4ebbc1192b8898004fe5d1cf2ca`；sources `9599669c3ec5617cfa9a0b05e9433c40c5a6088344477ef436185f09d5750248`；source-index `59b7d61e0f4c10948cdf929d13de604af12c2c6e907267d39368492256a6c2b6`；B14 test `40d9ece3abeb418aeeac6df9a4c939c09f1b0b3d23091082d40141c732fa4fbf`；GLB：31 `d35a3c2d…c8584c71`、2 `dee1ae41…440cce06`、56 `114a44a2…e346b1`。

**来源索引**：新增 SICK S30B 数据表、Schneider LC1N 数据表；索引现 **57 份**（used 45 / reference-only 7 / excluded 5）。本轮尝试但失败的 CHINT PD666、皖南 YFB4、德力西 JLXK1、正能风机 PDF 未入库（TLS/403/非PDF），已记录为未取得，不伪造。

**验证**：34 个备件定向测试文件 **107 通过 / 0 失败 / 0 跳过**；基线对比 **119 份 GLB 变化 = B1–B13 116 + B14 3**；frozen 119 / pending 211。未改 knowledge/API/App，未部署；冻结项哈希与 progress 保持对应。

**后续**：剩余 **211 项**；下一批转向电机/减速机（皖南 YFB4/YE4、SEW、德马格）、气动件与 Omron/Moxa 之外的电气件；CHINT/皖南等站点可换镜像或等你方提供 PDF。

## 全量330项 · 第15批冻结（B15 IEC 机座电机 4 项，2026-11-03）

按 IEC 60072 机座尺寸表重建（H/A/B/D/E 精确，机壳长度/风罩/接线盒/底脚形状示意）：

| ID | 型号 | 机座与关键尺寸 |
| --- | --- | --- |
| 105 | YFB4-160L-4（18 型号代表） | 160L：H160、A254、B254、D42、E110 mm |
| 110 | YFBBP200L1-2（3 型号代表） | 200L：H200、A318、B267、D55、E110 mm |
| 127 | SEW DRU180M4（5 型号代表） | 180M：H180、A279、B241、D48、E110 mm（按机座号；SEW 实际外形未核） |
| 146 | YE4-280M-4 | 280M：H280、A457、B419、D80、E170 mm |

新增族 `iec-motor`（机壳/散热筋/接线盒/风罩/输出轴/底脚+地脚孔）；轴心高、轴伸 D×E、底脚孔距 A×B 由机座尺寸驱动。105/110/127 仅代表型号，其余待 variant；127 已明确 SEW 实际外形未核。

**SHA256**：geometry `dc0b61af63a3ba8b9dec801596307fadf59b6c16c2cce00a2b9fe345bb8218bc`；catalog `c4eccbc8b5e3a7e8225031eec5fc24671a296612b1675dc90de32ce17aa3326e`；progress `8c08c67e2df51f6162a394bf36ee896a37296380c4d734b83b893c9263494e5b`；sources `6b6f7bd2bfa7e744aa3e99b2e359eab97605f2cee159727266a838d94e59b8ef`；source-index `65508fa93e55c0216e66d750700efe3aed1f99bbb0b278676ac84ac947afcbd8`；B15 test `3f10939f0d7ce8a3d13286496435d88b843e85f4980a81cc4562c0ad7afcef62`；GLB：105 `8b4e3ad5…2394c3f`、110 `4c161d11…e667248ae4`、127 `d87e930b…dccee276`、146 `02d58667…7eeeafb4`。

**来源索引**：新增 IEC 60072 机座表（used）、SEW DRU180M4 样本、Demag ZBA 样本（reference-only）；索引现 **60 份**（used 46 / reference-only 9 / excluded 5）。SEW/Demag 已取得但未用于精确外形，避免把机座号当厂家实测外形。

**验证**：35 个备件定向测试文件 **108 通过 / 0 失败 / 0 跳过**；基线对比 **123 份 GLB 变化 = B1–B14 119 + B15 4**；frozen 123 / pending 207。修正了 `iec-motor` 两个部件说明过短导致 legacy 观察测试失败的问题（已重新冻结哈希）。未改 knowledge/API/App，未部署。

**后续**：剩余 **207 项**；下一批继续气动件与电气件（AFC/AW/BFR/GFR、4V 尺寸页、SICK 其他）、减速机（SEW/德马格需样本尺寸页）、以及 CHINT/皖南等可换镜像的 PDF。

## 全量330项 · 第16批冻结 + 全量审计（2026-11-03）

**B16：无尺寸资料的通用结构件 8 项（此前被跳过的“硬”项）**

| ID | 结构类别 | 处理 |
| --- | --- | --- |
| 88 | 带座轴承 | 按带座轴承结构重建（无型号/尺寸） |
| 89 | 不锈钢带座轴承 | 同上 |
| 96 | 轴承座 | 按座体结构重建 |
| 149 | 轴承座（含轴承） | 按含轴承座体结构重建 |
| 91 | 标准气缸 | 按 SC 类似结构、计划占位 bore50/stroke200 重建 |
| 106 | 减速机（R 系列占位） | 按 R 系列箱体结构重建 |
| 108 | 减速机（带电机） | 按带电机箱体结构重建 |
| 147 | 减速机（带联轴器） | 按带联轴器结构重建 |

每项 catalog.source 均为 `plan-structure-illustrative`，note 与 GLB userData 明确写 **“无厂家型号与安装尺寸资料，按结构类别重建示意”**，并列出未知项；**不冒充原厂尺寸**，待资料后替换。所有 8 项 GLB 均与 input-330 基线不同（逐项测试强制校验 `currentSha256 !== originalSha256`）。

**B16 逐项哈希**：88 `58ed086e…3e2b77`、89 `3a8837d0…be601`、91 `b5dc5db8…17ed67`、96 `2978a6ee…341c7e`、106 `d628e716…799a61`、108 `a8f804b5…b886cc`、147 `4bc2587c…b69687`、149 `2fc9ebdf…e85987e`。

**全量 330 项审计（新增 `docs/SPARE_REBUILD_AUDIT_20261103.json`）**

- 总计 330；**frozen 131 / pending 199**
- **frozen 且与 input-330 基线哈希不同：131/131（0 项“未改却冻结”）**
- **frozen 缺来源：0**；每项记录 currentSha256/baselineSha256/changed/meshCount/partCount/sourceType/sourceUrl/unknown/tests
- pending 199 项保持真实 pending，不写 frozen；其中含无资料、尺寸冲突、待 variant 的项

**整体哈希**：geometry `dc0b61af…bb8218bc`；catalog `6215d7b2…f0a366`；progress `4344eaa2…5e5fdf`；sources `552251d6…f7c4df76`；audit `5092a704…3e6f44a`；B16 test `57d1b70f…5c4a205`。

**验证**：36 个备件定向测试文件 **109 通过 / 0 失败 / 0 跳过**；基线对比 **131 份 GLB 变化（B1–B16）**；未改 knowledge/API/App，未部署。

**继续**：剩余 **199 项**，包含接口/通讯模块（35/36/51）、无资料/冲突项（22/71 等）、多型号代表项（其余走 variant）；下一批继续按“可核实尺寸→结构示意”分级重建，仍保持真实状态与审计字段。

## 全量330项 · 第17批冻结（B17 SEW 系列减速机 13 项，2026-11-03）

**重要纠正**：B17 初次把 8 个 **A 型空心输出端**减速机（217/218/219/220/226/229/249/252）也覆盖成了通用系列示意。这些项在 input-330 基线里本来就带空心轴结构、且属于“待图纸核对”的 rebuilt 项，不能被我方通用示意覆盖。已全部**恢复 baseline GLB 与原始 catalog note/source，回到 pending**，并同步修正 B17 批次清单（21→13 项）。B17 测试只覆盖真实重建的 13 项。

**B17 真实重建 13 项**（SEW R/KAZ/RF 系列，台账型号已知，SEW 安装尺寸未取得）：

216 R37 AM80、221 R77、223 R27、225 R87、227 RF77、228 R57、237 R127、238 R97、239 R97、240 RF67、241 R87、250 RF57、251 YFB4-112M-4 电机（plan family=motor）。

每项：按 plan 系列结构真实重建（GLB 与 baseline 不同）、`source.type=plan-structure-illustrative`、note 记录台账型号与“**未取得 SEW 安装尺寸与外形图**”、unknown 3 项、`quality=结构示意`；待 SEW 样本尺寸页后替换。

**SHA256**：geometry `dc0b61af63a3ba8b9dec801596307fadf59b6c16c2cce00a2b9fe345bb8218bc`；catalog `be738585…a51928b`；progress `bd2cf189…d870678`；sources `a80cf28c…11b691adb`；audit `8ca36e90…cd53878`；B17 test `28110926…ebe35774a`；GLB：216 `50d4dac5…f6b2a298`、221 `7210680c…f4270ba4`、223 `6b69d270…b05ac6ba`、225 `4a204352…0485b822`、227 `61649071…03b34d`、228 `989d2402…669f8920`、237 `48cf4769…563f3998`、238 `42e22fd2…f02a616c`、239 `6846ffbd…90363e2`、240 `4d0a9d09…0cad533b`、241 `c815277a…dd45d4b8`、250 `adab69f5…e849e9b`、251 `9bb48090…435b2c86`。

**审计更新**：330 项中 **frozen 144 / pending 186**；**frozen 全部与 baseline 哈希不同（144/144）**；frozen 缺来源 0；pending 均为真实 pending（含 8 个恢复的空心轴项）。

**验证**：37 个备件定向测试文件 **110 通过 / 0 失败 / 0 跳过**；基线对比 **144 份 GLB 变化（B1–B17）**；未改 knowledge/API/App，未部署。

**继续**：剩余 **186 项**，其中带 plan spec 但未重建的主要是 SEW 减速机其余型号（259–295 等，注意其中空心轴项需保持原结构/待图纸）、电机（251 已做）、轴承/链轮/联轴器/密封（123/162/165/166/179/185 等），以及无 spec 的电气件；下一批继续按“可核实尺寸→系列结构示意”分级推进，并在审计中保持真实状态。

## 全量330项 · 第18批冻结（B18 剩余 plan-spec 项 54 项，2026-11-03）

本批把此前一直 pending 的 **54 个带 plan spec 项**全部真实重建（GLB 均与 input-330 基线不同），并按可用资料分级：

**SEW 系列减速机 34 项**（193、256/257/258、263–266、270–273、275–295、325）：按 plan 系列结构重建，台账型号保留；SEW 安装尺寸未取得，`source.type=plan-structure-illustrative`、`quality=结构示意`，明确 unknown。

**通用结构/标准件 20 项**：
- 65 微型断路器 iC65N 2P：DIN 43880 模数 36×85×78.5 mm（标准 + 台账型号）
- 318 YFBBP90S-4、319 YFBBP-112M-4、111 驱动电机：IEC 60072 机座 90S/112M 尺寸（111 德马格实际外形未核）
- 179 调心球轴承（无型号，按 1205 类比例示意）、skf-22220-e（plan nominal 100/180/46，按证据资产重建）
- 86/190/191 带座轴承与轴承座、192 拉杆式气缸、123 紧定套、162 24A-1 滚子链条、165/166 链式联轴器、185/326/327 轴承座密封圈、32 制动电阻、45 防爆接线箱、66 称重传感器、193 减速机箱体：按 plan 结构类别重建，标注无厂家尺寸

注：8 个 A 型空心输出端减速机（217/218/219/220/226/229/249/252）与 298–302 证据项**不在本批**，继续保持 baseline 结构/待图纸或证据状态，未被覆盖。

**SHA256**：geometry `dc0b61af…bb8218bc`；catalog `68665f0a…c189982f8`；progress `e59f5797…8a6c79b5`；sources `5719e12f…c2426f4e`；audit `89b98bd5…4594123e`；B18 test `b3bb94e5…7111f141f81`；批次逐项报告 `.local/spare-rebuild-all-20261102/research/batch-b18-report.json`（`5175bebd…a86d5820`）；代表 GLB：65 `b7feb15a…85d651ce`、318 `c3de4792…c7d613d`、319 `1fe7e309…20e2dcc5`、111 `0489e4d5…c2ff812b`、skf-22220-e `557e524e…d32cd14e`。

**审计更新**：330 项 **frozen 198 / pending 132**；**frozen 与 baseline 哈希不同 198/198**；frozen 缺来源 0；pending 保持真实状态。

**验证**：38 个备件定向测试文件 **111 通过 / 0 失败 / 0 跳过**；基线对比 **198 份 GLB 变化（B1–B18）**；未改 knowledge/API/App，未部署。

**继续**：剩余 **132 项**为无 plan spec 的项（电气/传感器/气动等，含材料型号但无尺寸）及证据/待图纸项；下一批将优先可取得厂家尺寸页的项，其余按结构类别补 spec 后重建，继续保持真实状态与审计字段。

## 全量330项 · 第19批冻结（B19 电气数据表 5 项，2026-11-03）

| ID | 型号 | 数据表尺寸（W×H×D） |
| --- | --- | --- |
| 11 | MeanWell NDR-240-24（6 型号代表） | 63 × 125.2 × 113.5 mm |
| 4 | Schneider ATV310HU15N4A（6 型号代表） | 105 × 143 × 151 mm（含散热片） |
| 14 | Siemens CPU 1214C 6ES7214-1AG40-0XB0（6 型号代表） | 110 × 100 × 75 mm |
| 8 | Schneider LADN20C 辅助触头（4 型号代表） | 26 × 48 × 42 mm |
| 59 | Schneider RSL1AB4BD 薄型继电器 | 5 × 28 × 18.5 mm |

新增族 `power-supply`、`vfd`；14/8/59 复用 `io-module`。端子/显示/散热片/内部结构均标示意；多型号目录项仅建代表，其余待 variant。

**SHA256**：geometry `709e9349…77be86`；catalog `2ed86309…ce076c3`；progress `3a602acf…ccaf40c`；sources `c69255aa…c3d87ab4`；audit `99703dfc…aa2741b`；source-index `bc820f19…59854e2`；B19 test `b6c5b1f5…d036e3d`；GLB：11 `595c5cbc…2b7138175`、4 `5fd6e47a…c5fef144d`、14 `76b7fbf9…d7a3bbeb8e`、8 `f6aed954…9fb079c29`、59 `72d90e2d…88fcb40913`。

**来源索引**：新增 ATV310、CPU1214C、LADN20、RSL1AB4BD 数据表；索引 **64 份**（used 50 / reference-only 9 / excluded 5）。

**审计**：330 项 **frozen 203 / pending 127**；frozen 全部与 baseline 不同（203/203）、0 缺来源；pending 真实 pending。

**验证**：39 个备件定向测试文件 **112 通过 / 0 失败 / 0 跳过**；基线对比 **203 份 GLB 变化（B1–B19）**；未改 knowledge/API/App。

**继续**：剩余 127 项（无 plan spec 的传感器/气动/机械件、待图纸/证据项）；下一批优先已取得数据表的 SICK/Omron/其他，其余补结构 spec 后按真实 GLB 改动重建。

## 全量330项 · 第20批冻结 + SEW/Leuze 原件入库（2026-11-03）

**B20：无尺寸资料的传感器/继电器/变送器 17 项（结构示意）**

10 防爆控制按钮、15 MY4N 继电器、23 PT100、24 速度传感器、26 排偏开关、27 JLXK1-111、38 JL90T、39 MX3100610、47 LX5-G、48 TSP83-R、50 ROS-2D、52 SPS-2D-FM、53 RD-10DQDET-200、55 JXK-10VD、57 正泰 PA666 电流表、60 FH2088、61 WZPB-231。

- 除 57 按 DIN 43700 面框 96×96 外，其余均无厂家尺寸资料，按类别结构重建；catalog note/GLB evidence 明写“无厂家尺寸/外形资料、结构示意”
- 17 项 GLB 均与 input-330 基线不同（测试强制）
- 57 来源 `public-standard`（DIN 43700），其余 `plan-structure-illustrative`

**SEW 原厂尺寸页与 Leuze CAD 已加入来源索引**

- 新增 `codex-sources/sew-{kaz47,kaz57,kaz67,kaz77,kaz87,kaz97,kaz107,ka47,ka57,fa57,fa77,sa37,sf37}-2026.pdf`（13 份，附 source.json URL/SHA）与 `leuze-46b-ex-cad.zip`、`leuze-46b-ex-original.pdf`
- 索引 **79 份**（used 50 / reference-only 24 / excluded 5）
- 状态均为 reference-only，**尚未用于几何**：SEW 图可核对箱体/空心轴/安装孔，但台账电机是皖南 YFB4，**不得用 SEW DRN 电机总长冒充皖南电机**；Leuze CAD 为原厂 46B Ex 共用壳体，导入前需核对版本/连接线计入范围
- 下一步：用 SEW 尺寸页对 16 个 pending KAZ/KA/FA/SAF 空心轴项做精确重建时，必须先保留其 hollowShaft 元数据与“待图纸”边界，不能覆盖 evidence 测试要求

**审计**：330 项 **frozen 220 / pending 110**；frozen 全部与 baseline 不同（220/220）、0 缺来源；pending 真实 pending。

**验证**：40 个备件定向测试文件 **113 通过 / 0 失败 / 0 跳过**；基线对比 **220 份 GLB 变化（B1–B20）**；未改 knowledge/API/App。

**SHA256**：geometry `709e9349…77be86`；catalog `312116ba…479353`；progress `a2bbcd56…9bb45d6`；sources `2e715c54…d04d32`；audit `c80ecb50…2c16e3`；source-index `0570c40e…efa9a5c5`；B20 test `a9f71f3d…49daf08`；逐项哈希见 `batch-b20-report.json`（`b7ef47ac…7b023a3`）；代表 GLB：10 `1e656869…f1637e`、15 `222478f7…45ac921`、23 `df163049…8b2554`、24 `93fd99c3…97276a4`、26 `b2eb2798…ad623d`、57 `2e362e53…372293c`。

## B21 几何未变纠正（独立验收整改，2026-11-03）

**问题确认**：独立验收按顶点/索引/法线/节点变换比较发现，frozen 中部分项虽文件哈希变化、但世界坐标几何与 input-330 基线相同。我方补充了同口径检查工具 `tools/modeling/glb-geometry-fingerprint.mjs`（世界坐标顶点/索引/法线 + 节点变换，忽略名称/extras），并在审计中新增 `geometryChanged` 字段。用该工具复查后，实际受影响 **71 项**（不只是最初 21 项，含 B17/B18 中同算法复现的减速机等）。

**B21 逐项重建并修复**：71 项全部重新生成，且构建脚本强制 `geometryFingerprint(new) !== geometryFingerprint(baseline)` 才允许写入/冻结：

- 减速机 50 项（106/108/147/193 + 216/221/.../325）：在 reducer 结构上补 **箱体散热筋、放油塞、呼吸器、地脚安装孔、输出键** 等可确认类别特征；SEW 原厂尺寸页已入索引但未逐项读图，继续标“安装尺寸待核”。
- 座体/带座轴承 7 项（86/88/89/96/149/190/191）：改用 mounted-unit 结构，补安装孔/润滑嘴/密封/内圈紧定螺钉。
- 气缸 2 项（91/192）：改用拉杆式 SC 结构（四根拉杆、端盖、缓冲）。
- 电气 3 项（32 制动电阻、45 防爆接线箱、66 称重传感器）：新增对应类别结构（散热片/端子、箱门/铰链/螺栓/电缆密封接头、弹性体/承载凸台/安装孔/电缆）。
- 123 紧定套：改为贯通环形锥套 + 环形锁紧螺母/垫圈 + 外圆注油槽/孔（保持中孔贯通）。
- 162 滚子链条：按 24A-1 标准节距/滚子/内宽重建。
- 165/166 链式联轴器：显式端部孔径/长度 + 缩小外径比例重建。
- 185/326/327 密封圈：迷宫密封环 + 骨架 + 毡圈。
- 251 YFB4-112M-4：按 IEC 112M 机座 H112/A190/B140/D28/E60 重建。
- skf-22220-e：在 100×180×46 轴承上补 W33 润滑槽与三个润滑孔，保持贯通孔。

**SDK/测试**：新增 `test/spare-geometry-correction-20261102.test.mjs`，读取 B21 批次 71 项，逐项用几何指纹校验“与基线实际几何不同”，并校验来源/说明。审计结果：**frozen 220，几何变化 220/220，frozenWithoutGeometryChange=0**。

**SHA256**：geometry `a9c9fff4…db880e8c`；fingerprint 工具 `8694519b…60513a2b`；catalog `db4a57c1…19c55c1f`；progress `a3d43c0e…5a1dc7`；sources `e10c343e…209e627a`；audit `1aced07f…cee31ce5`；source-index `0570c40e…efa9a5c5`（79 份，含 SEW 13 份尺寸图与 Leuze 46B Ex CAD/PDF，reference-only）；B21 test `feffbc1f…e5c7174`；逐项哈希见 `batch-b21-report.json`（`d8f56ce7…8f62626`）。代表 GLB：21 `1664eb99…f191cc`、32 `88f32a64…1229f2e`、45 `e40352af…5c1979`、66 `3e8c395d…01c356`、88 `0ae6410b…c8cba5d`、91 `fc9f4756…8dbf3ba`、123 `86b159a0…c290f53`、162 `32d257b9…e2ede3b8`、165 `c7fd43bc…077c536`、166 `6b06bba7…06819a452`、185 `5296787b…4a458da`、251 `a7622d83…00d5f0d4`。

**验证**：42 个备件定向测试文件 **114 通过 / 0 失败 / 0 跳过**；基线对比 **220 份 GLB 文件变化**，且几何指纹比较 **220/220 实际几何变化**；未改 knowledge/API/App，未部署。

**后续**：剩余 **110 项 pending**；此后每批冻结前强制跑几何指纹校验，不再允许“只改二进制/标注”的冻结。SEW 图将用于后续逐项读图精确化 KAZ/KA/FA/SAF 项，同时保留 DRN 电机总长不可冒充皖南 YFB4 的边界。

## 全量330项 · 第22批冻结（B22 气动/机械/电气结构 19 项，2026-11-03）

本批继续覆盖无厂家尺寸资料的剩余项，全部按类别结构重建，并强制通过**世界坐标几何指纹**与 input-330 基线差异校验：

- 气动：9 4V210-06-B 电磁阀、94 AFC2000 二联件、95 AW4000-04D、121 MAJ-Y-1型50 脉冲阀、143 DSG-01 换向阀、112 GT-16 气动振动器
- 风机/电机：46 GFBF-100 轴流风机、62 GB-132 隔爆风机、107 YZU-10-8A4 振动电机
- 机械：103 喂料辊、115 DQ1312 畚斗、133 CMSG-020 磁性开关、134 F-SC100SH 支架、136 DRSM160 主动轮、138 DRS160 导向轮
- 电气：58 LCS-150M3 操作面板（DIN 43700 面框）、72 SCALANCE XC206、79 UF51 5G CPE、80 WTU-NET21

新增族：`air-prep`、`solenoid-valve`、`axial-fan`、`vibration-motor`、`air-vibrator`、`bucket`、`wheel`、`pcb`、`bracket`。所有结构细节（滤杯/调压、线圈/手动按钮/气口、叶片/防护网、偏心块、斗体/加强边、轮毂/轮轴）均为类别示意；note/evidence 明写无厂家尺寸。

**SHA256**：geometry `117c5f0d…7190f67`；catalog `3561ed5a…c807122c`；progress `17586106…709ce43`；sources `691ff10a…91405b8`；audit `4f39b3f2…0faf552`；B22 test `7ac90bba…0ea6a519`；逐项见 `batch-b22-report.json`（`e6d7f6a9…46d1be6d`）；代表 GLB：9 `60a58eb4…bcd6dea`、46 `dc9e27a3…4b50d`、58 `bdc8c046…1910ad6`、94 `a976c8da…46eaa3`、103 `ec1da27b…26640dca`、107 `1dd4a8e5…bf8b69c3`、115 `6729472a…99050968`、121 `f4870330…53dd9a1d`、136 `4af725c2…f5812d3a`。

**审计**：330 项 **frozen 239 / pending 91**；**frozen 几何变化 239/239**、0 缺来源；pending 真实 pending。

**验证**：43 个备件定向测试文件 **115 通过 / 0 失败 / 0 跳过**；基线对比 239 份 GLB 变化且几何指纹全部不同；未改 knowledge/API/App。

**后续**：剩余 **91 项**（含 22/71 等资料冲突项、无 spec 的电气/机械件、待图纸项）；继续按“可核实尺寸→类别结构示意”推进，每批强制几何指纹校验。

## 全量330项 · 第23批冻结（B23 剩余类别结构 37 项，2026-11-03）

本批覆盖无厂家尺寸资料的电气/气动/机械项，全部通过**世界坐标几何指纹**与基线差异校验：

- 电气/电源：28 3RW5125 软启动器、30 BOP-2 面板、40/41 VAHLE 整流/取电器、49 EP3E 伺服驱动、51 接口模块、68/69/74/75/76/77 电路板、188? 等；78 steute Ex AZ16、100 电磁阀线圈、135 制动线圈
- 气动：34 Leuze IS118MM、122 GFR600、151 BFR4000、160 AR2000、170 PAL02 消声器、163 MDB1D63 主气缸
- 机械：63 MC15-2.0 鼓风机、117 清扫板、118 碾弧板、130 制动片、139 电磁离合器、141 支架、142 5m 电缆、145 锤片、148 回转减速器、150 离合器轴、153 铁辊、154 玻璃钢吊杆、157 塑料刮板、161 轴承防尘盖

新增族：`coil`、`brake-pad`、`clutch`、`bearing-cover`、`blower`、`arc-plate`、`muffler`、`blade-plate`。全部标注无厂家尺寸/结构示意；构建强制几何指纹不同于 input-330 基线。

**SHA256**：geometry `c2293b36…995de3e`；catalog `ca0e0720…da6f8a`；progress `364a62df…477090`；sources `7fa1f3cf…c10d8`；audit `437b4663…41188`；B23 test `58b2c93d…02c86`；逐项见 `batch-b23-report.json`（`7a479fa6…3e8eff`）；代表 GLB：28 `c0f7cc2f…521a3e`、34 `43c49c4a…7a4a8a`、63 `4824add8…97948f`、78 `b0a4868c…f97436a`、100 `5c66e9f1…7cbba5`、118 `724b75e7…fa0d5a7`、130 `b739ea9a…493804`、139 `7844b994…66ac90e`、148 `7fd1f164…7e699c3`、163 `cb266b6d…73761a65`。

**审计**：330 项 **frozen 276 / pending 54**；frozen 几何变化 276/276、0 缺来源。

**验证**：44 个备件定向测试文件 **116 通过 / 0 失败 / 0 跳过**；基线对比 276 份 GLB 变化且几何指纹全部不同；未改 knowledge/API/App。

**剩余 54 项**：证据/空心轴待图纸 15 项（217/218/219/220/226/229/249/252/259/260/261/262/267/268/269/274 中的 pending 部分及 298–302）、资料冲突 22/71、196 SKF 22212E、以及少量无资料项（168/178/180/181/182/183/184/186/187/194/195/199/233/320/321–324 等）。下一批继续分类型重建，保持真实状态与几何指纹门槛。

## 全量330项 · 第24批冻结（B24 剩余结构 34 项，2026-11-03）

本批覆盖最后一批无厂家尺寸资料项，并把 298–302 华康联轴器按 plan 端部尺寸重建（来源仍标待核）：

- 机械：155 风门调节装置、156 刮灰叶片、158 偏心轴、164 平筛筛格、171 开关操作件、172/173 托辊、174 笼骨架、177 缓冲胶垫、180 弹性圈、181 压筛板、182 拉紧把手、183 磁棒、184 磁棒支架、186 皮带清扫器、187 聚氨酯刮刀
- 电气/气动：175 防跑偏传感器、176 LRD3361C、178 辅助触点、188 总线适配器、194 电容补偿盒、195 时间继电器底座、199 IM 155-6 PN ST、233 JSI32X75S、320 MDB1D63 主气缸
- 纠偏装置：321–324 XBMJP 系列液压纠偏装置
- 联轴器：298–302 华康 ZL6–ZL9（端部孔径/长度按 plan，补连接螺栓；**来源尚待核实**，requiresReview 保持 true）

新增族：`screen-frame`、`cage-frame`、`correction-unit`、`coupling-detailed`。所有结构项均通过几何指纹与基线差异校验；298–302 保留“来源尚待核实”note 与人工核对状态，不给伪造审批。

**SHA256**：geometry `f17d0a82…00ed61a`；catalog `2eeaddff…ca060d`；progress `1b46e0f5…72d030`；sources `ba484d6a…31cfc9`；audit `5b88b368…a1d16ee`；B24 test `f32d6f62…f57a1e`；逐项见 `batch-b24-report.json`（`aa13b603…eec3e6`）；代表 GLB：155 `ce13b422…59cfac`、164 `c58c2e27…e2cc46`、174 `81192800…1a9880`、199 `44b6a392…0c9e95`、233 `9865ced1…8c0448`、298 `20762bc7…9d325f`、320 `da852d27…8d4547`、321 `dc7a33a8…5b1eed4e`。

**审计**：330 项 **frozen 310 / pending 20**；frozen 几何变化 310/310、0 缺来源。

**验证**：45 个备件定向测试文件 **117 通过 / 0 失败 / 0 跳过**；基线对比 310 份 GLB 变化且几何指纹全部不同；evidence-boundary 对 298–302 的“待核来源”约束仍通过；未改 knowledge/API/App。

**剩余 20 项**：证据/空心轴待图纸 16 项（217/218/219/220/226/229/249/252/259/260/261/262/267/268/269/274）、资料冲突 22（ATC100DIN 未证对应）/71（WP321 两套尺寸）、168（空名称无资料）、196（SKF 22212E 待尺寸页）。下一批优先用 SEW 原厂尺寸页逐项读图重建 16 个空心轴项，保留 hollowShaft 元数据与待图纸边界。

## 全量330项 · 第25批冻结（B25 ACT100 与 WP321 冲突参考，2026-11-03）

**22 号 ACT100（订货号 30529620，中文版）**：按原厂数据表 **40×110×100 mm**（DIN 导轨）建 `din-device` 外形，几何指纹与基线不同；note 明确：
- 原厂用户手册 PDF 第15页/印刷9 表1-1 证实 **30529620 是 ACT100 中文版**（30529622 才是 ACT100xx）
- 台账文字 `ATC100DIN` 保持不改，不篡改业务数据
- 手册本机下载遭循环重定向，**未伪造本地 PDF/哈希**；数据表本地 SHA 保留

**71 号 WP321（7MH4138-6AA00-0BA0）**：尺寸来源存在真实冲突，本模型仅按 **Siemens 官方 CAD 目录比例（W15/H73/D58）** 建外观参考：
- 原厂手册 PDF 第123页（08/2024 A5E33715669A-AE）为 **W15/H57/D72**
- note/evidence 明写冲突，未转置或拼凑数字，`requiresReview=true`，不宣称安装尺寸已确认
- CAD/手册 URL 已入来源索引 externalLinks

**来源索引**：71 份本地原件 + 2 条 externalLinks（ACT100 手册、Siemens CAD 目录）；新增 `codex-sources/siemens-wp321-manual.pdf`（SHA `7c302af1…228144`）reference-only。索引共 **80 份**（used 50 / reference-only 25 / excluded 5）。

**SHA256**：geometry `f17d0a82…00ed61a`；catalog `32996bc1…d41ad3`；progress `1ff33b00…cf6a9`；sources `ba484d6a…31cfc9`；audit `5d211a62…2cc62c`；source-index `f6a54f33…74a164`；B25 test `580b6291…050382`；逐项报告 `76706be4…e84633`；GLB：22 `3079f071…502a208`、71 `f05081a5…57f729`。

**审计**：330 项 **frozen 312 / pending 18**；frozen 几何变化 312/312、0 缺来源。

**验证**：46 个备件定向测试文件 **118 通过 / 0 失败 / 0 跳过**；未改 knowledge/API/App，未部署。

**剩余 18 项**：空心轴/待图纸 16 项（217/218/219/220/226/229/249/252/259/260/261/262/267/268/269/274）、168（空名称无资料）、196（SKF 22212E 待尺寸页）。下一批用 SEW 原厂尺寸页逐项读图重建 16 个空心轴项，保留 hollowShaft 元数据与待图纸边界。

## 全量330项 · 第26批冻结（B26 空心轴 SEW 16 项，2026-11-03）

在**保留 baseline 空心轴结构与 hollowShaft 元数据**的前提下，用 SEW 原厂尺寸页（33346739 02/2026）对应的箱体结构补外部细节：

- 16 项：217 KAZ67、218 KAZ97、219 KAZ57、220 KAZ67、226 KAZ107、229 KAZ77、249 FA77、252 FA57、259 KAZ97、260 KAZ77、261 KAZ87、262 KAZ67、267 KA47、268 KA57、269 KA47、274 SAF37
- 补充：箱体外部加强筋、放油塞、呼吸器、地脚螺栓头（均避开空心轴中心线）
- **保留**：`hollowShaft` 元数据（schema1/boreDiameterMm170/note 待图纸）、A型空心输出端 note、requiresReview=true、status=rebuilt
- 说明：**精确安装尺寸/孔位仍需逐张图纸核对**；皖南 YFB4 电机外形未核，SEW DRN 总长不冒充

**SHA256**：geometry `2c8ec768…b89045`；catalog `abcdef90…ee8b60`；progress `b40da792…848b75bc`；sources `6723517f…e5636621`；audit `a59b0ee7…54ee2d24`；source-index `f6a54f33…74a164`（80 份 + 2 externalLinks）；B26 test `1e9b80a8…03d32e`；逐项报告 `0034c3a1…4f9f48`；代表 GLB：217 `ce948dbd…1cd586d28`、218 `48129874…ca4e3d5c`、226 `30098b84…e2a132340`、249 `ba7dae03…e5613189`、259 `d69b3c14…87ae6d23`、267 `f0f52d15…a47a1b26de`、274 `6506a8c4…4ff41692`。

**审计**：330 项 **frozen 328 / pending 2**；frozen 几何变化 328/328、0 缺来源。

**验证**：47 个备件定向测试文件 **119 通过 / 0 失败 / 0 跳过**；hollow-shaft/evidence-boundary/reviewed-model-assets 契约均通过；未改 knowledge/API/App，未部署。

**剩余 2 项（已写入 supportRequests，不伪造）**：
- **168**：目录名称为空、无绑定物料；现有 GLB 注释明说“不能确认代表该备件”。无类别/型号可依据，重建会臆造。SR-9 请求补名称/实物照。
- **196**：`/models/supplement-20261009/spherical-roller-bearing-22212e.glb` 是已审核的 40 网格 22212E 证据资产，且有专用观察映射测试；直接按普通生成器重写会破坏该契约。SR-10 请求确认“保留证据资产并计入完成”还是另建资产/改 URL。

这两项之外 **328/330 已冻结且全部通过几何指纹校验**；待 SR-9/SR-10 口径回复后即可提交最终 330 清单。

## 几何指纹修复 + B25 部件说明修正 + B27 22212E 单位校正（2026-11-03）

**1. 几何指纹 bug 修复（Codex 独立验收指出）**

- `tools/modeling/glb-geometry-fingerprint.mjs` 的 `apply()` 原返回嵌套数组 `[[数,p],...]`，后续 `Math.round(p[0]*1e6)` 得到 NaN；矩阵平移也按行主序取错。
- 已修复为**列主序**世界矩阵变换，返回 `[x,y,z]`，并对非有限坐标抛错；POSITION/NORMAL 均参与哈希。
- 新增 `test/geom-fingerprint-20261102.test.mjs`：仅移动一个顶点、仅改节点变换都必须改变指纹，同文件保持不变。
- 修复后重跑全量审计：**frozen 329 / 几何变化 329/329 / frozenWithoutGeometryChange=0**。

**2. 22 号 ACT100 部件说明修正**

- `dinDevice` 支持 `role:'display'`：把手部件改为 **“显示区域位置与大小为示意，显示内容未建模。”**
- 22 号 GLB 重新导出（几何不变，但部件说明修正），note 仍保留 30529620/ACT100 中文版与 ATC100DIN 文字不改。

**3. 196 号 SKF 22212E 证据资产单位校正**

- 既有 `/models/supplement-20261009/spherical-roller-bearing-22212e.glb` 原为厘米单位，包围盒 1100×1100×280 mm（10 倍偏大）。
- 已按 22212E 实际外形 **60×110×28 mm**（OD110）整体校正为 **110×110×28 mm**，保持 **40 网格结构与专用观察映射**（4 部件/36 滚子）不变；测试 `spare-bearing-22212e-20261102` 与既有 model-observation 契约均通过。
- note 明写“仅修正单位比例，未改变网格结构；原厂 22212E 图纸未重新打开”。

**哈希**：geometry `fb535024…ad3a0aa`；fingerprint `19e5f3d5…551fdf`；catalog `f7d19eb6…6c70c09c`；progress `cff96bd7…b37967f`；sources `6723517f…e5636621`；audit `15b1062d…b20a1d4`；geom test `1e1a4574…717c8c`；B27 test `9115df93…fc926a1`；GLB：22 `374362a8…e1acbe`、196 `1c173b6d…a2307d`。

**验证**：49 个备件/几何定向测试文件 **121 通过 / 0 失败 / 0 跳过**；审计 330 项 **frozen 329 / pending 1**。

**剩余 1 项：168**（目录名称为空、无绑定物料、现有 GLB 注释“不能确认代表该备件”）。无类别/型号可依据，重建会臆造；SR-9 继续请求补名称/实物照。收到后即可完成最终 330 项冻结清单。

## 全量330项最终冻结（2026-11-03）

- **frozen 330 / pending 0**
- 文件哈希变化 330/330；**世界坐标几何指纹变化 330/330**（固定列主序矩阵/顶点移动测试后重跑审计）
- 49 个备件/几何测试文件：**123 通过 / 0 失败 / 0 跳过**
- 最终清单：`docs/SPARE_REBUILD_FREEZE_330_20261103.json`（逐项 sha256/baseline/geometryChanged/source/unknown/mesh/part）
- 最终说明：`docs/SPARE_REBUILD_FINAL_330_20261103.md`
- 审计：`docs/SPARE_REBUILD_AUDIT_20261103.json`；来源索引：`docs/SPARE_SOURCE_INDEX_20261103.json`（80 本地原件 + externalLinks：ACT100 手册、WP321 CAD、SKF 22212 E 目录/商店）
- 关键哈希：geometry `fb535024…ad3a0aa`；fingerprint `19e5f3d5…551fdf`；catalog `ad89190b…09cf39`；progress `46387eb9…d887ca`；audit `d5c200d8…9e0d26`；freeze manifest `2ab4d302…3ba698`；168 GLB `7c373e67…a1d47`；196 GLB `ffa131ad…b84cf2e`；22 GLB `374362a8…e1acbe`
- 数据边界：22 ACT100 订货号已由原厂手册证实（ATC100DIN 文字不改）；71 WP321 手册/CAD 冲突仅按 CAD 比例示意；SEW 空心轴保留待图纸边界；168 通用液压纠偏装置（生产库 name 补回，无精确型号）；196 22212 E 60×110×28/E 圆柱孔，保持 40 网格映射并细化钢保持架
- variants 增量另批，不混入本次冻结；根工作台/Knowledge/部署由 Codex 负责

**交接：Codex 可基于 freeze manifest + audit 做发布门禁与上线；本批未改 knowledge/API/App，未部署。**

## 最终台账身份元数据恢复（2026-11-03，Codex 验收反馈）

修复 `ledger-models.test.mjs` 两处失败：新 GLB 丢失原 root extras 身份字段。按 `server/data/ledger-model-catalog.json` 真实映射恢复：

- **11 个 shared formerly pending**（35/86/88/89/91/96/106/108/147/149/168）：root extras 恢复 `modelName`（原台账 name）、`catalogId`（原台账 id）、`manufacturerCAD=false`；168 恢复为“液压纠偏装置”身份
- **131 个 pending-ledger 资产**：root extras 恢复 `materialCode`（如首个 505018939 已恢复）
- 恢复方式：仅编辑 GLB JSON chunk 的 root extras，**BIN 几何字节不变**；逐文件断言 geometryFingerprint(before)===after，确保没有回到基线
- 同步恢复 immutable baseline catalog 中对应项的 aliases（若有）
- 更新 catalog 每项 sha256、progress frozenSha256、audit、freeze manifest

**回归**：完整网页 `npm test` **575 通过 / 0 失败 / 0 跳过**（此前 573/2）；`ledger-models.test.mjs` 3 项通过；330 项 frozen，文件哈希变化 330/330，几何指纹变化 330/330。

**最终哈希**：catalog `7adf1cd2…4d139a`；progress `700f465c…5b5b7631`；audit `5d2f76f8…be1f3ab`；freeze manifest `a5c66a3f…9ef6d38`；source-index `5b201891…47eb1`；geometry/fingerprint 未变（`fb535024…ad3a0aa` / `19e5f3d5…551fdf`）。
**报告**：`.local/spare-rebuild-all-20261102/research/b28-identity-report.json`（142 个目标，17 个文件需字节更新）。

## 来源索引 sourceUrl 兼容修复（2026-11-03，仅索引脚本）

- 修复 `build-source-index.mjs`：读取相邻 `.source.json` 时优先 `sourceUrl`（回退 `url`），避免 SEW 13 张 2026 尺寸图与 `leuze-46b-ex-original.pdf` 的 publicUrl 为空。
- 重生成 `docs/SPARE_SOURCE_INDEX_20261103.json`：**80 份本地原件 + 4 条 externalLinks**；16 个 SEW/Leuze 条目 publicUrl 全部非空且与本地 SHA 对应。
- **本轮未改任何 GLB/catalog/progress/audit/freeze**：catalog `7adf1cd2…4d139a`、progress `700f465c…5b5b7631`、audit `5d2f76f8…be1f3ab`、freeze `a5c66a3f…9ef6d38`、geometry `fb535024…ad3a0aa` 均保持不变；330 项冻结模型不动。
- 新索引哈希：`23d5355762b4504dc4babb42a57b299ad155a35306d7e29cf69cca2b217317aa`。

## 2026-11-03 下午接续：Codex 集成范围登记

用户要求配合 DSH 调整并接续前轮遗留。已在 DSH「AGV模型文件优化」会话读到老车照片细化、右侧功能图例/装配概况删除与按系统拆装的交付；尚未上线。Computer Use 输入后即时快照未显示内容，随后用户确认文字已输入并亲自提交；已独立从 DSH 无障碍树核对14:40交接正文及“深度求索中”，不重复发送。截图与当前前台其他窗口不一致，后续输入前同时核对目标与焦点。

- 接收待核验：`src/utils/agv-model.mjs`、`src/components/agv/AgvModelViewer.vue`、`AgvModelViewer.css` 及 AGV 对应测试（均在 spare-parts-web-release 下）。Codex 接续布局与集成，DSH 如有后续修改先在此登记文件。
- Codex 前轮未交付：AGV 画布/真实 XYZ/移除透视与提示外移；个人中心平台用量和跨应用模型用途；库位渐进加载；备件预览去按钮；568条物料/330模型身份排查及16项修正；用户最后反馈的两侧白边。
- Codex 将核验上述现有实现、修复遗漏、独立验收冻结模型、生产构建后备份并只同步本项目对应网页/API；不修改其他项目服务，不做网页/真机 UI 自动操作，不生成新 APK 或整站包，不提交/推送 Git。
- 已读最新历史日志：网页584/584、API425/425；仅作为前轮结果，部署门禁以本轮实际核验为准。保留有效数据、配置、原始资料及必要回滚。

## 2026-11-03 14:4x DSH 只读核验交接（本轮不写项目源码）

按 Codex 要求，DSH 停止源码写入，仅只读核验 AGV 文件稳定状态并登记精确范围、SHA256、测试与遗留。DSH 最后一次源码写入为 14:03（AGV 测试断言更新）；当前 viewer/CSS 的 14:40 响应式收尾由 Codex 完成，已包含在下列哈希内。

### 文件范围与 SHA256

| 文件 | 行数 | SHA256 | 说明 |
|---|---:|---|---|
| `spare-parts-web-release/src/utils/agv-model.mjs` | 366 | `5541e4b080bf35422e710fa5e22066131ed2af15bc2c7e0a9acc22eae59c339a` | 老车照片细化：27–33 材质（红车身/老轮胎/绿屏）、86–100 平台支架+伸缩护套、126–130 侧护罩黑色贴花、139–166 前面板 12/键盘/企业标签/开关、187 老车轮胎；均按 `variant==='old'` 隔离，新车视觉不变 |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.vue` | 269 | `8fbe377406711d162f9a845310632bd46db6e0d9b2d16d4b88fb3d8f9ca0fb73` | 12 左侧“单件聚焦/显隐”提示；38 画布归位提示；45–51 右栏“系统与视图”，仅“按系统拆装”+“模型剖切”，功能图例/装配概况已删除；50 安全提示小字 |
| `spare-parts-web-release/src/components/agv/AgvModelViewer.css` | 97 | `8d9a2ae63dfca015415466297d0eb57b5cbe6a4a7873a0d79a9051c8edddefb2` | 20–23/66–67 两栏响应式收尾；97 安全提示跨栏；已无 `.system-legend`/`.assembly-summary` 规则 |
| `spare-parts-web-release/test/agv-site-photos-20261103.test.mjs` | 46 | `ea0465f431fe97af3b8525fdceff856a61377f001e558b4ec89d20d5a0477462` | 新增：老车贴花/护套/支架/12/键盘/材质断言，并断言新车不带老车特征 |
| `spare-parts-web-release/test/agv-workbench-component.test.mjs` | 228 | `02b0f2720da70c32b07dcd861d511497f6742356ed93950397b90345b9f862a3` | 仅第 76 行文案断言由“系统概览”更新为“系统与视图/按系统拆装”，未删断言、未降低覆盖 |

### 测试与稳定状态

- DSH 只读复跑 `node --test test/agv-*.test.mjs`：**73 通过 / 0 失败**（含组件、模型形状、内部布局、包络、演示、照片细化）。
- Codex 最新报告本地网页 584/584、API 425/425 通过；以 Codex 本轮独立门禁为准。
- 文件 mtime：`agv-model.mjs` 13:51:18；`AgvModelViewer.vue` 14:40:43；`AgvModelViewer.css` 14:40:44；测试文件 13:49/14:03。DSH 此后未再改源码。
- 本轮 DSH 未触碰 330 冻结模型、catalog、progress、audit、freeze、GLB、知识库、API、App，也未执行部署或网页/真机 UI 自动化。

### 遗留

- **14:11 身份修正待 Codex 复核**：DSH 未重套、未覆盖；避免与 Codex 正在进行的独立验收/构建冲突。
- 约 14:05 全量网页测试曾因 13:59 外部快照写入出现 5 个 spare/ledger + 3 个 warehouse 失败；Codex 当前已报告 584/584，以最新门禁为准，保留此记录供审计。
- 本批 AGV 改动仅在本地源码，未构建、未部署、未上线；由 Codex 备份/构建/发布。
- variants 增量仍另批，不混入本轮；恢复网页/真机 UI 自动检查一事未执行，仍按用户停止指示。

## 2026-11-03 14:45 Codex 完成集成与上线

DSH交接的agv-model.mjs / AgvModelViewer.vue / CSS三份SHA与冻结构建源一致，AGV73项独立复跑由DSH提供，Codex全网页584/584、API425/425和生产构建通过。14:11的16项身份修正已复核，全330模型再次通过独立几何/哈希/绑定验收；生产模型88旧目录名定向纠正，库存与物料绑定保持。

14:45:44上线完整716份网页及4份API源码，旧调用记录路由移入私有回收目录；14:45:59生产3类账号、330模型鉴权哈希、716成品及公网页面/入口JS通过，共1434断言（含文件哈希，不是1434业务请求）。没有恢复网页/真机UI操作、调用付费模型、新APK/整站包或Git推送。回滚：`/opt/spare-parts/rollback/joint-20261103-afternoon`；[完整交付](JOINT_CONTINUATION_20261103.md)。DSH在只读交接后未再写源码。

## 2026-11-03 老车实物纠偏：新一轮分工登记

用户指出14:45版本仍有无依据拖车环、管理车号/贴纸、TIM数量与导航位置错误，补发四张原图。Codex已对照源码写明7类具体修改、原图SHA、文件分工和验收条件：`docs/AGV_OLD_PHOTO_CORRECTIONS_20261103.md`。原图保存在`docs/agv-site-20261103/`，不公开发布。

DSH主责`agv-model.mjs`与必要AGV几何/照片测试，先登记文件；Codex暂不并发写这些源码，负责差异复核、集成与收到冻结交付后的上线。本轮只纠正老车，不拿现场老车照片套改新车；不动330备件/API/业务，继续停止网页/真机UI自动操作。前一批“照片细化测试通过”不能当作实物一致验收，新交接优先。
15:07 已通过Computer Use在DSH的xiangmu工作区新接续会话实际提交完整纠偏任务，正文已出现在对话中、输入框已清空且进入深度求索；旧AGV会话在当前列表/搜索中未显示，未误发其他项目。要求先核对实际路径、读四张原图并登记文件后实施。

## 2026-11-03 15:2x-15:3x DSH 接收老车实物纠偏：范围登记并实施

**接收确认**：工作区经实读为`D:\wx_xiangm\xiangmu`（非其他项目）；已读`AGENTS.md`、本文件末尾交接、`docs/AGV_OLD_PHOTO_CORRECTIONS_20261103.md`全文；已逐张实际打开`docs/agv-site-20261103/`四原图（front 带屏短端、rear 无屏短端、side-a 竖百叶侧、side-b 圆角横格侧），四图SHA256与纠偏文档表内值**逐一相同**（d9da5d67…/211147a8…/01390d1d…/d82ae71d…），并另裁原图局部核对TIM/雷达/键盘/轮面细节，未只看文档或旧截图。

**修改范围（仅`variant==='old'`老车分支；新车几何/材质保持基线）**：

| 文件 | 当前SHA256（改前） | 本轮用途 |
|---|---|---|
| `spare-parts-web-release/src/utils/agv-model.mjs` | `5541e4b080bf35422e710fa5e22066131ed2af15bc2c7e0a9acc22eae59c339a` | 主改：去拖车环/管理贴纸、TIM=2、中央凹进导航、矩形平台口+折弯片、键盘/接口/按钮布局、两侧不同散热孔、轮面、风琴护套、包络元数据 |
| `spare-parts-web-release/test/agv-site-photos-20261103.test.mjs` | `ea0465f431fe97af3b8525fdceff856a61377f001e558b4ec89d20d5a0477462` | 按实物重写实物断言（删除“车号/公司标签存在”“圆孔”等旧错误断言，改为反向断言） |
| `spare-parts-web-release/test/agv-model-internals.test.mjs` | `7ca5a12a35ead47115754e008b2474e9dbcdb7f9ff25a6f884e9535a314bc1cc` | 导航射线/平台开口断言按新几何更新，覆盖不退 |
| `spare-parts-web-release/test/agv-envelope-20261102.test.mjs` | `febad1af4ac69bd8d317a9d09474f814154a39827eec502582f49ad5877853bb` | 去掉拖车环支撑包络的旧说明，按实测更新老车包络断言 |
| `spare-parts-web-release/test/agv-model-shape.test.mjs` | `75f25c94839bf0777491b7915519f6048ec0c9ae5f68e40b6f6323df3db74969` | 仅在平台顶/面板包络断言受影响时微调，保持15部件/1310×700×460口径 |
| `docs/AGV_COLLABORATION_20261102.md` | 本文件 | 范围登记、结果与遗留 |

**不做**：不改`AgvModelViewer.vue`/CSS、330备件GLB/目录/catalog/progress/audit/API/App/其他业务；不构建、不部署、不生成包；不恢复网页/真机UI自动操作；不截图他项目；不把四图套到新车。Codex不并发写上述源码，待本文件给出稳定SHA后再独立复核/构建/上线。

**实施对应纠偏条目**：①老车6处外露拖车环（chassis 4 + rear 2）删几何并改包络说明，前后黑色橡胶触边保留；②TIM改前后各1只、位于面对各端右下角（front=-Z、rear=+Z，相反Z侧）、蓝黑组件+黑色圆柱朝下，不再每端两只蓝方盒；③导航雷达改无屏端横向中部、上层端梁下方凹进开口，扫描窗对外无遮挡，删偏侧开孔与无依据外露灯；④删`panel-number-disc`/拼12小方块/`panel-company-label`伪二维码，保留功能键/接口/急停/屏/键盘；⑤端面按照片重排（面对端左侧上圆形接口、下钥匙/旋转开关+红按钮，右侧自上至下急停/绿/红/绿；屏与10键键盘同一操作器，左右功能键；下部宽凹口+银灰横条+黑色下层）；⑥顶板改银灰薄板、长边折边、矩形开口与折弯片，去圆孔圆环与规则螺钉堆砌；⑦护套改绕车多折风琴、两侧通风不镜像（side-a竖百叶、side-b圆角横格）、轮面深色金属+棕色聚氨酯外缘+六螺栓、侧下裙黑。**

状态：15:2x 已登记，开始实施；实施期间上述源码由DSH单方写入，改完在此补稳定SHA/测试/遗留。当前线上仍为14:45批次，未声称本轮已修好。

## 2026-11-03 15:4x DSH 实施完成：稳定交付（本地源码，未构建/未部署）

**状态**：仅本地源码与测试；未改viewer/CSS/330备件/API/App，未构建、未打包、未部署，未恢复网页/真机UI自动操作。Codex可据此独立复核/构建/上线；上线前的冻结源以本表SHA为准。

**稳定文件与SHA256**

| 文件 | 行数 | SHA256 |
|---|---:|---|
| `spare-parts-web-release/src/utils/agv-model.mjs` | 454 | `7e34a0de454017cc713c941a5c1bb89758689d19a13ed4b6fb15f9b6d40011ee` |
| `spare-parts-web-release/test/agv-site-photos-20261103.test.mjs` | 226 | `306ff31019ec66446d5bba2ff033d994270762510664c24ee2854821a494fb4a` |
| `spare-parts-web-release/test/agv-model-internals.test.mjs` | 77 | `4be3bcafa9af9987a8b4109375c91e7352b57fe4b0e612212470a4683e7811bd` |
| `spare-parts-web-release/test/agv-envelope-20261102.test.mjs` | 51 | `4062aeb7500ed1bcea485784f19c713b624e6647be7c26298445a84b1983614f` |
| `spare-parts-web-release/test/agv-model-shape.test.mjs` | 51 | `75f25c94839bf0777491b7915519f6048ec0c9ae5f68e40b6f6323df3db74969`（未改，仍通过） |

**测试（本地实跑，未构建）**：`node --test test/agv-*.test.mjs` → **78通过/0失败/0跳过**（改前73；照片测试由1项改为7项并补几何断言）；`node --test test/*.test.mjs`（即`npm test`）→ **589通过/0失败/0跳过**（改前584）。未跑生产环境、未截图。

**几何/包络实测**：老车 overall **1370×720×460**（body 1310×700×460），`overallEnvelopeMm`记录=实测；新车 **1387×720×460**，且受影响部件包围盒与改前基线逐项相同（chassis / left-cover / right-cover / operator-panel / rear-cover / sensors / platform），证明未把老车照片套到新车。

**逐项落实（对应纠偏文档1–7）**

1. **拖车环**：65行chassis环、240行rear环改为仅`variant==='new'`生成；老车全车`TorusGeometry`计数=0，包络元数据/说明/测试同时改正；前后黑色橡胶触边保留（老车前/后y≈.021–.051，黑色0x1c1e20）。
2. **管理贴纸**：180–212行老车面板已无`panel-number-disc`、拼“12”小方块、`panel-company-label`与伪二维码（面板无白底0xe8e4dc网格）；功能件保留并具名。
3. **TIM**：368–382行仅`tim-front-housing`/`tim-rear-housing`各1、黑圆柱各1；front(+X端)z=**-0.300**、rear(-X端)z=**+0.300**（面对该端右下=相反Z侧），y≈.08–.18在车壳下缘；`tim-*`与`navigation-*`分开命名。
4. **导航雷达**：213–234、366–376行；rear端改为上下两道端梁（y≈.233–.403 / .102–.202），中间y≈.202–.233横向中部凹进；扫描头(-.625,.224,0)，该高度对`rear-cover`射线0命中，y=.36/.15各命中端梁；删`navigation-aperture`偏侧开孔与无依据顶部装饰灯。
5. **顶板**：74–112行；`deckPlate`银灰0x8e9499薄板、长边折边2、矩形开口（中心(-.02,0)与(-.075,0)空、z=.06与x=.10处实心）、折弯片max y=.457、风琴护套16段=4折×4侧；删圆孔环、检修框与规则螺钉堆砌。
6. **操作端面**：180–212行；一体操作器（绿屏+屏下10键同体、左右功能键8），左侧(+Z)圆形接口/钥匙/旋转开关/红按钮，右侧(-Z)自上至下急停/绿/红/绿；下部真实开孔凹口（约6mm深背板+银灰横条）、红下带+银饰条+黑橡胶触边。
7. **两侧/轮面/护套**：137–152行；side-a=右护罩(-Z) 8条竖向银色百叶，side-b=左护罩(+Z)圆角横格6条，形态与位置不镜像；黑色腰线贴花6、侧下裙黑、加分缝2；245–260行老车轮面改深色金属r.113+棕色聚氨酯胎0x7d6847+6螺栓，无金色亮轮毂。

**遗留与未验收边界**

1. **未做浏览器/真机渲染截图比对**：用户已停止网页/真机UI自动操作，本会话未恢复；几何/射线/命名/包络验收已过，不等于最终视觉验收。Codex构建后可对照四图复核。
2. 照片→模型左右映射：`side-a=右护罩(-Z)`、`side-b=左护罩(+Z)`，依据front端操作按钮朝向、rear端间隙红光与TIM可见侧推断；照片存在透视，未做毫米标定。
3. 端梁高度、操作器宽高、TIM层位、通风孔尺寸、护套4折均按图比例估计，未声称精确安装坐标。
4. rear凹进间隙只加黑色内衬背板，未建内部两侧壁；大角度斜视可能看到少量内部边界。
5. 前部凹口为真实开孔+约6mm进深背板，不声称实车凹深与孔位。
6. 历史`docs/AGV_MODEL_20261102.md`首轮记录仍写“两侧拖车环/金色轮辋”，作为历史留档未改写；本轮以`docs/AGV_OLD_PHOTO_CORRECTIONS_20261103.md`与本交接为准。
7. 四原图仍只在`docs/agv-site-20261103/`留档，未进public/未发布；四图SHA与本轮实施前核对一致。

**交接**：Codex可基于上表SHA做差异复核与生产构建；本轮未上线，线上仍为14:45批次。

### Codex 接收与二次纠偏

已接收稳定源 `7e34a0de454017cc713c941a5c1bb89758689d19a13ed4b6fb15f9b6d40011ee`，独立逐网格验证新车437网格几何/材质/变换与改前完全相同。离线六视图发现剩余实质差异：顶板仍22mm厚、护套9mm厚横条以7mm节距重叠成平墙；原底架银色端梁外露遮挡红色下带；贯穿轮口的侧下黑条与分离斜贴片不符合连续轮拱腰线。DSH已结束交付，现由Codex接续修改同一模型及照片测试、登记最终哈希后构建，不与DSH并发写入。电脑被用户使用期间不反复抢占窗口；追加意见先记录在本共享文件。此时未上线。

16:07 Codex接续纠偏已上线。最终源`d738bbb040bd7f366f5a7d8eaa369efdabd3efe8b46433bf8f939ff274104b36`，照片测试`d8a1a18bab52b81956e181d4ccc7e16dfabbf12a846afdfb0d35900c2962fc2a`。589网页测试/构建通过，716成品及线上HTTP等852断言通过；新车437网格/410份GLB保持，API/其他进程未动。回滚与完整边界见`docs/AGV_OLD_PHOTO_CORRECTIONS_20261103.md`。本批已结束，后续消防台账与工段筛选由Codex另批实施，DSH请勿覆盖本轮最终源码。


## 2026-11-03 第二轮穿模与整页视觉、报障全端退役

本轮用户重新明确联合DSH；新文件范围与截图见 `docs/AGV_SECOND_JOINT_20261103.md`。DSH接手当前最新模型/查看器/车型展示源码及其测试；Codex负责报障全端退役、外层白边、密钥和集成上线。双方不要覆盖同一文件。

### 2026-11-03 19:0x DSH 第二轮交付（冻结，未构建部署）

DSH按`AGV_SECOND_JOINT_20261103.md`登记范围完成并冻结：模型后部凹槽/侧壳台阶穿模修正（封闭浅槽、内部件收容、连续腰线、离线九视图与射线/交叠测试）、AGV全画布布局（单画布+按需抽屉+紧凑底栏，默认放大居中、网格/底环减弱、手机规则）、备件展示器过曝与白壳融合修正（未改410 GLB/目录/厂家色）。稳定SHA、验证（全网页553/553、新车437网格基线未变、旧车410网格0 Torus）、离线视图与遗留见`docs/AGV_SECOND_JOINT_20261103.md`“DSH 交付”节；清理候选独立复核结论见同文件（认可10项、保留`app-ui-20261027`，未删除）。本轮未改Codex独占文件、未构建/部署/打包；线上仍为Codex上一批，待Codex复核构建上线。

### 2026-11-03 19:2x DSH 手机布局修正（再次冻结）

按Codex 19:12像素复核（`agv-app390-before.png`：58vh舞台致页底约250px空白、3行底栏偏高）修正：手机画布改`calc(100dvh - 132px)`填满剩余视口、舞台`absolute inset:0`；底栏3行→2行（拆解滑杆+横向控制条），顶栏/抽屉/底栏统一44px触摸；手机抽屉为底部sheet（bottom 118px、35%/280px），打开时相机把整车适配到sheet上方并居中、不裁切。全网页**554/554**通过（新增390×844含抽屉打开的相机不裁剪断言）。已再次冻结，等待Codex手机版构建与截图对照。

### 2026-11-03 19:3x DSH 手机底栏再修正（再次冻结）

按Codex实机截图`agv-app390-final.jpg`（实际375×812）复核：画布已填满，但底栏靠横向滚动访问俯视/侧视/查看全车，默认看不到后按钮且点俯视后左侧拆开被裁。修正：手机底栏改 `一键拆开/暂停/一键复位/更多▾` 四按钮不横滚；新增向上弹出的“更多”紧凑菜单（视角俯视/侧视、查看全车、拆解速度，44px触摸、选后收起）；桌面保持原内联控制条；相机手机`padTop=104`、`padBottom=底栏+抽屉sheet`，开抽屉仍适配到sheet上方。全网页**554/554**通过（新增无横滚/菜单功能齐全/390×844抽屉开态断言）。文件已再次冻结，等待Codex构建手机版及底栏/菜单/抽屉开态截图复核。

### 2026-11-03 19:4x DSH 联合总检（只读审查表 + 截图复核，再次冻结）

只读`docs/AGV_RETIREMENT_DELIVERY_20261103.md`（Codex独占，未改），复核6张业务截图与AGV新图。AGV：`agv-app390-menu.jpg`确认“更多”菜单/无横滚生效；`agv-app390-drawer-final.jpg`为主动切俯视，只看到顶板≠被抽屉遮挡（已撤销该判断），补图`agv-app390-drawer-verified.jpg`确认30%sheet下整车完整在sheet上方；`agv-rear-low-verified.jpg`确认-X低后视的封闭内壁/踏边与红色扫描窗、内部块体未穿出。备件3P：`spare-3p-production-full.jpg`证明显台取景正常，前图只是页面中部视口裁切；生产5.glb为白壳/深色手柄简化盒状，细节重做列后续，不能拿合成蓝色三极模型当生产已验收。业务截图只做独立复核未改源码；raw-detail宽表横滑建议另批按天卡片。Android原生ucrtbase.dll崩溃未UI验收；“线上1125项/Android23”为Codex结果，DSH未独立复跑。10项回收已独立确认路径不在、app-ui保留。最终SHA：viewer `361f1975…`、CSS `5605e79e…`、workbench测试`d2427568…`、mobile测试`e05000c2…`；模型/材质/AgvVehicles不变；554/554，代码保持冻结，不再扩展改动。

## 2026-11-04 22:4x 用户明确重新联合 DSH：程序运行面板美化

项目 D:\wx_xiangm\xiangmu。Codex 正在独占：AbbRobotViewer.vue、AbbProgramControl.vue 的运行逻辑/模板、server/src/robot-sim.js 与 robot-cell-sim.js、abb-material-simulation.mjs、程序会话/运动及功能测试。DSH 本次只接手新文件 spare-parts-web-release/src/components/agv/AbbProgramControl.css 与 docs/ABB_PROGRAM_PANEL_DSH_20261104.md，不改上述文件，不构建部署、不操作业务数据。请从现有面板 DOM/CSS 阅读后在新 CSS 中提供紧凑有层次的美化，并在交接文档列出必要模板 class 改造建议；Codex 统一整合。要求：备份/例程、流程参数/估算料量、速度与演示倍速 1/5/10/20、运行/停止、状态/进度清晰分组，源码/信号折叠到高级详情。电脑或浏览器已有用户操作时不要抢占。
