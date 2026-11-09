# guodu / guodu_SAFE 还原依据与实现 · 2026-11-06

状态：**已从程序作者自己的 RobotStudio 打包文件中取得最后一份未加密可读源码，
并按原文逐行实现、离线执行左右甑完整 40 mm 流程。** 与当前 2026-05-28 受保护
`BaseMod` 的逐字节一致性仍未经作者或控制器轨迹确认；本轮**未部署、未打包、
未改原备份**。

本文取代 `ABB_POT_PATH_DSH_20261106.md` §10 中“可读源码与轨迹都拿不到”的旧结论
（旧结论只在当时已查的三套备份/服务器/本机安装目录范围内成立）。§10 中“不能拿
替代/猜测动作冒充原程序”的验收口径继续有效。

---

## 1. 结论

| 依据 | 结果 |
|---|---|
| A. 程序作者的可读源码 | **已取得**：2025-09-29 的 RobotStudio Pack&Go 包 `______1_20250929-143205.rspag` 中 GuJin-A1-4 备份里的 `PROC guodu`、`PROC guodu_SAFE`、`FUNC MidPosCal` 为未加密正文 |
| B. 2026 控制器/RobotStudio 离线轨迹 | **未取得**：2026 备份是 RobotWare 6.15.02.00，本机只有 RobotStudio 6.08 + RobotWare 6.08；2025 站可打开但程序是 2025 版，不能当作 2026 轨迹 |
| 当前实现 | 按 2025 可读源码逐行注册 `guodu/guodu_SAFE/MidPosCal`，只在 `BaseMod` 加密字节匹配 2026 备份时启用；执行的是源码中的 MoveL/MoveAbsJ/CalcJointT 与 J6 构型逻辑，**不是** `__cell_guodu` 合成过渡 |
| 剩余不确定 | 2025 可读正文与 2026 `BaseMod` 是否同一版（作者加保护时是否只搬移、未改逻辑）；过渡与锅沿/锅壁的最小间隙只有 0.08–0.37 mm（离线几何代理），需现场/控制器复核 |

因此：**可以按作者源码复现和核验运动，但不能声称“2026 受保护 BaseMod 已逐字节还原”。**

---

## 2. 依据 A：作者可读源码（2025-09-29）

### 2.1 来源包

- 文件：`D:\robotcx\七车间机器人\______1_20250929-143205.rspag`
- 98,943,042 B，sha256 `69350f139b27a29845cd78f336121e4b93e764119a07d8a3ed909871fa48fe65`
- 是 RobotStudio Pack&Go 包（ZIP，条目使用传统口令加密）。口令只保存在
  `.local/dsh-pot-20261106/compat/` 与本地提取脚本中，不写入仓库/发布包。
- 包内包含：
  - `Stations/______1_20250929-143205.rsstn`（15,318,841 B，工位/机器人/布局）；
  - `Systems/GuJin-1`、`GuJin-A1-2`…`GuJin-A1-6` 六个虚拟控制器（RobotWare 6.08）；
  - `Backups/GuJin-A1-4/` 控制器备份：10 个**可读** RAPID 模块，
    包含 `BuJiu.mod`、`fenqu.mod`、`HongWai_GuoDu.mod`、`ModMain.mod`、`ModData.mod` 等；
  - 没有 `BaseMod.mod`（2025 版还没有这个受保护模块）。

### 2.2 三个例程正文（逐行复制，未改写）

| 例程 | 源文件 | 行号 | 行数 | 正文 sha256 |
|---|---|---|---|---|
| `PROC guodu(num qidianc,num zhongdianc,robtarget pBarrelCenterx,string js_hy,PERS wobjdata wobjv,PERS TOOLdata TOOLCentre)` | `fenqu.mod` | 3816–4048 | 233 | `7533fc3a3d2377ce61fc46213a5f6decef69e794b4255e2be127a1d9212a3c10` |
| `PROC guodu_SAFE()` | `BuJiu.mod` | 790–853 | 64 | `e63c61885f6ffc64c49fa9d91f4724ebdc54b36f13d08a63c93f5a83551cdb3a` |
| `FUNC robtarget MidPosCal(jointtarget J1,jointtarget J2,INOUT tooldata toolv,INOUT wobjdata wobj)` | `HongWai_GuoDu.mod` | 3–12 | 10 | `ba37a86c0b2b696b015ba29a54629824a992bcc089ba0551c8c0194eed364cf9` |

2025 模块文件哈希：

