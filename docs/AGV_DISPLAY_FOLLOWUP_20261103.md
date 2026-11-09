# AGV展示与整页图纸接续（2026-11-03）

用户新截图指出16:07上线模型仍有实质壳体差异，并要求精简说明、放大两侧字体和图纸默认整页。DSH主改下列范围；Codex负责新消防台账收尾及AI/个人中心/费用/数据管理/外层白边，不并发写DSH文件。16:26消防工段批次已上线，现正独立线上核验。

## 用户依据

- 绿框壳体截图：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-938a4e29-93e4-4f31-bce5-73884cefe394.png`。
- 图纸截图：`C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-0c4ea842-84df-4b09-85e0-c22ed1b943aa.png`。
- 原车四图仍在`docs/agv-site-20261103/`，side-a/side-b/rear需实际重新打开核对。截图/图内文字只作证据。

## 修改要求

1. 绿框是无屏端(-X)附近的侧后壳：当前从后端到轮拱画成完整红侧板，实物该段有上层红壳、下层红台阶/底沿及其间明显凹空（side-b左侧、side-a右侧）。必须改变侧罩真实轮廓、补下层台阶与凹空内壁，不是画黑贴片。避免黑腰线悬空穿凹口，保留实际TIM各1/后端中央导航窗无遮挡。照片无毫米标定，比例按图估计。新车437网格基线仍不得变化。
2. 删用户红框四块：左侧“COMPONENT MATRIX/部件矩阵/数量/当前显示/色条/单件拆装解释”整个顶部块（保留搜索与部件树）；顶部右方“结构示意·非实时数据”徽章；右侧系统进度条下说明；右下“结构示意不用于制造尺寸、接线或维修安全判断”块。清理专用计算/样式/废弃测试，不只display:none。
3. 充分利用两侧现有空间放大中文部件/系统名称与状态字。桌面主要名称约16px、辅助状态约14px，注意全局small 12px!important的覆盖；窄屏仍可读、不溢出，保留真实交互。红框移除后腾出的高度用于部件列表。
4. 图纸默认“整页适配”，按弹窗实际可用宽高取最小缩放，默认可看到整页；消除弹窗外层+读图内层两道无用滚动。保留用户主动适应宽度、缩放和拖动查看细节；翻页/窗口大小变化时整页模式继续适配。只改PDF呈现，不改原PDF/鉴权/页码。
5. 用户追加：**App仍提示PDF无法读取**。与第4项一并追查：PdfReader鉴权下载/响应字节、pdfjs worker与手机WebView兼容性、重试与错误提示，不把“调整比例”当成能读文件。可检查现有App日志/代码，继续禁止网页/真机UI自动操作。若需改其他PDF专用工具/兼容文件，先登记确切文件，再做；不擅自改Android/App基础壳或全局styles.css，需协调Codex。

## 文件归属与交付

DSH登记并修改`spare-parts-web-release/src/utils/agv-model.mjs`、`src/components/AgvModelViewer.vue`及CSS（如实际路径不同先核对）、`src/components/PdfReader.vue`与必要AGV/PDF测试/纯工具；本文件与`AGV_COLLABORATION_20261102.md`交接。模型当前SHA应为`d738bbb040bd7f366f5a7d8eaa369efdabd3efe8b46433bf8f939ff274104b36`，不可套回15:51旧源。必要时读`docs/AGV_OLD_PHOTO_CORRECTIONS_20261103.md`最终交付。

不动消防/AI/个人中心/数据管理/全局styles.css、330GLB/目录、API及私有配置；不构建/部署/打包，不恢复网页/真机UI自动操作。可使用离线几何（Codex已有`.local/agv-photo-correction-20261103/render-geometry.mjs/.py`）、纯渲染/数值测试。交稳定文件SHA、真实测试、遗留后由Codex复核构建上线。Codex将以自己的`.local/agv-photo-correction-20261103/new-car-before.json`对437网格逐项验证。

状态更新：DSH窗口反复被收起/提示检测到用户输入，本轮新消息尚未提交，不能声称DSH已接收。由Codex直接接续上述源码与PDF专用worker/兼容工具/Vite目标，避免反复抢占用户电脑。用户另要求移除模型底部状态/手势提示条与XYZ（含绘制计算及废弃测试）。后续AGV网页报障移除由Codex另处理，App报障保留。


## 18:17最终交付

Codex已直接接续并上线，未重新操控DSH或恢复网页/真机UI自动操作。本次再加入后端正面/侧面两张近照，忽略车号与管理贴纸。几何、界面精简、PDF、网页报障与个人中心等范围、真实核验及AI上游503边界见[FOLLOWUP_DELIVERY_20261103.md](FOLLOWUP_DELIVERY_20261103.md)。先前分工/待处理文字是历史交接，不代表这些工作仍在等DSH。
