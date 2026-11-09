# ABB 出锅碰撞与锅口清扫轨迹 · DSH 修复记录（2026-11-06）

范围：V1.9.10，`D:\wx_xiangm\xiangmu`。本轮 DSH 按用户授权只改：
`server/src/robot-sim.js`、`server/src/robot-deposit-state.js`，并新增专项测试
`server/test/robot-pot-path.test.js`、`spare-parts-web-release/test/abb-pot-path.test.mjs`。
**未改**原始备份 ZIP、机器人校正矩阵、速度/倍率；**未部署**、未起常驻服务；未触碰 Codex 独占文件
（`AbbRobotViewer.vue`、`robot-cell-sim.js`、`abb-material-simulation.mjs` 等）。

---

## 0. 结论摘要

1. **“出锅碰撞”来自受保护 BaseMod 的离线替代，不是可读源程序的点位**：旧替代把
   `guodu`（布料入锅过渡，调用点 `BuJiu.mod:320` 等）做成**单条 MoveJ 直插锅内**
   （目标离内底 290/330 mm），把 `guodu_SAFE`（`BuJiu.mod:177`，出锅前安全过渡）
   做成**从锅内单条 MoveJ 直飞 home**。实测这些 MoveJ 的目标 J6 出现
   **−375.60°、+260.27°、−242.26°、−137.33°、−285.47°** 等大角度/多圈变化，
   浏览器按关节线性插值渲染时整只布料斗会扫过锅壁/锅沿。
2. **当前 guodu / guodu_SAFE 仍是“占位替代”，不是按备份还原。** 已把旧的单条 MoveJ
   改成“竖直抬升 + 直线/MoveJ”，并全部标注 `substitute:{basis,unconfirmed}`；但 2026-11-06
   用户/Codex 独立复核指出尚未通过轨迹验收，我方随后核查确认：**备份里的 BaseMod 为加密受保护
   模块，现有资料无法取得真实源码或控制器记录的这两段关节轨迹（见 §10）**。因此这两段不再继续
   猜测、也不得把“全流程跑完”当作轨迹正确。
3. 新增**整只工具**（布料斗/护罩/打散滚筒/刚性耙子/刮板等 24 个 640 件、20 个 700 件）
   对**带 75.1 mm 壁厚与锅沿环**的锅壳的扫掠检查（robot-sim 对出锅/过渡/清扫事件输出
   `pot`/`potFrame`/`potCheck`），并统一做 **J1/J4/J6 归圈**（±360° 等价角取最短），
   消除“多转一圈”。
4. **锅口清扫轨迹（QS）经真实备份实跑核对**：左甑 75 步 ×(+5°)=375°、右甑 75 步 ×(−5°)，
   重叠 15°；TCP 环半径 **1253.73/1256.11 mm**、高度 **946.74/955.94 mm**（低于锅口
   23.26/14.06 mm），落在锅沿壁厚内（距内壁 +56.37/+57.70 mm，距外壁 18.8/17.4 mm）；
   覆盖锅沿带宽所需刷半径 ≥**53.73/56.11 mm**、刷毛长 ≥**23.26/14.06 mm**。
   **CAD 里没有毛刷零件**（只有刚性耙子/刮板），刷子尺寸为离线假设，已在代码与本文标注未确认。
5. 工具实体顶点级复核：QS 清扫姿态下 640 整只工具全部 485,396 个顶点距锅实体
   **≥168.2 mm**（最近在刚性耙子），说明 AABB 检查给出的 −8.7 mm 只是包围盒保守值，不是真碰撞；
   布料斗本体不下探到锅沿，真正的刷面必须在“虚拟清扫 TCP”上（见 §4）。

---

## 1. 真实备份调用链与可读 / 受保护边界

