# ABB 最终集成只读复核（DSH，2026-11-05 18:41）

## 范围与边界

本文件是只读终检记录，未改代码、ZIP、部署、浏览器、端口或现有测试。核验对象：

- `server/src/robot-deposit-state.js` `3BFF0B782F39FE47D8C89F7C0501DE86C1991087E34BF9FFF9BFCE987AED348E`
- `server/src/robot-deposit-grid.js` `FE051154720437A0E4998284A461944FA05DA67FF9D1978F38C56B2BBEC5413C`
- `server/src/robot-cell-sim.js` `E60AAD75CE1E30E8223B33CE54DF64571FD8240D79071CC297623F28A87476E1`
- `server/src/robot-sim.js` `33BA6BCE65879981FF739FDEF495F82D9BA34897A63B8C607AE34EBBA0694840`
- `spare-parts-web-release/src/utils/abb-material-surface.mjs` `6AF40E4770E7DAFFC5D8C2B3912B6A75D0BD83CE83029ECC828D6F250B11EE40`
- `spare-parts-web-release/src/utils/abb-material-simulation.mjs` `565AE3ABC60C2F6649E1D76AE21E1C585148717C0B038048093959C6B079F8C3`
- 证据：`.local/abb-flow-20261105/release-validated-left.log`、`release-validated-right.log`、`output/ABB_CONTINUOUS_VERIFY_20261105.json`

本次我**实际运行**的相关单测：后端 38 项、前端相关 11 项，合计 **49 通过 / 0 失败**。没有亲手重跑浏览器、完整 API/Web 全套、构建、上线；`output/ABB_CONTINUOUS_VERIFY_20261105.json` 中的 658/436/1847/部署状态只能作为 Codex 已生成证据读取，不能写成我的浏览器/部署验收。

## 结论表

| 项 | 结论 |
| --- | --- |
| 连续曲面/网格体积 | 通过现有单测；release 日志 renderedVolume 与 depositedVolume 误差约 1e-12，覆盖 484 格 |
| 源控制流 `nDisZOffs` | **仍有阻断级不一致**：受保护 `duqu_zaomian_gaodu` 替代仍未写 `nDisZOffs`，且 `zaomian` 写的是整锅 `cell.height` |
| 返接料按局部最高面抬升 | **代码与声明不符**：approach 使用全网格全局最大 + 250mm，不是局部最高面 |
| 逐轨迹点沉积/不重复 | 代码路径基本正确；`surfaceFollow` 在源目标上只改 z，仍只解一次 IK；现有测试覆盖 |
| 固定锅坐标/tcpBase | 固定锅坐标理由成立；当前单测覆盖倾斜锅架，但未直接覆盖源 `wobjjidian.oframe.rot` 的动态旋转 |
| 低于 1L 空斗/最后不足 1L | 单测通过；release 37 次接料收尾完成，余料与总量守恒 |
| 40mm/800 结果 | release 日志与 output 证据可读；40mm 高差是离线展示参数，不是古井 SOP，也不能当实机节拍 |

## 1. 真实源控制流与高度变量

### 1.1 `duqu_zaomian_gaodu` 仍是缺口

- 源调用：`BuJiu.mod:250 Set do178_duqu_zaomian_gaodu; :251 PanDuan_Liao; :252 duqu_zaomian_gaodu;`（`GoFeed_LUJING` 内），`ModMain.mod:186/204` 也调用。
- 源路径高度：`BuJiu.mod:423/433/436/...` 使用 `nDisZOffs+GaoDu_jia+ZPY_BU`；`nDisZOffs` 在 `BuJiu.mod:5` 初始化 500、`:24` 归零、`:65` 每层 `+nLayerThick`（`ModData.mod:58 nLayerThick=40`）。
- `yuanxin.mod:129-224` 保留的注释实现显示：读料面高度 → `gaiding=0` 减 85、`gaiding=1` 减 80 → clamp 0..800 → `nDisZOffs:=zaomiangaodu`。
- 当前 `robot-sim.js:1146-1148` 仍只写：
  - `zaomian_gaodu`、`zaomiangaodu` = `state.cell.height`
  - **没有 `nDisZOffs`**
  - **没有 85/80 偏置、没有 clamp、没有 gaiding 分支**
- `robot-cell-sim.js:111` 的 `cell.height` 是 `potHeight(depositedVolume)` 的整锅等效高度，不是某点/某圆周的局部料面。

**判断**：如果要求“真实源控制流”，这是**真实阻断项**。`surfaceFollow` 会在包含 `nDisZOffs` 的 MoveL 上重算 z（见下），所以 800 的料面视觉可能不暴露该缺口；但 `nDisZOffs` 仍被 `BuJiu.mod:45/121` 的 `gaiding/zhongtu/gai_ding_gao_du` 条件使用，旧值可能错误选择分层/盖顶分支。`zaomian` 写整锅高度也不是相机局部测量。不能因为 800 完成就判定该缺口已闭环。

