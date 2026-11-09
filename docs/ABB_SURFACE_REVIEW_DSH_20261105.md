# ABB 上甑料面复核（DSH 独立，2026-11-05）

范围：只读复核最新 `server/src/robot-sim.js`、`robot-cell-sim.js`、`robot-deposit-grid.js`、`robot-deposit-state.js` 及 `.local/abb-flow-20261105/report.json`。本文件只记录结论和建议；未改现有代码、Viewer、ZIP，未构建/部署/打开浏览器。Codex 对现有代码的接入和前端连续料面负责。

外部背景仅作定性参考：[人民网 2023-11-07 古井贡酒报道](https://finance.people.com.cn/n1/2023/1107/c1004-40112905.html) 提到“六字法+高端低倒”，但没有公开古井内部定量 SOP；本复核不把其他酒厂参数当古井标准，也不把报道当程序依据。

## 结论摘要

1. **确实存在高度失配风险，且不是“补写 nDisZOffs”一行就完**：`robot-sim.js:1138-1140` 的受保护 `duqu_zaomian_gaodu` 替代只写 `zaomian_gaodu/zaomiangaodu = cell.height`，没有写 `nDisZOffs`；而 `cell.height` 是 `potHeight(depositedVolume)` 的**整锅等效高度**（`robot-cell-sim.js:111`），不是逐点/局部料面。源路径的高度基准是 `nDisZOffs + GaoDu_jia + ZPY_BU`（`BuJiu.mod:423/433/...`）。
2. **返接料后下降撞料，当前代码只在“接料/空斗/do22 关”时清 previous，缺少基于局部料面的 clearance 判定**；并且 `depositPoint` 用 `wobjbarrel*` 的局部变换（`robot-deposit-state.js:3-11`），没有使用源程序实际切换的 `wobjjidian.oframe.rot`。应保留源 TCP 点，不在沉积网格上重新做 IK。
3. **源程序没有“边高中间低”的定量层参数**：源分层是 `nDisZOffs += nLayerThick`、`nLayerThick=40`（`BuJiu.mod:65`、`ModData.mod:58`），路径半径/角度由 `nXCircleR_bu/nYCircleR_bu/jiaodu_bu` 控制，z 只有单一 `nDisZOffs`。边高中间低只能先做**可配置的离线料面/显示目标**，不能冒充源程序已实现；若将来要控制机器人路径，必须用局部最高料面加安全余量单独验证。

## 1. `duqu_zaomian_gaodu` 未回写 nDisZOffs

### 源证据

- 调用点：`BuJiu.mod:250 Set do178_duqu_zaomian_gaodu; :251 PanDuan_Liao; :252 duqu_zaomian_gaodu;`（在 `GoFeed_LUJING` 接料路径中）。`ModMain.mod:186/204` 也有调用。
- 被保护例程的最接近源码证据在 `yuanxin.mod:129-224`（注释保留的历史实现）：
  - `:144 gaodu1:=GI192_207_zaomian_gaodu1;` 读相机/料面高度；
  - `:206 zaomiangaodu:=gaodu1; :207 zaomiangaodu_guding:=gaodu1;`
  - `:210-213` 若 `zaomiangaodu>50 and gaiding=0` 则 `zaomiangaodu:=zaomiangaodu-85`；`gaiding=1` 则减 `80`；
  - `:215-224` clamp 到 `0..800`，然后 `nDisZOffs:=zaomiangaodu;`。
- 路径：`BuJiu.mod:423/433/436/449/459/462/488/498/...` 都是
  `MoveL Offs(RelTool(pBarrelCenter_bu,...,nDisZOffs+GaoDu_jia+ZPY_BU))`。
- 分层：`BuJiu.mod:5 nDisZOffs:=500; :24 nDisZOffs:=0; :65 nDisZOffs:=nDisZOffs+nLayerThick;`；`ModData.mod:58 nLayerThick:=40`。
- 当前模拟：`robot-sim.js:1138-1140` 只写 `zaomian_gaodu`、`zaomiangaodu`；没有 `nDisZOffs`、没有 85/80 偏置、没有 clamp，也没有区分 `gaiding`。`robot-cell-sim.js:111` 的 `cell.height` 是整锅体积等效高度，不是局部读数。

### 判断

- **会高度失配**。接料后 `duqu` 本应用测量值更新 `nDisZOffs`，当前路径仍沿用旧 `nDisZOffs`（或初始层值）。表现为：料面高但路径按旧高度走，可能压料/撞料；料面低但路径偏高，出现空铺/外观不平。`cell.height` 又抹平了局部起伏，直接把它写进 `nDisZOffs` 会把“整体高度”当“局部测量”。
- 不能只补 `state.globals.nDisZOffs=state.cell.height` 就算修好：语义、偏置、clamp、局部采样都不对，会把“仿真体积高度”冒充“相机测量”。

### 可执行建议

1. 在 `executeCellExternal` 的 `duqu_zaomian_gaodu` 分支（Codex 接入）增加 `nDisZOffs` 的**受保护替代**，并且只在这次调用边界更新，不要每段运动更新：
   ```js
   const measured = localSurfaceSample(state.cell, nextPathPoint); // mm，非 cell.height
   const gaiding = Number(state.globals.gaiding) === 1;
   const cameraOffset = gaiding ? 80 : 85; // 来自 yuanxin 注释实现，作为待现场确认的假设
   let nDisZOffs = measured - cameraOffset;
   nDisZOffs = Math.max(0, Math.min(800, nDisZOffs));
   state.globals.zaomian_gaodu = measured;
   state.globals.zaomiangaodu = measured;
   state.globals.nDisZOffs = nDisZOffs;
   ```
   同时保留 `substitution` 事件和“85/80 为注释实现、受保护 BaseMod 未公开”标记。
2. `localSurfaceSample` 取**下一次布料路径附近/该圆周范围的局部最高/代表值**，不要用整锅 `cell.height`。如果暂时没有局部料面，宁可保留旧 `nDisZOffs` 并告警，也不要把 bulk height 写入。
3. 添加回归：给定料面中心 800/边缘 810、`gaiding=0`，断言 `nDisZOffs≈725`（800-85）且被 clamp；`gaiding=1` 断言 720（800-80）；路径仍用 `nDisZOffs+GaoDu_jia+ZPY_BU`，不另造 z。
4. 明确区分：`zaomian_gaodu`/`zaomiangaodu` = 测量显示；`nDisZOffs` = 提供给路径的**命令偏移**；`cell.height` = 体积等效展示值，三者不能互换。

## 2. 逐点局部料面 + 保留 pBarrelCenter_bu TCP 间距

### 当前实现的事实

- `pBarrelCenter_bu` 是源 robtarget（`ModData.mod:134: [[0,0,140], quat ...]`），路径用 `Offs(RelTool(...), nXCircleR_bu,nYCircleR_bu,nDisZOffs+GaoDu_jia+ZPY_BU)`。`robot-cell-sim.js:117-122` 的 `previousDepositPoint` 是**上一条实际 `event.tcpBase.pos`**；`appendDeposit`（`robot-deposit-state.js:18-28`）也接收实际 previous/current，**没有重新做 IK**，这一点是正确的，应保留。
- `robot-sim.js:1082-1089` 先按源 target 求 IK，再把 `event.tcpBase` 交给 `consumeCellMotion`；沉积是**执行后记录**，不是用沉积高度反推下一段机器人目标。这是避免重复 IK 的正确方向。
- 但：
  - `depositPoint`（`robot-deposit-state.js:3-11`）只对传入的 `wobjbarrel*` 做 `uframe/oframe` 逆变换；源程序在 `BuJiu.mod:327/358/...` 修改的是 `wobjjidian.oframe.rot`，并非始终用 `wobjbarrel*` 的原始 oframe。当前 local u/v 可能与实际路径旋转不一致。
  - `compact`（`robot-deposit-state.js:13-16`）把每格压成 `volume`，丢掉 `height/area/baseHeight`；下一次 `appendDeposit` 用 `createDepositGrid` 重建，局部料面和有效面积无法原样保留。前端/局部采样若读 compact 后的 grid，只能得到体积，不是真实料面协议。
  - `cell.height`（`robot-cell-sim.js:111`）是整锅等效高度，不是“逐轨迹点局部料面”。

### 返接料后下降撞料的关键机制

- 当前 `consumeCellMotion:117` 在 `do22` 关、接料中、空斗时清 `previousDepositPoint`；但**没有把新局部料面与源路径 z 做 clearance 比较**。接料后 `nDisZOffs` 若不更新，源路径会按旧层高下降；如果实际料面变高，机器人/布料斗会压料。
- 建议的确定性顺序（不改变源 TCP 间距）：
  1. **先执行源路径点**（保留 `pBarrelCenter_bu`、`RelTool/Offs`、源 `nDisZOffs/GaoDu_jia/ZPY_BU`），得到 `event.tcpBase`；
  2. 用该实际 TCP 点投影到局部锅坐标，更新局部料面；不要用局部料面重新生成一个 TCP 点再解 IK；
  3. 在接料返回后的**第一个布料点**，比较 `sourceLocalZ - localMaxSurface`。若小于 clearance，则只允许**单次整体抬升**（相同 tool/姿态）并重新解一次 IK，记录 `clearance-raised` 事件；不允许逐点用局部面反复改 IK。
  4. 任何 `do22` 关闭/接料/空斗/换层边界立即把 `previousDepositPoint=null`；首个铺料点只作为新参考，不把“返程高 z → 新层低 z”的垂直下降段计入沉积体积（避免重复计算/体积虚增）。
  5. 若源路径自身已低于 `localMax + clearance`，按源程序报警/停止处理，不静默修改源路径；离线只标红，不伪造安全。

### 可执行建议

- `appendDeposit(cell, previous, current, volume, frame)` 的 `frame` 应使用**当前运动实际生效的 work object**（含 `wobjjidian.oframe`），不要固定取 `wobjbarrel*`；或让 `robot-sim` 在 motion event 中带上有效 frame id/pose，由 `depositPoint` 使用。
- 保持 `pBarrelCenter_bu` 原始 TCP 间距：沉积宽度 0.30m 只影响**记录的铺料宽度**，不得重采样/缩放源 `MoveL` 目标；`previous/current` 必须是实际 `tcpBase`。
- 局部料面接口建议（Codex 接入现有 grid）：
  ```js
  localSurfaceAt(u,v)      // 该点料面 mm，由网格高度插值，不取整锅 height
  localMaxInRadius(u,v,r)  // 后续布料范围/圆周的局部最高 mm
  ```
  用它做 clearance 和前端连续曲面，不用它生成新的机器人目标。
- `compact` 若要给前端持续料面，至少保留每格 `u/v/volume/height/area/baseHeight`，或提供单独的 `surfaceHeights` 数组；只留 volume 会让前端无法判断局部高度，也是“方块尖塔/高度不一致”的来源之一。

## 3. 六字法、边高中间低与源分层

### 源程序事实

- 源分层只有单一 `nDisZOffs`，每层 `+nLayerThick=40mm`（`BuJiu.mod:65`、`ModData.mod:58`）；路径水平位置由 `nXCircleR_bu/nYCircleR_bu`、`jiaodu_bu` 控制；z 是 `nDisZOffs+GaoDu_jia+ZPY_BU`，没有中心/边缘的独立高度目标。
- `duqu_zaomian_gaodu` 的注释实现是读一个高度、减 85/80、赋给 `nDisZOffs`，也不是径向形状控制。
- 因此：**“两边高中间低”不是现有源程序的定量行为**。外部报道的“六字法+高端低倒”只能作为工艺方向，不能把具体数值冒充古井 SOP。

### 建议的离线形状层（先显示，后验证）

1. 在沉积网格上增加**目标料面剖面**，不要改源 `nDisZOffs`：
   ```text
   surfaceTarget(u,v, layer) = layerBase
       + edgeRise * (r/rEdge)^p
       - centerDrop * (1 - r/R)^q
   ```
   其中 `r=hypot(u,v)*R`；`edgeRise/centerDrop` 只是待标定离线参数，默认 0，不能声称古井实测。每格 `targetHeight=clamp(surfaceTarget,0,potHeight)`，按格面积积分并归一化到 `cell.targetVolume`，保证总体积不因形状变化而增加。
2. 分层仍按源 40mm 层级推进：形状只在**层内/显示曲面**变化，不改变源层数；若边缘目标超过当前层允许高度，先只显示/告警，不直接改源路径。
3. 若将来要机器人按形状走：
   - 用 `localMaxInRadius`（边缘最高）加 clearance 得到**单层安全 z**，保留源 `pBarrelCenter_bu` 的 TCP 间距和 `Offs` 结构；
   - 每个源路径点只解一次 IK，禁止逐格/逐层反复反解；
   - 边缘高、中心低意味着边缘路径 z 更高，中心可低；安全余量必须按边缘最大料面算，不能按中心平均高度算。
4. 前端“方块尖塔”问题的根源是逐格立方体渲染，不是料面体积本身；建议 Codex 用连续高度场/插值网格（含法线、边缘平滑）从同一 `u/v/height` 协议生成连续曲面；不要用单格 box 的顶面代表整个锅。边高中间低应在高度场上温和插值，而不是把格子竖高。
5. 体积验收：无论形状如何，`sum(area*height)=depositedVolume`、`completed` 时总体积=targetVolume；边缘高/中心低只改变高度分布，不增加总料量。

## 4. 建议的局部料面协议（供 Codex 接入）

```text
depositGrid.schema = 'abb-deposit-grid@2'（建议）
cells[key] = {
  u, v,              // [-1,1] 锅底归一化
  volume,            // m³
  baseHeight,        // m，当前 0；若做多层可改为层底
  height,            // m，局部料面
  area,              // m²，area*height=volume
  capacity,          // m³
  targetHeight       // m，形状目标（边高中间低时使用）
}
surfaceAt(u,v)       // 插值局部料面，非 cell.height
maxHeightInRadius(u,v,r)
```

- 状态序列化不要只丢 `volume`；至少保留 `height/area/baseHeight`，否则前端无法连续曲面，后端也无法做局部 clearance。
- `finalize` 的完成态应根据形状剖面填满目标锅，而不是把所有 cell 高度设成同一个 0.8m；否则“边高中间低”会被完成态抹平。

## 5. 只读发现的现有代码风险（不修改）

1. `robot-sim.js:1138-1140`：`duqu` 不写 `nDisZOffs`；且写入的是 bulk `cell.height`，不是局部测量。**高度失配的第一优先修复点**。
2. `robot-cell-sim.js:111`：`c.height` 是 `potHeight(depositedVolume)`，作为整锅等效高度可以用于完成判定，但**不能当局部料面或 nDisZOffs**。
3. `robot-deposit-state.js:13-16`：`compact` 只保留 volume；`appendDeposit:20-27` 每次重建 grid，丢弃每格 `height/area/baseHeight`，前端连续料面/局部采样无法拿到真实几何。
4. `robot-deposit-state.js:3-11`：`depositPoint` 固定使用 `wobjbarrel*` 的 uframe/oframe；源程序实际使用 `wobjjidian.oframe.rot`（`BuJiu.mod:327/358/...`），可能造成 u/v 旋转误差。
5. `robot-deposit-grid.js:49-51`：所有 cell 的 `area` 由同一 areaScale 得到；这对“体积守恒/完成铺满”是自洽的，但不能表达边高中间低的**目标**，需要 Codex 扩展 target profile（不改本文件也可在其上层加 profile）。
6. `robot-deposit-grid.js:103-117`：完成时补满所有 cell 到同一 `capacity`；这会抹平边高中间低。若采用形状，finalize 必须按 `targetHeight` 或保持已完成的 shaped heights。
7. `robot-cell-sim.js:115-122`：`previousDepositPoint` 清空条件正确（do22 关/接料/空斗），但缺少“返程下降段不沉积/clearance”检查；建议在 `consumeCellMotion` 增加：
   - `if (do22` 关或 receiving 或 bucketEmpty) { previous=null; return; }
   - 新段前若 `Δz` 超过阈值或 `toLocalZ < localMax + clearance`，不沉积，只记告警/跳到新参考点；
   - 首个铺料点只记 previous，不跨接料段计算体积。

