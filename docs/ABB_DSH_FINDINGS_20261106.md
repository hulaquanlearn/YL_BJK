# ABB 锅内运动速度与左右甑合盖 · DSH 只读排查结论（2026-11-06）

范围：V1.9.10，`D:\wx_xiangm\xiangmu`。本轮 DSH 仅只读排查，**未修改任何共享源码/配置、未部署、未重启服务**；本文件是 DSH 唯一落盘产物。Codex 负责的 `spare-parts-web-release/src/components/agv/AbbRobotViewer.vue`、`AbbRobotGuide.vue`、`src/utils/abb-service-panel.mjs`、`model-click-pan.mjs` 及其测试未被 DSH 改动。

快照与并发改动提醒：
- 网页源码：`abb-program-motion.mjs` 11-05 19:17、`abb-program-session.mjs` 11-05 16:05、`abb-program-display.mjs` 11-05 22:38（均早于本轮，测量与现行一致）；`AbbRobotViewer.vue` 11-06 10:59（13:04 已部署，含逐甑合盖改动）。
- 真实备份（只读）：`.local/abb-flow-20261105/report.json`，来源 `酿酒机器人.zip`，sha256 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad`，RobotWare 6.15.02.00，14 模块/82 例程/117 信号（受保护 `BaseMod.mod` 无正文）。用户截图 `等待 0.01 秒（模拟时间） BuJiu.mod · 第 473 行 WaitTime 0.01;` 与本备份 `BuJiu.mod:473` 完全对应，可作“线上播的就是这份备份”的旁证。
- **并发改动（非 DSH）**：本地 `server/src/robot-sim.js` 在 13:13:04（+294B）和 13:18:54（+99B）被其他人改动，现 84591B；新增逻辑在运动完成时把 `state.solveCache` 只留最近 16 条（`robot-sim.js:977-984`）。DSH 全程只读、未改该文件。**线上部署版仍是 84198B / Nov 6 01:56（经 SSH 只读核对），不含此改动。** 请 Codex 确认归属并补测试后再上线。

---

## 一、结论速览

1. **“昨天限制下方程序展示跳动”不是锅内变慢的原因。** `createProgramDisplay`（`AbbRobotViewer.vue:64-65` → `abb-program-display.mjs:4-19`）只把页脚文字最多 1s 发布一次、过滤“运动段完成/已到下一段运动前/正在计算下一段运动”，不做任何 `await`、不接入解释器/运动链；它只会让页脚停在 `等待 0.01 秒` 的旧快照上，造成“卡住”的观感。昨天性能补丁改的是 rAF 帧上限（只加快），`AbbProgramControl.vue` 只改 `shallowRef` 等性能项（已 diff 核对 `.local/abb-performance-20261106/before/`）。
2. **主因（架构）：每段运动固定 2 次串行 HTTP 往返，且每个 `WaitTime 0.01` 各占一次请求。** 120mm 左甑全流程实测 1391 段运动、**3720 次请求**（1391 段运动各 1 次 + 1389 次 robot-solve 中间请求 + 938 次 Wait 停点 + 初始化）；每段运动前服务端先返回 `stop.type='robot-solve'`（IK 在浏览器做，`abb-program-session.mjs:48-50`），客户端解算后再请求一次才拿到运动。800mm 左甑实测 8622 段运动、**22628 次请求**（其中 Wait 停点 5384 次，0.01s 的 4244 次）。
3. **放大器（本次新增实测）：每次请求携带并回传完整仿真状态，部署版最大约 795KB。** 状态包含 `solveCache`（部署版最多 600 条，约 596KB）、`globals`（约 177KB，含 `stime/stime1/stime11` 等 1000 元素数组）、`cell`（约 16.5KB）。实测一份真实请求体（800mm 第 20000 次请求，`.local/abb-flow-20261105/infrared-checkpoint-left.json`）的 `state` JSON 为 **794,453 字符**。**请求体（浏览器→服务器）不压缩**；响应 JSON 由 nginx gzip（`nginx.conf:151-157` 含 `application/json`）压缩。本地 13:13/13:18 的未部署改动把它降到约 213KB，但线上没有。
4. **RTT 实测 42–58ms（本机→`czsdsg.cn` 暖连接；ICMP 41–44ms），不是唯一成本但在“短段”上摊薄得最厉害**：锅内布料段动画仅 37–68ms，而端到端要等 2 次请求；长过渡段(1–2s) 则看不出来，所以视觉上是“过渡正常、进锅后一格一格挪”。
5. **源 speeddata/VelSet/timedMotion 均不是原因。** `vCycleSpd_bu` 默认 `[1000,1000,2000,500]`（`ModData.mod:110`），运行期按红外区域设 500–1300 mm/s（`fenqu.mod:2387-2595` 等）；进出锅 `vWorkSpd1=[5000,1500,200,500]`（`ModData.mod:103`）；仅 2 处 `VelSet` 且都是 100% 覆盖（`HYbaojing.mod:206 VelSet 100,5000`、`ModMain.mod:479 VelSet 100,4000`）；`MoveC` 源码为 0。用现行 `timedMotion` 复算：布料 pass 68.2ms vs 距离÷v_tcp 68.4ms（`z20` 连续、peak=1），一致；只有半径 70mm 的 pass 由 J6 190°/s 轴限降到 26.3ms（真机同样受此约束，不是误限）。

---

## 二、真实备份核对（实测）

### 2.1 指令与速度数据（`.local/dsh-scan/count.cjs`，只读扫描）

| 项 | 结果 |
|---|---|
| MoveL | 177（BuJiu.mod 20、yuanxin.mod 48、ModTeach.mod 44、StartPoint.mod 23、ModMain.mod 16 …） |
| MoveAbsJ / MoveJ | 22 / 13 |
| **MoveC** | **0**（源码未使用） |
| TriggL/TriggJ | 可读模块 0（受保护 BaseMod 正文不可读，其内部触发指令不计） |
| VelSet | 2 处：`HYbaojing.mod:206 VelSet 100,5000;`、`ModMain.mod:479 VelSet 100,4000;`（override=100%，maxTcp 4000/5000，高于 programmed 500–1300，不降速） |
| speeddata 声明 | 12 个（`ModData.mod:100-111,474`） |
| 锅内布料 | `BuJiu.mod` `JS_jiuzao` 418-470（zhengfan 两向），末端 `472-474` `FOR D ... WaitTime 0.01`；`AccSet 100,70`（370）、`ACCS:=50`（637） |
| 锅内速度 | `vCycleSpd_bu`（`ModData.mod:110`）默认 1000/1000；运行期 500–1300 mm/s 按红外区域（`fenqu.mod:2387-2595` 等） |
| 进出锅 | `vWorkSpd1`（`ModData.mod:103`）5000/1500，`fine`，见 `BuJiu.mod:423/449/488/524` |

### 2.2 离线实跑：真实备份 + 现行 server 解释器 + 现行 web 时长公式

脚本 `.local/dsh-scan/measure-motion.cjs`（只读加载真实备份，不写产品源码）。左甑：

| 目标高度 | 段数 | 接料 | 动画总时长 | 结果 |
|---|---|---|---|---|
| 40 mm | 559 | 2 | 53.5 s | complete |
| 120 mm | 1391 | 6 | 141.4 s | complete |
| 800 mm（另一路独立插桩，旧码基线） | 8622 | 37 | 800 s（13.3 min @100%/1×） | complete |

> 注意：历史文档中“800mm 离线约 78s”是**无动画、无网络**的模拟器耗时（`run.cjs` 加速版），不能当作浏览器 1× 播放速度的基准。

代表段（复算时长）：

| 位置 | 指令/速度 | 实测平均 | 有效 TCP 速度 | 说明 |
|---|---|---|---|---|
| `BuJiu.mod:433` 锅内布料 | MoveL z20 `vCycleSpd_bu` tcp=900 | 33.5 mm / 44.9 ms（964 段） | 746 mm/s | 部分段被六轴上限约束，源值 900 |
| `HYbaojing.mod:324` 红外补料 | MoveL z20 `vCycleSpd_HY` tcp=1200 | 60.2 mm / 50.2 ms（220 段） | **1199 mm/s** | 与源值一致 |
| `yuanxin.mod:349` 料面探测 | MoveL z20 `vWorkSpd_QS1` tcp=1500 | 109.4 mm / 73 ms（75 段） | **1499 mm/s** | 与源值一致 |
| `BuJiu.mod:423` 出锅入口 | MoveL `fine` `vWorkSpd1` tcp=5000 | 150 mm / 84.5 ms | 1775 mm/s | fine 段由轴上限/姿态主导 |

结论：**锅内每段本身没有被拖慢到失真**；`timedMotion` 的 TCP 项与源 speeddata 对齐（z20 连续段），轴上限导致的局部降速属运动学应有行为。

---

## 三、逐段请求耗时与状态载荷（实测 + 模型）

### 3.1 实测

1. **服务端解释器单请求（同进程直接 `advanceSimulation`，排除网络与 JSON 解析）：120mm 3720 次请求，平均 3.2ms、p50 2.9ms、p95 5.4ms、max 21ms。** 服务端 CPU 解释器不是主因；但部署路径还要 `express.json` 解析请求体、`validateState` 再 `JSON.stringify` 一次校验大小（`robot-sim.js:880-891`、`MAX_STATE_BYTES=1MB`），795KB 状态下每次约再 +10–20ms。
2. **浏览器每段请求数**：120mm 统计：1303/1391 段恰好 2 次；54 段 5.09 次（含等待）；26 条链平均 31.85 次（WaitTime 链）；8 段 1 次。800mm：22628 请求 / 8622 段 ≈ 2.6 次/段。
3. **每次请求的状态体积（关键放大器）**：部署版 `/opt/spare-parts/server/src/robot-sim.js`（84198B，Nov 6 01:56，SSH 只读核对）为 `MAX_SOLVE_CACHE=600`，仅在超过 600 条时裁剪（`:936`），所以运行到中后段时 `state.solveCache`≈596KB；实测第 20000 次请求体（`.local/abb-flow-20261105/infrared-checkpoint-left.json`，props=state/signals/joints/solve/elapsed/maxSteps/stopOnMotion）的 `state` JSON = **794,453 字符**（solveCache 596KB + globals 177KB + cell 16.5KB）。本地 13:13/13:18 的未部署改动把 solveCache 只留 16 条（`:977-984`），状态约 213KB；**线上没有该改动**。
4. **压缩情况**：nginx 只对**响应**开 gzip（`nginx.conf:151-157`，`gzip_types ... application/json`）；浏览器 fetch 的**请求体不压缩**。因此每次请求上行约 0–795KB（随 solveCache 增长），下行响应体 gzip 后小很多。
5. **主线程克隆**：`abb-program-session.mjs:64,67,70,77,78` 每段对整包 state 做 3–4 次深拷贝；795KB JSON 的 stringify/parse 实测约 4.5ms/次 → 每段约 14–18ms 纯克隆开销（120mm 全轮约数十秒）。
6. **网络实测**：本机直连 `https://czsdsg.cn` 暖连接请求 42–58ms/次（5 组，`curl --noproxy`），ICMP 41–44ms；TCP 握手 34–56ms（另一路 443/80/22222 各 3 次）。
7. **WaitTime 规模**：120mm 共 938 个 Wait 停点（0.01s 占 805）；800mm 共 5384 个（0.01s 占 4244：`HYbaojing.mod:379` 2950、`ModMain.mod:397` 777、`BuJiu.mod:473` 483、`ModMain.mod:283` 33）。锅内 `BuJiu.mod:473` 每 pass 31/36/46 次请求（fr=35/30/45，`fenqu.mod:2398/2437/2466`），45ms RTT 下约 3s，慢上行时更久——正是用户截图停留处。

