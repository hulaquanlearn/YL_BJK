# ABB 连续上甑与操作区联合整改 · 2026-11-05

## 连续料面续办
用户新增要求：消除方块料面、斗口跟随实际料面高度、边高中间低，并查古井上甑公开要求。Codex 接续 robot-deposit-grid/state、robot-cell-sim、robot-sim、abb-deposit-geometry/material-simulation 及新连续表面模块与测试。DSH 仅在新文档 ABB_SURFACE_REVIEW_DSH_20261105.md 独立只读复核，不并发写代码。未部署的旧构建不用于本次上线。

Codex 已接收 DSH 只读复核：采纳局部料面与体积等效高度分离、垂直下落不得计算铺料、形状必须保持体积守恒、不得冒充现场测量。未直接照抄历史注释中的 80/85mm 相机偏置，也不改原 ZIP/源码变量 nDisZOffs；在离线运动事件中显式标记 surfaceFollow，保留源 TCP 对源层高的间距，按选中锅局部料面/斗口覆盖范围抬升，再解实际目标 IK。固定锅坐标用于沉积是正确的：tcpBase 已含旋转 wobjjidian 的变换，再用其移动 frame 作沉积原点会将旋转重复消去，故该 DSH 建议不采用；完整 uframe/oframe 左右锅测试保留。数值稀疏体积可由已知底面积/锥度解析还原局部高，不需要每次传重复几何，连续网格与后端使用同一解析口径。边中高差 40mm 是离线展示参数，非古井内部 SOP。

### DSH 最终复核后的补充（本节取代上方“不写运行态nDisZOffs”的决定）
DSH 在 ABB_FINAL_REVIEW_DSH_20261105.md 独立跑49项测试并指出：只覆盖运动z不足以闭合BuJiu45/121的分层/盖顶条件。Codex采纳：受保护duqu替代现在从最后实际布料点（首次中心）的局部连续料面生成虚拟测量，按yuanxin历史注释85/80mm补偿、钳制0..800，更新运行态nDisZOffs与GI192反馈；原ZIP保持。测量/补偿/偏移分开记录为simulated，替代事件明确来源假设。新增真实IF表达式分支测试、固定锅中每5°旋转workobject物理轨迹回归。
DSH 所称B是描述不一致，不是压料风险：入锅approach有意采用全锅最高面+250mm的保守过渡，以覆盖跨锅口路径；不改成只看终点邻域而忽略路过高料。布料点才按斗口局部覆盖范围跟随。交付说明统一改为“全锅最高面”，不再宣称approach使用局部最高。A补丁须再次完整左右800mm回归后同步；DSH49项是其亲跑，Codex全套/界面/服务器记录独立列示。

用户在 Codex 明确要求与 DSH 一起商量、按各自所长处理。本文件是本轮范围登记，状态：**Codex 已开工，DSH 待确认接收**；不能把登记或发消息当作完成。

## 用户当前全部要求

1. 装填参数两个输入数值居中，累计入甑的数值与单位也居中。
2. 全流程应反复接料、铺料，达到预设高度才收尾，不能只跑一遍；解决空斗后长时间仍在铺料、没有及时回接料的表现。
3. 动作流畅，排查段间接口等待及插值导致的停顿；不能通过单纯降速代替完整循环。
4. 暂存斗缺料时链板补料，机器人接料到位、闸板/气缸、斗满转运、布料斗皮带/打散、空斗返回须协调，画面物料与逻辑一致。
5. 打开“程序运行”后：底部结构展开改为运行速度，倍率在其右侧；底部拆开/复位/正视/俯视区域改为全流程/所选例程/单步/停止/重新开始，保留360°查看及右侧旋转/全屏；中间程序状态和源文件行号仅程序模式显示。关闭程序面板恢复模型控制。
6. 模型右键按住拖动支持平移。
7. 示教器弹窗中左右两块支持交换主视角，让任一块占大屏，默认仍是现有左示教器、右大模型；切换不能重建或中断运行中的机器人/示教器会话。

## 分工提议与文件锁

- **Codex 已占用**：`AbbRobotViewer.vue`/CSS、`AbbProgramControl.vue`/CSS、`AbbPendantControl.vue`/相关布局、`FreeModelControls`（实际 `src/utils/free-model-controls.mjs`）、`src/utils/abb-program-session.mjs`、`src/utils/abb-program-motion.mjs`、必要新建控制区/轨迹工具及各自测试；`server/src/robot-library.js` 及缓存测试（减少 simulate 每次解压/编译备份）。Codex 负责交互、插值/预取、集成、生产构建、服务器同步。
- **请 DSH 接收**：`server/src/robot-cell-sim.js`、确需时 `server/src/robot-sim.js` 与对应服务端测试；`spare-parts-web-release/src/utils/abb-material-simulation.mjs` 及对应测试。负责补料/空斗返回的离线逻辑、暂存斗物料/链板/闸板协调；如需几何变化，先另登记具体文件，现阶段不改机器人/喂料机几何。**尚未接收前 Codex 也不写这些提议给 DSH 的文件**。
- 双方不同时写同一文件，不覆盖已有未提交改动。不自行部署/构建 dist，待稳定文件清单、SHA256、真实测试和边界交接后 Codex 统一构建与上线。
- DSH 请在下方先确认接收/调整范围；UI/插值可只读复核，通过文档或会话给 Codex 建议，不直接改 Codex 文件。

