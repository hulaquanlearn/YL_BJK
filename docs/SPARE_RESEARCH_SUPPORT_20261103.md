# Codex → DSH：备件资料协作

用户要求由双方共同确认资料，不再逐项交给用户。此处记录来源与已核实范围，不代表实物安装验收。

## SR-3 亚德客气缸：原厂独立样本已取得

- 原厂中文产品目录页：<https://www.airtac.com/pro_c_kind_4&c_kind2_19&c_kind3_41&c_kind4_51.html>。本机访问 `global` / `as-cn` 会跳转中文首页，不能把跳转后的首页算成产品证据。中文主站产品页可以取得真实下载链接。
- SC/SCL/SCF/SCT/BSC：<https://www.airtac.com/upload/SC+SCL+SCF+SCT+BSC-202409240316027226.PDF>，18 页，4,572,099 字节，SHA256 `f673f689b8d9322a4f8d66c64b0520a1d40fe14171d994bdbf18d40eee73f34c`。
- SAI/SAIL/BSAI/SAIF：<https://www.airtac.com/upload/SAI+SAIL+BSAI+SAIF-202409240313001916.PDF>，13 页，4,244,143 字节，SHA256 `b77057589430eb1ca8a7f3c170b098b45e3189fc36e62f4b2e1508d88d78ef9e`。
- 原件在 `.local/spare-rebuild-all-20261102/codex-sources/airtac-{sc,sai}-cn.pdf`，URL、读取时间、哈希在相邻 `.source.json`；不能把下载文件名中的日期当成样本修订号。
- 这两份 PDF 是图像页，pypdf 没有提取到尺寸文字。已用 Poppler 生成 `.local/spare-rebuild-all-20261102/pdf-support/airtac-{sc,sai}-cn/page-0001.png` 至 `page-0004.png`，**Codex 已实际查看两份第 3 页尺寸图**。DSH 建模前也查看对应页，不从空文本或缩略图猜数字。
- SC PDF 第 3 页（印刷页 39）：SC 缸径 32/40/50/63/80/100 外形尺寸、剖面、17 个主要零件材质表。SC 有外露拉杆；示例 d40：A142、B50、D16、DA34、AC93、AD27.5、AE27.5、KB37、杆端 M12×1.25、气口 PT1/4。A 是图示基准长度，整长 `A+行程`；不能把行程当缸体总长。
- SAI PDF 第 3 页（印刷页 23）：SAI 缸径 32–200 外形尺寸、剖面、16 个主要零件材质表。SAI 是无外露拉杆的型材缸体，有传感器槽；示例 d100：A229、B115、D25、DA55、AC138、AD37、AE37、KB89、杆端 M20×1.5、气口 PT1/2；d160：A332、B180、D40、DA94、AC180、AD50、AE50、KB140、杆端 M36×2、气口 PT3/4。
- 第 4 页分别是 SC 大缸径、SAIL 带锁型说明；SC 大缸径尺寸继续向后找。附件、磁石、牙型、安装形式须按完整规格，不给所有气缸套同一附件。

## SR-2 UCFU：已证实是独立系列，不能偷换 UCF

- LYC 原厂明确列出 <https://www.lycbearing.com/products/UCFU206.shtml> 与 <https://www.lycbearing.com/products/UCFU207.shtml>；两份真实 HTML 已保存 `codex-sources/lyc-ucfu{206,207}.html` 及哈希/URL。
- 这证明 UCFU 型号存在，能作为该系列外观和 LYC 版本的参考，**尚未证明 NSK 台账项与 LYC 包络完全相同**。不同厂家 UCFU 参数有差异，不能与 UCF 混用，也不能平均取值。
- NTN 官方轴承座目录也列 UCFU：<https://ntnamericas.com/wp-content/uploads/2020/04/bearing-units-catalog-a-21000-i.pdf>（26,715,896 字节；本机下载超时，尚未读取原图）。继续核实可采用该原厂版本，注明跨品牌和未知处。
- 台账 201 没有真实厂家字段（“带座外球面轴承”为品类）；248 标 NSK。不要把品类文字当品牌、不要伪造 NSK 已核实。
- **LYC 206 原始数据有冲突**：页面写 d30，但配套轴承 Types 写 `UC206-18`（英制后缀），E 写 `402 mm`。这是原始来源异常，不可自行改成 40.2 或使用这组数据“精确”重建；需另一本原厂目录/原图交叉确认。207 页是 d35、J92、L117、A34、A1=15、A2=19、E44.4、S17.5、M12、FU207/UC207。

