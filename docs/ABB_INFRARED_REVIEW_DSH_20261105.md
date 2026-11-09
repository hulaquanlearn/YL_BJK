# ABB 上甑红外相机离线复核（DSH，2026-11-05 19:14）

范围：只读分析本项目实际备份 `.local/abb-flow-20261105/report.json` 中的 `HYbaojing.mod`、`fenqu.mod`、`ModMain.mod`、`EIO.cfg`，以及当前 `server/src/robot-infrared-sim.js` 与 `robot-cell-sim.js` 的红外接入。**只写本复核文档**，不改源码/ZIP/部署/浏览器。

当前只读文件哈希（供 Codex 对照）：
- `server/src/robot-infrared-sim.js` `0E712A73EC3939E0A50E5706FDB96C6CAA9F97680EEB677A3A14BC9EFBD68661`
- `server/src/robot-cell-sim.js` `8E7D0E2CCF36C644361D322DD269E704A8868F389DB9345F56175A207F8FF7B5`
- `server/src/robot-sim.js` `DE2E34B15DCDFB310DAFC2DDA1C9295F3A456A20B7624682CD70C2ED0CBD857E`

## 1. 结论摘要

1. **DI105 仍被离线“推断”驱动，不是真实 PLC 反馈**。当前 `robot-cell-sim.js:50` 调用 `updateInfrared`，而 `robot-infrared-sim.js:25-26` 用 `nDisZOffs>=gai_ding_gao_du || depositedVolume>=targetVolume` 计算 `camera.cover` 并写 `di105_gaiding`。这不是当前代码字面上的“DO176→DI105”（旧版本可能是），但效果相同：**绕过了源程序等待 PLC `Di105_Gaiding` 的分支**。`DO176` 是红外使能，不是盖顶反馈；EIO 另有 `Do105_Gaiding`/`Di105_Gaiding`（EIO:380/377）。
2. **红外握手本身方向大体正确**：做 `do176` 使能、`do179` 请求、相机 1/2/3 位、结果有效时置 `di178`；但区域只覆盖 11/21/31，缺 41/888，角度使用 0/60/…/0，最后一段 360° 的 0 需要确认；`GO320=0` 时相机位置保持旧值，不是严格回显 0。
3. **`GO320` 的源语义应保留**：1=左锅相机位、2=右锅、3=退避；`ModMain` 在选锅时置 1/2，`BuJiu` 在退避时置 3 并等 `GI320=3`，之后置 0。`GI320` 是输入反馈，不应由程序直接“假装”瞬时到位。
4. **最小闭环**：把 IR 相机结果与盖顶反馈分开。IR 只负责 `do176/do179 → (位置1/2/3) → area/start/end → di178`；`do105→di105` 需要独立、带延时/条件的盖顶执行器，或者将 `di105` 保持 0 由测试显式注入。**不能**从 DO176、锅炉高度、depositedVolume 推导 DI105。
5. 不得伪造测温：当前 `camera.temperature=null` 是对的；区域选择应是几何代理并标 `simulated:true`，不是热像温度。不要把“区域欠铺”伪装成“红外测温结果”。

## 2. 源信号与状态机

### 2.1 EIO 定义

- `EIO.cfg:142 GI208_223_area_noa1`（区域输入）
- `EIO.cfg:220 Do176_hongwai_QiYong`（红外使能 DO）
- `EIO.cfg:223 Do177_hongwai_DingGuo`（外红定锅 DO，和 176 不是同一个）
- `EIO.cfg:226 Go320_336_sifu_weizhi`（相机位置命令 GO）
- `EIO.cfg:241/244 GI224_239_qidian_jiaodu / GI240_255zhongdian_jiaodu`（角度输入）
- `EIO.cfg:292 DI178_HY_receiveok`（相机结果收到 DI）
- `EIO.cfg:295 DO179_receive_HY`（请求接收 DO）
- `EIO.cfg:317 GI320_335xiangji_weizhi`（相机位置反馈 GI）
- `EIO.cfg:368/371/374 GO208/GO224/GO240`（程序写回红外的区域/角度 GO）
- `EIO.cfg:377 Di105_Gaiding`（盖顶到位 DI）
- `EIO.cfg:380 Do105_Gaiding`（盖顶命令 DO）

### 2.2 相机位置