## 已有证据（Codex 实际执行，勿误称完整界面验收）

- 本地实际备份 `.local/review-20261018/robot-library/01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad/backup.zip`（酿酒机器人）。不要改原ZIP或复制入发布包。
- 离线追踪工具 `.local/abb-flow-20261105/run.cjs`，report 私有临时 `.local/abb-flow-20261105/report.json`；`node .local/abb-flow-20261105/run.cjs 800` 实跑约60秒，24115次解释器推进、9107运动段、38次接料，height=800，deposited=target=3.241445211677m³，complete=true，最终 main exit。结果 `.local/abb-flow-20261105/run-800-left.json`。**所以当前解释器并非完全不会循环，须定位页面中为何空斗后仍长时间转圈/卡顿，不可在未复现前伪造根因**。
- 用户截图：24/800mm、2.8%、斗内0.0L/接料1次，BuJiu.mod第433行；后续已到累计90L、ModMain.mod第257行。源 `GoFeedCnv2_PANDUAN` 在 BuJiu.mod318处检查空斗，`JS_jiuzao` 循环行433铺料，因此空斗可能继续很多无料运动才走到检查点。建议 DSH 判断离线自动模拟如何在空斗后及时转入已有安全返回/接料路径，保存断点、目标高度、体积守恒，不能篡改上传源码、捏造现场PLC已具备的逻辑。
- 动作当前对每个 IK 采样小段单独 smoothstep，且每条运动最少0.3秒、每采样至少16ms；源 z20连续路径也每段停。simulate 每次 `library.get` 重新读 ZIP/parseBackup，潜在每段多次 FK/IK HTTP。Codex 正处理插值和有界预取，预取不能提前提交状态/IO、不能在停止后写回或执行后续动作。
- `abb-material-simulation` 现有 buffer 是视觉局部值0.55，链板仅视觉补充，接料逻辑3秒后直接把斗装满；缺乏一致的暂存斗容积/转移协调，供DSH核对。
- 截至登记，Codex 本轮仅改 `AbbProgramControl.css` 两处居中，已完成上一版居中输入的构建/4项回归，但**本轮机器人修复与最新累计居中尚未构建/上线**。当前线上仍 11:33 消防/Android24批次，勿覆盖。
- 单个既有本地预览 `http://127.0.0.1:8534/portal`，PID17912（操作前复查），不新增端口。可网站与模拟器检查，不能代称原生真机已验收。

## 接收、讨论与交付

- 待 DSH 确认。Codex 于会话“联合codex干活了”已核对 `xiangmu` 项目；对方当时停在用户范围选择，已有用户未提交文字，Codex 不代填或提交偏好答复。

### DSH 确认接收（2026-11-05 13:2x）

已读本交接与 `.local/abb-flow-20261105` 证据。**确认接收**：仅写 `server/src/robot-cell-sim.js`、确需时 `server/src/robot-sim.js`、`spare-parts-web-release/src/utils/abb-material-simulation.mjs` 及各自测试、本交接记录；不写 `AbbRobotViewer.vue`/`AbbProgramControl.vue`/`AbbPendantControl.vue`/`FreeModelControls`/`abb-program-session.mjs`/`abb-program-motion.mjs`/`robot-library.js` 及 Codex 缓存测试，不构建部署、不改原 ZIP。先复现“离线自动模式空斗后继续行走”与页面状态差异，再以最小改动让自动模式在空斗后走既有安全接料路径、循环至目标，保证体积守恒/断点；具体根因与交付以本文件追加为准。未把本条确认当成交付完成。

### DSH 交付：空斗返回补料、空间铺料与物料一致性（2026-11-05 14:20，本地源码/测试，未构建部署）

#### 根因（有源码证据）

- 源程序 `BuJiu.mod:318` 只在 `JS_pd0` 调用 `GoFeedCnv2_PANDUAN`（该函数 219 行检查 `di20_boqi_wuliao`）；但 `pudi=1` 的 `JS()` 走 `BuJiu.mod:396-397 → JS_pd1`，`JS_pd1`（337–364）没有空斗检查，随后 `JS_jiuzao`（404–477，433 行为连续 MoveL）继续走完整路径。
- 原 `robot-cell-sim` 只把 `di20_boqi_wuliao` 置 1，没有让离线自动模式在空斗时走 `GoFeedCnv2`；页面于是看到“斗内 0L、24/800 mm、仍 BuJiu433 继续”。离线 `run.cjs` 虽然最终完成（38 次接料/9107 段/24115 次推进/complete=true），但空斗后会继续大量无料运动。
- 页面慢还叠加 Codex 正在处理的逐 IK 采样动画/每段等待；本 DSH 改动只解决**空斗后回接料与物料状态**，不把动画耗时归因于本修复。

#### 本轮代码改动（只在本轮登记文件）

1. `server/src/robot-cell-sim.js`
   - 增加可序列化暂存斗库存：`hopperVolume`、`hopperCapacityLitres`（默认 `1.5×capacityLitres`，离线参数，不是实测）、`chainRateLitresPerSecond`（默认 `capacityLitres` L/s）、`transferSeconds`（默认0.5s）、`chainActive`、`gateOpen`、`pendingBucketVolume`；初始暂存斗为空。
   - `updateCell` 用 `state.virtualTime` 的增量推进链板：接料请求（`do99`，源程序在 `MoveL pFeedWork` 之后才置位）时计算所需料量；暂存斗不足则链板补料，未达到所需料量绝不置 `di103`/满载；料够后转移入斗、`di103=1`、链板停；`do99` 撤销后 `转运`、闸板关。
   - 空斗铺料时标 `空斗返回`、`chainActive` 继续补暂存斗；`gateOpen` 只在接料期；完成时链板/闸板复位。总物料守恒口径 `suppliedVolume = hopperVolume + bucketVolume + depositedVolume`；补料只按实际链板流量累计，不凭空写满。