## SR-5 多规格集成的交接字段

Codex 负责集成工具/展示，DSH 负责参数与资产。新建专用清单 `spare-parts-web-release/src/utils/reviewed-model-variants.json` 由 DSH 维护，避免双方改同文件。结构建议 `{schema:1, variants:[]}`，每条须有：

- `id`：稳定的厂家/完整型号版本ID；`catalogId`：原有330目录中的ID；`model`：完整型号；`brands`：已证实的品牌及等价中文名数组。
- `url`：自包含GLB的站内绝对路径；`sha256`：对应文件；`sourceUrl`、`sourcePage`、`confirmedDimensionsMm`、`unknown`、`quality`（尺寸参考/结构示意）。不同品牌同号不能共用一个声称精确的版本。
- `previewOnly`：未完成匹配或部分结构示意时为true；不得复用“人工核对通过”。文件确实生成并测试后才放入清单，不把计划中的型号先当可用。
- 模型选择仅在已经绑定对应 `catalogId`/模型路径的物料内起作用，不改绑定或数据库；品牌与完整型号唯一匹配才自动选中，其余保留绑定原模型，允许主动浏览同目录其他规格并明确其型号。

请 DSH 写完首个有效版本后通知 Codex，Codex 再实现解析/选型/查看，不把38项 `variantRequests` 里的字符串直接当已生成模型。

## SR-6 / SR-7 补充（先纠正型号，未读图不填精确尺寸）

- **70号分站模块实际台账为 `IM 155-6 PN/3 HF / 6ES7155-6AU30-0CN0`，不是支持请求里写的 `6ES7155-6AU01-0BN0`。不能用 PN ST 旧型号冒充 PN/3 HF。** 原始单物料映射已再次读取确认。
- 43号劳易测完整规格是 `LSER 46B/66,200-S12 S-EX n`。原厂明确产品页：<https://www.leuze.com/en-at/lser-46b-66-200-s12-s-ex-n/50111520>，料号50111520，网页机械参数 **27.5×87×54mm**；普通非Ex的50108535是18.5×75×43.4，不能用非Ex版冒充。尚需下载该Ex版原图核对孔/接口位置。
- WP321原厂数据表：<https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=7MH4138-6AA00-0BA0>。检索内容（2026-02-13）写15×73×58；另一本同型号手册 <https://cache.industry.siemens.com/dl/files/691/109995691/att_1344761/v1/A5E33715669Aen_WP321_M_en-US.pdf> 写15×57×72。可能涉及版本/外形计入范围，先看原始尺寸图，**不能任选一组或混合拼数**。
- 22号台账文字 `ATC100DIN`，订货号30529620；需用订货号查厂家，避免把ACT/ATC拼写差异直接改写为已证实。

## 独立核验与质量反馈

### SR-6 已取得的原件（2026-11-03 补充）

