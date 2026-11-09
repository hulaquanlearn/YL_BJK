# ABB 程序与模型联动协作（2026-11-04）

用户本轮明确要求联合 DSH，核对本机七车间机器人程序、智能中心 ABB 程序智能分析与设备模型展示的联动。**用户已明确暂不同步服务器，等用户另行通知才能部署。**

## 当前状态与边界

- 网页入口已本地改名“设备模型展示”，保留 `/agv-vehicles` 路由。ABB 型号为 IRB 6700-150/3.20。
- 已从本机 ABB 原始库转出机器人、640/700 布料头、古井甑锅和 FlexPendant 模型。工具/甑锅/示教器默认不显示。用户最终要求示教器可点击部件说明、并控制网页机器人模型动作演示；不再强制使用 RobotStudio 本身。
- 最新操作顺序：上方“系统与部件、工具下拉框、甑锅模型、坐标系、标签”；工具下拉框选项“不显示工具、640、700”，无独立“工具”文字或显示按钮，菜单选后收起。底部“拆开、复位、正视、俯视、旋转”，滑条在画布外。AGV 一起简化底栏，移除暂停、调速、查看全车和树内搜索。
- 资料弹窗需放大，手册可直接打开完整阅读，不能仅有静态目录。
- 真实程序不能作为公开 public 静态资源发布；继续沿用现有 `/api/robot-program` 的账号、权限、项目/版本/会话边界，不恢复已退役 ABB 分析代理。

## 文件范围（先提议，待 DSH 确认）

- Codex 持续修改：`src/components/agv/`、`src/views/AgvVehicles.vue`、`src/utils/abb-*.mjs`、AGV 展示工具/样式及相关测试，模型资源/转换工具、资料阅读器。上述路径相对 `spare-parts-web-release/`，转换工具在根 `tools/modeling/`。
- DSH 首先只读核验：`server/src/routes/robot-program.js`、`server/src/robot-*.js`、`src/views/RobotProgram.vue` 及相关程序分析接口；本机 `D:/robotcx/七车间机器人/` 工程和备份。请提出可执行接口/指令覆盖方案和具体拟写文件，**确认文件范围后再写**，不要同时改 Codex 展示文件。
- 不改生产服务、数据库、私有配置或有效上传，不构建覆盖 dist，不部署；交付请列实际文件、测试和 SHA256。

## 已核对的模型资料

- 机器人：`D:/robot/ABB Library/Robots/IRB6700_150_320__04.rslib`。
- 工具/甑锅：`D:/robot/Libraries(1)/` 下的 640 布料头、FJRB000910 七车间暂存皮带布料头（700宽度）、古井甑锅。
- 原始工作站：`D:/robotcx/七车间机器人/Stations/_____.rsstn`；对应 rspag 和 Systems / Backups 均在同一工程。
- 说明手册：`D:/robot/Help/zh-CN/3HAC050941.chm`，修订 G / RW6.08，已解包在 `.local/abb-device-20261104/irc5-manual/`。
- 已验证 ABB modified DH：`Tx(length) Rx(twist) Rz(rotation+q) Tz(offset)`，乘原始 `CorrectionTransform` 后，六轴全零姿态与 CAD 各部件原装坐标一致（误差 < 1e-9）。原始关节/补偿矩阵提取在 `.local/abb-device-20261104/joints.json`。平衡机构还有两条从动关节依赖。

## 联动方案需共同确认

1. 分析中心输出确定性的设备/工具/工件坐标、点位、例行程序调用和运动指令，不让模型直接执行 AI 生成的动作。
2. 示教器先实现模型六轴点动、限位、复位和演示；程序预演按真实解析结果驱动关节和轨迹，显示当前行/程序段。
3. 核对七车间真实程序中的 MoveAbsJ / MoveJ / MoveL / MoveC、变量表达式、Offs/RelTool、工具/工件、IF/循环、I/O等待与外轴。未支持内容应明确中止/提示，不静默跳过、不编造轨迹。
4. 轨迹预演与真实控制、碰撞验证/工艺验收分清；本次不连接或控制现场机器人。

## DSH 接收 / 交付

待确认。消息发送不等于对方已接收或完成。

### 用户最新澄清 · 09:55

- 完全离线仿真，不要求连接现场机器人、读取现场实时数据或启动 RobotStudio 本体。
- 工程中已有点位/工具/工件坐标优先使用；缺失值明确列成仿真输入，让用户在模型面板补值。
- I/O、等待、工艺条件通过用户点击模拟信号驱动；程序到等待处停在真实行，满足模拟条件再继续，不能静默跳过。
- 09:53 已通过 Computer Use 核对 DSH“联合codex干活了”会话文件根为 `D:/wx_xiangm/xiangmu`。界面确认 DSH 已读本交接且在只读核验，Codex 补充交接消息已出现在该会话中；尚未收到代码交付。

### DSH 只读核验与方案 · 2026-11-04 10:05（未写项目源码、未构建、未部署）

已收到 Codex 消息（文件根 `D:/wx_xiangm/xiangmu` 一致），已读 `docs/ABB_DIGITAL_TWIN_COLLABORATION_20261104.md` 及上述 09:55 用户澄清。本轮只做只读核验与方案登记；**未修改任何项目源码**、未启动服务、未连接数据库/现场控制器、未构建 dist、未部署、未同步服务器。以下统计来自真实备份的离线解析原型，脚本和输出在 `.local/abb-program-20261104/`（`scan3.mjs`、`expr-scan.mjs`、`scan.json`；备份 ZIP `gujin-a1-6-rapid.zip` SHA256 `BBF550BB…346E9B1`，`scan.json` `C6642205…2A442405`）。**这是源码统计，不是现场运行/视觉验收。**

#### 1. 现有接口核验（只读）

- `server/src/routes/robot-program.js` 的中间件顺序：登录(401) → `/status`、`/library`、`/library/:id`、`/library/:id/export` 只读 → `canAnalyze`（管理员/车间管理员，403）→ AI 写接口与上传 → `adminOnly`。即：**查看源码/注释/分析对已登录账号开放；新增只读运动计划接口应放在 `canAnalyze` 之前，与 `GET /library/:id` 同级权限**，不调用 AI、不扣次数。
- `server/src/robot-library.js` 的 `get(id)` 每次重新校验 ZIP 哈希并 `parseBackup`；返回 `report.files[].text/routines/signals/hooks/statistics`。因此运动计划可在新 GET 路由中**按需计算，不新增存储字段、不改 record schema、无迁移**；代价是每次约一次 450KB ZIP 解析（可加进程内 `id+revision` 小型 LRU，不落盘）。
- 现有 AI 分析（`robot-agent.js`/`robot-overview.js`）输出只有注释、总览、修改建议，**没有运动/点位数据**，不能作为模型动作来源；也不应让 AI 生成动作。
- 未在本机运行 API（本地无 `server/uploads` 库）；未读取服务器 `.env`、日志、业务数据或上传。

#### 2. 七车间真实程序核验（`D:/robotcx/七车间机器人/Backups/GuJin-A1-6` 六个同近似备份之一）

RobotWare 6.08.00.00 / IRB 6700-150/3.20，3 个任务、11 个模块、89 个例程、442 个 I/O 信号。只统计**代码行**（`!` 注释和注释掉的旧代码不计；原始文本里另有 35 条被注释的 MoveAbsJ、10 条 MoveL、4 条 TriggL、4 条 TriggIO 旧代码）。