2. `server/src/robot-sim.js`
   - 新增 **离线自动模式专用** `requestCellAutoFeed(state,env,routine)`：当自动 cell 在 `JS*`/`SA_ZHONG*` 铺料中斗空时，向调用栈压入备份中**已存在的 `GoFeedCnv2` 例程**；该例程即 `guodu_SAFE → GoFeed_LUJING → 接料 → GUODU_moveL`，不是新造路径。
   - 用 `autoFeedInjected` + frame 标记防止递归/重复；事件 `{type:'cell',stage:'空斗自动返回接料',autoFeed:true}`；不修改 ZIP、不写程序源码。只对 automation cell 生效，普通仿真/现场控制器不走此分支。
3. `spare-parts-web-release/src/utils/abb-material-simulation.mjs`
   - **酒醅 palette 改为深褐色** `#4a2f1e/#5b3a25/#321f14/#6e4a30`；测试验证纹理 R>G>B 且整体为深色，不再是浅棕/浅黄。
   - 视觉直接读同一 cell：`buffer = hopperVolume/(hopperCapacityLitres/1000)`，`chainActive` 优先取 `cell.chainActive`，`feeding` 同时要求 `cell.receiving`、`cell.gateOpen`、机器人到位及闸板开度；不再使用私有0.55作为主库存。
   - 新增 `materialState()`：`{buffer,bucketFill,hopperLitres,hopperCapacityLitres,chainActive,feeding,pouring,emptyReturn,coveredCells,depositedVolume,cellDepositedVolume,streams}`；保留原有视觉边界，流量/目标为离线参数，不冒充现场计量。
4. 空间铺料（按实际轨迹）
   - `robot-cell-sim.js` 新增可序列化 `depositCells`（键 `"ix:iy"`，值 `{u,v,volume}`，`u/v` 为锅局部归一化坐标）、`depositGridSize=24`、`depositRadiusMm=1090`；`consumeCellMotion` 只在 `do22` 开启、非接料、MoveL 有 `tcpBase` 时记录，首段仅建立参考点不铺料；沿途按40mm采样分配体积，未经过的网格不产生酒醅。
   - 每个运动段的沉积量按原 `distance×0.30×layerThickness` 计算，受 `bucketVolume` 和剩余目标双重上限；`sum(depositCells.volume)=depositedVolume`（误差<1e-12）；暂停/停止/斗空时没有新运动，因而不会继续增长。
   - `abb-material-simulation.mjs` 对含 `depositCells` 的 cell 使用 **InstancedMesh 单元块**逐格渲染：开始时只显示已覆盖网格，不显示整锅圆柱底；轨迹扩展时新网格出现、旧网格厚度累加；无 `depositCells` 的旧测试/旧状态仍保留圆柱兼容路径。`inspect()` 返回 `{height,visible,cells,volume,spatial}`，`materialState()` 暴露覆盖网格数/体积供 Codex 截图核对。
   - 深褐 palette 同时用于这些空间单元；不再用“整锅高度”提前显示满锅。

#### 测试与离线实跑

- 组合测试：`node --test server/test/robot-cell-sim.test.js server/test/robot-sim.test.js spare-parts-web-release/test/abb-material-simulation.test.mjs` → **34 通过 / 0 失败**（新增：空斗标记/`GoFeedCnv2` 只注入一次/非 JS 路径不注入/无该例程不注入；暂存斗空→链板补→转移→斗满→退出；停止后序列化恢复；gate/chain 状态；深褐酒醅；视觉 hopper/chain 读同一 cell；空间首格局部、沿轨迹扩展、暂停不增长、局部网格体积=cell.depositedVolume）。
- 自动模式左甑 800（最终空间代码）：`.local/abb-flow-20261105/run-800-spatial.log` → `requests=20232, motions=7604, fillCount=38, height=800, deposited=3.241445211677006, target=3.241445211677006, depositCells=211, cellSum=3.241445211677179, hopper=0.135, bucket=0, complete=true, gateOpen=0, chainActive=0, final main exit 339`（约78s）；右甑 `run-800-spatial-right.log` 同样38次、211格、height800、complete=true、约80.7s。
- 暂存斗最终保留 135L 是最后一次链板补料的真实余料；总物料守恒 `supplied=hopper+bucket+deposited`（误差<1e-12），未把余料算入甑内高度，完成后链板/闸板停止。
- 初始局部覆盖/轨迹扩展：单测只构造一个/两个 `depositCells` 网格时，material 渲染 `cells=1/2`、`cellSum` 与 `cell.depositedVolume` 一致，整锅圆柱体不显示；`running:false` 重复 update 前后 `inspect()` 完全相同，证明停止/暂停不增长。
- 对照：改前 `.local/abb-flow-20261105/run-800-left.json` 为 24115 requests/9107 motions/38 fills/60s；自动回接料后运动段减少到 7604，第2次接料提前到 step651/244 motions（改前 step835/317）；耗时不是性能基准（run.cjs 含真实 IK/解释器开销），页面仍由 Codex 插值/预取优化。
- 单例程复核：`GoFeedCnv2` **在 automation cell 下可完整结束**（3 段运动、接料1次、`di103` 由真实转移满足）；去掉 automation 时在 `guodu_SAFE` 第257行因 BaseMod 受保护而 `unknown-routine` 阻塞，这是需要设备模拟的边界，不用强行全信号1。`GoHome` 无设备等待，1段运动结束。
- 主调用顺序只读：`ModMain.main:335→rWorkLoop:356`（`GoFeedCnv_Base:375→jiancha:376→GUODU_moveL:377→kaishi_saliao:378`）；`BuJiu.kaishi_saliao:173` 内 `JS:174→SetGO/PulseDO→guodu_SAFE:177→QS:178→MoveL pRobHome:180→WaitUntil GI320_335=3/WaitTime 0.5/WaitDI di102=0:184-204`。本次离线 800 实跑完成 38 次接料并 exit 339，未发现该链漏调用；以上等待由 cell/automation 模拟满足，不是靠全信号1。
- 原始 ZIP/备份未改、未复制入 public/测试；`run.cjs`、日志只在 `.local` 私有证据目录，不作为生产测试依赖。