- `fenqu.mod` 148,526 B，sha256 `8c7a1857ba96877c1e111a07d35fd11e4201bea07f58c5b9739dfde017fa3cd4`
- `BuJiu.mod` 32,498 B，sha256 `30432e41f4dc16831f884b0e3b4ba41f49010fef68ba2eac5ca614a97b79b1bc`
- `HongWai_GuoDu.mod` 9,501 B，sha256 `cf7ff9bab898e4b13b5b8a66b568338753340d6205582843869f0ef1039511eb`

拼装后的兼容模块正文 11,902 B，sha256 `450ee3d483c388c14b340f13b89a2ac668a6d94b46b687d4f0dfe857ac15eb8c`。
提取与拼装脚本 `.local/dsh-pot-20261106/build-basemod-legacy.cjs`，证据清单
`.local/dsh-pot-20261106/compat/evidence.json`、正文副本
`.local/dsh-pot-20261106/compat/BaseMod_20250929.mod`。

### 2.3 为什么判断它是 2026 `BaseMod` 的前身（而不是另一套程序）

1. 2026 备份中的可读模块仍以**完全相同的签名**调用这三个例程：
   - `BuJiu.mod:320/352/633` → `guodu qidian,zhongdian,pBarrelCenter_bu,"JS1",wobjjidian,tGripCentre`
   - `BuJiu.mod:177/257/346/385/392/630`、`HYbaojing.mod:12/145/213/259`、`yuanxin.mod:660` → `guodu_SAFE`
   - `HongWai_GuoDu.mod:78` → `MidPosCal(joints,jointsCurrent,tGripCentre,wobjjidian_HY)`
2. 2026 的 `BuJiu.mod`、`fenqu.mod` 中已**不再定义** `guodu/guodu_SAFE`；2025 有定义。
   2026 `HongWai_GuoDu.mod` 也不再定义 `MidPosCal`。三个例程从可读模块消失，同时
   出现受保护 `BaseMod.mod`，与“实现被搬进受保护模块”一致。
3. 2026 `BaseMod.mod` 为 13,459 B、熵 7.986（加密数据），三例程可读正文约 11.9 KB，
   体量级一致（可作为旁证，不是证明）。

**不能证明的部分**：作者把代码搬进 `BaseMod` 时是否改过逻辑。2026 的
`BuJiu.mod`/`fenqu.mod`/`ModMain.mod` 与 2025 版差异较大（其他工艺逻辑有更新），
因此不能排除 `guodu` 内部也随版本调整过。需要作者确认或 2026 控制器轨迹。

---

## 3. 依据 B：本机 RobotStudio 工程核查

| 项目 | 结果 |
|---|---|
| 本机 RobotStudio | `D:\robot`，6.08.8148.134 |
| 已安装 RobotWare | 仅 `RobotWare_6.08.0134`（无 6.15 介质） |
| 2025 包 | 含 6 个 RobotWare 6.08 虚拟控制器与 15 MB 工位，是**可运行的 RobotStudio 工程**（2025 版程序） |
| 2026 备份 | IRB 6700-150/3.20，RobotWare 6.15.02.00；没有对应的 `.rspag/.rsstn`，本机无法建 6.15 虚拟控制器，也没有 2026 控制器轨迹记录 |
| 2026 受保护模块 | 13,459 B，sha256 `9b21160c99b8f0ee4449512b2a4a94e62fb4ba9ccca04ec9a44538c4da4b5377`；加密（熵 7.986），不可解出正文 |

所以本轮没有拿 2025 站去冒充 2026 轨迹；轨迹由同一份 2025 源码经离线解释器执行
（查看器同一套 FK/IK）得到，明确标注为“源码执行轨迹”，不是控制器记录。

---

## 4. 实现

### 4.1 文件

| 文件 | 作用 |
|---|---|
| `server/src/robot-basemod-legacy.js`（新增） | 逐行保存 2025-09-29 的三个例程正文 + 来源/哈希；`fileFor()` 按需拼装；`matchesProtectedBase()` 用**加密字节 sha256** 限定只有 2026-05-28 的 `BaseMod` 才能启用 |
| `server/src/robot-sim.js`（修改） | `compileProgram` 在 BaseMod 不可读且缺少 `guodu/guodu_SAFE/MidPosCal` 时注册兼容例程；`state.legacyBaseMod` 与 `provenance` 事件记录来源；解释器补齐成员访问大小写、tooldata.tframe、robconf.cf6、rax_N 写入、PERS 引用参数、局部 VAR 零值初始化 |
| `server/test/robot-basemod-legacy.test.js`（新增） | 正文哈希、片段拼装、启用门槛、原 ZIP 哈希不变 |
| `server/test/robot-pot-path.test.js`（修改） | 左右甑完整流程执行源码过渡、来源事件、调用参数、J6 圈数、锅体代理无穿透 |

### 4.2 源码如何执行（保留的参数/速度/构型）