| 项目 | 实测（本备份） | 说明 |
| --- | ---: | --- |
| 执行中的运动指令 | **280** | MoveL 117、MoveAbsJ 92、TriggL 68、TriggJ 2、MoveJ 1；**MoveC 0** |
| 目标可静态解析 | **106（37.9%）** | 全部为 `named-literal`：MoveL 102、MoveAbsJ 4 |
| 运行时取值目标 | 152 | PERS 无初值或例程内赋值 |
| 函数计算目标 | 17 | CalcRobT/Pass_PO/ARC 等 |
| Offs 动态 | 4 | `Offs(goRun,…)`、`Offs(PO_zuidi,0,0,PO_zuigao_H-…)` |
| 数组索引目标 | 1 | `MoveAbsJ pos_x_y{i}` |
| robtarget / jointtarget 声明 | 69 / 44 | 另有 tooldata 4、wobjdata 4、speeddata 15；**外轴全部 `9E+9`，本程序未使用外轴** |
| 流程结构 | IF 617、ELSEIF 430、ELSE 191、ENDIF 613、FOR 50、WHILE 24、TEST 5、CASE 45、GOTO 63 | PROC 59、FUNC 26、TRAP 4、CONNECT 6、IWatch 9、ISleep 12、IDelete 6、ExitCycle 17 |
| 运动控制/IO | StopMove 49、StartMove 17、AccSet 142、StorePath/RestoPath 2/2、Set 58、Reset 215、SetGO 326、WaitTime 132、WaitDI 3、TPWrite 60、TriggIO 70 | `WaitTime\InPos` 用于等运动到位 |

- **完全静态可演示例程 3 个**：`OtherModule.main_Pose_teach` 16/16（第 15–72 行，姿态示教/复位演示，最完整）、`MoveModule.DaiJi_JieLiao` 9/9（第 5598–5627 行，被 main 调用）、`MoveModule.Jieliao_Daiji_Yuandian` 10/10（第 5281 行起；未找到调用者，属可用演示例程）。
- **部分静态**：`Go_DaiJi` 18/22、`TQSZ_JieLiao` 15/20、`DD_PP_JieLiao` 15/22、`JieLiao_Guo` 9/10、`Guo_JieLiao` 9/13、`DaiJi_Qingxi` 3/5、`Clearing` 2/8；其余 36 个含运动例程为运行时时计算。
- **真实主循环依赖大量运行时数学**：CalcRobT 80、CRobT 10、CJointT 14、CalcJointT 11、ARC 78、INC_R 41、Get_Hight 24、EulerZYX 6、sin/cos/sqrt/atan2/round 等；条件里 `Get_Current_Pos()` 17、`TCP_Red`/`purview`/`INC_R` 等。`My_tool`/`My_wobj` 为 PERS 无初值，运行时分别赋 `tool1` 与 `wobj_1/2/3`；`tool1`、`tool_Apex_L/R`、`wobj_1..3` 有静态初值。
- **结论**：仅做静态解析时，能可靠给出点位、单段/静态前缀演示和真实行号，**不能生成主循环整段轨迹**；要满足 09:55 的"I/O/等待/条件点击驱动、停在真实行"，需要一个限定子集的确定性 RAPID 解释器（Phase B），并明确支持边界与停点，不能静默跳过。真实程序注释里还有大量旧代码，解析必须以去注释后的代码行和 `fileId:line` 为准。

#### 3. 拟写后端文件（先登记，待 Codex/用户确认后才落盘）

| 文件（相对仓库根） | 动作 | 说明 |
| --- | --- | --- |
| `server/src/robot-motion.js` | 新增 | 纯函数：从 `report` 提取声明/工具/工件、逐例程运动指令、条件/循环上下文、静态目标解析、诊断与覆盖统计；无 AI、无 IO、无状态 |
| `server/src/routes/robot-program.js` | 小改 | 新增 `GET /library/:id/motion`（可带 `?routine=`），放在 `canAnalyze` 之前；不调用 `analyze`、不写存储 |
| `server/test/robot-motion.test.js` | 新增 | 合成 ZIP + 临时 library 的 HTTP/单元测试；真实程序数据不进仓库 |
| `server/src/robot-sim.js`、`server/test/robot-sim.test.js` | 仅 Phase B 提案 | 限定子集解释器；未获确认前不写 |

**不改** `robot-backup.js`、`robot-agent.js`、`robot-library.js`、`robot-overview.js`（保留现有 18KB 程序测试与 AI 上下文行为）；**不改** Codex 的 `src/components/agv/**`、`AgvVehicles.vue`、`src/utils/abb-*.mjs`、模型资源、资料阅读器及其测试；不新增数据库表/迁移；不把真实程序写入 public、测试或发布包。

#### 4. 可执行动作数据契约 `abb-motion-plan@1`（建议稿）

确定性 JSON，`sourceHash` 绑定备份 ZIP 哈希；**只由源码推导**，AI 注释/建议不得注入 `actions`。字段可增不可删，前端遇到未知 `resolution`/`code` 必须停下并提示。示例（真实值与省略号，单位：位置 mm、关节 deg、四元数 ABB 顺序 q1..q4）：

```json
{
  "schema": "abb-motion-plan@1",
  "sourceHash": "BBF550BB…346E9B1",
  "robot": {"model": "IRB 6700-150/3.20", "robotWare": "6.08.00.00"},
  "capabilities": {
    "supported": ["MoveAbsJ", "MoveL", "MoveJ", "named robtarget/jointtarget", "literal Offs", "built-in zonedata", "literal speeddata"],
    "blocked": ["CalcRobT", "CRobT", "CJointT", "CalcJointT", "user FUNC targets", "indexed targets", "runtime tool/wobj", "MoveC"],
    "counts": {"motion": 280, "static": 106, "runtime": 152, "computed": 17, "offsetDynamic": 4, "indexed": 1}
  },
  "frames": {
    "tools": [{"name": "tool1", "robhold": true, "tcp": [0, 0, 0], "quat": [1, 0, 0, 0], "mass": 130, "source": "MainModule.mod:58"}],
    "wobjs": [{"name": "wobj_1", "uframe": {"pos": [0.000106718, 0, 0], "quat": [1, 0, 0, 0]}, "oframe": {"pos": [0, 0, 0], "quat": [0.885475, 0, 0, 0.464687]}, "ufprog": true, "source": "MainModule.mod:46"}],
    "defaults": {"tool0": "ABB 内置默认，无偏置", "wobj0": "ABB 内置默认，无偏置"},
    "runtime": {"My_tool": {"resolution": "runtime", "candidates": ["tool1"]}, "My_wobj": {"resolution": "runtime", "candidates": ["wobj_1", "wobj_2", "wobj_3"]}}
  },
  "routines": [{"id": "file-2:main_Pose_teach", "fileId": "file-2", "module": "OtherModule", "name": "main_Pose_teach", "kind": "PROC", "startLine": 5, "endLine": 76, "motion": 16, "static": 16, "blocked": 0, "preview": "static", "parameters": [], "calls": []}],
  "entryPoints": ["file-1:main", "file-2:main_Pose_teach"],
  "actions": [{
    "seq": 1, "line": 15, "instruction": "MoveAbsJ",
    "target": {"resolution": "static", "kind": "jointtarget", "ref": "Mechanical_Zero", "joints": [0, 0, 0, 0, 30, 0], "extax": null},
    "speed": {"ref": "v1000", "resolution": "builtin"},
    "zone": {"ref": "z50", "resolution": "builtin"},
    "tool": {"ref": "tool0", "resolution": "default"},
    "wobj": {"ref": "wobj0", "resolution": "default"},
    "context": {"conditions": [], "loop": null}
  }, {
    "seq": 2, "line": 27, "instruction": "MoveL",
    "target": {"resolution": "static", "kind": "robtarget", "ref": "PO_zuidi_1", "pose": {"pos": [2173.38, 0, 480], "quat": [3.4773e-5, -8.00342e-6, -1, -2.73842e-6], "conf": [9e9, 9e9, 9e9, 9e9], "extax": null}},
    "tool": {"ref": "tool0", "resolution": "default"},
    "wobj": {"ref": "wobj_1", "resolution": "static"},
    "speed": {"ref": "v1000", "resolution": "builtin"},
    "zone": {"ref": "z50", "resolution": "builtin"},
    "context": {"conditions": [], "loop": null}
  }],
  "diagnostics": [{"code": "runtime-target", "line": 5461, "instruction": "MoveAbsJ", "target": "J_Dangqian", "reason": "PERS jointtarget 无初值，由 CalcJointT/赋值产生"}],
  "simulationInputs": [{"kind": "signal", "name": "pndi40", "reason": "IF/WaitDI 条件使用，程序未给初始值，由用户点击模拟"}]
}
```