## 6. 验证建议（不部署）

- 单元：`duqu` 后 `nDisZOffs` 的 85/80 偏置、clamp、`gaiding` 分支；`cell.height` 与 local max 不同时不得混用。
- 单元：接料返回后首个布料点 clearance；高 z 到低 z 的垂直段不被 `appendDeposit` 计体积；总 `supplied/hopper/bucket/deposited` 守恒。
- 空间：真实 800 轨迹下每层 `nDisZOffs` 与源 `MoveL` 路径 z 对齐；边缘局部料面不超过路径 z-clearance；完成体积=target。
- 渲染：连续高度场无单格尖塔；边高中间低轮廓可见；暂停/停止不增长；颜色仍深褐。
- 不要用把 `nDisZOffs` 强行设为 `cell.height`、全信号 1、跳过等待或提前显示满锅来“验收”。

## 相关源码索引

- `BuJiu.mod:5,24,65,250-253,317,423,433,436,449,459,462,488,498...`
- `ModData.mod:58,134,306,341,354,355`
- `yuanxin.mod:129-224`（`duqu_zaomian_gaodu` 注释实现；受保护 BaseMod 仍是最终依据）
- `server/src/robot-sim.js:1082-1089,1136-1148`
- `server/src/robot-cell-sim.js:111,115-122`
- `server/src/robot-deposit-state.js:3-28`
- `server/src/robot-deposit-grid.js:24-51,81-117`
- `.local/abb-flow-20261105/report.json`（备份源码只读来源）