**建议**（Codex 决定是否改离线执行器，不改源 ZIP）：
1. 在 `duqu` 代替事件边界模拟测量值：`measured=localSurfaceSample(...)`，不是 `cell.height`；按源注释做 85/80 偏置和 clamp，写 `nDisZOffs` 并记录 `substitution`/假设。
2. 若坚持不写 `nDisZOffs`，必须在 UI/交接明确这是离线 surfaceFollow 覆盖，不能宣称源 `nDisZOffs` 语义已完成；同时为 `BuJiu:45/121` 分支加单测/日志核对。
3. 区分三值：`zaomian_gaodu`（测量显示）、`nDisZOffs`（命令偏移）、`cell.height`（整锅体积展示）；不可互替。

### 1.2 源 `pBarrelCenter_bu` 与固定锅坐标

- `ModData.mod:134 pBarrelCenter_bu=[[0,0,140], quat...]`；源路径是 `Offs(RelTool(pBarrelCenter_bu,...), nXCircleR_bu,nYCircleR_bu,nDisZOffs+GaoDu_jia+ZPY_BU)`（`BuJiu.mod:423` 等）。
- `robot-sim.js:1083` 先按源 wobj 求 `tcpBase=wobjPose*target`；`robot-cell-sim.js:119` 再取固定 `wobjbarrel*` 做沉积局部化。Codex 顶部文档的理由成立：**固定锅库存坐标应逆固定锅 frame，不能用移动 `wobjjidian` 再次旋转**；否则实际轨迹会被二次旋转。`robot-deposit-state` 的两个锅/倾斜架测试也通过。
- 仍需注意覆盖缺口：现有 `robot-deposit-state.test.js` 的 frame 是构造的倾斜锅架，不是 `BuJiu` 实际每段 `wobjjidian.oframe.rot` 的动态序列；release 左右 800 能跑完，但没有直接把源 `oframe.rot` 注入单测。建议补一个“动态 wobjjidian 旋转下，固定锅 u/v 仍等于物理点”的回归，防止以后有人把固定 frame 改回移动 frame。
- `robot-sim.js:1096` 的 `event.pose` 仍是源目标，`tcpBase` 已被 surfaceFollow 改过；前端 `prepareProgramMotion` 用 `joints/to`，所以当前运动执行一致；但调试/记录若读 `event.pose` 会看到源 z 而非实际跟随 z，应在交接标注。

## 2. surfaceFollow 与返接料抬升

### 2.1 单次 IK 握手基本正确

`robot-sim.js:1083-1098` 顺序是：

1. `tcpBase = wobjPose * sourceTarget`
2. 仅当 raw target 含 `nDisZOffs` 或 `pBarrelAppr_*` 时调用 `followSurface`
3. 用调整后的 `tcpBase` 求 flange，`solveIk` 一次
4. 生成 motion event，再 `consumeCellMotion`

没有“沉积状态驱动下一段 IK、再反解”的循环。`followSurface`（`robot-deposit-state.js:37-44`）只改 z，保留源 local x/y；现有单测 + release 9028 段通过，说明没有明显的重复 IK/体积重复。这个方向正确。

### 2.2 `approach` 不是局部最高面，而是全局最高 +250mm

代码事实（`server/src/robot-deposit-state.js:41-43`）：

```js
let maximum=Number(cell.height)||0;
if(approach&&cell.depositGrid){ /* 遍历全部 cells */ maximum=Math.max(maximum, ...) }
const next=approach?Math.max(local[2],maximum+250):height+clearance;
```

- `maximum` 起点是整锅 `cell.height`；
- approach 分支遍历**全部网格**取最大，不使用 `local[0]/local[1]` 邻域；
- 所以“接料返回过渡按局部最高面抬升”在代码上**没有实现为局部**，而是全局最高/整锅高度 +250mm。它偏保守，不会压低，但会造成不必要的整体高抬、改变源 TCP 的 z 间距，且不能反映“局部最高”。
- 建议：为 approach 增加 `localMaxInRadius(u,v,radiusM)`，只取路径/斗口覆盖范围；保留源 x/y 和 clearance 常量；增加“远处高料面不应抬升本地路径”的回归。
- 该项是**行为/声明不一致**，在 800 日志中不会导致体积或完成失败，但会影响轨迹流畅性和间距保真。

### 2.3 垂直下降不沉积

`robot-cell-sim.js:117-122` 使用 local `a/b` 的 XY 距离 `Math.hypot(b[0]-a[0],b[1]-a[1])` 计算沉积；纯垂直下降水平距离为 0，不会新增体积。`robot-cell-sim.test.js` 首项 `vertical return descent cannot invent deposited volume` 覆盖了这一点。这是本轮正确处理，保留。