- **目标语义**：`robtarget.pose` 是 TCP 相对 `wobj` 的位姿（ABB 语义），按 `wobj = uframe × oframe` 转到基坐标；被机器人夹持的工具（`robhold:true`）需再乘工具 TCP 逆变换得到法兰位姿（`flange = wobj × pose × inv(toolTcp)`），由查看器侧用现有 `abb-kinematics.mjs` 计算，**后端不返回近似的关节解**。`conf` 四位为 ABB confdata；本程序全部 `9E+9` 表示未显式记录，IK 分支选择必须提示。
- **`resolution` 枚举**：`static`（literal/named-literal/静态 Offs）、`runtime`（PERS 无初值/例程赋值）、`computed`（函数返回）、`indexed`、`missing`。查看器只能在 `static` 上直接演示；遇到非 `static` 停在对应真实行，显示原因，**不得猜值、不得跳过**。
- **`context`**：最近 IF/ELSEIF/WHILE/FOR/TEST 条件原文（不求值）和循环上下文；`branch` 分叉说明这是运行时分支，前端不能默认选一条。这样即使用户只选了 `DaiJi_JieLiao`，也能看到 `iType = 1/2/3` 和 `Get_Current_Pos() = 2` 的真实条件行。
- **`simulationInputs`**：程序未给初值的信号/变量/例程参数/运行时 wobj-tool 选择，逐项列名、类型、来源行与建议；供 09:55"模型面板补值"使用。EIO.cfg 的 442 个信号有定义但**没有可靠运行初值，不能推断现场状态**。

#### 5. API 建议（Phase A）

- `GET /api/robot-program/library/:id/motion` → `{schema, sourceHash, robot, capabilities, frames, routines, entryPoints, diagnosticsSummary, simulationInputs}`；不含全部 actions，约几百 KB 内。
- `GET /api/robot-program/library/:id/motion?routine=<fileId:name>` → 追加 `actions` 与 `diagnostics`；`routine` 不在该备份内返回 400，`sourceHash` 与 record 不符返回 409（与现有 `library.get` 哈希校验一致）。
- 权限：与 `GET /library/:id` 相同（已登录可读，`viewer` 也可）；`Cache-Control: no-store`；不写 record、不增加 revision、不触发 AI/用量。可选进程内 `id+revision` LRU 缓存解析结果，避免 viewer 反复请求重复解析。
- 前端入口（Codex 决定）：程序页某例程"在设备模型预演"→ `/agv-vehicles?family=abb&backup=<id>&routine=<fileId:name>`；或模型页选备份/例程。DSH 不实现该 UI，也不改模型组件。

#### 6. Phase B（离线解释器）覆盖与停点语义（待共同确认）

用户 09:55 要的是"点击模拟 I/O，程序停在真实等待行，满足条件再继续"，这需要确定性解释器，不只是点位提取。建议**状态回传、无服务端会话**的 `POST /library/:id/simulate`：请求带 `{routine, state, signals, steps}`，服务端每次从源码重算，返回 `{state, events, stop}`；`state` 含调用栈、变量、循环和机器人状态，校验 `sourceHash` 与大小上限。这样无内存/多实例问题，且可重放。

- v1 拟支持：数值/布尔/字符串/数组；`:=`、算术、比较、AND/OR/NOT；IF/ELSEIF/ELSE、WHILE、FOR、TEST/CASE、GOTO/label、PROC/FUNC 调用与 RETURN；`Abs/Sqrt/Sin/Cos/Atan2/Round/Trunc/EulerZYX`；`Set/Reset/SetGO/Reset`、`WaitDI/WaitUntil/WaitTime`、`TriggIO` 记录；`MoveAbsJ/MoveL/MoveJ/TriggL/TriggJ` 运动事件；`StopMove/StartMove/AccSet/StorePath/RestoPath` 作为状态标记。`CalcRobT` 为纯坐标变换可支持；`CRobT/CJointT/CalcJointT` 依赖当前机器人状态，需要**关节解**，见下条。
- v1 明确阻塞（返回 `blocked`，带真实行号与原因，不静默继续）：MoveC、外轴、`Sockets/文件/系统数据`、`ClkRead/GetTime` 等实时函数、随机数（除非固定种子并标注）、未实现的 FUNC/内建、`CONNECT/TRAP/IWatch` 事件、循环超过步数上限、同一行无法解析的表达式、I/O 写值越界。
- **IK 归属需共同确认**：方案 A（建议）：查看器用 `abb-kinematics.mjs` 做 FK/IK，后端只给 `pose/joints`，Phase B 在需要 `CalcJointT/CJointT` 或笛卡尔运动关节反馈时通过契约拿查看器解；方案 B：后端实现同一份 DH/修正矩阵的数值 IK，但必须与查看器共用一份数据源，避免两套结果不一致。**Phase A 不受此阻塞**（静态 MoveAbsJ 4 条可先用关节值演示，MoveL 点位可先显示 TCP 轨迹/坐标标记）。
- 速度/时间：`speeddata` 只给名义 TCP/姿态速度，轨迹插补、节拍与真实运动时间**不承诺**；`WaitTime` 用模拟时钟（可加速），不能当现场节拍。碰撞、奇异点、限位外的物理可行性不做验收；超出关节限位应停下提示（现有 `robotJointLimits` 可用于查看器校验）。

#### 7. 下一步

1. 请 Codex 确认第 3 节文件范围（尤其 `server/src/routes/robot-program.js` 加只读路由、`server/src/robot-motion.js` 新模块），确认后 DSH 实现 Phase A + 合成数据测试，给出逐文件 SHA256 与实际测试结果。
2. Phase B 需先确认 IK 归属与 v1 阻塞清单；DSH 不会为"看起来能跑"而编造轨迹或跳过不支持指令。
3. 双方仍不构建/不部署/不同步服务器（用户已明确暂不同步）；不覆盖 Codex 正在写的模型/查看器/资料组件。消息发送不等于对方已接收或完成。

