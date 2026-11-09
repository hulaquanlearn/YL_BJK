# AT20 / DS77pro 测高测温握手复核（DSH，2026-11-05）

范围：只读核对实际私有备份 `.local/review-20261018/robot-library/01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad/backup.zip`（SHA256 `01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad`）中的 `HYbaojing.mod`、`BuJiu.mod`、`ModMain.mod`、`yuanxin.mod`、`ModData.mod`、`EIO.cfg`。未改源码、ZIP、API、Viewer、布局或部署。

**先说明证据边界**：用户提供的现场信息是 **AT20 红外与 DS77pro 测高装在同一盒、同一悬杆**；但这份 ABB 备份文本中**没有 AT20、DS77pro 或其他设备型号字符串**。因此本复核只能核对备份里的**通道、变量和握手**，不能从 ZIP 证明两台设备同盒/同杆，也不能把型号写入源程序。同盒/同杆属于现场硬件事实，需 BOM/照片/接线图确认。

## 1. 备份里的三套独立握手

### 1.1 测高（DS77pro 对应通道）

- `EIO.cfg:247` `do178_duqu_zaomian_gaodu`（DO 触发）
- `EIO.cfg:250` `di177_zaomian_celiang_ok`（DI 测量完成）
- `EIO.cfg:145` `GI192_207_zaomian_gaodu1`（GI 高度值）
- 调用：`BuJiu.mod:250-253` `GoFeed_LUJING` 内
  `Set do178_duqu_zaomian_gaodu; PanDuan_Liao; duqu_zaomian_gaodu;`
- `yuanxin.mod:129-224` 的受保护历史实现（注释）：
  `set do178 → WaitUntil di177_zaomian_celiang_ok → gaodu1:=GI192_207_zaomian_gaodu1 → ... → nDisZOffs:=zaomiangaodu`；
  另一段 `yuanxin.mod:250-295` 同样 `do178/di177/GI192`，但补偿有 **75/75** 与 **85/80** 的不同历史版本。
- 结论：测高的源握手是 `DO178 → DI177 → GI192`，且 `nDisZOffs` 由测量值经补偿得到。**不能把 DO178 直接当 DI177**；当前 `robot-cell-sim.js:59` 正是立即把 `di177 = do178`，属于离线回环，绕过真实测量延迟/有效性。
- `robot-deposit-state.js:46-59` 的 `readSurfaceFeedback` 已从局部料面产生虚拟 `GI192` 并写 `nDisZOffs`，但它没有模拟 `DI177` 的独立状态；该函数是模拟替代，不是相机/激光实测。

### 1.2 红外（AT20 对应通道）

- `EIO.cfg:220/295/292` `Do176_hongwai_QiYong`、`DO179_receive_HY`、`DI178_HY_receiveok`
- `EIO.cfg:142/241/244` `GI208_223_area_noa1`、`GI224_239_qidian_jiaodu`、`GI240_255zhongdian_jiaodu`
- `HYbaojing.mod:18-19/50-51/76-77/141-142` 设置 `Do176` + `DO179`；`yuanxin.mod:304-310 HY_QU()` 要求 `DI178=1` 且区域 ∈ {11,21,31,41,888}；`HYbaojing.mod:217/256/375` 读取/复位。
- 红外与测高是**独立通道**：红外用 `DO176/DO179/DI178/GI208/224/240`；测高用 `DO178/DI177/GI192`。同一盒子/悬杆不改变这一点，不能共享完成位。

### 1.3 测温（机器人/料面温度通道）

- `EIO.cfg:253` `DO181_duqu_robot_wendu`
- `EIO.cfg:256` `DO182_duqu_zaomian_wendu`
- `EIO.cfg:350` `di179_wendu_xieru_ok`
- `EIO.cfg:121` `GI48_63_wendu_zhi`（温度值）
- `EIO.cfg:79` `di23_wendu_ok`（另有状态位）
- `HYbaojing.mod:21-36`：机器人温度分支连续 3 次
  `Set DO181 → WaitUntil di179_wendu_xieru_ok=1 → Reset DO181`；
- `HYbaojing.mod:48-65`：料面温度分支连续 3 次
  `Set DO182 → WaitUntil di179_wendu_xieru_ok=1 → Reset DO182`；
- `ModMain.mod:657-658` 在 `InitAll` 中复位 `DO181/DO182`。

注意：**可读源码没有读取 `GI48_63_wendu_zhi` 的语句**。目前只能证明程序发出 `DO181/DO182` 并等待 `DI179`，不能证明程序读取了温度值、单位、符号或写入哪个变量；这些很可能在受保护 BaseMod/PLC 中。不能在离线模型中伪造温度值。