#### 文件 SHA256

| 文件 | SHA256 |
| --- | --- |
| `server/src/robot-cell-sim.js` | `80D799782F66D48BEB171F4D191AAFD8C1ABE07DD503534AA927B941150DB3B2` |
| `server/src/robot-sim.js` | `1C635A9FF9EC23947590986C0BDBB803AF4968EEF46F3145B60DC1FCD3ECC4E9` |
| `spare-parts-web-release/src/utils/abb-material-simulation.mjs` | `95669FB2E872779F8AF62AE7AE059E4819A88ACF72207C54A19E5D7D34280AC2` |
| `server/test/robot-cell-sim.test.js` | `F55F06328DF3E5B783E91F508FDAC9C7A790042293B8B970604E6CDA8B27E3AE` |
| `spare-parts-web-release/test/abb-material-simulation.test.mjs` | `A84180856ED9756F1F4F9E500548C955AF4ABE8690DA47DFDCF29C7811ABFB3C` |

本文件 SHA 见交付回复（自引用会改变自身哈希）。

#### 边界与待 Codex 集成

- **这不是现场 PLC 已有逻辑**：`GoFeedCnv2` 注入仅用于离线 automation 仿真，明确标注 `autoFeed` 事件；真实控制器不执行该注入，不宣称现场联锁已验证。
- 未做页面/浏览器截图、未构建/部署、未改 Viewer/程序面板/示教器/会话/插值；Codex 集成后需复测 24→800 页面、手机面板、停止/继续和示教器同步。
- 后续若 Codex 改变 automation 入口/PROFILE 或 cell 字段，需同步检查 `requestCellAutoFeed` 的 `GoFeedCnv2` 匹配；若源程序没有该例程则安全跳过，不伪造。
- **Viewer 接口约定**：无需新增请求字段；`cell.depositCells`（`"ix:iy":{u,v,volume}`）、`depositGridSize`、`depositRadiusMm`、`hopperVolume`、`hopperCapacityLitres`、`chainActive`、`gateOpen` 随现有 simulate state 返回；`abb-material-simulation` 已自动消费这些字段，`materialState()`/`inspect()` 提供 coveredCells/volume/spatial 供截图或调试。若 Codex 希望空间网格在动画期间更细腻，可把已完成运动时长作为既有 `elapsed` 传入，但预取不得提前提交 IO/state；本 DSH 不要求新接口。
- 体积/料流仍是离线近似，不是现场计量；料斗/链板视觉参数未标定。

### DSH 追加复核：皮带/打散输出、双闸板、空间轨迹与异常路径（2026-11-05 14:38）

#### 用户反馈

用户看到：(1) 暂存斗气缸未开而布料斗已满料；(2) 布料斗从甑锅退出时轨迹异常，像要重新装锅。要求认真比对程序，而不是只看画面。

#### 源程序与信号证据（只读）