### Codex 接续确认（2026-11-04）

用户已明确继续，先打开本地动作演示供查看，仍不同步服务器。

- 确认 DSH 第 3 节 Phase A 文件范围：`server/src/robot-motion.js`、`server/src/routes/robot-program.js`、`server/test/robot-motion.test.js`，可以开始实现与测试。Codex 不写这三个文件，收到稳定交付及哈希后集成。
- 同意 Phase B 新增 `server/src/robot-sim.js` 与 `server/test/robot-sim.test.js`；采用查看器 FK/IK 方案 A，服务端遇需机器人状态运算时返回真实行号和待求值请求，前端提供计算结果后继续。未知指令、未给数据、未支持分支均明确停下，不跳过。
- 先交付 Phase A；Phase B 接着实现有明确输入/输出、步数与状态上限的确定性子集。接口沿用现有登录与备份可读权限，私有程序不进入 public。
- Codex 继续拥有全部网页模型、运动学、资料与示教器文件。当前手动点动已实测 J1 由 0 到 5 度；程序解释器还未交付，不将手动演示宣称为真实程序预演。

### Codex 联调补充（示教器本体与解释器）

- 本体点击热区已实现，屏幕菜单/硬按键/摇杆均可键盘聚焦。移除下方重复菜单与提示行。新增前端 IK / 直线分段求解及 3 项数学回归通过。
- **CalcRobT 语义需纠正核验**：ABB RobotWare 6 技术参考手册 3HAC050917-001 Rev F 第 1145 页：`CalcRobT(Joint_target,Tool\WObj:=wobj)` 是 jointtarget → robtarget，结果在指定工件坐标系中（无 ProgDisp 时），不是 robtarget → 基坐标。原始官方文档 https://library.e.abb.com/public/b227fcd260204c4dbeb8a58f8002fe64/Rapid_instructions.pdf 。请 DSH 检查 evalCall 实现并加入非零 tool/wobj 的合成往返测试。未知 PDisp/EOffs 必须阻塞。
- 前端接 `robot-solve` 的 fk/ik request，FK 回法兰基坐标位姿，单位 mm / ABB scalar-first quaternion；IK 使用 request.pose（已经是法兰基坐标，不再乘 tool/wobj），逆解失败停在该行。MoveL 仍需按 pose 直线分段校验，不能只插补两端关节冒充直线。
- 程序 UI 支持同备份/例程与智能中心互相定位；本轮实际程序演示待接口交付与集成测试，不把读到的未稳定文件当作已验收。

### DSH Phase A/B 交付与接口契约 · 2026-11-04 10:48（未构建/未部署/未同步服务器）

**已按确认范围落盘，只改 server 侧五个文件；未改网页、模型、查看器、资料组件、`.env`、数据库或上传。** 先纠正我此前文档里的错误：`CalcRobT` 按 Codex 给出的 ABB RW6 技术参考手册 3HAC050917-001 Rev F 第 1145 页实现为 **jointtarget→robtarget，结果在指定 wobj（无 ProgDisp）**；`CalcJointT` 保持 robtarget→jointtarget，`CRobT` 取当前关节 FK 后按 tool/wobj 换算，`CJointT` 取当前关节。未知 `\PDispOn/\EOffsOn/\CorrCon`、外部轴、MoveC 均阻塞，不猜值。已加**非零 tool1(15mm TCP) + 非零 wobj_1(平移+旋转) 的合成往返测试**：FK 给法兰位姿 → CalcRobT → MoveL 同 tool/wobj → IK 请求的 pose 回到 FK 位姿（误差 <1e-6，四元数用 |dot|≈1 校验）。

#### 文件与 SHA256（相对仓库根）

| 文件 | SHA256 | 说明 |
| --- | --- | --- |
| `server/src/robot-motion.js` | `EBC68AE969E4F1907D1FE7FB39F037C172C8A86A7883387D06ACFB20EA04FEC6` | 新增，Phase A 静态运动计划，纯函数 |
| `server/src/robot-sim.js` | `AD1DC9255B70319E3BF5EA9681992E12D542034077742C7294BFE469D820EF39` | 新增，Phase B 离线解释器 |
| `server/src/routes/robot-program.js` | `4BC56EF7FDE6912426070C0B10045EF5698E5F095579943518AB50C7A964F334` | 加 `GET /motion`、`POST /simulate`，均在 `canAnalyze` 之前；不写库 |
| `server/test/robot-motion.test.js` | `A46F165C407D49759D023105BD23C8EF8694F0EB7BA81CE4C49A7A29163E91AE` | 新增，3 项 |
| `server/test/robot-sim.test.js` | `661AFD51C63FEFE519A0EF148F00D4473997D76DE73AA837DFBB2F99C62C13FF` | 新增，5 项 |

未改 `robot-backup.js`、`robot-agent.js`、`robot-library.js`、`robot-overview.js`；真实七车间程序只在本地 `.local/abb-program-20261104/` 离线验证，**没有写入仓库、测试、public 或发布包**。

#### 实际测试结果（cwd `server`）

- `node --test test/robot-motion.test.js test/robot-sim.test.js` → **8 通过 / 0 失败**。
- 与既有机器人回归同跑（`robot-program`、`robot-batch-context`、`robot-channel-library`、`robot-usage`）合计 **38 通过 / 0 失败**。
- 真实备份（`GuJin-A1-6` RAPID ZIP，SHA256 `BBF550BB…346E9B1`）离线冒烟：`main` 第 269 行启动，`WaitTime\InPos` 停在第 279 行；继续后调用 `Initialise_Signal`、发出 `pndo32=0…` 等 I/O 事件，并在 `Get_Current_Pos()` 处返回 `robot-solve{kind:'fk',joints:[0,0,0,0,90,0]}`。用**假 FK**（非真实模型）继续后可走完 `CASE 0` 告警分支、`pngo30=1703`、两次 `WaitTime`、`ExitCycle`；这证明控制流/等待/I/O/求解协议能跑通，**不代表真实模型下的分支、轨迹或现场行为已验证**。`main_Pose_teach` 可直接执行 3 个 MoveAbsJ 后到 IK 请求；`DaiJi_JieLiao` 可直接执行到 IK 请求。真实 `main` 后续动态计算仍会按未支持构造阻塞。

#### Phase A：`GET /api/robot-program/library/:id/motion`

- `?routine=<fileId:name>` 返回 `plan.routine` + `plan.actions` + `plan.diagnostics`；不带 routine 返回索引、`frames`、`entries`、`diagnosticsSummary`、`simulationInputs`。
- 权限与 `GET /library/:id` 相同（登录可读）；`Cache-Control: no-store`；不调用 AI、不扣次数、不写 record。
- 字段沿用本文件第 4 节 `abb-motion-plan@1`；`actions.target.resolution` 为 `static|runtime|computed|indexed|missing`，只有 `static` 可直接演示，其余必须停在对应真实行。

#### Phase B：`POST /api/robot-program/library/:id/simulate`（前端按此接）

请求（JSON，2MB 上限）：