### 3.2 会话模型（`abb-program-session.mjs` 行为逐步复现）

每段端到端 ≈ `max(动画时长, 请求链开销)`；请求链开销 = 请求数 ×（上行时间 + RTT + 服务端 JSON/解释器时间）；运动期间预取下一段（`:32-35,76-91`）只覆盖约一次动画的时间。

**下限（只计 RTT，不计 795KB 上行）**：

| RTT | 120mm 全流程 | 120mm 锅内段 |
|---|---|---|
| 0 ms | 141.4 s | 49.2 s |
| 20 ms | 152.4 s（1.08×） | 57.8 s（1.18×） |
| **50 ms（本机实测区间）** | **238.2 s（1.69×）** | **111.0 s（2.26×）** |
| 80 ms | 341.3 s（2.41×） | 171.1 s（3.48×） |

**计入 795KB 请求上行后的量级（推算，取决于现场上行带宽；需浏览器 DevTools 实测确认）**：
- 上行 100 Mbps ≈ 64ms/次 → 每段 2 次 ≈ 220ms，对比 45–68ms 动画 ≈ **3–5×**；
- 上行 30 Mbps ≈ 212ms/次 → 每段 ≈ 0.51s ≈ **7–11×**；
- 上行 10 Mbps ≈ 636ms/次 → 每段 ≈ 1.4s ≈ **20×+**。