- EIO 定义：`do18_pidai_zhengzhuan`（EIO:148）、`do19_pidai_fanzhuan`（187）、`do20_dasan_zhengzhuan`（190）、`do21_dasan_fanzhuan`（193）、`do22_boji_zz_DK`（236）、`Go32_47_boqi_zhuansu`（229）、`Go48_63_dasan_zhuansu`（208）。
- 可读源码里 **DO22 是明确的组合铺料使能**（`BuJiu:425/430/451/456/475/490/494/526/530/560` 等 Set/Reset；`ModMain:248/257/272/285/297/302/484`）；`Go32/Go48` 由 `BuJiu:666-779`、`fenqu` 的速度表写入。
- **DO18/DO20/DO21 在可读源码中没有任何 Set/Reset 写入**；只有 `do19_pidai_fanzhuan` 在 `BuJiu:236`、`ModMain:489` 被 Reset。说明正/反转与打散输出由受保护 BaseMod/PLC 层展开，不能把“读不到写入”当成“输出为0”，也不能伪造现场已联锁。
- 本次只在 cell 仿真层增加 **derived** 输出：`do18=do22 && go32>0`、`do20=do22 && go48>0`；`do19/do21` 保持观察值/0；`cell.toolDrive={combined,beltSpeed,rotorSpeed,derived:true}`；停止/空斗/接料时 do22=0，故 do18/do20=0。该输出明确标记 derived，不是 BaseMod 实测。
- 双闸板区分：`do99_bopi_zhuangliao` 是**暂存斗下料/拨料装载**，源程序在 `PanDuan_Liao:232` Set、`:235` Reset；cell 输出 `feedGateOpen=do99`。`do16_dakai_huzhao` 是**布料斗挡料护罩/挡料板**，源程序在 `BuJiu:324` Set、`ModMain:487/InitAll` Reset；cell 输出 `clothGateClosed=!do16`。**可读 EIO/源码没有另一路“布料斗闸板”专用 DO**，因此不能虚构一个信号。
- 源程序只在 `InitAll`（每个完整循环开始/结束）Reset do16；在一个 `rWorkLoop` 内多次接料时没有逐次复位。若 do16 就是布料斗挡料板，接料阶段可能仍为打开状态；cell 新增 `gateWarning='接料时布料斗挡料板/护罩未关闭，可能漏料'` 作为可序列化反馈，供 Codex/现场程序修正，**本 DSH 不篡改源程序**。

#### 本轮修改

- `robot-cell-sim.js`
  - 派生 DO18/DO20 与 GO 速度；`toolDrive`、`clothGateClosed`、`feedGateOpen`、`gateWarning` 进入 state。
  - 空间 `depositCells` 保持上一轮：只记录实际经过轨迹、暂停/停止/空斗/接料不新增，累计体积与 `depositedVolume` 一致；深褐 palette 保留。
- `robot-sim.js`
  - **撤回上一版“空斗即从 JS_jiuzao 中途注入 GoFeedCnv2”**——这会造成用户看到的“从锅里退出但又要装锅”的异常轨迹。
  - 现在只在 **`JS_pd1` 安全阶段入口**调用已有 `GoFeedCnv2`；`JS_jiuzao` 中途永不注入（测试断言）。这样空斗仍会回接料，但退出/返回发生在程序循环边界，不打断当前布料路径。
- `abb-material-simulation.mjs`
  - 斗内料块只在 `atReceiving && gateAmount>.95 && cell.gateOpen` 时才允许从0增长；暂存斗闸板未开/机器人未到位时不再提前显示满斗，解决用户第(1)点观感。
  - 空间网格仍从 `cell.depositCells` 绘制，停止/暂停不增长；不再用整锅圆柱底冒充已铺底。

#### 测试与实跑

- 组合测试：**36 通过 / 0 失败**（新增 DO18/DO20、gate 区分、接料门控、空间网格、空斗补料、停止序列化等）。
- `run-800-final-safe.log`（左）：`requests=24081, motions=9103, fillCount=37, height=800, deposited=3.2414452116770054, depositCells=147, complete=true, exit339`，约93s。
- `run-800-safe-right-final.log`（右）：`24081/9103/37, height800, deposited=target, depositCells=140, complete=true, exit339`，约69s。
- 轨迹异常复核：800 跑中已无“JS_jiuzao 中途压入 GoFeedCnv2”事件；空斗回接料只发生在 JS_pd1 边界。测试 `requestCellAutoFeed(...,{name:'JS_jiuzao'})===false`。
- 空间局部覆盖：单元测试只给一个/两个 deposit cell 时 material `cells=1/2`，整锅圆柱隐藏；暂停前后 `inspect()` 完全一致。
- 主调用链见上一节；单例程 `GoFeedCnv2` automation 结束，`GoHome` 结束，去掉 automation 的 GoFeedCnv2 在 guodu_SAFE 阻塞（设备模拟边界）。

#### 最终文件 SHA256

| 文件 | SHA256 |
| --- | --- |
| `server/src/robot-cell-sim.js` | `E0F348A86D8677B0DF8D28B38B3DB7CF5B6A86A72E043949BDC5376459B993F8` |
| `server/src/robot-sim.js` | `9AC8EBE87A2756972582976287B9A276F6ED7DCD0E9AFC844EAB0B2E2B61DE39` |
| `spare-parts-web-release/src/utils/abb-material-simulation.mjs` | `5D37BA70C6A95B8EC9178387A0560B1AB2B1F6236FFAB95B5E3716F6CD64F09D` |
| `server/test/robot-cell-sim.test.js` | `BDC17D19A5C30E7BAB32D1FACE2BEC582A8A85C44B42769FB363B70DA4560566` |
| `spare-parts-web-release/test/abb-material-simulation.test.mjs` | `FBA26D9F7413144646E8772E7506BEB15DDB353338F1853CD87B2AA40F3E7AE1` |

本文件 SHA 见交付回复（自引用会改变自身哈希）。

#### 边界与 Codex 集成

- DO18/19/20/21 的 derived 输出是基于 DO22+GO 的离线显示推断，不是 BaseMod 实际输出；真机方向/极性需 Codex/现场核对。
- `do16` 是否就是布料斗挡料板仍需确认；若确认，源程序未逐次复位是待改点，cell 已给出 warning，不能由 DSH 私自改源程序。
- `GoFeedCnv2` 只在 `JS_pd1` 边界注入，仍是离线策略，不宣称现场 PLC 原有调度；实际轨迹需 Codex 浏览器复核。
- 未改 Viewer/程序面板/示教器/会话/插值；未构建部署；原 ZIP 未改。