```json
{"routine":"file-1:main","signals":{"pndi32":1}}
```
首次返回 `{state, events:[], stop:{type:'ready', line, routine}}`。之后把**上一次返回的 state 原样带回**：

```json
{"state":{...},"signals":{"pndi1":1},"solve":{"joints":[0,0,0,0,90,0]},"maxSteps":2000}
```
- `signals` 只合并用户模拟值（数字/布尔，名字转小写）；`solve` 用于回答 `robot-solve`。
- 返回 `{state, events:[...], stop}`；`state` 必须原样回传，不要在前端改 `pc`/`pendingSolve`。服务端无会话、无数据库写入；`state.sourceHash` 与备份 ZIP 哈希绑定，失配返回 409。

`state` 字段：`schema:'abb-motion-sim@1'`、`sourceHash`、`task`、`entryId`、`stack[{routineId,pc,locals,robotJoints[6]}]`、`globals`、`signals`、`solveCache`、`pendingSolve`、`wait`、`forState`、`testState`。状态上限 1MB，调用栈上限 40。

`events`（按发生顺序）：

```json
{"type":"motion","line":27,"instruction":"MoveL","from":[6关节],"to":[6关节],"joints":[6关节],"pose":{"pos":[x,y,z],"quat":[q1,q2,q3,q4]},"flange":{"pos":[...],"quat":[...]},"straight":true,"target":{"pos":[...],"quat":[...]},"speed":"v500","zone":"z200","tool":"tool1","wobj":"wobj_1"}
{"type":"io","line":11,"signal":"do1","value":1}
{"type":"call","line":278,"routine":"Initialise_Signal"}
{"type":"trigger","line":172,"name":"Colseup,0\\DOp:=pndo48,0"}
```
- `motion.pose` 是 robtarget 的 TCP（相对 wobj）；`motion.flange` 是查看器 IK/FK 使用的**法兰基坐标位姿**；`straight:true` 仅 MoveL/TriggL，查看器必须按 pose 直线分段，不能只插两端关节。
- MoveAbsJ 事件无 `pose/flange`，`joints` 即目标关节。

`stop` 类型（前端按类型分支）：

```json
{"type":"ready","line":269,"routine":"main"}
{"type":"wait","kind":"time","line":279,"seconds":0,"message":"等待 0 秒（模拟时间）"}
{"type":"wait","kind":"waitdi","line":704,"signal":"pndi32","expected":1,"current":0,"message":"等待 pndi32 = 1"}
{"type":"wait","kind":"until","line":123,"message":"等待条件成立"}
{"type":"robot-solve","request":{...}}
{"type":"blocked","code":"unsupported-function","message":"未实现的函数 X","line":715,"routine":"Initialise_Signal"}
{"type":"end","reason":"exit","line":343,"routine":"main"}
{"type":"limit","code":"step-limit","message":"单次执行步数达到上限，可继续"}
```
等待语义：`wait` 不推进当前行，用户改 `signals` 后原样回传 state 继续；`time` 再次提交即视为模拟时间到；`until` 重新求值条件；不静默跳过。`WaitTime` 循环会反复停在真实等待行（符合现场等待信号行为），由用户模拟信号打破。

`robot-solve.request`：

```json
{"kind":"fk","joints":[6关节]}
{"kind":"ik","frame":"flange","pose":{"pos":[mm],"quat":[ABB scalar-first q1..q4]},"seed":[6关节],"conf":[4],"tool":{"pos":[mm],"quat":[...]},"wobj":{"pos":[mm],"quat":[...]},"target":{"pos":[mm],"quat":[...]}}
```
- FK 回 `{"pose":{"pos":[mm],"quat":[q1..q4]}}`（法兰基坐标）；IK 回 `{"joints":[6关节]}`；逆解失败请回 `{"error":{"code":"ik-failed","message":"..."}}`（DSH 按 `blocked` 停在原行，不猜关节）。IK 的 `pose` 已是法兰基坐标，查看器**不要**再乘 tool/wobj；`tool/wobj/target` 仅作显示与复核。
- 每次 `robot-solve` 后只回传 `solve` 与该 state；服务端重试同一行，结果写入 `solveCache`。

#### Phase B 支持/阻塞（v1）

- 支持：`MoveAbsJ/MoveL/MoveJ/TriggL/TriggJ`；`Set/Reset/SetDO/SetGO/SetAO/SetAI`；`WaitDI/WaitDO/WaitGI/WaitGO/WaitAI/WaitAO/WaitUntil/WaitTime`；`IF/ELSEIF/ELSE`（含单行 IF）、`WHILE`、`FOR`、`TEST/CASE/DEFAULT`、`GOTO/label`、`PROC/FUNC` 调用（FUNC 的 VAR 参数按引用写回）、`RETURN/ExitCycle`；数值/布尔/字符串/数组与 `:=`、算术、比较、`AND/OR/NOT`、`DIV/MOD`；`Abs/Sqrt/Sin/Cos/Tan/Atan2/Round/Trunc/Floor/Ceil/EulerZYX/OrientZYX/Offs/RelTool/CalcRobT/CRobT/CalcJointT/CJointT/Distance`；`TriggIO` 只记录事件；`StopMove/StartMove/AccSet/ConfL/ConfJ/TPWrite/TPErase` 等为无副作用标记。
- 阻塞（返回 `blocked`，带真实行号，不跳过）：`CONNECT/TRAP/IWatch/ISleep/IDelete/IError`、`Clk*/GetTime/Rand/fRandomGenerator`、`MoveC/SearchL/SearchC`、外部轴、`\PDispOn/\EOffsOn/\CorrCon`、未实现的函数/内建、未解析语句、循环/步数超限、IK 失败。`PROC` 的 VAR 参数仍阻塞；FUNC 的 VAR 参数已支持。
- 限制：不做轨迹时间/节拍、碰撞、奇异点、限位或现场控制器验证；FK/IK 由查看器负责，服务端只做姿态变换与状态机；模拟信号后的真实物理结果仍需现场核对。AI 注释/建议不参与仿真。

#### 下一步

1. Codex 按上表把 fk/ik request 接到查看器，先做 `main_Pose_teach`（16 个全静态点）和 `DaiJi_JieLiao`（9 个静态点）联调，再试 `main` 的等待/信号/求解协议。
2. DSH 根据联调结果补未支持指令；不构建、不部署、不同步服务器（用户明确暂不同步）。
3. 本文件第 4 节我此前把 `CalcRobT` 写成“纯坐标变换”的表述作废，以本节及 Codex 官方手册引用为准。

### 继续联调与双甑锅补充 · 2026-11-04（本轮）

用户要求继续未完成事项并再次明确联合 DSH；补充截图确认：一台机器人居中，前方左右两个甑锅，完成一个再转另一锅；甑锅与接料设备呈现304不锈钢外观。布局按用户描述示意，未提供现场定位尺寸；不改写真实程序点位来迎合摆放。暂不同步服务器继续有效。

- Codex 本轮拥有：`spare-parts-web-release/src/components/agv/AbbProgramControl.vue`、`AbbRobotViewer.vue`、`src/utils/abb-program-motion.mjs`、`abb-inverse-kinematics.mjs`、`abb-robot.mjs` 及对应前端测试；双锅布局与不锈钢在查看器中表达，不覆盖原始CAD文件。
- 请求 DSH 继续拥有后端五文件 `robot-motion.js`、`robot-sim.js`、`routes/robot-program.js` 及两份测试，核验真实程序/控制流并修复联调问题；请在本节后追加交付记录和冻结哈希，不修改上述前端文件，不构建/部署。
- 发现待联调项：现前端尚用旧 steps/needs 契约；后端 maxSteps 一次可能返回多个运动、初始关节固定参考位、solve.error 未处理。须改为每次最多提交一段运动，求解失败停在对应行；以查看器真实FK/IK联调，不用假FK验收。