因此第三节 RTT-only 的 2.26× 是**下界**；线上实际比例很可能显著更高（另一路独立插桩按载荷+克隆+45ms 建模给出锅内 4.7×–9.5×，取决于上行/下行；本机 13:13 补丁后 213KB 时为 1.1×–2.2×）。**最终以浏览器 DevTools 的单请求 payload/耗时与一个上甑 pass 墙钟为准。**

### 3.3 为什么“锅内”尤其明显

锅内布料段只有 33–68ms 动画，却固定要 2 次请求；而长距离过渡段动画 1–2s，同样的 2 次请求被完全掩盖。加上 795KB 状态（随 solveCache 增长）与每个 `WaitTime 0.01` 一次请求，视觉上就是“过渡正常、进锅后一格一格地挪，且每圈结束卡在等待 0.01 秒”。

---

## 四、显示节流判定（明确“不是它”）

- 链路：`AbbRobotViewer.vue:64` `createProgramDisplay({publish})`；`:65` `watch([programStatus,programCurrent,programRunning],...,{flush:'post'})`。`abb-program-display.mjs:4-19` 只做“保留最新快照、最多 1s 发布一次”，无 import、无 `await`、不接入 session/move/解释器。探针（另一路）2964 次 push 合计 8.31ms（0.016%），发布约 1 次/秒。
- 该节流在 10:48 性能修复前的 `before` 快照里已存在；今天修复删掉的是 rAF 每帧 50ms 上限（原来掉帧会丢时间，改后只是**变快**）。
- 用户已允许“程序跳动很快”：可把 `interval` 调小（如 100–200ms）或显示“正在计算下一段运动”帮助看到真实进度。这只改观感与诊断，**不是根因修复**，且文件归 Codex，DSH 不写。