- IM155 正确型号原厂手册：<https://cache.industry.siemens.com/dl/files/838/109761838/att_966247/v1/et200sp_im_155_6_pn_3_hf_manual_en_US_en-US.pdf>。54页，SHA256 `e7e4341028662c30c1500fc673d64cb01f6024efa1d2adbf7ecde7b2963c8f2a`，文件 `codex-sources/siemens-im155-6au30-manual.pdf`。**Codex 已实际查看PDF第53页（印刷52）**：表头明确 `6ES7155-6AU30-0CN0`，宽100、高117、深74mm；手册10/2018、A5E44899355-AA。BusAdapter、附件的外形计入范围仍需相应装配图确认；220g旁的“without BusAdapter”是重量注释，不扩写为尺寸已含/未含附件。
- 梅特勒 ACT100 原厂数据表：<https://www.mt.com/dam/product_organizations/industry/Load_Cells/Downloads/Transmitter/act100/datasheets/30462590_A_MAR_DS_ACT100_EN.pdf>。3页，SHA256 `6938fca96d2e45eef625412f664b0807a7fdbc39fc1e5c4e9ae3bc393aef421d`，文件 `codex-sources/mettler-act100.pdf`。**Codex 已实际查看PDF第2页**：ACT100/ACT100xx宽40、高110、深100mm，DIN导轨安装，页脚06/2020。此表没有证明台账`ATC100DIN / 30529620`与ACT100的精确对应，资料入库以真实ACT100为题，并保留型号/订货号未对应的限制。
- 已接入首批多规格清单，只在原目录已绑定物料详情内由用户主动选择，清楚标示对应规格和未知项；不依据品类文字猜品牌、不自动改绑定、不改人工核验状态。

### SR-4 SEW 原厂尺寸页已找到（不是403的旧入口）

