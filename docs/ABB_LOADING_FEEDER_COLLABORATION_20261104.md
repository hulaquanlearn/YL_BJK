# ABB 加载与上甑喂料机联合接续

用户新要求：工具与示教器加载很慢；旧接料设备停用，现为上甑喂料机，链板下带气缸暂存斗，位于机器人接料点上方；联合 DSH 排查其他相关问题。此前同步授权有效，Codex统一测试、备份部署；不是继续早先暂不部署状态。

## 文件分工（本次先登记）

- DSH 拟拥有新增 `spare-parts-web-release/src/utils/abb-feed-station.mjs` 及 `test/abb-feed-station.test.mjs`，本记录的DSH追加段落。按用户照片建喂料机可视总成；其余文件只读诊断，尤其不要同时改查看器、加载缓存、服务器、原GLB、构建输出。
- Codex：查看器/示教器资源加载、加载进度、按需刷新、性能测量、`abb-robot.mjs` 接料工位定位/入口/标签、服务器无损压缩传输与集成/回收/测试/部署；相关测试与说明。
- DSH未确认接收前，不把消息发出当交付。稳定交付需文件哈希、实际测试和已知边界。

## 模型证据和约定

现场照片：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-979cf336-4ecf-47df-b8ca-5289780f4bea.jpg`。用户示意：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-aa5a3018-4f58-40f8-8816-cc8943c07b2a.png`。图片只作结构证据，没有量尺，尺寸按展示比例标明，不冒充实测。

新模块导出 `createFeedStation({outletHeight=2.05}={})`，返回 Three.Group；局部Y向上、底部落地、出料口中心XZ为0。总成含上方链板供料段、下方矩形上斗/收缩暂存斗/短出料口、气缸及铰接闸板和外支架，银灰金属。避免不必要密集网格；链板可用实例化。提供 `root.userData.setGate(amount)` 或独立rig接口，销轴与缸两端连上、开合无悬空。外观以可见照片为准，未知内部件不虚构。Codex负责世界位置与机器人接料区配合，不修改真实程序点位。

旧 `feeding-buffer.glb`、`supply-conveyor.glb` 不再作为本页在用资产；确认所有引用后按回收规则移出有效发布，原建模资料仍保留溯源。

## Codex 最终验收 · 19:54

DSH第二版两文件哈希与交付表一致；独立运行模型测试并集成，网页607/607、压缩传输/数据保护4/4及生产构建通过。第二版反馈中的封闭进出料面、链板和支架问题由Codex独立复核提出，不是新增现场尺寸证据。`meshoptimizer`依赖、package.json/package-lock.json由Codex安装修改，DSH界面自动收集的工作区改动列表不代表文件作者。

1053份网页+2份API+1份web运行器已同步，公网压缩大小/鉴权/退役地址、10类账号与保护哈希等4163项断言通过，App共用页面生效，无新APK。完整事实、截图、回收与恢复见 [本轮交付](ABB_LOADING_FEEDER_DELIVERY_20261104.md)。此前DSH初稿不再是最终几何。

## DSH 接收与交付（2026-11-04 19:10）

已读本交接和现场照片/用户示意图，**接受本轮范围**：只新增 `spare-parts-web-release/src/utils/abb-feed-station.mjs` 与 `spare-parts-web-release/test/abb-feed-station.test.mjs`；其余只看只读复核，不改查看器/示教器/`abb-robot.mjs`/缓存/服务器/旧GLB/dist，不构建、不部署、不开第二端口。照片无量尺，模块尺寸一律标为按展示比例估算，不写实测；未知内部件不建模。`robot-sim.js` 保持 Codex 最新 SHA `C79739D8…F9B341` 不覆盖。交付后在本文件追加测试、SHA 与边界。

### DSH 交付（2026-11-04 19:35）

#### 新增文件与接口

| 文件 | SHA256 | 内容 |
| --- | --- | --- |
| `spare-parts-web-release/src/utils/abb-feed-station.mjs` | `97548DC97118584422A033A4D335CDAE0C92854AF71E79CAFDFDB4234C9486E6` | `createFeedStation({outletHeight=2.05})` 返回 `THREE.Group`；本地 Y 向上、脚 y=0、出料口中心 x=z=0、y=outletHeight |
| `spare-parts-web-release/test/abb-feed-station.test.mjs` | `19B1D1292E88172CC00CDECE21D9250FF2808700EEEDFA34882B7962C37E528B` | 5 项，见下 |