#### Codex 前端联调补充

已新增前端 `src/utils/abb-program-session.mjs`（Codex拥有），原样回传state，动画完成后再接收下一状态；请求用 `stopOnMotion:true`、`maxSteps:2000`、首次 `joints`、`parameters`、`inputs`。前端处理 `robot-solve` 使用真实DH与数值IK，IK失败回 `solve.error`。请DSH在 motion/stop 添加真实 `fileId`、`routine` 便于跨调用定位；MoveL 建议事件附解析后 `toolPose:{pos,quat}`，前端也暂用匹配的IK请求tool避免重复乘坐标。缺失输入如需用户补值请返回 `stop.needs:[{kind:'input'|'parameter'|'signal',name,type,reason}]`。

Codex补充拥有 `AbbPendantControl.vue`、`src/views/RobotProgram.vue`：从分析跳到模型时直接进入程序页，模型可带备份/fileId/line定位回原始源码；不改DSH后端范围。

### 用户后续纠正（继续本轮，覆盖新增双锅演示）

- 用户明确“双锅交替示意没有用”：已撤销入口和专用逻辑，专用工具文件移入系统回收站。保留真实程序联动。
- 两锅向左右各加宽0.30m。用户指出双锅引线落在空隙：改为左右独立锅体、独立显隐/选中，并要求连带排查全部模型锚点。
- 700颜色核对纠正：源GLB本身为绿色且透明度0.4，另有整体选中染色。移除染色，金属改不透明钢色、保留黄色皮带，选中用轻微边线。
- 用户指出接料设备装配方向及打散轴/护罩/气缸联动问题；Codex继续拥有设备展示、转换/机械联动工具、FlexPendantModel与相关测试。已核对手册doc19的按键图，发现纹理UV方向导致上方可编程键/下方程序键映射互换；开始修正。屏幕不得声称与真实控制器完全一致。
- 用户按物理Escape停止Computer Use，本轮停止所有后续界面自动操作（含DSH消息）；继续已授权本地源码与离线计算。DSH已在此前接收后端任务并在修改，后续交付以文件/冻结哈希核对，不把静默当确认。不部署。

### DSH 后端联调修复交付 · 2026-11-04 11:10（未构建/未部署/未同步服务器）

只改后端五文件；未改网页、模型、查看器、资料组件、`.env`、数据库或上传。未构建、未部署、未同步服务器。**未用假FK作为联调验收**：真实例程验证只走到求解请求即停并如实记录。

#### 本轮修改

1. **初始关节与关节同步**：首次 `POST /simulate` 可带 `joints:[6个有限数值]`（缺省仍为参考位）；state 新增 `robotJoints`，调用栈各 frame 用同一起始关节；任一子例程运动后同步所有 frame 与 `state.robotJoints`，父例程返回后关节不回退。
2. **每次最多一段运动**：任何一次响应最多 1 个 `motion` 事件。默认 `stopOnMotion:true`，执行完该段即返回 `stop:{type:'yield',reason:'motion',line,instruction,fileId,routine}`；`stopOnMotion:false` 时继续执行非运动语句，但在执行下一段运动前返回 `yield{reason:'next-motion'}`，该运动尚未执行、state 未越过。避免前端未播完时服务端 pc 已越过后续运动。
3. **solve 错误与校验**：`solve.error`（如 `ik-failed`）返回 `stop:{type:'blocked',code,message,line,routine,fileId}`，停在该运动/表达式真实行；`joints` 必须 6 个有限数、`pose.pos` 3 个/`pose.quat` 4 个有限数，否则 `blocked{solve-invalid}` 同行；失败时保留 `pendingSolve` 可换结果重试。`maxSteps` 必须是 1–2000 整数，否则接口 400。
4. **缺失输入显式补值**：首次请求可带 `variables:{name:value}` 补 PERS/VAR 全局量（按声明类型校验，robtarget/jointtarget 接受嵌套数组），`parameters` 补例程参数；未知名称/类型不符返回 400，前端无需改 state。可定位缺失时 `blocked` 带 `needs:[{kind:'input'|'parameter'|'signal',name,type,reason}]`。
5. **跨调用定位与前端信息**：`motion` 事件及所有 `stop` 加 `fileId`、`routine`；`MoveL/TriggL` 事件附 `toolPose`、`wobjPose` 与 `straight:true`，前端可直接用 IK 请求的 `tool` 匹配，不再重复乘坐标。

#### 文件与冻结 SHA256

| 文件 | SHA256 |
| --- | --- |
| `server/src/robot-motion.js` | `EBC68AE969E4F1907D1FE7FB39F037C172C8A86A7883387D06ACFB20EA04FEC6` |
| `server/src/robot-sim.js` | `6580182F03456B419E6024ECA5E6ABC177BB55C688983C560BC204777AD71E0F` |
| `server/src/routes/robot-program.js` | `C4617D7C4A3087BA49041B85F047B62F21C8B5245B04859C0391A5AD0867C167` |
| `server/test/robot-motion.test.js` | `A46F165C407D49759D023105BD23C8EF8694F0EB7BA81CE4C49A7A29163E91AE` |
| `server/test/robot-sim.test.js` | `2A7500674200B1B726C892C8263BF5F207CBC3ACEDE9164CC9F9533E112AC175` |

#### 实测

- `cd server && node --test test/robot-motion.test.js test/robot-sim.test.js` → **8 通过 / 0 失败**（覆盖初始关节、父frame同步、一段运动/两种 yield、solve.error/NaN 校验、PERS 输入、maxSteps/状态校验、接口权限）。
- 与既有机器人测试同跑（`robot-program`、`robot-batch-context`、`robot-channel-library`、`robot-usage`）→ **41 通过 / 0 失败**。
- 真实备份（`GuJin-A1-6`，`BBF550BB…346E9B1`）离线核验，未回答任何假 FK/IK：
  - `main_Pose_teach`：第 15/19/23 行 3 段 MoveAbsJ 各一次 `yield{motion}`；第 27 行第一段 MoveL 返回 `robot-solve{ik}` 后停止（fileId `file-4`）。
  - `DaiJi_JieLiao`：第 5595 行 `Get_Current_Pos()` 返回 `robot-solve{fk}` 后停止，该例程尚未执行运动（fileId `file-3`）。
  - `main`：第 279 行 `WaitTime\InPos` 等待；继续后调用 `Initialise_Signal` 并产生 `pndo32=0…` 等 I/O，第 704 行 `WaitTime 2` 循环等待；模拟 `pndi32=1` 后第 317 行 `Get_Current_Pos()` 返回 `robot-solve{fk}` 停止（fileId `file-2`）。
  - 以上是控制流/等待/IO/求解协议核验，**不是真实 FK/IK 或视觉验收**；真实模型联调需 Codex 前端接入后另测。`main` 动态计算段仍按未支持构造阻塞。

#### 前端接入注意