当前 `robot-cell-sim.js:58` 立即把 `di179 = do181 || do182`，同样属于**回环握手**：源程序三个脉冲会被瞬时满足，既没有测量延迟，也没有验证 `GI48`。这不是“伪造温度”，但会造成“测温已完成”的假象，必须区分。

## 2. 同一盒/同一悬杆的结论与限制

- 从信号上可以确认：AT20 红外、DS77pro 测高、温度/机器人测温是**三条独立握手**，不能因为同盒就把 `DI177`、`DI178`、`DI179` 合并。
- 同盒/同杆只意味着机械安装和供电/线缆可能共用；**IO 语义仍独立**。
- 从 ABB 备份无法确认：
  - AT20/DS77pro 的型号、通信协议、量程、采样率；
  - 同盒内是否共用控制器、电源、触发板；
  - `GI48_63_wendu_zhi` 的缩放/符号；
  - 两传感器光学窗口/激光光路是否互相遮挡。
- 因此不能把同盒/同杆写成源程序事实，也不能据此把 `DI177/DI178/DI179` 全置 1 凑完成。

## 3. 最小离线反馈闭环建议（Codex 接入时）

### 3.1 测高（独立状态机）

```
on do178 rising:
  height.pending=true; height.started=now
on update:
  if height.pending && now >= started + heightLatency:
     gi192 = round(localSurfaceHeightMm)          // 由料面/虚拟测量，明确标注 simulated
     di177 = 1
     height.pending=false
on do178 falling:
  di177 = 0; height.pending=false
```

- `heightLatency` 是明确离线参数，不是 DS77pro 实测节拍。
- 若没有虚拟测量，保持 `di177=0` 并报告等待，不能直接回环。
- `nDisZOffs` 的更新仍应在 `duqu_zaomian_gaodu` 调用边界进行一次，不能每段运动重复补偿。

### 3.2 测温（独立状态机，不伪造值）

```
on do181/do182 rising:
  temp[channel].pending=true; started=now
on update:
  if pending && now>=started+tempLatency:
     if simulatedTemperatureAvailable: gi48=value; di179=1
     else: di179=0; report 'temperature unavailable; not faked'
on do181/do182 falling:
  di179=0; pending=false
```

- `DI179` 不应由测高/红外/完成状态驱动。
- 源码只等待 `DI179`，没有可读的 `GI48` 读取；若没有温度源，应让测试显式注入或保持阻塞，**绝不填造温度**。
- 三脉冲要按源 `HYbaojing` 的脉冲顺序独立计数，不能一次置住不释放。

### 3.3 红外（保持独立）

- AT20 仍走 `DO176/DO179 → DI178 + GI208/GI224/GI240`，与测高/测温无共享完成位。
- 同盒只影响安装和线缆；不要把红外的 `DI178` 当作测高的 `DI177`。

## 4. 代码层面的问题

1. `robot-cell-sim.js:58`：`di179 = do181 || do182` 是即时回环；没有测量状态/延迟，也没有确认温度值。
2. `robot-cell-sim.js:59`：`di177 = do178` 是即时回环；没有独立测高状态/延迟。
3. 当前 `readSurfaceFeedback` 写 `GI192`/`nDisZOffs` 是受保护函数的**虚拟替代**，不是 DS77pro 实测；其 85/80 补偿来自历史注释，且注释版本另有 75/75，不能当唯一真值。
4. `HYbaojing.mod` 的测温分支没有可读温度值读取；`GI48_63_wendu_zhi`、`di23_wendu_ok` 可能在 BaseMod/PLC 内，不能从现有源码断言闭环。
5. 同盒/同杆没有在备份文本中出现；不要把 AT20/DS77pro 型号/共用盒写进源程序或宣称已从备份证明。

## 5. 建议验证

- 读实际备份：确认 `DO178/DI177/GI192`、`DO176/DO179/DI178`、`DO181/DO182/DI179` 三组独立信号；当前备份 SHA 与 16 个文件一致，`BaseMod.mod` 仍受保护。
- 单测：`do178` 脉冲只产生一次延迟后的 `di177`/`GI192`；`do179` 复位后下一次再请求；不能一次请求重复刷新。
- 单测：`do181/do182` 各自脉冲；`di179` 不因 `do178`/`do176` 或沉积完成置位；无温度源时不为1。
- 回归：`HYbaojing.dengdai_hongwai`/`dengdai_hongwai2` 不因测高/红外/温度交叉反馈提前跳过；`BuJiu` 接料/盖顶分支顺序不变。
- 机械：同盒同杆的 AT20 窗口、DS77pro 激光窗口、线缆、悬杆振动/热漂移需现场图/BOM 核对；离线模型不声称已做光学/热学标定。

本文件只记录复核和建议，未改代码；AT20/DS77pro 同盒同杆以用户现场说明为输入，不从 ZIP 冒充证据。
