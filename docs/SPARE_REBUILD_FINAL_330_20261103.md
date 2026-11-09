# 备件模型全量 330 项冻结清单（2026-11-03）

## 结论

- 目录 330 项：**frozen 330 / pending 0**
- 与 input-330 不可变基线比较：**文件哈希变化 330/330**；**世界坐标几何指纹变化 330/330**（忽略名称/extras，比较顶点/索引/法线/节点变换）
- 每项均记录：batch、来源类型/URL、unknown、requiresReview、meshCount/partCount、frozenSha256、测试文件
- 49 个备件/几何定向测试文件：**123 通过 / 0 失败 / 0 跳过**

## 关键交付文件

| 文件 | 内容 |
| --- | --- |
| `docs/SPARE_REBUILD_FREEZE_330_20261103.json` | 330 项逐项冻结清单（sha256、baselineSha、geometryChanged、来源类型/URL、unknown、mesh/part 数） |
| `docs/SPARE_REBUILD_AUDIT_20261103.json` | 全量审计（含 geometryChanged 字段） |
| `docs/SPARE_REBUILD_PROGRESS_20261102.json` | 330 项状态、批次、证据、supportRequests（SR-1…SR-10，SR-9/SR-10 已解决） |
| `docs/SPARE_MODEL_SOURCES_20261102.json` | 各批次来源登记 |
| `docs/SPARE_SOURCE_INDEX_20261103.json` | 来源索引：80 份本地原件（SHA256 去重）+ 外部链接（ACT100 手册、WP321 CAD、SKF 22212E 目录/商店） |
| `tools/modeling/reviewed-geometry.mjs` | 几何生成器（族：轴承/座体/减速机/气缸/传动/电气/传感器/密封/纠偏装置等） |
| `tools/modeling/glb-geometry-fingerprint.mjs` | 世界坐标几何指纹（列主序变换；有顶点移动/节点变换敏感性测试） |
| `spare-parts-web-release/src/utils/reviewed-model-catalog.json` | 330 项目录（稳定 ID/URL/sha/mesh/part/note/source） |
| `spare-parts-web-release/src/utils/reviewed-model-variants.json` | 12 个已生成 variant（独立于本次冻结，不混入） |

## 数据边界（保持真实，不声称已确认）

- **尺寸来源分级**：厂家数据表/手册（如 ATV310、CPU1214C、NDR-240、GV2、EZD100、IM155-6 PN/3 HF、ACT100、SICK S30B、Moxa、Schneider 接触器等）；公开标准（IEC 60072 机座、DIN 43880、DIN 43700、GB/T 11544、GB/T 1243）；台账物料规格；无资料项按类别结构示意。
- **22 ACT100**：订货号 30529620 由原厂手册表1-1 证实为 ACT100 中文版；台账文字 `ATC100DIN` 未改；手册未本地化（循环重定向），未伪造文件。
- **71 WP321**：手册 15×57×72 与 Siemens CAD 目录 15×73×58 冲突；模型仅按 CAD 目录比例示意，`requiresReview=true`，不宣称安装尺寸已确认。
- **SEW 空心轴 16 项**：保留原 hollowShaft 元数据/待图纸边界，补 SEW 尺寸页对应外部细节；精确安装尺寸仍需逐张图纸核对；皖南 YFB4 电机外形未核，DRN 总长未冒充。
- **168 液压纠偏装置**：生产库 name/description 已补；通用外观示意，尺寸/孔位/内部未核，不虚构型号。
- **196 SKF 22212 E**：60×110×28（E 圆柱孔，非 EK）；保留原 40 网格观察映射，做单位校正（1100→110 mm）与窗式钢保持架细化；保持架具体型式为结构示意。
- 各结构示意项均带 unknown 列表；不以“人工核对通过”冒充未核项。

## 验证命令摘要

```
node --test test/...（49 个备件/几何测试文件）
```

结果：123 通过 / 0 失败 / 0 跳过；审计：330 frozen，geometryChanged 330/330，0 缺来源。

## 交接

- Codex 可基于本清单与审计独立复核/发布门禁；variant 增量另批交付，不混入本次冻结。
- 根工作台、Knowledge 资料库、部署与上线由 Codex 负责；本批未改 knowledge/API/App，未部署。

## 台账身份元数据恢复（2026-11-03）

- 11 shared previously-pending roots: modelName / catalogId / manufacturerCAD=false restored (168=液压纠偏装置)
- 131 pending-ledger roots: materialCode restored (first 505018939 included)
- JSON chunk only; BIN geometry untouched (fingerprint before===after)
- full npm test: 575 pass / 0 fail / 0 skip; 330 frozen, file hash 330/330, geometry 330/330
- final hashes: catalog `7adf1cd2…4d139a`, progress `700f465c…5b5b7631`, audit `5d2f76f8…be1f3ab`, freeze `a5c66a3f…9ef6d38`