- `ModMain.mod:26` 左锅时 `SetGO Go320_336_sifu_weizhi,1`；`:38` 右锅时 `2`。
- `BuJiu.mod:175` `SetGO ...3`，`:184` `WaitUntil GI320=3`，`:186` `SetGO ...0`；`:198/200` 同样用于另一处退避。
- `ModMain.mod:159/162/174/177/363/366` `WaitUntil GI320=1`（左）或 `2`（右）。
- 所以最小反馈必须能产生 **1/2/3**；`GI320` 是反馈输入，`GO320` 是命令，不能只写 `GI320` 不保存 `GO320` 的来源。`0` 是释放/回零，源程序没有在 0 上等待，但应回显为 0，避免残留“还在3”的假反馈。

### 2.3 DO176/DO179/DI178 握手

- `HYbaojing.mod:18-19`、`:50-51`、`:76-77`、`:141-142`：`Set Do176_hongwai_QiYong` + `Set DO179_receive_HY`。
- `HYbaojing.mod:35-36` 在测温分支 `Reset Do176`/`Reset DO179`。
- `HYbaojing.mod:85-112` 等待 `hongwai_OK`：`HY_QU()` 或 `di102`、`Di105`、`bPuDi_Satart` 等条件退出；`HY_QU()` 见 `yuanxin.mod:304-310`：
  `DI178=1 AND GI208 in {11,21,31,41,888}`。
- `HYbaojing.mod:217` `IF HY_QU() AND DO179_receive_HY=1` 才进入区域路径，取 `GI208`；`:256` 处理后 `Reset DO179_receive_HY`；`:375-377` 再次请求（如果 DI178=0）。
- 结论：**DO176 是使能，DO179 是请求，DI178 是结果有效**，三者不能合并。当前 `updateInfrared` 用 `do176 && do179 && position===selected` 作为采集条件，方向正确；问题只在 DI105。

### 2.4 区域/角度

- `fenqu.mod:123-125`：`nCycle_HY:=GI208`，`nCStartAngle:=GI224`，`nEndAngle:=GI240`。
- `yuanxin.mod:7-40 jiaodu_duqu1`：读入原始角度（0..360），`qidian:=Round(GIqi/5)`，`zhongdian:=Round(bianhualiang/5)+qidian`。因此 `GI224/GI240` 应输出**原始度数**，不是已经除以 5 的格数；当前 `robot-infrared-sim` 的 `startAngle:0/60/...` 原始度数是对的。
- `fenqu.mod:126-191` 的区域分支：
  - 11 面糟：起点/终点来自 GI224/GI240，`qidian=qidian-3`，方向1；
  - 21 中上：来自 GI224/GI240，`qidian=qidian-5`，方向1；
  - 31 中中：`qidian=0, zhongdian=76`，方向1，角度按 `HY_31` 周期；
  - 41：`qidian=0, zhongdian=0`，方向1，角度按 `HY_41` 周期；
  - `GI208=888`：`HYHY` 在 `HYbaojing.mod:219` 直接 `GOTO R66`（不执行区域路径）。
- 当前 `selectInfraredRegion` 只产生 11/21/31，缺 41/888。如果实际源会出现 41/888，当前模拟会给出一个错误区域而不是“无目标/不扫描”；至少应显式声明“离线不支持41/888”或在结果中支持 888 作为无目标分支。
- 角度边界：当前 `endAngle` 对最后一个扇区为 0（`(sector+1)*60===360?0`），源 `jiaodu_duqu1` 对 qidian=300、GIzhong=0 需要能处理成 300..360；建议明确用 360，或补测试确保 wrap 语义与源一致。

### 2.5 DI105/DO105 与 HY 分支

- `EIO.cfg:377/380` 有独立的 `Di105_Gaiding` 输入和 `Do105_Gaiding` 输出，不是 DO176。
- `BuJiu.mod:60 Set Do105_Gaiding`（开始盖顶/收尾）；`:66` `(di102 OR Di105_Gaiding=1) AND hongwai_OK=0` 时才处理；`:121` 盖顶分支也依赖 `nDisZOffs` 与 gaiding。
- `HYbaojing.mod:86` `HY_QU() OR di102 OR Di105_Gaiding=1 OR bPuDi...` 决定退出等待；`:131` `IF di102=0 AND Di105=0 THEN GOTO A63`，即盖顶未到则继续下一层/扫描；`HYbaojing.mod:88` 也要 `Di105=0`。
- 当前 `robot-infrared-sim.js:25-26` 用 `nDisZOffs>=gai_ding_gao_du || c.depositedVolume>=targetVolume` 写 `di105`：
  - 这不是盖顶执行器反馈；
  - 会让 HY 分支在“高度/体积到目标”时直接跳过/退出，**绕过真实的 do105→di105 等待**；
  - 也与 `BuJiu.mod:60` 的 `Do105` 命令没有关系。