- 结构组成：上方链板供料段（15 块实例化链板、底板/侧挡板/支撑柱）、矩形上斗、收缩暂存斗（四棱锥台）、短出料口、气缸缸体/活塞杆/铰接耳轴、铰接闸板（闸板/摇臂/销轴）、四脚外支架与横梁；全部银灰金属材质。
- 联动接口：`root.userData.setGate(amount)`（同时 `root.userData.gate.set`），0=关闭、1=打开，自动钳制 0–1 并返回实际值；`root.userData.getGate()` 读取。开合时闸板绕 X 轴 0…-1.1rad，气缸缸体随销轴方向转动，活塞杆长度/位置重算，杆两端分别连缸体端和闸板销轴；模型放入场景（平移/旋转）后仍按 root 局部坐标计算，不随世界变换脱开。
- 辅助信息：`root.userData.parts`（outlet/upperHopper/chainDeck/support/cylinderGroup/gatePivot/rod/plates）、`outletHeight`、`dimensionsEstimated:true`、`source` 明确照片无量尺；`dispose()` 释放几何/材质。
- 低网格：30 个 Mesh/InstancedMesh、676 三角形（实例化链板 15 块），无 GLB/纹理、无内部虚构件；出料口为矩形短管，不伪造圆口或未知内部结构。

#### 测试（`cd spare-parts-web-release`）

`node --test test/abb-feed-station.test.mjs` → **5 通过 / 0 失败**：

- 默认 Group、出料口 XZ=0/y=2.05、脚落地、边界有限；`outletHeight` 1.9/2.4 可调，整机高度随动且脚仍落地；非法高度抛 RangeError。
- 照片可见总成名称齐全、链板为 InstancedMesh（15 块）、四脚落地、低网格（<5000 三角形，实际 676）。
- `setGate(0/0.5/1)` 角度正确、杆长变化、杆末端与闸板销轴误差 <1e-6；模型平移/旋转后仍连接；`setGate(2/-3/NaN)` 正确钳制。
- 材质金属度/粗糙度符合银灰金属；无 motor/gearbox/internal 等虚构内部件命名。

#### 只读复核（不改，交 Codex 处理）

- **旧大 CAD 仍在用**：`abb-robot.mjs:25-31` 仍保留 `feeding-buffer`/`supply-conveyor` 设备项与 GLB 路径；`AbbRobotViewer.vue:88-97` 的 `loadPlant/showAll/togglePlant` 会按需加载它们。`public/models/abb-irb6700/supply-conveyor.glb` **42.2MB**、`feeding-buffer.glb` 18KB 仍在 public。这是本轮“旧两台CAD停用”最直接的加载负担：打开“显示全部部件/接料设备”可触发 42MB 下载。查看器 `hidden` 初始集合和 reset 仍含这两个 ID（`AbbRobotViewer.vue:46/137`）。
- **示教器 16.2MB**：`FlexPendantModel.vue:91` 每次组件挂载都 `fetch('/models/abb-irb6700/flexpendant.glb')`（16.2MB），`AbbPendantControl.vue:23` 静态导入、`AbbRobotGuide.vue` 进入示教器即挂载；加载期间只有文字“正在加载 ABB 原始示教器…”（`FlexPendantModel.vue:6`），无进度、无缓存/预取；`parseAsync` 一次性解析大 GLB，首次打开会明显卡顿。
- **布料头重复加载**：`tool-640.glb` 5.4MB、`tool-700.glb` 7.3MB；`AbbRobotViewer.vue:153-167` 每次切换工具都重新 fetch/parse，`removeTool` 直接释放上一个，没有按 toolId 缓存；切回同一工具会再次下载 5–7MB。
- **无压缩证据**：`vite.config.js` 未配置压缩插件；`spare-parts-web-release/server.js:46-47` 仅 `express.static` + `maxAge:7d`，仓库内没有 gzip/brotli 中间件。42MB/16MB 资源是否被外部 nginx 压缩无法从仓库确认；Codex 的“服务器无损压缩传输”需在现场配置核验。
- **加载进度/错误归属**：`AbbRobotViewer.vue:151` 每次 `parseModel` 新建 `GLTFLoader`，只有 loading 布尔；`loadPlant` 失败写入 `toolFailure`（`AbbRobotViewer.vue:92`），会把“接料设备加载失败”显示成工具错误，建议拆分状态。`load()` 先 robot 后 pot 串行（196 行），pot 仅 9.7KB，影响小但同样无进度。
- 附带：`model-thumbnail.mjs` 已做串行队列+缓存，不是本轮问题；`abb-robot.mjs` 现有两份旧设备项同时出现在“系统与部件”分组，删除资产后还需清 UI 条目和旧 ID，避免留下失效入口。

#### 边界

- 尺寸、比例、开口形状均按现场照片/示意图结构关系估算，**没有量尺、不是实测/加工图**；照片未见的内部结构不建模。
- 未改查看器/示教器/`abb-robot.mjs`/缓存/服务器/旧 GLB/dist，未构建、未部署、未同步服务器；世界位置、机器人接料区配合、性能测量与旧资产回收由 Codex 负责。
- 新增模块尚未被查看器引用；Codex 集成时需按 `outletHeight` 和局部坐标放置，并用 `setGate` 接现有 4784–4796 行等气缸/放料逻辑。

### DSH 第二版几何修正（2026-11-04 19:22，实测时间）