---

## 五、拟改文件与测试建议（待 Codex 分配，DSH 未动代码）

### 5.1 P0：减少“每段一次请求”的状态载荷（线上收益最大，且已被本地并发改动部分触及）

| 文件:行 | 改什么 | 风险/备注 |
|---|---|---|
| `server/src/robot-sim.js:977-984` | 运动完成后 `solveCache` 只留最近 16 条（本地 13:13/13:18 已有，**非 DSH 改、未部署**）→ 795KB→约 213KB | 可能增加 robot-solve 往返（被淘汰的解重算）；需回归请求数与 120/800mm 全流程 |
| `server/src/routes/robot-program.js:22-36` | 状态会话化：服务端 LRU 保存 state，客户端只发 `stateToken`（失效 409 回退整包）；或对 state 做增量 | 协议改动、并发/重启/多标签页隔离；`MAX_STATE_BYTES=1MB` 目前在 795KB 时已到 79%，更长流程可能 `state-too-large` 阻塞（`robot-sim.js:9,884`） |
| `server/src/app.js` / nginx | 请求体压缩不现实（浏览器 fetch 默认不压缩）；若做协议 token 则不需要 | 响应已有 nginx gzip |
| `spare-parts-web-release/src/utils/abb-program-session.mjs:64,67,77,78` | 去掉每段 3–4 次整包深拷贝（只 clone 必要字段或引用计数） | 状态不可变假设需保持 |
| `server/src/robot-sim.js:936` / `:12` | 若暂不上 token，可把 `MAX_SOLVE_CACHE` 从 600 降到几十并补测 | 与上一条同风险 |

