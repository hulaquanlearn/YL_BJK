# 备件模型资料与展示审查（2026-11-02）

## 当前交付

Harness因额度暂停时，Codex接收并保存其半成品快照，完成本轮必要收尾。用户随后确认Harness恢复，备件和AGV模型继续由Harness精细化；本报告所列文件现冻结，后续交接后再修改。

- 保留Harness已完成的浅灰白展台、透明物体预览及实物图来源纠正。修复备件查看器仍使用深色雾、橙色描边、深色说明浮层和目录展厅深色面板的问题，统一石墨文字与钢蓝选择状态。
- 保留现有模型、显式绑定和分组标注，不运行历史全量生成或自动绑定。目录中的“rebuilt”只说明网格已按类别重建，不能代表实物或安装尺寸核验。
- 为下述21项增加独立`requiresReview`与具体资料说明；普通展示进入“外形待核对”，可以主动选择“仅预览当前外形”，核对预览不自动变成通过。物料绑定、模型目录和编辑页使用同一状态；服务器确认有效的当前版本人工核对、过期核对和缺文件仍各自处理。
- 模型编辑和预览中的参考资料图增加显式放大入口，采用可键盘触发的按钮与站内图片查看器，支持放大和拖动；只有放大按钮消费自己的点击，不全局截断父级导航。物料卡实物照片原已进入独立照片弹窗和`el-image`缩放，保留该路径；三维缩略图仍打开模型，不把它当照片。
- 未知来源图片不会被标为实物照片；只有明确的`partImageUrl`或`imageSource=part`才进入实物照片字段，保留参考图与实物图的区别。

## 本地资料与几何证据

本轮没有读取私有台账、生产数据库或账号。Harness提供的只读几何审查与Codex独立复核分开记录：

| 范围 | 本轮证据与结论 |
| --- | --- |
| 本地目录330项 | 历史资源目录数量，既不是330件实物核验，也不是线上实时绑定数。没有运行时人工核对记录时，当前静态展示状态为208项可观察、122项待核；待核包含原101项与本次21项。可观察仍只表示可查看示意外观。 |
| 398份GLB文件 | 对Harness接手时记录逐一重算SHA256，398份均未变化。相关回归加载目录330份资产，检查有限几何、资源哈希与四方向展台落地；这是文件/几何检验，不是实物验收。 |
| 联轴器5项：ID 298–302 | GLB继承的`sourceDescription`写有两端不同轴配合参数，实际网格两端轮毂均为等孔、等长。旧`coupling({chain})`生成器只读取是否链式，未读取两端参数。原始厂家图纸或用户实测出处尚未独立建立，所以仅记录“文件描述与模型比例不一致、参数来源待核”，不据此推算实物外形或生成替换几何。 |
| 减速机16项 | ID 217、218、219、220、226、229、249、252、259、260、261、262、267、268、269、274。已有空心输出端环体，但沿输出轴线的射线仍命中箱体；具体型号无可追溯厂家图纸或实物对照。只记录“贯通轴与箱体关系需核”，不写成已确定实物几何错误。 |
| 有厂家来源描述的5种产品、10份精简/详细资产 | 既有来源描述包括明纬NDR-240-24、NDR-480-24及SKF 6006-2Z、6003-2RSH、61802。本轮比较GLB外廓与项目保存的来源尺寸描述：详细模型与轴承模型在浮点误差内一致；两份NDR精简模型深度比描述少0.1mm。仍是外观示意，没有重新在线核验厂家原文，也没有确认端子、倒角、滚道或内部细节实物一致。 |

21项均保留原GLB、分组与哈希，不按文件夹名称推断核对结果。后续Harness应优先补齐原始图纸/实物依据；不能仅把模型做得更复杂就解除待核状态。

## 修改范围

相对`spare-parts-web-release/`：

- `src/components/ModelPreview.vue`、`ModelCatalogShowroom.vue`、`PartModelBinding.vue`、`ModelReferenceImage.vue`
- `src/views/ModelLibrary.vue`
- `src/utils/showroom-stage.mjs`、`model-display-status.mjs`、`reviewed-model-catalog.json`
- `test/spare-model-presentation.test.mjs`、`spare-model-evidence-boundary.test.mjs`、`model-reference-image.test.mjs`

其中`showroom-stage.mjs`、`PartModelBinding.vue`为接收并复核的Harness改动；Codex没有继续改其内容。AGV冻结六文件、几何、PDF、原生和库存等范围不在本次写入清单。