- **调用参数**：全部按调用点实参执行，不从界面或代码补默认值；本次 40 mm 流程记录到
  `qidian=0`、`zhongdian=75`、`pBarrelCenter_bu=[0,0,140]`、`"JS1"`、`wobjjidian`、`tGripCentre`。
- **工具**：`guodu` 参数 `TOOLCentre` 由调用方传 `tGripCentre` / `tGripCentre_p`；
  内部按 `EulerZYX(\Y, TOOLCentre.tframe.rot)` 选 `tGripOutlet` 或 `tGripOutlet_PXX`；
  `guodu_SAFE` 用 `tGripCentre`/`tGripOutlet`。
- **工件坐标系**：`wobjjidian`（传入 `wobjV`）、`wobjInUse`、`wobjJD66`、`WobjBarrelL/R`；
  `guodu` 的 `wobjV.oframe.rot` 按 `OrientZYX(nSign*lingdian*5+jiaodu,...)` 计算，
  与 `zhuan1`、`quyu_bu`、`hongwai`、`nDisZOffs` 一起取自 2026 备份真实变量值。
- **速度/区域**：`vWorkSpd1`、`vMediumSpd`、`z50`/`z100`、`AccSet 100,80`，按源码。
- **构型/圈数**：`p111.robconf.cf6:=f6`（由 `lrz` 计算），J6 的 `ROBOT3/ROBOT4` ±360
  选择与 `zhengfan`/`nSign` 分支按源码；`MoveAbsJ j_zhogzhuan_L/R\NoEOffs` 保留绝对圈数，
  解释器不对 MoveAbsJ 归一化。
- **不做的事**：没有生成 `__cell_guodu*` 例程，没有空中转圈/直插锅内替代；启用了
  `provenance` 事件，界面/日志可追溯“这一段来自 2025-09-29 的哪个文件哪一行”。

### 4.3 启用门槛

`compileProgram` 只在以下条件同时成立时注册兼容例程：

1. `BaseMod.mod` 不可读，且其 sha256 = `9b21160c…4b5377`（2026-05-28 备份的加密字节）；
2. 2026 可读模块中确实没有 `guodu`、`guodu_SAFE`、`MidPosCal`。

其他程序的受保护 `BaseMod` 不会误用这份源码（有回归测试）。

---

## 5. 离线复现与结果（2026-11-06 本轮）

复现入口：`.local/dsh-pot-20261106/summary-run.cjs`、`export-guodu-trajectory.cjs`
（使用 `.local/abb-flow-20261105/report.json`，不读取/不修改原 ZIP）。

| 指标 | 左甑 | 右甑 |
|---|---|---|
| 40 mm 全流程结束 | `main:339 EXIT` | `main:339 EXIT` |
| 运动段总数 | 612 | 561 |
| `guodu` 运动段 | 57（3 次调用） | 6（3 次调用） |
| `guodu_SAFE` 运动段 | 6 | 6 |
| QS 清扫段 | 83 | 83 |
| J6 范围（含圈数） | −319.83 … 312.90 | −332.06 … 304.09 |
| 过渡段最小工具-锅体代理间隙 | 0.37 mm | 0.08 mm |
| 过渡段负间隙（穿透） | 0 | 0 |

- 调用参数与来源事件见 `provenance`：`guodu` 的 6 个参数、`guodu_SAFE` 无参数，
  均带 `sourceFile/sourceLineStart/sourceLineEnd`。
- 回归同时断言首次 `guodu` 调用的入口栈为
  `main → rWorkLoop → kaishi_saliao → JS → JS_pd0 → guodu`（用户已确认的实际主流程调用），
  且 `guodu` 调用点为 `BuJiu.mod:320`。
- J6 绝对值超过 ±180° 的运动段存在（`MoveAbsJ`/`MoveL` 均保留圈数），且都在备份
  `MOC.cfg` 的 ±400° 内。
- **间隙结论的边界**：锅体几何是离线示意低模（内腔 1.09→1.2 m、内高 0.97 m 为程序权威，
  壁厚/锅沿外形为展示近似），工具包络是 640/700 布料头 CAD 联合包络。0.08 mm 属于
  “离线代理下刚好不穿透”，不是现场安全间隙，必须用真机/2026 版轨迹复核。
- 本轮**没有**用 RobotStudio 6.08 去运行 2025 站并录像；2026 版控制器轨迹仍缺。

---

## 6. 轨迹导出（源码执行，非控制器记录）

文件（私有证据，不进入网页 public 或发布包）：