### DSH 新增独占文件：空间沉积网格（2026-11-05 15:02）

**范围确认**：本轮只新增/独占 `server/src/robot-deposit-grid.js` 与 `server/test/robot-deposit-grid.test.js`；未再改 `robot-cell-sim.js`、`robot-sim.js`、`abb-material-simulation.mjs` 或 Viewer。Codex 可继续接执行器并替换旧 `depositCells`。

#### 协议

`createDepositGrid({targetHeight=800,targetVolume=null,lowerRadius=1.09,upperRadius=1.2,potHeight=.97,gridSize=24,pourWidthM=.30})`

- `targetHeight` 单位 mm；`targetVolume` 缺省按 `potVolumeAtHeight(targetHeightM)` 计算；网格中心在锅底半径内，`u/v∈[-1,1]`。
- 每格字段：
  - `u,v`：锅局部归一化中心；
  - `volume`：m³；
  - `baseHeight`：0（当前为底部单层柱）；
  - `height`：柱顶，≤`targetHeightM`；
  - `area`：有效水平面积，满足 `area*height===volume`；
  - `capacity`：`area*targetHeightM`，用于不能裁剪的摊铺。
- `depositSegment(grid,{fromU,fromV,toU,toV,volume,widthM=.30})`：按 0.30m 出料宽度沿轨迹采样分配；初始网格空，只有经过/相邻范围出现料；单格超过 target 高度时向相邻格溢出，不裁体积；超过锅总容量记入 `overflowVolume`，不静默丢。
- `finalizeDepositGrid(grid)`：达到 `targetVolume` 后把未覆盖格补到其 `capacity`，使完成态铺满目标锅；补的只是总容量，不增加总物料。
- `depositCells(grid)`：返回排序后的 `{key,u,v,volume,baseHeight,height,area,capacity}`；`depositStats(grid)`：`{targetHeight,targetVolume,depositedVolume,visibleVolume,coveredCells,gridCells,completed,overflowVolume}`。

**建议 Codex 在 `consumeCellMotion` 接入：**

```js
const {createDepositGrid,depositSegment}=require('./robot-deposit-grid')
if(!c.depositGrid)c.depositGrid=createDepositGrid({
  targetHeight:c.targetHeight,targetVolume:c.targetVolume,
  lowerRadius:1.09,upperRadius:1.2,potHeight:.97,gridSize:24,pourWidthM:.30
})
// 由 wobj 局部点计算 u/v
const fromU=(prev[0]-origin[0])/1090,fromV=(prev[1]-origin[1])/1090
const toU=(point[0]-origin[0])/1090,toV=(point[1]-origin[1])/1090
depositSegment(c.depositGrid,{fromU,fromV,toU,toV,volume:deposited,widthM:.30})
// 完成后 c.depositGrid.completed=true；需要序列化时直接存 c.depositGrid.cells
```

`depositGrid` 是纯 JSON（无 Three.js/无 ZIP），可随现有 state 返回；Viewer 只需读 `depositCells()` 或 `grid.cells`。不需要新增请求字段，也不要把 `depositGrid` 当作提前提交 IO。

#### 测试与真实 800 验证

- `node --test server/test/robot-deposit-grid.test.js` → **5 通过 / 0 失败**：初始全空、局部轨迹、0.30m 宽度扩展、重复加入不裁剪且不超目标高、完成铺满（448/448 格）、边界/NaN 输入。
- 真实离线 800 验证（`.local/abb-flow-20261105/verify-deposit-grid.cjs`，用当前 `run.cjs` 的真实 24081 requests/9103 motions 轨迹，收集每次 `depositedVolume` 增量并按 tcpBase 局部点喂新网格）：
  - `targetVolume=3.241445211677006`，`depositedVolume=3.241445211677006`；
  - 网格 `visibleVolume=3.2414452116770165`，`coveredCells=448/448`，`heightRange=[0.8,0.8]`，`completed=true`，`overflowVolume≈1.3e-14`；
  - 即网格几何体积和 = 目标/实际沉积体积，完成态上满 800mm 目标锅，不是147格高柱。
- 该验证是后端轨迹/体积验证，不是浏览器截图；Codex 接入渲染后仍需实际目视。

**新文件 SHA256**

| 文件 | SHA256 |
| --- | --- |
| `server/src/robot-deposit-grid.js` | `6EE1721BB94DEB5290AD6E7540282CD70DC409B17CA474D8ED275A830C7E3C10` |
| `server/test/robot-deposit-grid.test.js` | `9D5C6536047DF046A9D4D2B4CE08D3854A04AEAABEE2D7921E7AF9616F485E4D` |

本文件 SHA 见回复（自引用会改变自身哈希）。

#### 只读复核 Codex 执行器联动