## 执行验证

在网页目录执行：

```powershell
node --test test/spare-model-presentation.test.mjs test/spare-model-evidence-boundary.test.mjs test/model-reference-image.test.mjs test/model-catalog-showroom.test.mjs test/model-review.test.mjs test/model-display-status.test.mjs test/model-binding-cards.test.mjs test/model-library-requests.test.mjs test/model-request-failure.test.mjs test/model-observation.test.mjs test/evidence-models.test.mjs test/reviewed-model-assets.test.mjs test/category-models.test.mjs test/warehouse-ready-models.test.mjs test/model-mesh-inventory.test.mjs test/model-callout-layout.test.mjs
```

最终结果：**85通过、0失败、0跳过**。

五份涉及SFC的脚本、模板与样式独立编译通过。限定修改路径的`git diff --check`最终退出0；部分文件尚未跟踪，未将此命令当作全部差异审查，Git同时提示仓库后续操作会把部分LF规范成CRLF。

- 展示回归执行真实Three场景、材质、光源与生产mounted初始化，GPU/DOM为合成端口；CSS由真实SFC编译与PostCSS解析检查浅色面板、文字对比度和焦点规则。它不是浏览器像素验收。
- 资料边界回归执行真实规范化函数、真实SFC绑定组件及状态函数，涵盖21项待核、有效人工核对、过期记录、照片来源及显式核对预览。
- 图片回归编译真实SFC并触发实际按钮处理，验证当前回退图片放大、局部停止冒泡、关闭、换源/加载失败清理及默认不改变父级导航。
- 新展示测试在补完半成品前复现深色雾/面板/浮层3项失败；资料状态3项失败；参考图放大2项失败。开发测试时两处测试夹具曾有语法/SSR绑定错误，已修正后重新执行，未计作产品复现或通过结果。

未启动服务、浏览器、真机、模拟器或ADB，未进行手机视觉验收；本子任务未生产构建、打包、部署或提交推送。统一构建、服务器同步与实际接收结果由主Codex另记。

本机半成品快照、原始审查、独立测量和完整测试输出在`.local/spare-model-audit-20261102/`，只作当前工作证据，不作为发布资源；清理时由主Codex按用户回收要求统一处理。

## Harness 接手后的几何修正（2026-11-02 22:00 起）

用户恢复 Harness 并指定其主导备件与四类 AGV 模型的几何/结构/材质/标注优化后，本轮只做有本地资料依据的第一批：

| 范围 | 修正 | 资料依据与未证部分 |
| --- | --- | --- |
| 联轴器 298–302 | 两端轮毂按 298 Φ80×140/Φ90×150、299 Φ105×210/Φ90×150、300 Φ120×210/Φ90×150、301 Φ140×250/Φ90×150、302 Φ100×170/Φ90×150 生成；此前五件两端等孔等长 | 取自原 GLB 节点 `extras.sourceDescription` 继承文本（如“华康,联轴器,ZL6 减速机端Φ80x140 头轮端Φ90x150,”）。该文本**尚未独立确认**来自厂家图纸或用户实测，故 `requiresReview` 保留、note 写明“参数原始来源尚待核实”。外径仍 Φ500 示意，法兰、8 销、无键槽、颜色、±0.2 m 轮毂位置未推断 |
| 空心轴减速机 16 项 | 输出法兰由悬空改为贴靠箱体；右角型（KA/KAZ/SAF）按 A 型空心轴开出贯通示意孔（沿轴射线 0 命中），FA77/G、FA57/G 两件平行轴型仍封闭并在数据与 note 说明需图纸 | 依据仅为型号类别（A 型空心输出端）与“空心轴不应是盲盖”的结构自洽；无厂家图纸，孔径 Φ170、键槽、收缩盘、箱体内部齿轮均未证，`requiresReview` 保留 |
| 明纬 NDR-240-24/480-24 精简 LOD | 外廓 113.4→113.5 mm、128.4→128.5 mm（DIN 卡扣 3.1→3.2 mm、后端后移 0.1 mm）；detail 两份字节未变 | 依据为项目已保存的厂家规格描述，未重新在线核验；端子、倒角与内部细节仍示意 |

