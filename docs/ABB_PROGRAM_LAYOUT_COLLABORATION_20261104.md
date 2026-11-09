# 酿酒程序坐标对齐联合交接 · 2026-11-04

用户最新要求：按服务器《酿酒机器人.zip》的接料点与左右甑锅坐标重新布局；喂料机可悬空，无需支腿。此前估算布局作废。

## 修改范围
- DSH：仅 `spare-parts-web-release/src/utils/abb-feed-station.mjs`、`spare-parts-web-release/test/abb-feed-station.test.mjs`；在本文追加交付。清除四脚支架、横梁、链板尾部落地柱及其废弃元数据；保留薄壁贯通、气缸/闸板真实连接和联动。气缸固定到斗体，不可悬离。更新测试。不要改查看器/布局/程序解析/性能/服务器/包依赖，不构建部署。
- Codex：实际服务器备份读取、工具/工件坐标变换与 CAD 配合验证、布局模块、查看器、其他受影响测试与说明、构建/部署。DSH 两文件交付稳定 SHA 后再集成。

备份已读至私有 `.local/abb-program-layout-20261104/server-library.json`（只读）。酿酒备份 SHA256 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad`，IRB 6700-150/3.20。不得改原程序点位或把完整私有程序写进 public。位置由 Codex 推导；DSH 可只读复核，结果在本文留言。

当前 feeder 基线 SHA256 `0E19606BFF5129FA3841A9244CEEA4AF67AEDD7802A226804151A1681A4A45C4`。`outletHeight` 仍表示出料口下沿；根节点坐标保持不变。照片没有量尺，几何尺寸仍是比例示意。

## DSH 接收与悬空版交付（2026-11-04 20:22）

**已接收本轮范围**：只改 `spare-parts-web-release/src/utils/abb-feed-station.mjs` 与对应测试；未改布局/查看器/程序解析/性能/服务器/包依赖，未构建部署，未覆盖 `robot-sim.js`。按用户纠正，喂料机改为**允许悬空、无支腿**，清除落地框架/横梁/链板尾落地柱和废弃元数据。

### 本轮修改

- 删除 `support-frame` 四脚立柱、四根上方横梁、低部横撑，以及链板尾部两根落地柱；`userData.parts`/`FEED_STATION_PARTS` 不再含 `support-frame`；没有腿/柱/支架命名残留。
- 保留并回归：短管/收缩斗/上斗四壁薄板开口、上下口尺寸衔接、链板沿 Z 输送到暂存斗顶口上方末端卸料、不封进料口、闸板关闭封住出口、打开后垂直射线贯通、气缸杆/销轴连接。
- **气缸固定在斗体**：`cylinder-bracket` 仍与收缩斗外壁体积重叠，安装点落在支架 Box3 内，缸体与支架相交；已加测试断言，不悬离。
- 悬空后整机包围盒最低点是闸板关闭底面（=outletHeight），不再有落地件；测试断言 `min.y>1` 且无支撑件。
- 测试仍 9 项，全部通过（20:21:49 实际执行）。

### 新 SHA256（稳定交付）

| 文件 | SHA256 |
| --- | --- |
| `spare-parts-web-release/src/utils/abb-feed-station.mjs` | `1A218BE1B186AA6AC1F756B46F2CF9B5ABED1D3D439C69B3800893B7DFCA3582` |
| `spare-parts-web-release/test/abb-feed-station.test.mjs` | `1A6B48486D99758DB41AAED70335022C5F7FAB51ED6C0A09B19370FC5A010EDA` |

`node --test test/abb-feed-station.test.mjs` → **9 通过 / 0 失败**。包围盒约 X ±0.69m、Y 2.05–4.05m、Z −1.35–0.70m；28 网格、684 三角形；`outletHeight` 仍为出料口下沿，`userData.outlet.bottomY/bottomCenter` 可定位。

### 只读复核 `server-library.json`（酿酒坐标，未改）

已读私有 `.local/abb-program-layout-20261104/server-library.json`（只读；不复制完整程序）。`酿酒机器人.zip` 行 id/backup SHA `01b7a45e…2406ad`，IRB 6700-150/3.20，RobotWare 6.15.02.00；1 task、14 modules、82 routines、117 signals、54 archive entries、477,061 bytes。

可用于 Codex 推导的坐标证据（单位 mm，均为程序内声明，未做世界坐标换算）：

- `ModData.mod:137` `CONST robtarget pFeedWork = [2326.80, 16.26, 666.32]`；实际用于 `BuJiu.mod:248`、`HYbaojing.mod:47`、`HYbaojing.mod:157`，均带 `WobjBase`。同文件 141/142 有被注释的旧 `pFeedWork`（[1650.69,1909.90,-109.42]、[2163.19,917.49,797.26]），说明当前有效值是 137 行。**pFeedWork 是机器人 robtarget（z≈0.666m），不是喂料机出料口高度；不能把 feeder 的 `outletHeight=2.05m` 当作由它直接得出。**
- `ModData.mod:139` `pRobHome = [1874.63, 8.24, 686.31]`；136 行有注释掉的旧值 [1900.42,564.74,768.01]。
- 左右甑锅边缘标定点：`pLeftEdge1..5` 在 `ModData.mod:121–125`，`pRightEdge1..5` 在 `126–130`（均为 `wobj0`）。
- `ModTeach.SetUpLeft/SetUpRight`（`ModTeach.mod:54–60`、`174–179`）会用上述 5 点求 `center1`，再 `WobjBarrelL/R.uframe.trans.z := … - nBarrelHeight`。因此 `ModData.mod:160/164` 保存的 `WobjBarrelR=[784.479,-2102.4,-455.264]`、`WobjBarrelL=[782.182,2093.4,-443.776]` 是**上次标定/保存值**，静态 z 与边缘点 z（约 512–528）不是同一参考，不能直接当锅口中心；`WobjBarrelInUse` 在 177 行为 [780.182,2086.4,-448.776]。Codex 若要用真实锅位，应按 `ModTeach` 的中心/半径/高度逻辑或现场标定重算，不能只抄声明值。
- 锅相关基准点：`pBarrelCenter`（`ModData.mod:133`，相对 wobj [0,0,150]）、`pBarrelCenter_bu`/`pBarrelCenter_HY`（134/135，[0,0,140]）、`pBarrelAppr`（132，[753.17,601.55,1147.28]）；`pBarrelAppr_L/R` 在 254/255。
- 左右布局方向：左锅边缘点 y≈+934…+2889、右锅 y≈−1149…−2863，叉车/接料点 `pFeedWork` y≈16，基本关于 y=0 分左右；x 约 0.78m（Wobj 保存值）或边缘点 0–2.3m 范围。以上只是原始坐标观察，世界布局仍由 Codex 推导。

未发现备份中可直接读取的“喂料机出口”字段；`pFeedWork` 是机器人程序点，喂料机几何位置/出口高度需 Codex 用工具坐标、接料动作和 CAD 配合推导。DSH 未改任何坐标或布局文件。

## Codex 独立集成说明

已验DSH最终两文件SHA：F3BD32ADC80474F9FE801C3B655DBC9A60EC4F0DD3D6B9511EE18C606501C822 / B78B306373331BB8193585116CB050C7FC59D8B0E5D5671C4EDE2F1111415472。DSH最终参数回归10/10；本轮完整回归612/612、最终机构18/18。完整出口扫查又把集成外深从.22调整至.20m，并微调CAD内承接中心，使640/700各169条全内口射线均落到接料面且避开打散轴；这两项布局由Codex修改。DSH界面自动收集的布局/查看器等改动不代表DSH写入这些文件。保存锅标定为内底，按实际程序使用，不重新执行交互标定；此前DSH“不能直接当锅口中心”警示已处理。完整事实见交付文档。

## Codex 生产验收 · 20:57

1053份网页完整成品已同步；4159项线上断言、10类账号、酿酒接料例程计划/初始化、24项模型与App Cookie核验通过。427项保护文件与API/其他项目进程保持。回滚、截图、边界见交付文档；无新APK。