- 因此这是**真实阻断项**，不是显示小问题。

## 3. 当前代码的具体问题

1. `server/src/robot-cell-sim.js:50` 在每步 `updateCell` 开头调用 `updateInfrared`；当前红外模块把 `di105` 当输出写回。
2. `server/src/robot-infrared-sim.js:25-26`：
   ```js
   camera.cover = Number((nDisZOffs >= gai_ding_gao_du) || (c.depositedVolume >= c.targetVolume-1e-9));
   set('di105_gaiding', camera.cover);
   ```
   这是**按高度/体积推断盖顶**，不是现场盖顶反馈。用户描述“cell 把 DI105 直接映射 DO176”在旧版本可能成立；当前代码换了形式但同类绕过仍在。
3. `robot-infrared-sim.js:19-21`：`camera.position = [1,2,3].includes(GO320) ? GO320 : previous`；`GO320=0` 时保留3，且没有对 0 回显。`GI320` 是输入，源程序可能不等待 0，但应避免残留位置影响下一次 `HY_QU`/选择。
4. `robot-infrared-sim.js:6-14`：区域只生成 11/21/31；缺 41 和 888；`888` 是源程序“无区域/跳过”语义，不应当成普通区域。
5. `robot-infrared-sim.js:29-30`：一次性写 `GI208/GI224/GI240` 并置 `DI178=1`，没有模拟 GO208/GO224/GO240 的回读/握手；源程序在 `HYHY:293-295` 用 GO 写回，当前离线直接写 GI 可工作，但必须保证源代码先把结果读走再清 DI178，并给测试覆盖。
6. `robot-infrared-sim.js:25` 的 `camera.cover` 与 `c.complete` 独立；`robot-cell-sim.js:51` 在 `complete` 后提前 return，可能使相机状态/`di105` 不再按源路径复位。

## 4. 最小离线反馈闭环建议

### 4.1 分离两个设备状态

**A. 红外相机（几何代理，不测温）**

```
position = go320 in {1,2,3} ? go320 : 0    // 回显，不保留陈旧3
set gi320 = position
enabled = do176 && !complete
request = do179
if (enabled && request && position === selected && !ready) {
  result = proxyRegion(cell)               // area/start/end only
  set gi208 = result.area
  set gi224 = result.startAngle
  set gi240 = result.endAngle
  ready = true
  set di178 = 1
  event.simulated = true; temperature = null
}
if (!enabled || !request || position !== selected) {
  ready = false
  set di178 = 0
}
```

- `selected` 由在用工位决定（左=1，右=2）；`3` 是退避，不能采集。
- `dengdai_hongwai`/`dengdai_hongwai2` 都是 **DO176/DO179** 请求；一个请求周期只产生一次结果；源程序 `Reset DO179` 后清 `DI178`，不要持续刷新。
- **不设置任何温度**；如前端需要显示，显示“几何代理/未测温”，而不是伪造 ℃。

**B. 盖顶执行器（独立于红外）**

```
command = do105_gaiding             // 源程序盖顶输出，不是 DO176
if command && !lid.active: lid.active=true; lid.started=now
if lid.active && now-lid.started >= lidDelay:
    set di105 = 1                   // 盖顶到位反馈
if !command:
    lid.active=false; set di105=0
```

- `lidDelay` 是明确标注的离线执行器参数，不是现场节拍。
- 如果暂时没有盖顶执行器模型：**保持 `di105=0`**，通过测试/调试输入显式注入 `1` 来验证 HY 的盖顶分支；绝不能从 IR/DO176/高度/沉积体积推导。
- `Do105_Gaiding` 是命令，`Di105_Gaiding` 是反馈；`DO176`/`DO179`/`DI178` 是红外，不是盖顶。
- 需要验证 `BuJiu:60` 设 `Do105` 后，`BuJiu:66`/`HYbaojing:86/131` 在 `DI105` 0→1 时分支正确；`DI105` 回0时继续等待。

### 4.2 相机选择/退避

- `ModMain:26/38` 1/2；`BuJiu:175/184/186` 3→等3→0。
- 最小模拟：`GO320` 1/2/3 → 在下一 update 让 `GI320` 回显；3 清 `DI178` 并标记退避；0 回显0，不保留3。不要“瞬时”发结果，至少等一个状态步，便于源程序 WaitUntil 看到真实切换。
- `GO320=3` 时 `camera.position!==selected`，DI178=0；`HY_QU` 不会误真。