实现方式：只改 `tools/modeling/reviewed-geometry.mjs` / `generate-evidence.mjs` / plan 对应条目，用白名单脚本重建上述 GLB 并只更新对应 catalog 条目；**未**运行会重写全部重建目录的 `apply-model-review.mjs`。465 份 `public/models` 改前/改后哈希对比：仅 5 联轴器 GLB、16 减速机 GLB、2 份 NDR low、evidence `manifest.json` 变化，其余资产字节未变；catalog 330 条中只有上述 21 条变化，Codex 的 21 项 `requiresReview` 与专用 note 全部保留（本轮在此基础上补充减速机 note）。

离线回归（cwd `spare-parts-web-release`）：备件 18 个定向测试文件 89 通过 / 0 失败；AGV 14 个测试文件 69 通过 / 0 失败；`reviewed-model-assets` 330 份资产哈希/网格/四向落地仍通过（mapped 226）。未做浏览器像素、真机、实物或厂家图纸验收；未生产构建、部署或推送。

细节、逐文件 SHA256 与交接见 `docs/AGV_COLLABORATION_20261102.md` 的“本轮交付（已冻结，待 Codex 统一集成）”。

## 首批厂家尺寸核实模型（2026-11-02 22:55）

联网方式与边界：内置搜索接口本次返回 `terminated`，改用 DuckDuckGo HTML 检索与厂家站点直接请求；`web_fetch` 不支持 PDF，因此只使用厂家 HTML 尺寸表，未读取 PDF、未上传任何项目文件。

| 目录ID | 型号 | 公开来源 | 证实尺寸（mm） | 未证实 |
| --- | --- | --- | --- | --- |
| 235 | UCP 308 | Timken UCP 308 产品页（cad.timken.com，2026-11-02） | d40 H60 L220 A60 J170 N17 N1 27 H1 19 H2 118 B52 S19 | 球面座半径、内圈外径、密封、润滑嘴、圆角 |
| 211 | UCP 310 | Timken UCP 310 产品页 | d50 H75 L275 A75 J212 N20 N1 35 H1 24 H2 148 B61 S22 | 同上 |
| 212 | UCP 312 | Timken UCP 312 产品页 | d60 H85 L330 A85 J250 N25 N1 38 H1 29 H2 167 B71 S26 | 同上 |

生成方式：新增 `mounted-unit` 族（底座 L×A×H1 + N1×N 长圆孔、孔距 J；半圆顶半径 H2−H；内圈 bore=d、宽 B），三件离线实测包围盒与厂家 L/H2/A 一致（<0.001 mm），底面落地、中心孔与安装孔贯通；`requiresReview=true` 并写入来源 URL、型号、证实尺寸与未知项，保留原目录 ID、URL 与人工核对入口。

未纳入本批：UCF307 方形座尺寸已取得但凸台外径/内圈外径无官方值；亚德客 SC 官方样本仅 PDF（本次通道无法解析）；SEW 官网 403 或无公开尺寸表。上述均保持待核，不凭同系列图片或第三方数字建精确几何。

回归：8 个定向测试文件 21 通过 / 0 失败；330 份 GLB 哈希/网格/部位数与 catalog 一致；465 份模型资源仅本次 3 份 GLB 与上批 24 份变化。未做视觉、实物或安装验收。

### 验收补充修正：品牌口径、长圆槽与 S 偏置

- 台账品牌 SKF 不改；211/212/235 的尺寸取自 Timken 同编号产品页（UCP 310/312/308），是**跨品牌参考**，**未核对 SKF 实物/SKF 原厂图纸**。SKF 官方产品页本次只返回前端外壳、无可解析尺寸表，SKF 目录为 PDF 且本会话不能解析，故未取得 SKF 原厂数值。catalog note 与 GLB `userData.evidence` 均按此口径记录，`requiresReview` 保持 true。
- 未知项（球面座半径、内圈外径、密封、润滑嘴、螺钉、铸件圆角）同时写入 catalog note 与 GLB userData，不只留在文档。
- 底座安装孔由椭圆改为长圆（stadium：直边 + 半圆端），宽 N、长 N1、距 J；测试用直段末端与越过 N1 的采样区分长圆与椭圆。
- S 轴向偏置已实现：内圈沿孔轴占 `[-S, B−S]`，整体向一侧偏移 B/2−S，整体深度 = A/2 + max(A/2, B−S)，与厂家宽度 A 的座体区分记录。
- 修正后逐文件 SHA256 与 91 项回归结果见 `docs/AGV_COLLABORATION_20261102.md` 同节。