- **初始参考姿态使用源 `pRobHome`**：`ModData.mod:139 pRobHome=[1874.63,8.24,686.31]` 是程序自身 home，比手工姿态可复核；但 `pRobHome` 不等于喂料机/暂存斗无碰撞姿态，需 Codex 用实际几何/轨迹检查起终点、工具法兰和暂存斗包围盒；不能用“源里有 pRobHome”直接当安全证明。
- **双闸板**：建议执行器分开使用 `do99_bopi_zhuangliao`（暂存斗拨料/下料）与 `do16_dakai_huzhao`（布料斗挡料护罩）。源程序只在 `InitAll`/`ModMain:487` 复位 do16，逐次接料没有关；若现场确认 do16 是布料斗挡料板，需 Codex/现场改程序或明确安全策略，不能在离线执行器里伪造关闭。
- **GO32/GO48 独立速度**：两者是独立的皮带/打散转速设定，不应被一个统一倍速覆盖；源程序中大量 `SetGO` 组合（`BuJiu:666-779`），建议保留独立 `beltSpeed/rotorSpeed` 字段，不要让 DO18/20 的派生值反向覆盖速度值。BaseMod 对 DO18/20/21 的展开仍不可读，需 Codex 现场/保护模块确认极性。
- **空间网格接入**：请在 cell 中先写 `depositGrid` 再更新 material；不要把旧 `depositCells` 与新网格混用；完成时用 `finalizeDepositGrid`，暂停/停止不调用 `depositSegment`，避免料块增长。

### Codex 追加界面范围
新增登记 RobotProgram.vue（模型预演进入程序面板而非示教器）、AbbRobotGuide.vue（主视角按钮到标题旁）、abb-tool-mechanics.mjs（浅黄皮带材质）；不碰 DSH 文件。累计值行与输入行等高垂直居中、隐藏日志、去例程任务前缀、显示执行源码、重新开始同时回起始位、回归接料位移至设备动作第一项均纳入本轮。


### 用户追加打底轨迹要求（待 DSH 接收）
用户指出打底一开始就显示满底不合理，要求按机器人布料斗轨迹动态铺料。请 DSH 在其 material-simulation 范围补空间分布：不能把第一笔体积画成整锅均匀圆盘；应跟随实际 toolPoint 运动轨迹逐块/条带累积覆盖和厚度，最终覆盖、体积与 cell.depositedVolume 一致。铺料关闭、斗空、暂停均不增长；不能预先铺满。与暂存斗单一库存状态和深褐色材质第二轮一起交付。如需 Viewer 传入运动段前后 cell/轨迹进度，先在交接约定由 Codex 改 Viewer，不交叉写。


### Codex 继续集成（用户新增界面与联动反馈）
- 面板显示与程序模式独立，收起保持运行，退出按钮移至绿色程序分析旁。删除重复备份/例程标题，字段加粗，诊断折叠区两列；移除重复工位状态。
- 新增文件登记 `src/components/fire/FireOverview.vue`：固定短列宽，将剩余空间给位置列，记录列固定右侧，避免点检人/时间等短字段占掉位置空间。
- Viewer 工具护罩现在在运动前 tool-signals 更新时响应 do16，避免等待运动完成才开闭；修正工具动画速度/倍率被乘两次。暂存斗闸板读取 cell.gateOpen，与布料斗护罩独立。
- 用户新增 DSH 范围：核查 DO18/19、DO20/21、DO22 与转速输出、布料斗接料时挡料板关闭、铺料时打开，并给出阶段/信号验证。Codex 不覆盖 DSH 文件。

### Codex 接收 DSH 最终交付并继续集成
已核对 14:38 节最终五个文件 SHA；DSH 稳定交付由 Codex 接续验证。新增登记 `abb-workcell-layout.mjs` 及对应测试：默认展示参考姿态的布料斗与暂存斗出料机构 AABB 重叠，源 pRobHome+tGripOutlet_pXX 求解姿态无重叠；自动工位启动先就位该源起始点再显设备，重新开始回该点，未改料机坐标和备份。另登记 `abb-tool-drive.mjs`，皮带与打散分别读取 GO32/GO48，修正使用同一速度的视觉联动。

### Codex 接续文件范围（DSH 已交付）
五文件最终哈希核对通过并留独立冻结副本后，Codex 接续 `robot-cell-sim.js`/测试与 material-simulation/测试集成。DSH 的 gateWarning 只报告源 do16 未逐次关闭，尚未执行用户要求；补离线执行器状态，与请求信号分开标记，不改 ZIP。接料时布料斗关闭、皮带/打散停；铺料时打开，分别读取 GO32/GO48；短管闸板动画在逻辑转移前到位。后续需 DSH 只读复核，不再交叉写。

### Codex 最终联动与坐标修正
DSH 新网格两文件冻结已核对，Codex 接续集成；新增 `robot-deposit-state.js` 做稀疏序列化，避免每次往返传完整空格网格。圆盘边界改矩形与圆的解析交面积，前端按锥锅径向扩张并裁切边缘，不用重叠/截断盒子凑体积。
用户发现铺料镜像：原先把ABB局部Y直接当场景Z，已改先分别逆变换左/右甑完整uframe/oframe，再使用X/Z/-Y转换，含两侧和旋转工件坐标单测。
用户要求低于1L近似空斗，阈值<0.001m³；残余保留，接料仅补足斗容，最后不足1L的目标余量仍能排完，避免目标末端死循环。皮带/打散与护罩/颗粒同步该口径。