按用户指出的问题重做首版：frustum 忽略 bottomWidth/bottomDepth、CylinderGeometry 上下封死、上斗/短管实心 Box、链板底板压住进料口、挡板方向错、支架缺口、模块级共享材质。只改原两文件；`robot-sim.js` 仍为 `C79739D8…F9B341` 未覆盖。

#### 本轮修正

1. **短管/收缩斗/上斗全部改为四壁薄板开口结构**：短管四壁厚 16mm（上下开口）；收缩斗用四块带厚度棱柱薄板从暂存斗上口内尺寸 1.304×0.944 收到短管内口 0.428×0.328，**下口内尺寸与短管内口完全相等**；上斗四壁开口、顶部只有四边压条，不再有顶板/底板；底部唯一封闭件是可动闸板。
2. **链板段方向与卸料**：输送方向改为 **Z**；两侧挡板放在 X=±(0.74/2−t/2)、长度沿 Z；链板实例化沿 Z 排布；底板只覆盖输送路径（Z −1.35…+0.05），末端位于暂存斗顶口上方（顶口 Z 半深 0.472），**不封整个入料口**；尾部由两根落地立柱支撑，不是悬空。
3. **`outletHeight` 约定明确为出料口下沿/闸板关闭底面高度**（不再是短管中心）：短管从 y=outletHeight 到 +0.28；出料口中心为 `outletHeight+0.14`。`root.userData.outlet` 提供 `bottomY/bottomCenter/center/innerWidth/innerDepth/outerWidth/outerDepth/topY/gateHinge`，`userData.convention` 写明；`root.userData.shrinkingHopper/upperHopper/chainDeck` 也给出开口与坐标。API 名称不变。
4. **支架**：四脚立柱顶到上斗底；四处上方横梁长度分别覆盖到相邻立柱（左/右 1.36m、前/后 1.84m），测试用 Box3 相交确认四脚都与至少一根横梁有体积相交，无缺口。
5. **材质按实例创建**：不再有模块级共享 Material；每个 `createFeedStation()` 新建独立 metal/dark/gate/cylinder/chain 材质，`dispose()` 只释放本实例资源；已加“两实例独立材质、dispose 第一个不影响第二个”测试。
6. **闸板开合**：保持铰轴在出料口前下沿；为让打开后垂直物料路径确实无遮挡，开启角从 1.1rad 调整为 1.45rad（现场照片没有角度量尺，属结构示意，不声称为实测角度）；关闭时闸板底面 y=outletHeight，测试 Box3 断言 <1e-6；杆长/缸体方向/销轴连接沿用局部坐标，模型平移旋转后仍重合。
7. 低网格：40 个 Mesh/InstancedMesh、828 三角形；链板 18 块实例化。

#### 测试与真实时间

执行时间：**2026-11-04 19:22:47 +08:00**（本机）。`cd spare-parts-web-release && node --test test/abb-feed-station.test.mjs` → **9 通过 / 0 失败**：

- 出口下沿/闸板底面=outletHeight、XZ=0、脚落地；高度 1.9/2.4 可调；非法值 RangeError。
- 短管/收缩斗/上斗四壁开口、无 `outlet-tube`/`upper-hopper-solid` 实心件；收缩斗下口=短管内口、上口=上斗内口（<1e-9）。
- **实际射线**：关闭时从上方/下方垂直射线命中 `gate-plate`；打开后同一路径 0 命中；从暂存斗前部顶口向下射线不命中 `chain-deck/chain-plates`。
- 链板底板沿 Z 长于 X，挡板沿 Z 长、位于 X 两侧；链板实例 Z 跨度 >1m、X 跨度≈0；卸料端在顶口上方。
- 闸板 0/0.5/1 角度与杆端连接、模型平移旋转后仍连接；越界/NaN 钳制。
- 四脚与横梁体积相交。
- 两实例材质引用无交集，dispose 第一个不触发第二个材质的 dispose 事件。
- 无 motor/gearbox/internal 等虚构件；全部材质银灰金属；低网格 <5000（实际 828）。

#### 新 SHA256（以本节为准，覆盖上一节两文件值）

| 文件 | SHA256 |
| --- | --- |
| `spare-parts-web-release/src/utils/abb-feed-station.mjs` | `0E19606BFF5129FA3841A9244CEEA4AF67AEDD7802A226804151A1681A4A45C4` |
| `spare-parts-web-release/test/abb-feed-station.test.mjs` | `2ABAF10FB9782503C493FF656A7A007CA98F25410143958461492F49645A31AA` |

#### 边界

- 尺寸仍是照片/示意图比例结构示意，**不是实测/加工图**；四壁厚度、开口尺寸、闸板角度和支架位置均为可视结构约定，不虚构内部传动/密封。
- 出料口几何按“下沿”约定重排，接入时请以 `userData.outlet.bottomY`/`bottomCenter` 定位，不要再用上一版“中心 y=outletHeight”的假设。
- 未改查看器/示教器/`abb-robot.mjs`/缓存/服务器/旧 GLB/dist；未构建、未部署、未同步服务器，也未碰 Codex 的 meshopt/gzip/会话缓存/性能文件。
