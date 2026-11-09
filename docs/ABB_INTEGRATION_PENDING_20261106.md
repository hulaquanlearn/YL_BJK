# ABB 本地集成状态 · 2026-11-06

当前状态（18:18更新）：已接收2025可读源码并完成Codex集成、网页706/API475测试、左右40mm浏览器10×与左右800mm离线模型验证，已同步服务器。2026加密版同版性仍待确认。详见ABB_SOURCE_MATERIAL_DELIVERY_20261106.md；下文各时间点状态为历史过程记录。

## 按备份执行的边界

- 原始ZIP仍为 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad`，未修改原ZIP、RAPID、MOC或机器人标定矩阵。
- 直接读取该ZIP的 `SYSPAR/MOC.cfg`：`ROB_1 → ROB1_6700_3.20_150`；ARM `rob1_5` 上限1.745rad≈99.981°、下限−130°；`rob1_6` 当前上/下限±6.98132rad≈±400°。没有使用 `upper_joint_bound_max=589` 当作当前限位。MOC SHA256为 `bc0fe51d0f71682177c0a0c1da7d558621a70e42d219bee64f878f0ae166f305`。
- 解析器为MOC单独生成限位元数据，不把MOC插入原文件编号序列；原注释与阅读定位的file-id保持不变。只有一台机器人且六轴限位完整、有效时采用；缺失/歧义时保留型号默认范围。限位贯通运动计划、请求求解、FK/IK、直线插值、模型姿态、手动点动和示教器范围提示。
- 保留MoveAbsJ源码绝对圈数；MoveL不通过逐点模360隐藏跨限位或中途换构型。已增加359°→363°在±400°内连续通过、超过400°拒绝、J5超备份上限拒绝的回归。
- [ABB RW6手册3HAC050917-001 RevF](https://library.e.abb.com/public/b227fcd260204c4dbeb8a58f8002fe64/Rapid_instructions.pdf)：p222的EXIT终止程序；p1347的Present判断可选参数是否传入；p1316列出OpMode枚举。DSH报告§8“EXIT退出循环”的判断不成立。本轮不为执行main:343以后代码而篡改EXIT。
- Present连同可选形参、命名实参、未传参数拦截与INOUT回写补齐。OpMode使用明确的离线状态：整流程默认OP_AUTO=1、独立例程默认OP_MAN_PROG=2，可在模拟入口显式指定0–3；不代表读取了控制器模式。

## 已修的显示与物料问题

1. 示教器在ABB主模型就绪后后台预取，打开时复用缓存；模型框扩展到角度栏上方；坐标系默认关闭；高度/斗容输入隐藏微调箭头。
2. 布料斗物料改到皮带内腔侧，纠正CAD法向，消除以源滚筒50mm偏移定位物料的问题；按框架侧壁和承重滑板边界限制料层，皮带/打散动作共同决定出料，暂停不流动。640/700真实CAD均有专项检查。
3. 暂存斗沿上部、锥形部和出料口内腔显示，斗门打开时存量下降并进入布料斗；关闭后才能补料。补料采用低位启动、高位停止的滞回逻辑（本地模型默认20%/95%），不会仅因接过一斗或空斗返回就启动。
4. 原默认暂存量1.5斗会导致频繁补料，现按绘制内腔约1.13m³作1130L离线估算。此容量、流量与阈值不是PLC/现场实测。切换左右甑时传递同一个暂存斗剩余存量，不凭空回满；两甑料面分别保留，“重新开始”只重置所选甑。
5. 右甑准备只打开右甑盖，清理会话不再重开两盖。退出程序模式或隐藏锅体时，料面、粒子与斗内物料同步隐藏，保留对应装填状态，不再显示地上的孤立圆料块。
6. QS清扫按实际插值后的TCP显示毛刷示意；CAD无真实毛刷，60mm半径/25mm刷毛仍是未确认代理，界面明确提示“尺寸待现场确认”。

## 仍未完成的出入锅动作

### 从main入口核验调用链（用户追问后复核）

核对当前原始备份可读正文，而非按例程存在就判定执行。`main`没有直接写`guodu`，但存在以下有效、未注释的间接调用：

`ModMain.mod:335 main → rWorkLoop` → `ModMain.mod:378 → kaishi_saliao` → `BuJiu.mod:174 → JS` → `BuJiu.mod:395 → JS_pd0` → `BuJiu.mod:320 → guodu qidian,zhongdian,pBarrelCenter_bu,"JS1",wobjjidian,tGripCentre`。

`main`在`:333`前设`pudi:=0`，所以进入JS的普通上甑分支；JS的结束/手动结束分支可能提前走`guodu_SAFE`。`guodu_SAFE`还在`kaishi_saliao:177`（JS返回后）、`GoFeedCnv2:257`（接料）等有条件的路径中。`:377`的`GUODU_moveL`是另一个正文可读的例程，不能与受保护的`guodu`混同。`:339 EXIT`在`rWorkLoop`调用返回之后，不能据此排除前面的上甑调用。

使用同一备份从`file-7:main`分别运行左/右甑40mm离线场景，均在3条可读运动后到达`BuJiu.mod:320`，栈为`main/rWorkLoop/kaishi_saliao/JS/JS_pd0`，没有自动补料插入帧；在真实调用处停止。记录`.local/abb-pendant-layout-20261106/main-call-audit.json`，回归`server/test/robot-pot-path.test.js`同时断言两侧完整入口栈。此结果证明当前备份普通上甑路径可达，不代表已取得现场控制器运行记录，也未声称动态执行过停止点之后的`guodu_SAFE`。

用户明确指出不会装料后在空中绕一圈再上甑，并要求按备份来。早先为了通过腕轴行程而加入的腕轴预留/空中换构型是猜测，不是原程序动作，已从当前有效代码删除。

`BaseMod`中的 `guodu/guodu_SAFE` 受保护。当前执行到它们会在真实调用行返回 `protected-motion`，保留机器人姿态，并说明原轨迹不可读；不继续执行猜测的转圈、出锅、入锅路径。**这表示整流程仍未完成，不是已修复并验收的运动。** 等DSH交付可读原例程或控制器/RobotStudio记录的关节轨迹，再做真实出入锅及100%/1×、10×复核。

可读QS已单独实跑检查左右75步、375°覆盖；rRunGoHome在home、中央、左右甑初始位姿的分支均完成真实IK/插值准备，越界场景保留源码Stop。源码yuanxin:456同一分支要求Z≥614.736且Z≤214.736，不可达，未改原程序也未声称该分支通过。结果在 `.local/abb-pendant-layout-20261106/return-home-audit.json`。

## 验证记录与交付边界

- 关联专项最终43项通过，日志 `.local/abb-pendant-layout-20261106/focused-final-tests.log`；含MOC限位、Present/EXIT、可读QS、未知过渡停机、物料守恒与低位补料、逐甑保留、隐藏残影、内腔料层与缓存性能。
- 网页全量703项首次701通过，2个旧断言失败：ABB“清会话清料面”断言已改为显式重置所选甑，专项4项复测通过；另一个消防空文案断言在独立复测中6项通过，本轮未修改消防源码或测试。
- API全量最终474项通过；日志 `api-verified-tests.log`。本地接续清单及20个关联源码SHA256在 `.local/abb-pendant-layout-20261106/pending-result.json`。
- 生产构建在独立TEMP目录下通过，成品 `.local/abb-pendant-layout-20261106/build-verified/`。第一次构建遇到Windows临时文件拒绝删除，改用本次专用TEMP后通过；不交付失败构建目录。
- 浏览器专项使用独立临时页和明确的显示测试数据：斗内90L比例料层、左800mm/右40mm状态保留、退出模式/隐藏锅体无残影。截图在 `docs/validation/20261106-abb-followup/stock-inner-cavity-fixed.png`、`hidden-pots-no-floating-material.png`；临时页已关闭，用户预览页保留。未把这些显示夹具当作真实整流程验收。
- 历史开发中的800mm/8688段完成记录属于后来被用户否定的替代路径版本，不能用作当前运动验收。当前没有完整浏览器10×验收结果。
- 本轮没有部署、推送、打包，也未改业务数据、上传或私有配置。服务器只读核对仍为 `fire-month-select-20261106` 批次，989份受保护文件；`output/CURRENT_DEPLOYMENT_V1.9.10.json`保持实际线上状态。后续需接收DSH原轨迹、完成运动验收后按既有授权同步。

## DSH 2026-11-06 17:00 更新：guodu/guodu_SAFE 可读源码回退（待 Codex 复核）

状态：**不再在受保护调用行停止。** 本次从用户本机 2025-09-29 Pack&Go 包
`D:\robotcx\七车间机器人\______1_20250929-143205.rspag`（sha256 `69350f13…48fe65`）的
GuJin-A1-4 备份中取得了同一程序的未加密可读正文：`guodu`（fenqu:3816–4048）、
`guodu_SAFE`（BuJiu:790–853）、`MidPosCal`（HongWai_GuoDu:3–12），已逐行放入
`server/src/robot-basemod-legacy.js`；`robot-sim.js` 仅当 `BaseMod.mod` 的加密字节
sha256 = `9b21160c…4b5377`（2026-05-28 备份）且可读模块缺少这三个例程时启用，并产生
`provenance` 事件与 `state.legacyBaseMod` 来源信息。

验证：左右甑 40 mm 全流程均到 `main:339 EXIT`；左/右 `guodu` 57/6 段、`guodu_SAFE` 6/6 段，
J6 圈数保留；过渡段工具-锅体离线代理最小间隙 0.37/0.08 mm（正间隙，但需现场/控制器复核）；
`server/test/robot-*.test.js` **106 通过 / 0 失败**。未改原 ZIP/标定/速度，未部署/打包。

边界：2025 可读正文与 2026 受保护 `BaseMod` 是否逐字节同版**未证明**（2026 可读模块其他
工艺逻辑与 2025 有差异）。在这点由作者确认或取得 2026 控制器轨迹前，界面/交付应标注
“按 2025-09-29 作者可读源码还原（2026 BaseMod 同版待确认）”，不能标为 2026 版还原完成。
详细证据、哈希、轨迹与 Codex 复核清单见 `docs/ABB_GUODU_SAFE_RESTORE_20261106.md`。
本节覆盖本文件上文“`BaseMod` 中的 `guodu/guodu_SAFE` 受保护，当前执行到它们会停止”的当前状态；
其余显示/物料/QS 边界不变。
