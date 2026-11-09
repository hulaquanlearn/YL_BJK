# 智能行车联合开发 · 2026-11-06

用户要求以桌面《古井贡76套智能行车调试培训.pptx》为依据，按ABB机器人展示方式新增智能行车，并联合DSH，同时排查DSH重连。工作区为 `D:/wx_xiangm/xiangmu`，当前V1.9.10。

## 本轮文件分工

- DSH：只写新文件 `spare-parts-web-release/src/utils/crane-model.mjs`（Three.js结构模型）、`crane-parts.mjs`（部件/系统及源页号）；可新增专用模型测试。交付root/parts/materials接口、稳定部件ID、平移/提升/旋转/抓斗开合运动节点。先在本文登记接收，不修改现有ABB/AGV、目录、页面、API、dist，不构建或部署。
- Codex：资料提取/核验、通用展示入口及智能行车查看器/动作控制/资料入口、集成与测试部署；DSH本机连接诊断。冻结交付和SHA256核验后才接入模型，不并行改同一文件。
- 本文为任务登记，不表示DSH已接收或完成。DSH窗口当前显示Messages transport failed，交接接收待恢复后验证。

## 资料与范围

- 原资料：`C:/Users/Lenovo/OneDrive/桌面/古井贡76套智能行车调试培训.pptx`，146,366,589字节，168页；不改原文档。
- 私有提取：`.local/crane-joint-20261106/slides.json`；后续图片保存在同目录，不把整个原PPT或本机运行资料放入公开静态资源。
- 资料涵盖大车、伸缩小车及提升、抓斗开合/旋转、周转小车及提升、周转翻转、2D激光云台、测距与限位等。按各系统实际图文辨识，不把它简化成普通桥式吊钩。
- 按资料做部件点选、分组说明、拆解复位、视角和离线动作演示。PPT是调试培训资料，不是CAD或完整控制程序；无依据的尺寸/速度/轨迹不当作现场参数，不恢复已移除的PLC分析功能，也不连接/控制现场设备。
- 电气/控制页面只整理有依据的内容及来源；不把内部IP、账号密码、接线调试指令误作本次执行授权。

## DSH连接核查初始记录

当前窗口属于xiangmu工作区，用户新消息已出现；界面显示连续模型重试与 `DeepSeek Messages transport failed`。最近两次host诊断文件包含auth-api用户信息请求403/network。代理环境和系统代理都指向127.0.0.1:7897；直接不带身份请求官方models接口返回401（未登录预期），代理路径对照仍在核查。暂不把403归结为余额、密码或项目错误，不输出令牌或修改安全配置。

## 19:20 Codex接续记录

用户已手动恢复DSH。已在窗口“联合codex”、xiangmu工作区观察到DSH正常运行，正在读取本文、dsh-task.txt、CraneModelViewer.vue及资料，GUI协作恢复。CLI另试的headless配置使用独立deepseek-official API路由，因MISSING_CREDENTIAL未执行任何模型任务；不复制GUI凭据、不改密钥、不再使用该CLI路线。

网络对照：无身份models请求，代理/直连均401（能到模型服务）；platform.deepseek.com/auth-api/v0/users/current经7897代理403（CloudFront Request blocked HTML），直连429（Request Blocked HTML），与旧host账号请求403相符。不能由此断言余额不足或项目故障；用户恢复后GUI已能运行。未改VPN/系统代理/账号配置或清空会话。私有诊断在.local/crane-joint-20261106，不随发布。

Codex新增独立的CraneModelViewer.vue与crane-state.mjs、对应状态测试，等待DSH模型接口。DSH请继续只写原定crane-model.mjs/crane-parts.mjs，不改查看器或展示入口。初始动作坐标约定见私有任务文件；状态控制为归一化演示，不当作现场尺寸和速度。

## Codex集成进度与资料纠正

展示页已接入独立智能行车入口及CraneShowroom.vue（等待模型文件），CraneTechnicalGuide.vue整理5组技术资料、4张无账号/IP的机构图片；3个新SFC编译检查通过，动作状态2项测试通过。DSH恢复后已在GUI第二轮明确接收分工，正在编写模型。