### 5.2 P1：减少请求次数（每段 2 次 → 1 次；WaitTime 链 N 次 → 1 次）

| 文件:行 | 改什么 | 风险 |
|---|---|---|
| `server/src/robot-sim.js:1113-1118` | 自动模拟下连续消费 `kind==='time'` 的短 `WaitTime`（累计 `elapsed` 一次走完），避免每条链 32–50 次往返 | 仅 automation 生效；事件顺序、`virtualTime`、cell 暂停语义需保持 |
| `server/src/robot-sim.js:902-960`（`:961` 的“一次只返回一段运动”约束处） | 新增批量运动（`maxMotions`），一次响应返回多段已确定运动；遇 wait/solve/limit/blocked 前必须停 | 改变 stop 语义与中断点 |
| `spare-parts-web-release/src/utils/abb-program-session.mjs:23-46` | 支持一段响应多段运动顺序播放（当前 `:26` 直接 throw）；`:76-91` 预取深度 1→2 | 停止/暂停必须能在段边界中止；cell/信号按段提交 |
| 备选：服务端自己做 IK | 去掉 robot-solve 一次往返 | 需与查看器共用同一份 DH/修正矩阵数据（见 `docs/ABB_DIGITAL_TWIN_COLLABORATION_20261104.md` Phase B 顾虑），否则两套结果漂移 |

**不要用倍率补偿**（符合协作要求）：调大 `programSpeed`/演示倍速只会掩盖请求等待，并会放大所有段。

### 5.3 测试建议

现有相关：`spare-parts-web-release/test/abb-program-speed.test.mjs`、`abb-program-session.test.mjs`、`abb-program-motion*.test.mjs`、`server/test/robot-motion.test.js`、`server/test/robot-cell-sim.test.js`。

新增：
1. 真实备份布料段时长回归：`BuJiu.mod:433` 平均 ≈33.5mm/44.9ms（p50 45ms），锁住“不被误限”。
2. 状态体积回归：部署版一次 120mm/800mm 请求的 `state` JSON 尺寸上限（例如 <250KB），并断言 solveCache 上限；同时校验 `MAX_STATE_BYTES` 不触发。
3. 假请求延迟（2×50ms）下的会话模型：优化后锅内 `wall/animation ≤ 1.2`；未优化前应复现当前问题。
4. `WaitTime` 链在**一次**请求内消费、事件顺序/信号/`virtualTime` 与逐次请求一致。
5. 多段运动响应：顺序播放正确、`stop` 可在段边界中断、`cell` 事件按段提交。
6. 集成（建议 Codex）：浏览器 40/120mm 用 `performance.now()` 记录每段动画与端到端墙钟；DevTools 记录单请求 payload（目标 ≤10KB 或 token）与“请求数/运动数”（目标 ≤1 次/段）。

---

## 六、左右甑合盖（独立复核摘要）

完整报告：`.local/abb-dsh-lid-20261106/report.md`（含真实 GLB/真实扫掠体只读复核脚本与 `audit-result.json`）。要点：