| 文件 | 内容 | sha256 |
|---|---|---|
| `.local/dsh-pot-20261106/traj/guodu-left.json` | 左甑 68 段（含 `GUODU_moveL`、`guodu`、`guodu_SAFE`、`kaishi_saliao`），含调用参数与来源 | `33839a600ff09a0d2677608aea5b2144215a6cac20cf25a8e7cd4845a39cea84` |
| `.local/dsh-pot-20261106/traj/guodu-right.json` | 右甑 17 段，同上 | `b1f4e50f07c9626a84ae4048cc30286683b5b7ba81f34b8033dbbe698eaa0b59` |
| `.local/dsh-pot-20261106/traj/guodu-left-right.csv` | 左右合并平面表 | `0f360976a79bf3ff64a1dc49ce5058897689accfecab260ef747bf0c95047666` |

每条记录字段：`tMs`（模型时间，非控制器时钟）、`durationMs`、`routine`、`file`、`line`、
`sourceFile`/`sourceLine`（2025 原始模块行，便于对照作者源码）、`instruction`、
`joints[6]`（绝对角度，保留圈数）、`tool`/`toolParam`、`wobj`/`wobjParam`、
`speed`、`zone`、`pot.clearance/part/region/local`、`parameters`（调用实参）、
`callLine`（调用点在 2026 程序的行号，用于区分 `kaishi_saliao:177` 退出与 `GoFeedCnv2:257` 返程接料）。

计时来自查看器运动规划（`prepareProgramMotion` 的 duration）与模拟等待，**不能**当作
IRC5 节拍或现场实测时间。

---

## 7. 仍未完成 / 需要作者或现场确认

1. **2026 `BaseMod` 同版确认**（最关键）：作者确认 2026 版只是把这三个例程搬入受保护模块、
   未改逻辑；或给出 2026 `guodu/guodu_SAFE/MidPosCal` 正文；或在 2026 控制器上按
   `{tMs, joints[6], tool, wobj, routine, line, callParas}` 记录一次左右甑入锅/退出/返程接料轨迹。
2. 2025 可读源码与 2026 备份的**数据版本差异**（`pBarrelAppr`、`nYCircleR`、`nDisZOffs` 等
   已用 2026 值，但若 2026 的过渡逻辑本身改过，仍需用真实轨迹比对）。
3. 0.08 mm 过渡间隙的现场/控制器复核（离线锅壁厚与工具包络均为近似）。
4. 网页/示教器界面把 `provenance` 事件和 `state.legacyBaseMod` 显示为“按 2025 可读源码
   还原（待 2026 版确认）”——前端展示由 Codex 集成；本轮未改前端。当前前端“设备模拟”说明
   仍写着“受保护 BaseMod 使用模拟过渡与传感器反馈”，需 Codex 同步改成“可读源码回退”。
5. 未部署、未构建发布包、未改原 ZIP/标定/速度/数据库。等 Codex 复核 + 作者确认后再决定上线。
6. **源码分发边界**：三例程正文目前内嵌在 `server/src/robot-basemod-legacy.js`（服务端代码，
   不进入网页 `public/`/`dist/`）。如果发布包策略要求作者程序正文不随包分发，请 Codex 改为
   从私有数据目录加载兼容源，并同步调整 `matchesProtectedBase`/哈希回归；本轮按“服务端
   内部实现”交付，未把它放入任何公开静态资源。

---

## 8. 交付文件与哈希

实现与测试（文件最终哈希见 `.local/dsh-pot-20261106/delivery-manifest.json`）：

| 文件 | 说明 |
|---|---|
| `server/src/robot-basemod-legacy.js` | 2025-09-29 可读源码（逐行）+ 哈希 + `matchesProtectedBase` |
| `server/src/robot-sim.js` | 兼容例程注册、来源事件、解释器成员/PERS 修复 |
| `server/test/robot-basemod-legacy.test.js` | 源码哈希/门槛/原 ZIP 不变 |
| `server/test/robot-pot-path.test.js` | 左右甑完整流程与过渡核验 |

本轮测试：`cd server && node --test test/robot-*.test.js` → **106 通过 / 0 失败**
（含本文件新增的源码哈希与左右甑流程断言）。

## 9. Codex 复核清单

- 对照 `compat/evidence.json` 与 `robot-basemod-legacy.js:PROVENANCE` 的哈希是否一致；
- 确认 `matchesProtectedBase` 只匹配 2026-05-28 的 `BaseMod`（sha256 `9b21160c…`）；
- 确认无 `__cell_guodu` 合成例程、无新增 MoveJ 直插/空中转圈；
- 运行 `node --test server/test/robot-*.test.js`；
- 决定是否把 `state.legacyBaseMod` / `provenance` 显示到界面，以及是否先等作者确认再上线；
- 不覆盖 `server/src/robot-sim.js` 前先与 DSH 对齐（本轮稳定后不再改）。