真实备份：`.local/abb-flow-20261105/report.json` = `酿酒机器人.zip`，
sha256 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad`，
RobotWare 6.15.02.00。

### 1.1 可读源码（main → 出锅链）

| 位置 | 内容 |
|---|---|
| `ModMain.mod:315` `main` | 程序入口；循环后 `:339 EXIT`、`:343 GoHome`、`:345 rRunGoHome`、`:349 InitAll`、`:352/353` 两条绝对 MoveL |
| `ModMain.mod:356` `rWorkLoop` | `:375 GoFeedCnv_Base` → `:376 jiancha 550` → `:377 GUODU_moveL` → `:378 kaishi_saliao` |
| `ModMain.mod:388` `GUODU_moveL` | 可读：`MoveL pBarrelAppr_L/R` → `MoveAbsJ j_zhogzhuan_L/R` → 开护罩 `do16` |
| `BuJiu.mod:173` `kaishi_saliao` | `:174 JS`（上甑）→ `:177 guodu_SAFE`（受保护）→ `:178 QS`（清扫）→ `:180 MoveL pRobHome,vWorkSpd3000,fine,tGripOutlet_pXX\WObj:=WobjBase` |
| `yuanxin.mod:314` `QS` | 清扫：左 `:326-369`、右 `:371-411`；`:330/375 MoveL pBarrelAppr_L/R` → `:331/376 MoveAbsJ j_zhogzhuan_L/R` → `:332/377 MoveL Clean_L/R` → `:333/378 Offs(...,0,0,-95)` → `:346-362/:390-404 FOR 1..75`（`OrientZYX(±i*5)`）→ `:365-369/:407-411` 退刀 → `MoveAbsJ j_zhogzhuan` |
| `yuanxin.mod:422` `rRunGoHome` | 按当前 Y/Z 分支抬起/居中回 home；`:435 CurrentPos` → `ModMain.mod:136 Present(Wobj)`（**未实现**） |
| `ModData.mod:254/255` `pBarrelAppr_L/R` | 锅口上方可读接近点（`z=1149.96/1149.95`，`r≈316 mm`） |
| `ModData.mod:262/263` `Clean_L/R` | `[[1253.65,-14.35,1046.74],…]` / `[[1255.14,-49.26,1055.94],…]` |
| `ModData.mod:198/200/203/205` | `tGripOutlet / tGripCentre / tGripOutlet_pXX / tGripCentre_p` tooldata（见 §3） |
| `ModData.mod:160/164` | `WobjBarrelR/L` 锅工件坐标（内底基准） |

### 1.2 受保护 BaseMod 的离线替代（不可读，必须视为替代）

`server/src/robot-sim.js` `executeCellExternal` 中可读的替代事件（`file="模拟过渡（BaseMod 受保护）"`）：

| 例程 | 旧替代 | 依据/未确认 |
|---|---|---|
| `guodu` | 1 条 `MoveJ` 到 `pBarrelCenter_bu + (nXCircleR_bu,nYCircleR_bu,nDisZOffs+…+150)`（锅内离底 290/330） | 调用方实参被忽略、工具硬编码 `tGripOutlet`、+150 mm 为假设；BaseMod 内部不可读 |
| `guodu_SAFE` | 1 条 `MoveJ pRobHome`（从锅内直飞 home） | 同上；锅内/锅外不区分 |
| `duqu_zaomian_gaodu` | 虚拟测高 `readSurfaceFeedback`（补偿 85/80、clamp 0..800，写 `nDisZOffs`） | 历史可读注释实现，非真实测量 |

> 结论：`guodu`/`guodu_SAFE` 的路径**不能当作原程序动作**；本轮修复只改替代路径，
> 并在事件 `substitute` 字段与文案中显式标注 basis/unconfirmed。

---

## 2. 出锅碰撞根因（修复前实测）

用真实备份跑 40 mm 左甑，按事件 `from`/`to` 关节统计替代 MoveJ：

| 位置 | 目标（锅坐标，mm） | ΔJ4/ΔJ5/ΔJ6 (°) |
|---|---|---|
| `guodu` @35 | (−705, 0, 290) | −6.09 / −32.27 / **−137.33** |
| `guodu` @671 | (354, 613, 330) | −16.41 / +7.74 / **−375.60**（多转一圈） |
| `guodu` @863 | (238, 283, 330) | −4.92 / −2.89 / **+260.27** |
| `guodu` @1054 | (35, 60.6, 330) | +6.02 / −3.03 / **−242.26** |
| `guodu_SAFE` @617 | home（世界） | +3.19 / +14.02 / **−285.47** |

- 浏览器对 MoveJ 用关节线性插值（`AbbRobotViewer.updateMotion`），J6 多转一圈会让
  **整只布料斗**绕锅口扫过；且目标本身在锅内低处（290/330 mm），从上一段姿态直插时
  斗体/护罩/打散轴扫过锅壁。用户截图里的“模拟过渡（BaseMod 受保护）第 320 行 MoveJ”
  就是 `BuJiu.mod:320` 调用的 `guodu` 替代（事件行号锁定首次调用行 257/320）。
- `guodu_SAFE` 从锅内直接 MoveJ 回 home 同样穿越锅口/锅壁，并把 QS 入口改成从 home
  重新接近（与原程序疑似不一致，属未确认项）。

---

## 3. 修复内容（已在授权文件内）

### 3.1 `server/src/robot-sim.js`

1. **`guodu` 替代改为三段 MoveL**（锅内进料过渡）：
   `MoveL pBarrelAppr_L/R`（可读锅口上方点）→ `MoveL` 目标上方（锅口+250 mm，
   与目标同 X/Y/wobj 旋转）→ `MoveL` 布料目标。全程直线、始终在锅内腔或锅口上方，
   不再用关节空间直线穿越锅沿。
2. **`guodu_SAFE` 替代**：若上一段可读运动仍在锅内（由 `state.lastTcp` 与锅几何判断），
   先 `MoveL pBarrelAppr_L/R`，再 `MoveL pRobHome`；否则保留 `MoveJ pRobHome`
   （`GoFeedCnv2` 场景机器人不在锅内）。QS 之后的 `BuJiu.mod:180` 可读 MoveL 不变。
3. **关节归圈 `normalizeJointTurns`**：MoveL/MoveJ/MoveAbsJ 的目标 J1/J4/J6
   按 ±360° 归到距上一姿态最近且不超关节限位的等价角（同一 TCP 位姿），
   浏览器不再多转一圈；事件附 `jointDelta`，|ΔJ4|>150 或 |ΔJ6|>170 时附 `branchWarning`。
4. **整只工具遥测**：对 `exit/transition/clean` 类运动附加
   `pot`（锅尺寸/刷代理）、`potFrame`、`tcpLocal`、`potCheck`（AABB 最小间隙/最近件/区域）；
   QS 环步额外附 `potClean`（半径/高度/低于锅口/内外壁距/覆盖所需刷半径与刷毛长）。
5. `createSimulation` 支持 `toolType:'tool-640'|'tool-700'`，供检查选择对应整只工具包络。

### 3.2 `server/src/robot-deposit-state.js`

新增（不改原有落料/料面函数语义）：
- `POT_GEOMETRY` / `potShell(cell)`：内腔 1.09→1.2 m、内高 0.97 m；锅壁/锅沿宽 **75.1 mm**、
  rim top=970 mm、锅口外沿 1275.1 mm（来自真实锅 GLB 径向剖面，见 §4）。
- `TOOL_ENVELOPES`：真实 tool-640（24 件）/tool-700（20 件）GLB 节点 AABB，
  CAD→法兰 `p_flange_mm=(1000x, −1000z, 1000y)`（转接法兰盘心/贴合面、tooldata 258.25 mm、
  出料唇口平面 ≤1.1 mm、640 皮带 −20°/0.63° 三路核验；700 皮带残差 8.66°，已标不确定）。
- `potPointClearance` / `potToolClearance`：点/整只工具对锅实体（内腔/壁厚/锅沿/锅底）的有符号间隙。
- `potRimSweep`：QS 环的覆盖/接触检查（内外半径、低于锅口、所需刷半径/刷毛长、角度覆盖），
  含 `CLEAN_BRUSH_PROXY`（半径 60 mm、刷毛 25 mm）——**明确标 `confirmed:false` 的离线假设**。
- `sampleJointPath`：MoveJ/MoveAbsJ 关节插值采样，供整只工具扫掠复核。

> 说明：AABB 包络对大型斗体是保守的（QS 姿态下 AABB 给 −8.7 mm，顶点级实算 +168.2 mm），
> 因此测试把 AABB < −12 mm 才判为可疑，并用顶点级离线复核确认实际无碰撞（见 §4/§5）。

---

## 4. 整只工具扫掠与锅壁/锅沿/倾斜姿态

- 检查对象：布料斗（hopperBody/frame）、护罩（rest 与 open 包络）、打散滚筒、刚性耙子、
  前/转弯/侧刮板、皮带/滚筒、接料口（700）等；全部经过**该段法兰位姿（含倾斜/旋转）**
  变换到锅坐标后再与锅壳求交，不是只看 TCP。
- 锅实体包含：内腔锥面、**75.1 mm 壁厚**、锅口水平环（1200–1275.1 mm）、底厚 98 mm。
- 40 mm 左/右实跑（100%、1×，离线自动化；未加任何倍率）：
  - `exit` 类（`BuJiu:180` 到 `pRobHome`、`kaishi_saliao` 等）AABB 最小间隙 **55.3 / 52.0 mm**；
  - `transition` 类（新替代的 3 段/2 段直线）最小间隙 **8.63 mm**（正值，无碰撞）；
  - `clean` 类 AABB 保守值 −8.7 / −1.0 mm，但**顶点级**（485,396 顶点，真实 CAD 三角形顶点）
    640 整只工具在 QS 姿态距锅实体 **≥168.2 mm**（最近点为刚性耙子 r≈1573、z≈1138），
    故不是实际碰撞；AABB 的负值来自大包围盒角点，已在文档与测试阈值中说明。
- 旧替代的 MoveJ 多圈/直插路径已不存在：新替代事件全部为 MoveL，且无 `branchWarning`；
  旧实测 J6 −375.6°/+260.3°/−242.3°/−285.5° 归圈后不再出现。

---

## 5. 锅口清扫（QS）核对结果

真实备份三次实跑（40 左、40 右、800 左）一致：QS 每次只调用 1 次，**75/75 步**。

| 项目 | 左甑 | 右甑 |
|---|---|---|
| 环步方向 | `OrientZYX(+i*5)`，+5°/步 | `OrientZYX(−i*5)`，−5°/步 |
| 角度覆盖 | 375°，重叠 15° | 375°，重叠 15° |
| 工具 / 工件 | `tGripCentre_p`，`wobjWork`（=WobjBarrelL 每步旋转） | 同左，WobjBarrelR |
| TCP 环半径 | **1253.73 mm** | **1256.11 mm** |
| TCP 环高度（锅坐标） | **946.74 mm** | **955.94 mm** |
| 低于锅口（rim top 970） | **23.26 mm** | **14.06 mm** |
| 距该高度内壁（1197.36/1198.41） | +56.37 mm | +57.70 mm |
| 距该高度外壁（1272.46/1273.51） | 18.8 mm（在壁内） | 17.4 mm（在壁内） |
| 覆盖锅沿带宽所需刷半径 ≥ | **53.73 mm** | **56.11 mm** |
| 接触所需刷毛长 ≥ | **23.26 mm** | **14.06 mm** |
| 进入/退刀点 | `Clean_L` z=1046.74 → −95 → 951.74；退刀 :365/:367/:368 | `Clean_R` z=1055.94 → −95 → 960.94；退刀 :407/:409/:410 |

- TCP 环落在**锅沿壁厚以内**（既不是内腔，也不是锅外），这是清扫接触点的正确位置；
  左右方向相反、375° 全周覆盖、两种甑的半径/高度均在锅沿带内。
- **CAD 中没有毛刷**：tool-640/700 节点只有“刚性耙子/滚筒皮带前刮板/转弯刮板/护罩/接料口”，
  无刷毛零件；QS 姿态下布料斗本体最低点高于锅口 168.2 mm（640）/115 mm（700），
  TCP 比工具最低点还低 91.5/38.2 mm ⇒ 清扫元素只能是装在 `tGripCentre_p` 上的刷盘/毛刷
  （离线假设，`CLEAN_BRUSH_PROXY` 半径 60/刷毛 25 mm 仅用于阈值验证，`confirmed:false`）。
- **覆盖判定**：`potRimSweep` 要求刷半径 ≥53.7/56.1 mm 且刷毛 ≥23.3/14.1 mm 才 `coversRim`；
  当前假设满足（60/25）。若现场毛刷更小，现有源轨迹扫不到锅沿——这是需要现场确认的临界项。
- 退刀 :365/:407 在低于锅口 23.3/14.1 mm 处横向穿入内壁半径（穿入 43.6/42.2 mm），
  :367/:409 再抬到锅口上方并外移；用整只工具顶点级复核未见工具实体碰撞（工具本体高于锅口），
  但若实际毛刷是**刚性刮板**而非柔性刷，这一段会切锅沿（未确认，列在边界）。

---

## 6. 修改文件与 SHA256

| 文件 | SHA256 |
|---|---|
| `server/src/robot-sim.js`（当前工作区，含 Codex 15:57 并发修改） | `6C5342024CFEDCFA73CF33F3C8BAB0675942748167497D593647D56BF035690A` |
| `server/src/robot-sim.js`（DSH 交出时，2026-11-06 ~15:35） | `E18E6918148E8CCDE9B0F2881D2CE4B18047069104ED49A5664F96737AA7186C` |
| `server/src/robot-deposit-state.js` | `029A1D755AF5FBF396C19FD9EDF67DC659DEE5D03E01A239AD2F971873A202C0` |
| `server/test/robot-pot-path.test.js`（当前工作区，Codex 15:55 更新断言为“受保护动作停在调用点、不生成空中绕圈/出入锅”） | `6C01CAC1ADD6B61BE1AB672CF47EB70846C258AFB05991AC7F7A2308EC57D08D` |
| `spare-parts-web-release/test/abb-pot-path.test.mjs` | `A9D382E4C368298FBBAB48247C0781A24206CCA7CECFC686F28B365EB9264714` |
| `spare-parts-web-release/src/utils/abb-program-motion.mjs` | 未改 |
| `spare-parts-web-release/src/utils/abb-inverse-kinematics.mjs`（新增 MoveL 中途换构型保护） | `D30E63C8F761148C77820EEB1D8F29759ECD18586CC3520DCA75031F74697EE0` |

> `server/src/robot-sim.js` 在 13:13/13:18 与 15:42/15:57 被并发修改（前次 solveCache 剪枝，
> 后次为 Codex 对替代过渡的继续修改，含 `pushSynthetic` 与“按备份 MOC 轴限位”文案）；DSH 已停止
> 继续写该文件。稳定交付哈希应在 Codex 集成、拿到真实 BaseMod 数据并完成替换后重新取。
> 线上部署版仍是旧文件；文档自身不列入哈希。

## 7. 测试结果

- `server/test/robot-pot-path.test.js`：**7/7 通过**（锅壳/锅沿几何、点与整只工具间隙、
  QS 左右覆盖、真实备份 75 步、替代路径全部 MoveL 且无分支翻转、exit/transition/clean
  间隙与关节归圈；真实备份夹具缺失时自动 skip 真机用例，几何单测始终运行）。
- 既有机器人回归：`robot-sim/robot-program/robot-cell-sim/robot-motion` **45/45 通过**；
  服务器全量 `node --test` **463/463 通过**。
- `spare-parts-web-release/test/abb-pot-path.test.mjs`：**3/3 通过**；网页全量
  `node --test test/*.test.mjs` **701/701 通过**（左右覆盖阈值、与服务端同一份几何常量、
  附加 `pot/potPath` 字段不改变准备路径）。
- 100%/1× 用离线自动化逐段核验（自动化不等于真实播放倍率）；倍速播放只缩放客户端时间
  （session 的 rate 只影响时长），服务端事件几何不含倍率 ⇒ 关节序列/间隙与倍速无关；
  浏览器 10× 实跑未测，需 Codex 集成用 DevTools 复核。

## 8. 未完成 / 需 Codex 配合

1. **EXIT 语义（D1）**：`ModMain.mod:339 EXIT` 被模拟当“程序结束”，导致 `:343 GoHome`、
   `:345 rRunGoHome`、`:349 InitAll`、`:352/353` 两条绝对 MoveL 不执行。RAPID 的 EXIT 是
   “退出循环”，不是结束程序；需在 `robot-sim.js` 编译器实现 loop-EXIT（影响所有程序，
   建议 Codex 集成后整体回归）。本轮未改，避免改变整段流程验收。
2. **Present/CurrentPos（D2）**：`rRunGoHome` 依赖 `Present(Wobj)`（未实现），当前 blocked，
   Y/Z 四个安全分支无法验证；需实现 `Present` 并用异常位姿验证 4 个分支。
3. **查看器（Codex）**：QS 期间若要视觉正确，应按 `pot.toolType` 与刷参数显示刷盘/毛刷，
   或隐藏布料斗；否则画面仍是布料斗悬在锅口上方。`pot/potFrame/potCheck/potClean`
   已随事件下发，可直接用。
4. 可选：`routes/robot-program.js` 透传 `toolType`（640/700）以使用对应包络。
5. 现场确认项：真实毛刷半径/刷毛长/刚性、锅外廓与壁厚（示意 GLB；临界壁厚 56.4 mm）、
   护罩开/闭状态、700 偏航 8.66° 残差、EXIT/BaseMod 内部实现。

## 9. 边界

- 未部署、未改原始备份、未改已核验机器人校正矩阵、未用速度倍率掩盖问题。
- 锅外廓/壁厚来自示意低模（`gujing-pot.glb`），只有内腔 1.09→1.2 m、内高 0.97 m 是程序权威；
  壁厚 75.1 mm 与“TCP 落在壁厚内”的结论对壁厚敏感（临界 56.4 mm）。
- AABB 包络保守；真实三角形顶点复核只做了 QS 640 一个姿态（+168.2 mm），其余事件用 AABB +
  正间隙阈值判定。
- 未跑真机/IRC5/BaseMod 内部；没有现场毛刷数据前，刷面覆盖是“几何上可行且阈值满足”，
  不是已确认的实际清扫效果。

---

## 10. 真实 guodu / guodu_SAFE 可读代码与轨迹核查（应要求，2026-11-06 16:00）

**结论：现有备份、服务器与本机资料都无法提供/确认 guodu 与 guodu_SAFE 的真实可读代码，
也没有控制器/RobotStudio 记录的这两段关节轨迹。** 在拿到真实数据前，不能“按备份还原”这两段，
当前替代只能算占位；不能用全流程执行结束替代轨迹验收。

### 10.1 已核查的证据（只读）

1. **酿酒机器人.zip 的 BaseMod.mod 是加密/受保护二进制**：ZIP 内路径
   `backup_6700-551593-1_6700-551593_2026.5.28/RAPID/TASK1/PROGMOD/BaseMod.mod`，
   13,459 字节，sha256 `9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377`；
   解压内容不可打印（头部为二进制 `\x10\x00/e…`）。备份解析记录
   `.local/abb-flow-20261105/report.json` 中该文件 `readable:false`，
   原因：“非文本或不可识别的模块，可能受保护；未解密”（`encoding:"binary"`）。
   `guodu`/`guodu_SAFE` 的**调用**可在可读模块（BuJiu/HYbaojing/StartPoint/Module_Tool/yuanxin 等）中看到，
   但两个过程体只存在于该受保护模块。
2. **本机缓存的真实备份只有 3 套真实程序**（`.local/review-20261018/robot-library`）：
   - `酿酒机器人.zip`（01b7a45e…，BaseMod 加密，见上）；
   - `4楼S02.zip`（1e3b1abe…）：其受保护文件 `ROB_PRGDATA.mod` 为 271 字节二进制
     （sha256 `01cfeb3519b6441015e725affd2a43b120ae9fae23cf4821a9f7f2b243985541`）；
     可读的 `MainModule.mod` 是**另一个搬运程序**（`Tool_Pick`、`Left_guodu_Pos`/`Right_guodu_Pos`
     为示教点位，`:263/:307 MoveJ` 到这些点位）——只能证明“真实程序的过渡常是到示教点位的 MoveJ”，
     不是本机 6700 甑锅程序，不能拿来替代。
   - `七车间机器人-GuJin-A1-6.zip`（bbf550bb…）：11/11 模块可读、89 个例程，但全文
     **0 处**出现 `guodu`、`guodu_SAFE`、`BaseMod`、`j_zhogzhuan`——是另一套程序。
3. **服务器** `/opt/spare-parts/server/uploads/robot-program-library/` 只有两套真实备份
   （`01b7a4…`、`1e3b1a…`，与本地一致）；`recycle-bin`、`rollback` 下没有该程序的
   `backup.zip`/`.mod` 副本；服务器无 `guodu/BaseMod` 的其他可读源。
4. **本机 RobotStudio/控制器资料**：`D:\robot` 只有 ABB 库（含 `640布料头古井七车间.rslib`、
   `古井七车间暂存皮带布料头（700宽度）.rslib` 等）和示例站；未发现本项目的 `.rspag/.rsstn`
   站文件、`.pgf`、`.mod` 控制器文件或 `.eventlog`。工作区/服务器也未发现包含
   `PROC guodu` 或 `MODULE BaseMod` 正文的文本（只有上述可读调用点和另一套程序）。
5. 因此**加密模块无解密材料**：ABB 保护模块在备份 ZIP 内即为加密内容，仅凭 ZIP/现有账号无法
   还原源码；当前工具也没有控制器在线访问或 EGM/PC SDK 录制数据。

### 10.2 要按备份还原，需要下列任一真实输入

- **A. BaseMod 未加密源码**：从控制器/RobotStudio/程序作者取得 `guodu` 与 `guodu_SAFE`
  的正文（包含目标点、工具、工件、MoveJ/MoveL/MoveAbsJ、等待与 I/O），或该模块的
  “保存为 .mod 源码”导出。加密模块必须有 ABB 服务/原作者权限才能导出。
- **B. 真实关节轨迹录制**（不修改 BaseMod）：在 IRC5 上以 100%/1× 运行这两个过程时采样关节，
  建议 10–50 ms，左右甑与各调用点分别录制。推荐做法：
  - 新建一个**可读后台任务/TRAP**，用 `CJointT()` 采样并写入文件/Socket（RobotWare File/Socket 选项），
    或用 PC SDK / RobotStudio 在线关节订阅（EGM 亦可）；BaseMod 本身不动。
  - 需要字段：`{tMs, joints[6], tool, wobj, routine, line}`；覆盖
    `BuJiu:177/257/320/352/630/633`、`HYbaojing:12/145/181/213/268` 等调用，及对应
    `guodu_SAFE`；标明录制时的工具/工件与控制器版本。
- **C. 含该控制器的 RobotStudio 站**：即使站内 BaseMod 仍加密，也可在线联合 PC SDK 录制 B 的轨迹，
  或提供站文件供核对点位/工具/工件（但不要把站内替代动作当源程序）。
- 拿到 A 或 B 后，DSH 将按真实关节/源码替换替代事件，重新做整只工具 CAD 扫掠、QS 与左右镜像回归；
  验收以真实轨迹的逐段扫掠结果为准。

### 10.3 当前状态与边界

- 工作区 `server/src/robot-sim.js` 在 DSH 修改后又被 Codex 并发修改（最新 mtime 15:57，
  当前 sha256 `6C5342024CFEDCFA73CF33F3C8BAB0675942748167497D593647D56BF035690A`）：
  **当前代码已对 `guodu`/`guodu_SAFE` 改为显式停止**（`Blocked('protected-motion', 'BaseMod 中的 … 受保护，
  未读取到原过渡轨迹；已停止，保留当前姿态，不执行猜测的转圈/出入锅动作')`），不再生成替代轨迹。
  这与“不能继续猜”的口径一致；DSH 不再覆盖该文件，最终替换由 Codex 在拿到真实数据后集成。
- DSH 最近一次本地 prepared-path 审计（在 Codex 最后一次编辑前）：左右甑替代动作已成为
  12–13 条已标记的直线/MoveJ，按实际 prepared frames 采样整只工具 CAD 未再检出穿入摆放锅体；
  但**右甑可读的 QS 入口 `yuanxin.mod:375` 与出口 `BuJiu.mod:180` 仍出现前端 prepare 失败**
  （详见 §8 未完成项），且这不验证未知的真实 BaseMod 动作。
- 验收口径：在 A/B 到位前，`guodu`/`guodu_SAFE` 标注为“占位替代（未还原）”，
  不通过轨迹验收，不用全流程结束/界面正常作为通过依据；QS 的 75 步、半径/高度与锅沿覆盖结论
  （§5）仍按可读源程序成立，但**清扫元素是离线刷代理**，同样需现场确认。

### 10.4 证据文件与哈希（只读）

| 证据 | 值 |
|---|---|
| 酿酒机器人.zip（= 备份 ID） | sha256 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad` |
| BaseMod.mod（ZIP 内，加密） | 13,459 B，sha256 `9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377` |
| 4楼S02.zip / ROB_PRGDATA.mod | `1e3b1abe…` / 271 B，sha256 `01cfeb3519b6441015e725affd2a43b120ae9fae23cf4821a9f7f2b243985541` |
| 七车间机器人-GuJin-A1-6.zip | sha256 `bbf550bb474fc05ced6046704a20828870d3c7f840b93ee281553f69a346e9b1`（11/11 可读，无 guodu） |
| 复现脚本/结果 | `.local/dsh-pot-20261106/extract-backups.cjs`、`backup-search.log`、`backup-modules/` |

> 另：`docs/ABB_POT_PATH_DSH_20261106.md` 的 DSH 交付哈希不列入本表（文档自身）；本节结论以只读
> 备份证据为准，未修改任何备份、校正矩阵或速度。

---

## 11. 2026-11-06 17:00 追加：找到 2025-09-29 可读源码并完成还原（更新 §10 结论）

**§10 的“可读源码/轨迹都拿不到”只在本轮之前核查的备份、服务器与本机 install 目录范围内成立。**
用户再次要求按作者源码或可运行 RobotStudio 工程还原后，本轮只读核查 `D:\robotcx\七车间机器人\`
发现 2025-09-29 的 Pack&Go 包 `______1_20250929-143205.rspag`（98,943,042 B，sha256
`69350f13…48fe65`）：

- 包内 `Backups/GuJin-A1-4/RAPID/TASK1/PROGMOD` 的 `fenqu.mod`/`BuJiu.mod`/`HongWai_GuoDu.mod`
  仍是**未加密正文**，含 `PROC guodu`（fenqu:3816–4048）、`PROC guodu_SAFE`（BuJiu:790–853）、
  `FUNC MidPosCal`（HongWai_GuoDu:3–12）；已逐行复制到 `server/src/robot-basemod-legacy.js`。
- 2026-05-28 备份中的可读模块仍以相同签名调用这三个例程，且已不再定义它们，受保护
  `BaseMod.mod`（13,459 B，sha256 `9b21160c…4b5377`）是其后继实现；但“2025 正文与 2026 加密
  BaseMod 逐字节一致”仍未证明，需作者确认或 2026 控制器轨迹。
- 本机 RobotStudio 6.08 + RobotWare 6.08 可打开 2025 站，但没有 2026（RW 6.15.02）站，不能
  冒充 2026 控制器轨迹。本轮轨迹为同一份 2025 源码经离线解释器执行（模型时间），不是控制器记录。
- 实现与验证：左右甑 40 mm 全流程 `main:339 EXIT`；左/右 `guodu` 57/6 段、`guodu_SAFE` 6/6 段，
  J6 圈数保留；过渡段工具-锅体代理最小间隙 0.37/0.08 mm（无负间隙，但需现场复核）；
  `node --test server/test/robot-*.test.js` 106/106 通过。未部署、未打包、未改原 ZIP。

详见 [guodu/guodu_SAFE 还原依据与实现](ABB_GUODU_SAFE_RESTORE_20261106.md)。
验收口径：现有实现应标注“按 2025-09-29 作者可读源码还原（2026 BaseMod 同版待确认）”，
**不再标为占位替代，也不能标为 2026 版逐字节还原完成**；§10 的“不猜测/不冒充”要求继续有效。