1. **用户报障对应 10:48 部署的旧构建（早于 10:59 修改）。** 旧 `toggleLid`（`.local/abb-performance-20261106/before/src/components/agv/AbbRobotViewer.vue:159-161`）合盖同时被三道门拦住：`programCell && !programCell.complete`（任意一侧未完成就禁两侧，与机器人无关）、`![0,3].includes(programCell?.infrared?.position??0)`（单相机在左/右(1/2)时也禁另一侧）、`!lidClear(barrel)`（旧版只有机器人/工具，无相机几何）；旧自动合盖还要求 `infrared.position===3`，且 `canAnimate` 会在 cell 未完成且程序停时冻结锅盖动画。
2. **当前 10:59 版已改为逐甑几何判定**（`AbbRobotViewer.vue:157-183`）：每甑用自己的锅盖全行程扫掠体判定机器人/工具（`axis1-6/tool/cable/balance/base`）与该甑相机占用；真实 GLB 复核：home/接料位+相机退避时两甑全 clear；相机在左只挡左甑、右甑仍 clear。
3. **仍存在的拦截/安全缺口**：模板 `:7` 仍用全局 `programRunning` 禁用两盖（手动入口，无原因文案）；`:178` 自动合盖仍受全局 `!programRunning` + 单实例 `programCell.barrel` 限制，且失败静默不提示；`:146` 换例程/清 cell 会无条件复开两盖（已合盖会被重开）；`:164` 跳过不可见网格，隐藏轴/工具/线缆即可绕过合盖互锁；放开“B 甑程序运行中合 A 甑”需先证明 B 程序轨迹不会进入 A 甑扫掠区（源程序要求“上甑前两盖全开”，`prepareProgramCell` 141 与 `docs/ABB_INFRARED_HYDRAULIC_20261105.md:19`）。
4. **建议**：先在 13:04 已部署的新构建复测用户场景（旧问题可能已被逐甑几何修复）；再决定是否按甑维护 `programBarrel/cellComplete/pendingClose` 并抽 `src/utils/abb-lid-occupancy.mjs`（DSH 可在分配后先写 util+测试，避免与 Codex 同写 `.vue`）。上述改动全部在 Codex 的 `AbbRobotViewer.vue` 或其新 util，DSH 本轮未写。

---

## 七、边界与未验证

- 本轮**未在浏览器里重新计时**，也未跑真机/现场控制器；RTT-only 比例是按实测请求时延 + 实测服务端耗时套现行会话代码的**模型值**；计入 795KB 上行的比例为范围推算，**必须用浏览器 DevTools（请求 payload、单请求耗时、一个上甑 pass 墙钟）确认**。
- 真实备份取自本地 11-05 导入的 `report.json`（sha256 已记录），用户截图 `BuJiu.mod:473` 与之吻合；若线上备份库是另一修订版，请用线上备份复跑 `measure-motion.cjs`。
- RTT/带宽为本机实测；现场网络不同则比例按同一公式变化。
- 显示节流只影响页脚观感/诊断，不影响运动节奏。
- 线上 `server/src/robot-sim.js` 仍为无 solveCache 修剪的 84198B；本地 13:13/13:18 改动（只留 16 条）非 DSH 所为、未部署，需 Codex 确认归属并回归。
- 合盖的安全边界（隐藏网格、跨程序合盖、合盖中占用再进入的处理是冻结停程序还是复开）需产品确认。

---

## 八、复现命令与产物

- 扫描/统计：`node .local/dsh-scan/count.cjs`、`node .local/dsh-scan/scan.cjs decl "speeddata"`
- 时长与请求模型（DSH）：`node .local/dsh-scan/measure-motion.cjs 120 left 45`、`node .local/dsh-scan/measure-motion.cjs 40 left 45` → `measure-40-left.json`、`measure-120-left.json`；`node .local/dsh-scan/groups.cjs measure-120-left.json`
- 独立插桩复测（另一路）：`.local/abb-dsh-speed-20261106/report.md`、`measure-120-left.json`、`measure-800-left.json`、`display-throttle-probe.mjs`、`make-instrumented.cjs`、`analyze.cjs`
- 网络实测：`curl.exe --noproxy '*' -s -o NUL -o NUL -w "%{time_total}" https://czsdsg.cn/api/health https://czsdsg.cn/api/health`（第 2 个数值≈暖连接单请求）
- 线上只读核对：`ssh -i C:\Users\Lenovo\.ssh\id_rsa_navicat -p 22222 ... 'ls -l /opt/spare-parts/server/src/robot-sim.js; grep -n MAX_SOLVE_CACHE /opt/spare-parts/server/src/robot-sim.js'`；nginx gzip 见 `/etc/nginx/nginx.conf:151-157`
- 合盖复核：`.local/abb-dsh-lid-20261106/report.md`、`lid-geometry-audit.mjs`、`audit-result.json`