## 3. 体积不重复与连续料面

- 后端：`depositGrid` 的每格 `volume` 是唯一库存；`relaxSurface` 只做格间转移，`finalizeDepositGrid` 只在总量达到 target 后补容量，日志 `covered=484`、`renderedVolume=3.2414452116752215`、`deposited=3.241445211676953`，差约 1.7e-12，未发现重复加料。
- 前端：`abb-material-surface` 是共享顶点连续网格，`renderedVolume` 用封闭网格实际积分，单测断言与逻辑体积一致；`abb-material-simulation` 不再用单格 box。
- 需要注意的**显示状态**：`cell.height` 是整锅等效高度，不能作为局部曲面高度；当前前端/后端都另外从体积/底面积/锥度解析，方向正确。
- Codex 声称的“边高中间低 40mm”在 release 日志 `heightRange=[0.7801,0.81997]` 可见；它是离线展示参数，不是古井内部定量 SOP，也不能把 40mm 高差当作现场工艺标准或实机节拍。

## 4. 低于 1L 空斗与最后不足 1L

- `robot-cell-sim.js:9-13 cellBucketEmpty`：`bucketVolume<.001` 返回空，除非残留 `>1e-8` 且剩余目标 `<=.001`（最后小剂量继续）。
- 现有 `robot-cell-sim.test.js` 的 `less than one litre returns for a top-up...` 通过：
  - 0.0007m³ 空斗判空并保留 residual；
  - 接料后总量/料量守恒；
  - `.001` 不判空；
  - deposited 0.9995、bucket .0005 不判空，避免最后小剂量反复空斗。
- release 左右 800 均 37 次接料、complete、target 体积；没有出现反复空斗死循环。该项通过。
- 小瑕疵（非阻断）：`updateCell` 在 `needed<=0` 分支把 `bucketFraction=0`，但 `bucketVolume` 仍保留小残料；视觉会短暂隐藏残料。体积没丢，若前端需要严格显示残料，请让 `bucketFraction` 由 `bucketVolume/capacity` 计算而不是置 0。

## 5. 真实运行证据（读日志/JSON，非我重跑）

`release-validated-left.log` / `right.log`（Codex 产物）：

- 左/右均 `requests=23884, motions=9028, fillCount=37, complete=true, height=800, end=true`；
- `covered=484`；`renderedVolume=3.2414452116752215`，`deposited=3.241445211676953`；
- `heightRange=[0.7801067200163625,0.8199678311274741]`（约40mm边中差，离线展示）。

`output/ABB_CONTINUOUS_VERIFY_20261105.json` 记录 `webTests=658, apiTests=436, checks=1847, deployed-and-verified`，其 `apiHashes` 与本次冻结四文件哈希一致；这是我读取的产物记录，**不是我在浏览器/服务器上重新执行的验收**。`nativeRuntimeVerified=false` 也明确保留。

## 6. 真实阻断项与建议优先级

**阻断项 A（源控制流）**
- `robot-sim.js:1146-1148` 的 `duqu_zaomian_gaodu` 仍不写 `nDisZOffs`、不实现 85/80/clamp；`zaomian` 写整锅 `cell.height`。800 通过只能说明 surfaceFollow 掩盖了 z，不能说明 `BuJiu:45/121` 源分支正确。需要实现或明确标注“离线 override，不声称源语义完成”并补分支测试。

**阻断项 B（局部抬升）**
- `robot-deposit-state.js:41-43` 的 approach 全局最大 +250mm，与“局部最高面”不符；应改为路径/料口邻域局部最大，并用测试锁定“远处高料不抬升本地”。

**验证缺口（非代码失败）**
- 未直接单测源 `wobjjidian.oframe.rot` 动态序列；现有固定锅测试不足以覆盖该路径。建议增加“旋转 oframe 下固定锅 u/v 物理一致”回归。
- 未在本轮亲手重跑浏览器 40mm、部署/1054+5 哈希检查；只读 JSON/log，不能把 Codex 的部署结果写成我的验收。
- `event.pose` 是源 pose、`tcpBase` 才是 surfaceFollow 后目标；任何监控/缓存必须读后者，避免显示和实际不一致。

## 7. 最终意见

- **可以继续保留当前连续曲面、固定锅坐标、单次 IK 握手和体积守恒实现**；49 项相关单测和左右 800 日志支持这些结论。
- **在宣称“真实源控制流/局部最高面抬升完成”前，A、B 两项需要闭环**；如果不改，只能表述为“离线 surfaceFollow 覆盖，`nDisZOffs` 源语义未完全复现”。
- 40mm高差、37次接料、离线900+秒是离线模型证据，不是古井内部SOP/实机节拍。
- 本文件不改代码；以上内容供 Codex 冻结/发布决策。