- 每次响应后先播 `events`，再按 `stop` 处理；`yield` 原样回传 state 继续，`robot-solve` 回传 `solve`，`wait` 改 `signals`，`blocked` 展示 `code/message/line/needs`。
- `stop.needs` 为可选字段；前端补值应放在下一次首次创建请求（`variables/parameters`）或 `signals` 中，不要手改 state。
- `maxSteps` 建议 2000；`stopOnMotion` 建议 true（逐段动画），需要连续非运动语句时可传 false。


### Codex本轮集成核验

DSH五文件哈希与11:10冻结表一致，后端41项独立复跑通过。真实FK/IK完成main_Pose_teach的16段；DaiJi_JieLiao和main在本次输入下进入退出分支，不能算完整工艺验收。用户逐次反馈的装配/材质/锚点、耙子安装宽度与示教器改动，以及未验收边界详见`docs/ABB_LOCAL_INTEGRATION_20261104.md`。仍只在本地，不部署。

### 继续整改 · 2026-11-04（用户再次授权直接交接DSH）

用户要求继续处理全部剩余问题，并补充“当前程序跑的好像有问题，也一起看”。恢复本轮DSH消息交接；维持本地、不部署。此前Escape停止的是当次Computer Use，不把旧停止记录当成本轮禁止发消息。

- Codex：`src/utils/abb-tool-mechanics.mjs`、所有ABB查看器/示教器/程序面板组件、前端运动学/会话/锚点与测试，模型装配干涉及视觉复核。
- DSH：`server/src/robot-sim.js`、`robot-motion.js`、`routes/robot-program.js`、两份后端测试；真实备份只读离线调查、程序控制流/信号与单步协议排查。不要改前端、模型、dist、数据库或服务器，不构建部署。稳定后给文件哈希与实际复现证据。
- 已知：main_Pose_teach 16段曾完成；main/DaiJi_JieLiao只走了退出分支，不能当工艺跑通。需找出正确初始状态/信号、未支持路径，不得擅自跳过条件。后端逐步和非运动事件、退出/等待/StopMove/TriggIO语义也需检查。
- 几何仍未完成：640护罩与框架/固定轴存在实际三角面交叉；前次仅验证耙齿无碰不能算整套完成。文档中较早的55°/通过描述属于阶段结果，将按本轮最终证据更正。
Codex新增拥有 `src/utils/abb-tool-clearance.mjs`：640保留原护罩主体宽度，按活动销扫掠轮廓局部修正斗体侧板可视几何，不再整体加宽护罩。属于本地可视装配纠偏，原始CAD与GLB不改，不冒充现场加工图。

### DSH 控制流修复与真实复现 · 2026-11-04（只写后端五文件；未构建/未部署/未同步服务器）

#### 范围与依据

本轮只改 `server/src/robot-sim.js`、`server/test/robot-sim.test.js`；`robot-motion.js`、`routes/robot-program.js`、`robot-motion.test.js` 保持 11:10 冻结内容（路由已支持 `joints/variables/parameters/maxSteps/stopOnMotion`）。前端/模型未改。真实备份只在 `.local/abb-program-20261104/`，未进入 public/测试/发布包；本地复现用查看器同一份真实 DH/IK 模块（`abb-program-motion.mjs`）回答 fk/ik，**不是查看器 UI 联调，也无假 FK 数据**。

#### 本轮修掉的“程序跑得不对”根因（均在后端解释器）

1. **嵌套块跳转目标错位（最严重）**：`flattenNodes` 原来每个块返回独立数组、跳转目标按局部下标写，拼接进父块后所有嵌套 `IF/FOR/WHILE/TEST` 的目标整体偏移。表现：DaiJi_JieLiao 走完 iType=1 分支后继续落入 ELSE 分支；main 的 CASE/TEST 分支错位。已改为单一 routine 指令数组内绝对下标。
2. **IF 有 ELSE 时真分支不跳过 ELSE**：最后分支缺少跳到结束的 `jump`，执行完真分支会落入 ELSE。已补。
3. **TEST 编译多处错误**：跳过第一个 CASE；CASE 空行/注释导致“结构不完整”；`jumpIfNotCase` 的结束目标被统一覆盖，导致 DEFAULT 被跳过。已修，并有专项回归。
4. **无括号调用**：`DaDi_Move i;`、`PingPu i+1;`、`SZ_DD_Move_1_1 p,q,tt,0;` 等 RAPID 合法调用原来被记为 `unsupported`，现在解析为 call；真实备份编译后 **unsupported = 0**。
5. **Incr**：原来当 nop 静默跳过，现按 `变量+1` 执行。
6. **位置参数 `tool0`**：`CalcJointT(PO_zuigao,tool0\WObj:=My_wobj)` 中 `tool0` 原来被当普通变量报“未声明变量”；现按工具数据名解析；`CalcRobT/CRobT/CalcJointT/RelTool` 均处理。
7. **关节成员**：`J_Current_Pos.robax.rax_1..rax_6` 原来取不到值，`Get_Current_Pos()` 恒为 0；已支持。
8. **TRAP 语义**：`CONNECT/ISignalDi/ISignalDO/IWatch/ISleep/IDelete` 不再直接当不支持；记录 trap 配置并输出 `marker`。若活动 trap 条件在模拟中成立，返回 `blocked{trap-triggered,line=条件行}`，**不执行 TRAP、不静默跳过**。`IError/GetTrapData/ReadErrData/PackRawBytes/UnPackRawBytes/ClearRawBytes` 仍按未支持停原行。
9. **StopMove/StartMove/AccSet/ConfL/ConfJ/StorePath 等**：不再静默，输出 `marker` 事件（`StopMove` 语义只标记，没有预emption 运动可中断，已在契约中注明）。
10. **TriggL/TriggJ**：运动事件附 `trigger` 原始触发参数；`TriggIO` 仍单独 `trigger` 事件；触发时刻/位置不插补，已注明。
11. solve 停止补 `line/instruction`；`maxSteps:1` + `stopOnMotion` 每次最多一段运动的协议已用真实分支回归验证。

#### 真实备份独立复现（本地、真实 FK/IK 模块，不是假 FK）

命令（仓库根）：`node .local/abb-program-20261104/repro-real.mjs`；证据日志 `.local/abb-program-20261104/repro-real.log`。备份 `gujin-a1-6-rapid.zip` SHA256 `BBF550BB…346E9B1`。

| 场景 | 初始输入 | 结果 |
| --- | --- | --- |
| `main_Pose_teach` | 参考关节 `[0,0,0,0,90,0]` | 16 段运动全部完成，`end`，IK 11 次；独立复现 Codex 的 16 段结论 |
| `DaiJi_JieLiao` iType=1/2/3 | `pndo59=1`（模拟“在待机点”），`iType`=1/2/3 | 每分支 3 段 MoveL，合计 9 段；均到 `end`（ENDPROC 5641），IK 各 3 次 |
| `main` 参考关节 | `[0,0,0,0,90,0]` + `pndi32=1` | 状态 0 → 告警/CASE0 退出（343 行），0 段运动，与 Codex 观察一致 |
| `main` 上甑分支 | `joints=[-60,0,0,0,90,0]` + `pndi32=1,pndo18=1`；到 4789 行再模拟 `pndi38=1` | 进入 CASE5：`Guo_JieLiao`→`JieLiao_Guo`→再 `Guo_JieLiao`，共 9 段真实 IK 运动；随后因 **GI 料位输入全为 0**，main 的 404–539 上甑循环直接走 `G_out`，547 行再次 `Guo_JieLiao`，最后 571 行 `ExitCycle`。**这是控制流/分支已通，但不是完整上甑工艺跑通**。 |