### 4.3 区域/角度最小集合

- 支持 11/21/31（当前）并明确可选 41；区域只影响源 `fenqu` 路径，不是温度。
- 888 作为“无区域/跳过”单独处理：`HYbaojing:219` 走 R66，不应产生普通区域路径；如果要模拟无目标，输出 888 并让 DI178 有效，让源程序自行跳转。
- 41 是源 `fenqu` 的合法 case，`qidian=0/zhongdian=0`；若离线代理不生成 41，需在文档标注“未覆盖 41”，不能把 41 错当 11/21/31。
- `GI224/GI240` 原始 0..360；最后一段 300..360 建议给 360 而非0，或加 wrap 测试；`jiaodu_duqu1` 的 5°量化由源程序做，代理不要预除。
- `GO208/GO224/GO240` 源在 `HYHY:293-295` 回写；离线可以直接给 GI 作为反馈，但测试必须验证源 `HYHY` 先读 GI、再写 GO 的顺序，不能被提前置 DI178 打断。

## 5. 必须验证的源例程

建议最小回归（不修改 ZIP；用当前 `createSimulation`/离线 cell）：

1. `HYbaojing.dengdai_hongwai` / `dengdai_hongwai2`：
   - `do176=1, do179=1` → 相机1/2 → DI178=1、area/start/end 合规 → `HY_QU` 真 → 进入 `HYHY`；
   - `do179=0` → DI178=0，源程序不应把旧结果当新结果；
   - 相机3/0 → DI178=0，不能采集。
2. `HYbaojing.HYHY` + `fenqu.hongwai_quyu`/`hongwai_quyu_1..6`：
   - GI208 11/21/31/41 各路径；GI224/240 角度转换（qidian/zhongdian、wrap 0/360）；
   - 888 走 R66，不执行普通区域路径；
   - 每个区域只产生一次源路径，不重复叠加。
3. `BuJiu.bujin_2`/`JS_pd0`/`JS_pd1`：
   - `DI105=0` 时 `BuJiu:66/121` 的等待/下一层分支保持；
   - 独立注入 `DI105=1` 时盖顶分支执行；不得由 DO176/高度自动变为1；
   - `Do105` 置位但 DI105 未到位时，源不应提前进入盖顶完成。
4. `ModMain.rWorkLoop`/`main` + `GoFeedCnv_Base`：
   - 左/右选择后 `GO320=1/2`，等待 `GI320`；
   - `BuJiu` 退避 `GO320=3` 等 `GI320=3`，再回0；
   - 完整 800 循环中红外请求不阻断铺料，也不伪造测温。
5. `GoFeedCnv2_PANDUAN` 与 `HYHY:256-257` 的衔接：
   - Reset DO179 后 DI178 清0；再次 Set DO179 时才允许下一次结果。
6. `ModMain.InitAll:498-499` / `HYbaojing`末尾：`Do176`/`Do179` 复位、相机位置回退，`DI178=0`，不得残留。

## 6. 不建议的做法

- 不要把 `DI105_Gaiding` 设为 `1` 来“让流程走完”；这会让 `HYbaojing:86/131` 跳过真实盖顶等待。
- 不要用 `nDisZOffs>=gai_ding_gao_du` 或 `depositedVolume>=targetVolume` 推导 `di105`；这是体积/高度推断，不是执行器反馈。
- 不要把 `DO176`（红外使能）当 `DI105` 或 `DO105`。
- 不要伪造温度、热像或相机测量值；当前 `temperature:null` 和 `simulated:true` 应保持。
- 不要把 888 当普通区域，也不要把 41 错映射成 21/31；源路径分支不同。
- 不要在 `DO179` 持续为1时反复刷新 DI178/区域；一次请求一次结果，等源程序复位。

## 7. 交付建议

- Codex 的 `robot-infrared-sim.js` 最小改动点：**删除 `di105` 写入**；新增独立 `do105→di105` 的离线执行器（带明确延迟/参数）或保持0+注入；扩展 41/888 语义与角度 wrap；GO320=0/3 的位置回显；每请求一次结果。
- 前端相机可视化只读 `camera`/`di178`/area/angles；温度显示必须显示“未测温/几何代理”，不能显示伪造数值。
- 测试至少覆盖上述 1–3；再跑左/右 800 与 `dengdai_hongwai` 单例程，确认没有把 `di105` 从红外/高度间接置1。
- 本轮只读，未改代码/ZIP/部署；最终以 Codex 冻结文件哈希和测试结果为准。