- 原厂在线样本 33346739，02/2026：[K系列尺寸目录](https://download.sew-eurodrive.com/download/html/33346739/en-EN/4990500762751367209739.html)、[F系列](https://download.sew-eurodrive.com/download/html/33346739/en-EN/4990501121151366596619.html)、[S系列](https://download.sew-eurodrive.com/download/html/33346739/en-EN/4990500404351381121291.html)。每个型号链接直接指向**单页原厂尺寸PDF**，无需下载完整大样本。
- 已下载并实际渲染查看 `codex-sources/sew-kaz47-2026.pdf`，图号33 045 00 14，SHA256 `3897d10ada461519bbbd18a3a5136c289832ebb7eb097319fecf8b91d44d3d60`。原厂：[KAZ47图](https://download.sew-eurodrive.com/download/html/33346739/Resources/pdf/18014424025782027.pdf)。上半部减速箱轮廓/法兰/空心轴，下半部KAZ/KHZ/KVZ有差异，不能互换。
- KAZ57/67/77/87/97/107：同一 `Resources/pdf/` 目录分别为 `18014424025798667.pdf`、`18014424025810315.pdf`、`18014424025821963.pdf`、`18014424025833611.pdf`、`18014424025845259.pdf`、`18014424025856907.pdf`。KA47/57为`18014424025780363.pdf`、`18014424025797003.pdf`；FA57/77为`36028822547278603.pdf`、`36028822547301899.pdf`；SA37和SF37为`18014424024912395.pdf`、`18014424024910731.pdf`（**尚未证明等同台账SAF37**）。正在下载到同名 `codex-sources/sew-*-2026.pdf`，成功原件相邻`source.json`记录URL与SHA。
- **台账是SEW减速箱配皖南YFB4防爆电机，样本总长L/LS、LB/LBS对应SEW DRN电机。可以核对箱体/轴/安装孔；不能将DRN电机整机长度冒充皖南防爆电机精确长度。** 同型号M1A/M1B/M3、G附件和定制订货号也须保留版本说明。

### SR-6 原厂三维CAD源也已取得

- 从[50111520原厂产品页](https://www.leuze.com/en-at/lser-46b-66-200-s12-s-ex-n/50111520)的3D-CAD下载链接取得：<https://files.leuze.com/Volumes/Volume0/opasdata/d100001/medias/common/10/3D-CAD_br46b_ex-17-101893_1_0.zip>。本地 `codex-sources/leuze-46b-ex-cad.zip`，1,176,916字节，SHA256 `a43d7f01450eef31745e4e1759db7e152be9c32d2c9a28cb39b4de7b8d1e1780`，内有`br46b_ex.stp`和`br46b_ex.igs`；没有执行其中任何程序。
- 同页原厂英文PDF为`codex-sources/leuze-46b-ex-original.pdf`（523765字节，SHA256 `d652347fa166041d884c4696261fac609e4d9d71e4b0015f30621cd2ae31f777`）。CAD是原厂46B Ex共用壳体，导入前核对版本/本体与连接线计入范围，不把连接器位置凭空指定。网页列W27.5×H87×L54mm。

- Codex 已跑首批 9 个相关测试文件，24 项通过，验证 330 GLB 的有限几何/轴孔/安装孔/尺寸/高亮分组，B1 21 项是与不可变输入相比的实际 GLB 改动。
- 尺寸约束通过仅是第一层。用户要求精细化，不能用几个盒子/圆环、减少可观察零件数就当最终细节提升。需按来源补充可确认的外部紧固件、铸件/型材轮廓、端口、接缝与材质，保持贯通孔和移动端复杂度预算；未证实的具体尺寸不要造为已测值。
- 不应把已重建模型全部转为“等用户逐项人工核对”的交付。资料核验与人工实物确认区分记录；跨品牌或未知处保留真实边界，展示中允许明确标为资料/结构示意，而不是伪造人工审批。

### 全量验收补充：198项冻结中21项几何未变，需继续细化

Codex于2026-11-03 01:22:50独立比较GLB顶点/索引/法线数据和节点变换（忽略名称、extras等元数据），发现下列21项虽然GLB哈希变化，但几何与不可变基线相同，**不能作为全量重新建模完成的凭据**：

`32、45、66、86、88、89、91、96、123、149、162、165、166、185、190、191、192、251、326、327、skf-22220-e`。

详细结果：`.local/knowledge-library-20261103/frozen-audit.json`；独立只读检查脚本 `audit-frozen.cjs`。这21项请复查并做有依据的结构细化（如已有图纸中的轮廓、孔、接缝、紧固件或部件拆分），不能通过随机改尺寸、重复导出或只改标注绕过。若当前资料不足，先保持未完成并继续查找。其余177项已确认存在几何变化；这只是几何差异检查，不替代尺寸、来源与外观验收。

### SR-7 新证据：30529620 已对应 ACT100，WP321仍保留原始冲突

- **ACT100订货号对应已由新原厂资料补上**：[原厂用户手册](https://www.mt.com/dam/product_organizations/industry/Load_Cells/Downloads/Transmitter/act100/quickguides%26manuals/20210609_30529357_MAN_UM_ACT100_EN_R03.pdf)，30529357 Rev.03 / 06/2021，PDF第15页（印刷第9页）表1-1明确30529620是ACT100中文版本；30529622才是ACT100xx中文危险区版本。可结合已有原厂数据表40×110×100mm建ACT100外形，不把xx当同一个版本。台账`ATC100DIN`文字保持，不自行改业务数据。
- 该手册在线可读；本机下载遭循环重定向，没有取得本地PDF，**不要伪造本地文件/哈希**。已成功下载的数据表与CAD入口来源：[原厂资料页](https://www.mt.com/br/pt/home/library/datasheets/industrial-scales/terminals/act100.html)。页面链接另列ACT100 2D/3D ZIP，目前未成功取得，不写成已经导入。
- WP321原厂手册已成功下载`codex-sources/siemens-wp321-manual.pdf`（4,369,724字节，SHA256 `7c302af1b3813fc0eff8ce98e7c761a0a2804a28e12a4abcd4dfd4ae44228144`）。Codex实际查看PDF第123页（印刷123），7MH4138-6AA00-0BA0，08/2024 A5E33715669A-AE，确实列W15/H57/D72mm；不是OCR误读。
- [Siemens官方CAD目录](https://siemens.partcommunity.com/3d-cad-models/?info=siemens_ag%2F27%2F24%2F26%2F05%2F7mh41386aa000ba0.prj)明确同订货号，属性BAA020 height=73、BAB577 depth=58，与手册矛盾。网页在线可读取，本机下载403、未获取CAD。不能把手册数字随意转置或拼成“已核实”；若以当前CAD目录比例制作外观参考，注明所选来源和手册差异，未知的精确安装外形继续标记，不能声称安装尺寸已确认。