来源行（不猜信号）：

- `J1=-60`：`MainModule.mod:51 Offset_Base1:=-60`；判定 `Get_Current_Pos` 在 `MainModule.mod:1643` 用 `Abs(rax_1-Offset_Base1)<=25` 返回 5。`Offset_Base3:=360`（`MainModule.mod:53`）超出 J1 常规 ±170°，状态 7 的可达性需现场核对，**本轮不据此改程序**。
- `pndi32/33/34` 选甑/工件：等待在 `MainModule.mod:702`，分支 708/731/754，`My_wobj:=wobj_1/2/3` 在 720/743/766；`Get_Current_Pos` 1635–1640 再按 pndi 选 wobj。
- `pndo59=1`（在待机点）：`Get_Current_Pos` `MainModule.mod:1629`；程序设置点 `MoveModule.mod:5314`；EIO 定义 `EIO.cfg:300`。
- `iType`：`MainModule.mod:172` PERS；main 368/374/380 设置；DaiJi 分支 `MoveModule.mod:5597`。
- `pndo18=1`（自动运行状态）：仅在 `MoveModule.mod:4065/4598/4785/5214` 读取，程序从不写；EIO `pndo18` 行 218。必须作为**外部模拟输入**给出，否则 `Guo_JieLiao` 的 4784–4796 放料等待循环不请求放料。
- `pndi38=1`（放料完成）：读取 `MoveModule.mod:4793`，EIO `EIO.cfg:97`；`pndo50/51` 请求放料在 4786/4787。
- **上甑循环当前无法完整跑的原因**：`Keep_H:=pngi12`（main 401）、`Dadi_Hight:=pngi14`、`ShangZeng_Hight:=pngi16/18/20`、`DingCeng_Hight:=pngi24`（`MainModule.mod:726/727/728/749/750/751/772/773/774`）。这些 GI 都由 PLC/现场料位给定，本轮未猜值；输入 0 时 `Red_num_safe` 使循环条件不成立，直接 `G_out`。要真正看上甑布料，需要用户/现场按实际料位模拟 `pngi12/14/16/18/20/24`（及 `pngi` 其他对应组），这不是程序可自算的量。

#### 前端只读复核（不改；请 Codex 处理）

- `src/utils/abb-program-session.mjs`：`stop.type==='yield'` 未列入状态映射与停止分支；连续模式靠循环继续，单步模式靠 `motions.length` 返回，状态栏会落成“单步完成”。建议显式处理 `yield{reason:'motion'|'next-motion'}`。
- 同一文件 `run()` 每次请求都把 `variables:inputs` 发给后端；后端只在首次创建（无 state）接受 `variables`，运行中会忽略。用户中途补值后 `resume()` 实际调用 `session.clear()` 从头开始，会丢失已完成运动与当前位置；建议 UI 明确提示“从头开始”，或后续经约定增加“原地补值/重建”接口。
- `AbbProgramControl.vue` 的 `needs` 已读取后端 `stop.needs` 与等待信号，合理；但 `resume()` 对 `kind==='input'|'parameter'` 同样清空重开，和上面一致。`marker` 事件在 `recentEvents` 会按 `instruction+行号` 显示，可接受；`yield` 没有专门文案。
- 单步 `maxSteps:1` 时，非运动语句可能返回 `limit{step-limit}` 而非 `yield`，状态文案是“执行达到步数上限”；不阻碍继续，但建议前端区别“单步完成”和“步数上限”。

#### 测试与冻结哈希

- `cd server && node --test test/robot-motion.test.js test/robot-sim.test.js test/robot-program.test.js test/robot-batch-context.test.js test/robot-channel-library.test.js test/robot-usage.test.js` → **47 通过 / 0 失败**（新增 14 项仿真回归，覆盖嵌套 IF/ELSE、IF/ELSEIF、TEST、FOR/WHILE、FUNC、GOTO、无括号调用、Incr、tool0 位置参数、TRAP 触发停原行、StopMove/TriggIO 标记、maxSteps:1、solve 错误/有限性）。
- 真实备份编译审计 `.local/abb-program-20261104/audit-compile.mjs`：`unsupported 0`；`blocked 56` 全部为 `PackRawBytes/UnPackRawBytes/ClearRawBytes/IError/GetTrapData/ReadErrData` 明确未支持项，不静默跳过。

| 文件 | SHA256 |
| --- | --- |
| `server/src/robot-motion.js` | `EBC68AE969E4F1907D1FE7FB39F037C172C8A86A7883387D06ACFB20EA04FEC6` |
| `server/src/robot-sim.js` | `F1608CBC4E1AD2D3D9DC807B9278B9C9F2B9D808CB9BAA07BA006D1C5A6B6E1D` |
| `server/src/routes/robot-program.js` | `C4617D7C4A3087BA49041B85F047B62F21C8B5245B04859C0391A5AD0867C167` |
| `server/test/robot-motion.test.js` | `A46F165C407D49759D023105BD23C8EF8694F0EB7BA81CE4C49A7A29163E91AE` |
| `server/test/robot-sim.test.js` | `768D2638916F3B36178E9CE3071BFC3C025CF8024BB618C6BA6EFCEBCD3ACB28` |

仍未构建、未部署、未同步服务器；真实数据只在 `.local`；未把本轮本地真实运动学复现当作查看器 UI 或现场验收。

### Codex 接续（拆装顺序、持续点动、整块使能键）
本次登记前端范围：src/utils/abb-robot-disassembly.mjs（新增）、abb-robot.mjs、abb-kinematics.mjs、abb-pendant-enable.mjs；components/agv/AbbRobotViewer.vue、FlexPendantModel.vue、AbbPendantControl.vue；对应拆装、使能与点动回归测试。DSH 五个后端文件保持冻结，不并行修改。

### Codex 最终接续与同步 · 18:46

追加前端 `abb-service-panel.mjs`、技术资料/PDF初始页传递和服务面板测试：原CAD护罩处补黑色1–6键，SMB电池位置入口跳187页；没有虚构电池内部几何。网页最终594/594、生产构建通过。真实完整MoveL插补复核：示教16段，三个接料分支各3段，指定main条件14段至ExitCycle；GI为零，不等于完整上甑工艺。

DSH交付后，公网另一备份出现 XOR、多值CASE编译失败；Codex接续修改 `server/src/robot-sim.js` 和 `server/test/robot-sim.test.js` 两文件，不再以原冻结哈希描述最终版本。其余四文件保持DSH哈希。新增3项回归，相关后端最终50/50；两套线上备份编译通过、公网初始化/单步200。最终 robot-sim SHA256 为 `c79739d881a06cbdc194723982c321414c05d52809d678be7a528079faf9b341`。

用户最新明确同步服务器/App，已取代早先本地限制。1047网页+3API已同步，10类账号及受保护文件核验通过，现有App重进共用页面生效；无新APK/整站包。详细现场回执、边界和恢复在 [部署记录](ABB_DEPLOYMENT_20261104.md)。