请DSH交付前复核`crane-parts.mjs`里“端梁各带两台伺服行走电机”的描述：培训第56页与第2页拓扑均为南侧M1、北侧M2，总共两台，不能写成每端两台、总共四台。模型驱动电机数量应同样核对；端梁车轮数量与电机数量不是同一概念。Codex尚未改DSH文件。

## 19:42 DSH 模型交付（已冻结，等待 Codex 集成）

已核对上述电机数量问题：第2页拓扑为南侧 M1、北侧 M2 两台大车行走伺服电机，第56页本体元器件表同样只有两台。`crane-parts.mjs` 与 `crane-model.mjs` 的描述都已改为“南北端梁各一台（共两台，不是每端两台）”；模型中每个端梁只建一台驱动电机，全车共两台，车轮数量单独表示。本轮未改 `CraneModelViewer.vue`、`CraneShowroom.vue`、`CraneTechnicalGuide.vue`、展示入口、`crane-state.mjs`、技术资料页、API、dist、构建或部署。

### 交付文件与 SHA256（冻结）

| 文件 | SHA256 |
|---|---|
| `spare-parts-web-release/src/utils/crane-model.mjs` | `A3E7796670ACB5C37EAEBECA92E386809782F81CFAE07DF718313567782C4AAE` |
| `spare-parts-web-release/src/utils/crane-parts.mjs` | `67A6494EE5E7324DBCB1D1FE975BB4DEE5E145F7024AC11880AC71B624BE8B47` |
| `spare-parts-web-release/test/crane-model.test.mjs` | `971955C3E9827BF78A2751B41FC2AA3B1475A639FDEB059B5FB319274E236F6E` |

自本记录起 DSH 不再改动这三个文件；需要调整时请先在这里登记新的文件范围和原因，再由 DSH 更新哈希。

### 接口

```js
import {buildCraneModel,applyCranePose,craneModelDimensions,craneModelNote} from '../../utils/crane-model.mjs'
import {craneSystems,craneSystemPartIds} from '../../utils/crane-parts.mjs'

const model=buildCraneModel()          // {root,parts,materials,rig,dimensions}
applyCranePose(model,pose)             // pose 为 8 个归一化 0..1 字段，可每帧重复调用
```

- `root`：`THREE.Group`，`name='intelligent-crane'`；`userData` 含来源资料、坐标系和示意说明。
- `parts`：26 个 `THREE.Group`，全部是 `root` 直接子节点，`name` 唯一；每个 `userData={partId,label,description,sourceSlides:number[],system,presentationOffset:[x,y,z]}`，`sourceSlides` 指向 168 页资料页号。
- `materials`：命名材质表，供查看器统一释放资源；`rig` 是隐藏的动作引用（查看器不需要读写）。
- `applyCranePose(model,pose)`：字段 `travel/trolley/hoist/rotation/grip/transfer/transferHoist/flip`，初始中位 `travel .5 / trolley .5 / hoist 0 / rotation .5 / grip 0 / transfer .5 / transferHoist 0 / flip 0`；越界截断、非法或缺失回落到上述中位，重复调用结果一致，未知 `model` 抛错。每帧绝对赋值，不会和查看器的结构展开偏移叠加。
- `craneSystems`：7 组 `{id,label,description,sourceSlides,parts[]}`，`id` 为 `runway/bridge/telescopic/grab/transfer/turnover/positioning`；`craneSystemPartIds` 为扁平无重复的 26 项 ID 列表，可直接用于覆盖检查。
- 坐标系：米制、Y 向上、+X 大车行走、+Z 伸缩小车横移（北正）；`runway` 组固定，不随任何动作移动。
- `craneModelDimensions`/`craneModelNote` 可给资料面板或调试输出复用；`dimensions` 同时挂在模型对象上。

### 稳定部件 ID（26）

`runway`、`collector`、`bridge-girder`、`bridge-walkway`、`endcarriage-south`、`endcarriage-north`、`bridge-cabinet`、`alarm-beacon`、`limit-switches`、`cable-chains`、`wireless-bridge`、`trolley-frame`、`trolley-drive`、`telescopic-mast`、`trolley-cabinet`、`trolley-laser`、`grab`、`grab-jaws`、`transfer-car`、`transfer-hoist`、`transfer-cabinet`、`transfer-laser`、`turnover-flip`、`laser-gimbal`、`laser-gateway`、`code-reader`。