### 19:04 新增红外相机范围登记
用户补现场照片，要求相机与左右甑/程序联动。Codex负责 server/src/robot-infrared-sim.js、robot-cell-sim.js、robot-sim.js、前端 abb-infrared-camera.mjs、abb-robot.mjs、abb-program-motion.mjs、AbbRobotViewer.vue、AbbProgramControl.vue及相关测试；DSH只读核对HYbaojing/fenqu/ModMain/EIO，仅写 ABB_INFRARED_REVIEW_DSH_20261105.md，未授权交叉修改。
DSH复核已收到；采纳DI105必须独立于红外、GO320的0/1/2/3、每请求一次锁存结果、角度300–360及41/888分支、无虚构温度。红外结果为明确标注的局部欠铺几何代理。照片无量尺，支架/移动方式为展示近似，不声称现场测绘。受保护guodu增加HY专用参数和整段腕轴余量预检，必须复跑实际调用链后再上线。

### 红外复核差异与实体液压锅盖补充
实际ModMain:188在等待相机1/2到位后将GO320清0，随即铺料/红外采集，因此0按释放命令处理，GI保留已到物理位置；不能按DSH建议0立即回显GI0，否则完整程序在红外等待中停滞。新增该源顺序回归；3仍显式退避，0保留3。DSH原文保留，以上为Codex基于实际全流程的修正。
用户说明实体锅盖由液压油缸驱动。新增abb-hydraulic-lid.mjs及机构端点测试，接入abb-workcell-layout/Viewer：油缸两铰点随锅盖转动、活塞杆伸缩，上甑开盖，完整收尾/相机退避且机器人离开扫掠包围盒后才合盖。EIO没有明确命名实体锅盖油缸阀/开闭到位信号；Do105/Di105保留为源盖顶阶段握手，不映射实体锅盖，机械动作是单独标记的离线配合。

### 用户位置与实体连接纠正
Codex接续修正 abb-hydraulic-lid.mjs、abb-workcell-layout.mjs、AbbRobotViewer.vue 及hydraulic-lid测试。两甑开盖侧统一为各自锅局部-Z，不再右甑翻转180度；补齐焊接支臂、锅体固定座、双耳座、缸筒/活塞杆眼与贯穿销，检查实体相交与每段开合端点，不再仅验证浮空坐标重合。扫掠范围改从实际移动锅盖采样，取消左右硬编码。

最终安装方向纠正：两锅连线为Z轴，原先统一负Z仍使右盖侵入两锅之间。最终两盖整体机构统一转到锅局部+X外侧，避开中间机器人。扫掠三角面在盖机构局部坐标缓存，机器人障碍物先变换至对应机构坐标；两锅程序原位/接料位的完整640斗均通过避让回归。此前负Z描述是中间方案，以本段和最终交付文档为准。

### 用户现场连接图与最终方向更正
用户明确两盖方向应为现有正对面，改为锅局部-X同向；现场图显示锅盖背面中心轴座、长摆臂及液压缸连接，Codex重做abb-hydraulic-lid与测试。相机待机镜头必须回两锅中间，上甑到在用锅中心；修改相机伸缩回转模型及robot-infrared-sim到位时序。此前+X/侧向待机为已被用户纠正的中间版本，不作为最终验收。文件写入范围不与DSH交叉。

### DSH本轮独占范围
用户要求去掉示教器模型加减按钮，鼠标滚轮缩放及拖动操作按机器人模型一致。DSH仅可修改FlexPendantModel.vue、对应pendant组件测试；如需公用abb-pendant-controls/enable请先回复登记。另只读复核锅盖现场图和Codex当前机构，写docs/ABB_LID_PHOTO_REVIEW_DSH_20261105.md，不改锅盖/布局/相机/Viewer/API。Codex负责这些模型及集成/部署。

DSH追加独占：abb-service-panel.mjs及对应测试，按用户codex-clipboard-9d71d2ee-6563-4d49-8f8c-782a2b9e6b20.png定位SMB电池仓和抱闸按钮，按钮必须贴本体护罩，避免浮空；只改这些，不改Viewer/abb-robot/layout。Codex另移除AbbProgramControl程序工具栏前进一步按钮，保留实体示教器源单步操作。

### 2026-11-06 技术资料重做与部件接续
DSH的service-panel最终三文件SHA已核对，冻结交付，Codex接续修正盖板与按钮几何、Viewer编号。用户最新图明确电池盖在按钮左侧；此前bounds仍旧必须重新验证。DSH新独占AbbRobotGuide.vue、AbbDocumentReader.vue及专用阅读组件/测试（可新增AbbPdfReader），不改共用PdfReader/Viewer/service-panel/API。重做资料展示：文档标题替代顶层ABB技术资料，目录/章节/工具统一，PDF连续多页阅读、宽屏合理利用空间、按需渲染，不同时绘制834页；保留页码定位/缩放/目录返回/新窗口和CHM章节。Codex负责集成与部署。

### 2026-11-06 最终集成与用户侧视纠正
DSH资料界面四文件交付SHA已逐一核对：Guide 85A1C515…，DocumentReader 8605C4AF…，PdfReader 9E7C04EB…，test 82A0B32E…。Codex冻结后接手修正导入路径（原正则测试也误匹配错误路径）、页面比例、工具栏/章节链接、跳页与渲染生命周期；浏览器实际834页、双页/连续/缩放/CHM通过。DSH没有做浏览器验收。
最新用户侧视发现按钮仍在护罩前沿，Codex独立接续原CAD射线采样本体安装面，避免误用guard.min/max；最终无新增安装板，6圆形按钮贴原axis1_2凹面。8项几何回归、侧窗可见射线和正/侧浏览器检查通过并上线。最终记录见ABB_MODEL_CORRECTIONS_20261106.md，先前护罩前缘安装描述已作废。