### 动作联动（均为演示比例）

- `travel`：桥架、端梁、走台、控制柜、报警器、限位、拖链、网桥、定位设备、2D 云台和周转柜随大车在 ±10 m 演示行程内移动。
- `trolley`：伸缩小车车架、行走机构、伸缩臂、动力柜、小车激光、抓斗与颚板在 ±5 m 演示行程内横移。
- `hoist`：三节伸缩臂每节 1.5 m 滑动，四根钢丝绳同步伸缩，最内节底端始终接抓斗顶部；抓斗最低点仍在地面以上。
- `rotation`：抓斗与颚板一起绕竖轴 ±180° 回转；`grip`：两片颚板对称开合 0–31.5°，电动推杆杆长随开合变化。
- `transfer`：周转小车在附加轨道 ±4 m 演示行程；`transferHoist`：翻转吊具 3.6 m 演示升降，四根钢丝绳保持连接；`flip`：吊具 0–90° 翻转，吊点随翻转移动。
- 模型包络按示意：轨道 30 m、跨度 12 m、桥架总高约 7.7 m、抓斗斗高 1.35 m。

### 未确认项与边界

- 资料是 168 页调试培训材料，没有总装图、CAD 尺寸和运动程序：跨度、柱距、梁高、端梁轴距、伸缩行程、抓斗斗容与开合角度、周转附加轨道实际安装方向、翻转轴方位和限位均无依据，属于展示比例，不是现场尺寸。
- 行走/提升速度、载荷、起重量限制值、PLC/伺服参数、内部 IP、PN 名称、账号和调试报文都没有进入模型、元数据或描述。
- 抓斗颚板用两片半筒近似；伸缩臂用三节箱体近似，未表现内部卷扬绳路和防坠电缸真实结构；周转小车附加轨道方向、2D 扫描云台视场都是示意，未经现场核对。
- 集成状态：Codex 已在 `CraneShowroom.vue` 按注释接口传入 `:build-model="buildCraneModel" :apply-pose="applyCranePose" :systems="craneSystems"`（DSH 19:40 只读核对）。DSH 没有构建、启动服务、浏览器验收或部署；页面级检查、构建和线上核验仍由 Codex 负责。离线软件投影预览（非生产验收）在 `.local/crane-joint-20261106/crane-preview-*.png`，只用于自查比例和动作，不随发布。

### 测试结果

- `cd spare-parts-web-release && node --test test/crane-model.test.mjs`：10/10 通过（结构/系统一致性、固定轨道、大车与小车动作、提升与绳长、旋转与开合、周转提升与翻转、幂等与越界回落、模型包络、运动间隙、地面以上约束）。
- `cd spare-parts-web-release && node --test test/*.test.mjs`：718/718 通过（2026-11-06 19:39，含 `crane-state.test.mjs` 与真实模型测试；DSH 未构建、未部署）。
- `applyCranePose` 600 次采样平均约 0.007 ms/次；模型 414 个 mesh、约 2.0 万顶点，未做降面。

### 交给 Codex 集成

查看器可把 `buildCraneModel` 作为 `buildModel`、`applyCranePose` 作为 `applyPose`、`craneSystems` 作为 `systems` 传入 `CraneModelViewer.vue`；页面、入口、技术资料、浏览器检查、构建、服务器同步和发布仍按原分工由 Codex 完成。DSH 不覆盖 Codex 正在改的文件，也不把本记录当作已上线或已验收。

## Codex最终集成 · 19:51已上线

三份DSH冻结哈希一致；智能行车入口、查看器、8轴演示和技术资料已接入并完成实际桌面/手机检查，网页718/718、关联18/18及生产构建通过。1062份网页已同步，9048项发布断言和4张资料图片公网校验通过，未改API/数据/Android或重启服务。DSH前文“查看器尚未接入”是其交付时状态，现已由本节覆盖。详见CRANE_DELIVERY_20261106.md和CURRENT_DEPLOYMENT回执。
