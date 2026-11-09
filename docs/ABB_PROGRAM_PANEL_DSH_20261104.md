# ABB 程序运行面板 DSH 交付 · 2026-11-04

## 范围与状态

用户要求 DSH 只接手程序面板外观；本轮**仅新增/修改**：

- `spare-parts-web-release/src/components/agv/AbbProgramControl.css`
- `docs/ABB_PROGRAM_PANEL_DSH_20261104.md`（本文件）

未改 `AbbProgramControl.vue`、`AbbRobotViewer.vue`、程序/信号/体积守恒/机构物料联动、`robot-sim.js`、`robot-cell-sim.js`、`abb-material-simulation.mjs`、测试或包依赖；未构建、未部署、未打包、未另开端口、未操作浏览器/窗口。CSS 尚未被组件引用，需 Codex 按下方方式整合。

**稳定 SHA256**

| 文件 | SHA256 |
| --- | --- |
| `spare-parts-web-release/src/components/agv/AbbProgramControl.css` | 见文末“冻结”节 |
| `docs/ABB_PROGRAM_PANEL_DSH_20261104.md` | 见文末“冻结”节 |

## 整合方式

推荐把 `AbbProgramControl.vue` 末尾现有 `<style scoped>…</style>` 整体替换为：

```vue
<style scoped src="./AbbProgramControl.css"></style>
```

CSS 全部选择器以 `.abb-program-control` 为根，不会进入画布、示教器、工具栏或其他页面。若保留非 scoped 全局引入，文件末尾的 `.main-program-speed` 也会生效；但更推荐把速度控件移入组件，统一使用 `.program-speed`。

不要在本 CSS 里再写 `.robot-stage`、`.robot-program-pane` 或示教器样式；面板宽度/滚动仍由 `AbbRobotViewer.vue` 的 `.robot-program-pane` 负责。手机端父容器目前 `max-height:230px`（`AbbRobotViewer.vue:314`），本 CSS 已按 340px 桌面窄栏与 390px 手机做紧凑排版；若 Codex 调整父栏高度，只需保证组件自身可滚动/换行，不需要改选择器。

## 模板 class 建议（Codex 统一整合）

现有模板可直接获得基础美化；要满足“清楚分组”，建议按下面结构补 class/包裹层。**不改变现有逻辑与绑定**，只改模板结构。

```vue
<section class="abb-program-control" aria-label="机器人程序联动">
  <header class="program-panel-head">
    <div>
      <span class="program-eyebrow">ABB · 主视图</span>
      <strong class="program-title">程序运行</strong>
    </div>
    <RouterLink class="program-link" :to="…">程序分析 ↗</RouterLink>
  </header>

  <!-- 1. 备份 / 例程 -->
  <div class="program-section">
    <div class="program-section-head">
      <h3 class="program-section-title">备份 / 例程</h3>
      <span class="program-badge">{{ routines.length }} 个例程</span>
    </div>
    <div class="program-pickers">
      <label class="program-field"><span class="program-field-label">备份</span><select …/></label>
      <label class="program-field"><span class="program-field-label">例程</span><select …/></label>
    </div>
  </div>

  <!-- 2. 装填高度 / 斗容估算 / 累计体积 -->
  <div v-if="index?.automation" class="program-section program-fill">
    <div class="program-section-head">
      <h3 class="program-section-title">装填参数</h3>
      <span class="program-badge" :class="{ 'is-muted': !busy }">{{ barrel==='right'?'右甑':'左甑' }}</span>
    </div>
    <div class="program-metrics">
      <label class="program-metric is-accent">
        <span class="program-metric-label">装填高度</span>
        <input v-model.number="targetHeight" type="number" min="40" max="900" step="10" :disabled="busy"/>
        <span class="program-metric-unit">mm</span>
      </label>
      <div class="program-metric">
        <span class="program-metric-label">斗容估算</span>
        <strong class="program-metric-value">{{ hopperVolumeText }}<span class="program-metric-unit">m³</span></strong>
      </div>
      <div class="program-metric">
        <span class="program-metric-label">累计体积</span>
        <strong class="program-metric-value">{{ cumulativeVolumeText }}<span class="program-metric-unit">m³</span></strong>
      </div>
      <div class="program-metric">
        <span class="program-metric-label">目标甑</span>
        <select v-model="barrel" :disabled="busy">…</select>
      </div>
    </div>
    <div class="program-volume-bar" role="img" aria-label="装填体积进度" :style="{ '--volume': fillPercent + '%' }"><span></span></div>
    <p class="program-volume-note">…估算依据/自动模拟说明…</p>
    <label class="program-field program-check"><input v-model="automaticSignals" type="checkbox" :disabled="busy"/>自动模拟设备信号</label>
  </div>

  <!-- 3. 速度 / 1·5·10·20 倍速 -->
  <div class="program-section program-speed-section">
    <div class="program-section-head">
      <h3 class="program-section-title">运行速度</h3>
      <span class="program-badge">{{ programSpeed }}%</span>
    </div>
    <div class="program-speed">
      <label>
        <span>速度</span>
        <input v-model.number="programSpeed" type="range" min="1" max="100" aria-label="程序运行速度"/>
        <span class="program-speed-value">{{ programSpeed }}%</span>
      </label>
      <div class="program-rate">
        <span class="program-rate-label">演示倍速</span>
        <div class="program-rate-options" role="group" aria-label="演示倍速">
          <button v-for="n in [1,5,10,20]" :key="n" type="button" class="program-rate-option"
            :aria-pressed="playbackRate===n" @click="playbackRate=n">{{ n }}×</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 4. 全流程 / 所选例程 / 停止 -->
  <div class="program-run-actions" role="group" aria-label="程序运行控制">
    <button v-if="index?.automation" class="program-primary" :disabled="busy||loading" @click="runAll">
      {{ runMode==='full'&&cell&&!cell.complete ? '继续全流程' : '全流程运行' }}
    </button>
    <button :disabled="busy||loading||!plan" @click="start">运行所选例程</button>
    <button :disabled="busy||loading||!plan" @click="step">前进一步</button>
    <button :disabled="!busy" class="program-danger" @click="stop">停止</button>
    <button :disabled="busy||!plan" class="program-ghost" @click="restart">重新开始</button>
  </div>

  <!-- 5. 状态 / 进度 -->
  <div class="program-status-block">
    <p class="program-status" :class="{ 'program-error': !!error, 'is-running': busy&&!error }" role="status" aria-live="polite">
      {{ loading ? '正在读取程序…' : error || status }}
    </p>
    <div v-if="cell || busy" class="program-progress" role="progressbar" aria-label="程序装填进度"
      aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressValue">
      <div class="program-progress-head"><span>{{ cell?.stage || '执行中' }}</span><span class="program-progress-value">{{ progressValue }}%</span></div>
      <div class="program-progress-track"><span class="program-progress-fill" :style="{ '--progress': progressValue + '%' }"></span></div>
    </div>
  </div>

  <div v-if="current?.line" class="program-current">…现有当前行结构…</div>
  <div v-if="needs.length" class="program-inputs">…现有 needs 结构…</div>

  <!-- 6. 源码 / 信号 / 运动指令折叠 -->
  <div class="program-advanced">
    <details class="program-details">
      <summary>源码片段</summary>
      <div class="program-details-body"><pre class="program-source">…当前行前后代码…</pre></div>
    </details>
    <details class="program-details program-signals">…现有信号搜索/列表…</details>
    <details class="program-details">…现有运动指令列表…</details>
  </div>

  <p v-if="cell" class="program-cell-status">…现有工位状态…</p>
  <p v-if="plan" class="program-note">…现有说明…</p>
</section>
```

class 不是硬编码数据接口，Codex 可按实际字段改名；CSS 同时兼容现有旧 class（`.program-pickers`、`.program-cell-settings`、`.program-run-actions`、`.program-status`、`.program-current`、`.program-inputs`、`.program-signals`、`.program-events`、`.program-actions`、`.program-cell-status`），未包 section 也能正常显示。

### 关键 class 对应

- 分组：`.program-section`、`.program-section-head`、`.program-section-title`、`.program-badge`。
- 备份/例程：`.program-field`、`.program-field-label`、`.program-pickers`。
- 料量：`.program-fill`、`.program-metrics`、`.program-metric`、`.program-metric-label`、`.program-metric-value`、`.program-metric-unit`、`.program-volume-bar`、`.program-volume-note`。
- 速度：`.program-speed`、`.program-speed-value`、`.program-rate`、`.program-rate-options`、`.program-rate-option`；倍速按钮用 `aria-pressed`/`.is-active` 表示选中。
- 运行：`.program-primary`（全流程主按钮）、`.program-danger`（停止）、`.program-ghost`（次要）；现有无 class 的按钮仍有中性样式。
- 状态：`.program-status`、`.program-error`、`.program-status-block`、`.program-progress`、`.program-progress-head`、`.program-progress-track`、`.program-progress-fill`；进度通过 `--progress` 或 `aria-valuenow` 驱动。
- 源码：`.program-source`、`.program-source-line`/`.is-current`；折叠用原生 `<details>`，summary 已有箭头/触摸样式。
- 复选框：用 `.program-check` 包住，避免依赖 `:has()`（CSS 未使用 `:has`，兼容旧浏览器）。

## 只读 UI 审查（初始基线：Codex 22:24 版本）

以下 1–11 为 CSS 交付时的只读基线；Codex 23:25 已实际集成，当前状态与 CSS 配合修正见下一节。

基于当前 `AbbProgramControl.vue`（22:24 版本）与 `AbbRobotViewer.vue`（22:30 版本）：

1. **分组现状**：现有模板有备份/例程（第 4 行）、装填高度/目标甑（第 5 行）、按钮（第 6 行）、状态文本（第 8 行）、当前行（第 9 行）、needs（第 10 行）、信号折叠（第 11 行）、事件（第 12 行）、运动指令折叠（第 13 行）和工位状态（第 14 行）；但视觉上没有分组容器/标题，填写高度与体积估算没有独立卡片。
2. **速度在面板外**：`AbbRobotViewer.vue:19` 的 `.main-program-speed` 在 `<AbbProgramControl>` 之前、同一个 aside 内；当前用 `<select>` 选 1/5/10/20。要满足“面板内清楚分组 + 示教器不出现控制”，建议把这段移进组件，复用本 CSS 的 `.program-speed`/`.program-rate`；若保留外部结构，本文件末尾 `.main-program-speed` 只在非 scoped 引入时生效。
3. **缺进度条**：当前只有 `role="status"` 文本（第 8 行），没有可视进度；建议加 `.program-progress` 与 `role="progressbar"`，用 `aria-valuenow` 表达装填/运行进度。CSS 提供确定/不确定两种轨道；没有真实进度时用 `.is-indeterminate`，不要伪造百分比。
4. **缺斗容/累计体积**：组件目前只有 `cell.height/targetHeight`（第 14 行）和 `targetHeight`（第 5 行），没有斗容估算/累计体积字段。体积数值应由 Codex 程序/体积守恒逻辑提供；CSS 只提供 `.program-metrics` 三列/两列布局，不计算、不虚构。
5. **按钮层级**：当前五个按钮全是默认样式（第 6 行），主操作与停止不突出；建议 `program-primary`/`program-danger`/`program-ghost` 三类，且停止按钮保持独立红色系。不要用 `:first-child` 自动染主按钮（全流程按钮在有 automation 时才渲染）。
6. **源码/信号折叠**：信号和运动指令已有 `<details>`，源码目前只有当前行 code（第 9 行），无前后片段折叠；建议 `.program-advanced` 包三个 details（源码/信号/运动指令），默认闭合，减少面板高度。CSS 已给 details/summary、源码块和搜索框样式。
7. **手机适配**：`AbbRobotViewer.vue:314` 在 ≤900px 把 `.robot-program-pane` 设为 `width:100%;max-height:230px`，横向占满但高度很紧。本 CSS 手机端把 picker/metrics/speed 改单列、按钮 40px 触摸、运行区恢复非 sticky，并允许面板自身内容滚动；230px 的父高度是否够用建议 Codex 按实机截图调到约 `min(46vh,360px)`（布局属 Codex，DSH 未改）。
8. **主视图/示教器隔离**：`AbbRobotViewer.vue:19` 的面板条件已含 `!guide`，示教器走 `AbbRobotGuide`（第 13 行），适合保持“只在主视图显示程序面板”；示教器只接收 `@location`/状态行号，不应挂载本面板。CSS 未选择 `.robot-stage`/示教器 DOM，不会泄漏样式；若全局引入 `.main-program-speed` 需确认它只在 `robot-program-pane` 内。
9. **实时行号接线现状**：只读看到 `AbbRobotViewer.vue:55` 声明了 `programStatus`，但当前模板第 19 行没有使用它，也没有给 `AbbProgramControl` 绑定 `@location`；`AbbRobotGuide.vue:10` 的示教器组件也没有接收当前行号/动作的 prop。也就是说“示教器同步实时动作/行号”目前还没有从程序面板到示教器的数据通路，需 Codex 在集成逻辑中补（DSH 未改逻辑）。CSS 仅为展示，不参与这条同步。
10. **可访问性**：建议倍速按钮 `type="button"` + `aria-pressed`，进度 `role="progressbar"` + aria-valuemin/max/now，状态 `role="status" aria-live="polite"`，错误 `role="alert"`；CSS 已提供 `:focus-visible` 2px 焦点环、40px 手机触摸和 reduced-motion 规则。当前模板按钮未写 `type`，在表单上下文中可能触发提交，属模板细节，需 Codex 处理。
11. **视觉基调**：浅钢蓝 `#f8fbfd/#e8f3f8`、深钢蓝字 `#2e566d`、主色 `#2b7b98`，与现有 viewer 的 `#d3e1e9/#2f7891` 一致；没有引入字体/图片/外部资源，无动画外溢，`prefers-reduced-motion` 下关闭动画。

## Codex 集成交互复核（23:25 版本，DSH 配合；未改 Vue）

Codex 已实际接入 `AbbProgramControl.vue:113` 的 `<style scoped src="./AbbProgramControl.css">`，并把速度/倍速移入组件第 17 行；新增 `capacityLitres`、`depositedVolume`、`fillPercent`、`program-progress`、`program-source`、`program-check`，与 DSH 建议的 class 基本对应。本轮 DSH 只根据集成后的真实 DOM 修补 CSS，未改 Vue：

- 修正 `.program-section-head` 在 `.program-fill` / `.program-speed-section` 的 grid 半宽问题（现在整行）。
- `.program-speed`、`.program-metrics`、`.program-volume-note` 强制跨满 section。
- `.program-progress` 加为浅钢蓝卡片；补齐 `program-progress-head strong`、`program-progress > small`。
- `.program-check` 从 grid 改为 flex 行，复选框与文字对齐。
- 新增 `details > p` 的紧凑段落样式（自动匹配/替代说明）。
- 运行组最后一个按钮（重新开始）无 `program-ghost` 时自动降级，避免与主运行/停止争层级（当前模板最后按钮固定是重新开始）。
- 删除已不再使用的 `.main-program-speed` 全局兼容块；速度条现在完全在组件内。

### 集成后仍需 Codex 处理

1. **面板内没有状态文本**：当前只在第 20 行渲染 `error`（`.program-error`）；普通 `status` 没有 `.program-status` 节点，只在 `AbbRobotViewer.vue:28` 的底部 `robot-program-status` 显示。若“状态”必须留在面板内（用户要求“状态进度”），建议在 `.program-progress` 前加：
   `<p v-if="!error" class="program-status" :class="{'is-running':busy}" role="status" aria-live="polite">{{loading?'正在读取程序…':status}}</p>`；CSS 已有完整样式，不会自动生成节点。
2. **运行按钮在参数/速度之前**：第 6 行运行组位于第 7 行装填参数之前；当前 sticky 使其始终可见，功能上可用，但“先参数后运行”的阅读顺序更自然。是否调整由 Codex 决定，CSS 不强制顺序。
3. **进度只在有 cell 时出现**：第 21 行 `v-if="cell"`；例程单选/空转时没有进度条。若需要“运行中”占位，可用 `.program-progress.is-indeterminate`（CSS 已支持），由 Codex 决定真实进度来源，DSH 不虚构百分比。
4. **`program-cell-status` 与 `program-progress` 内容重复**：第 21 行和 27 行都显示高度/阶段；视觉上可接受，若觉得重复可只保留进度块，属 Codex 模板取舍。
5. **本轮未做浏览器截图**：只做 PostCSS 静态解析与 DOM/class 对照；颜色对比、340px 桌面窄栏和 390px 手机布局需 Codex 构建后实机复核。父栏手机高度 Codex 已从 230px 调到 `min(46vh,360px)`，本 CSS 的 40px 触摸/单列规则与之匹配。
6. **示教器接线已补**：复核看到 `AbbRobotViewer.vue:13` 已向 `AbbRobotGuide` 传 `program-running/status/current/context/speed`，第 19 行已绑定 `@location`、`@context`；面板仍用 `v-show="programOpen && !guide"`，满足“只在主视图显示”。DSH 未改这些逻辑。

## 冻结

- CSS 已被 Codex 在 `AbbProgramControl.vue:113` 以 scoped src 引入；本文件为整合与复核说明。DSH 未改 Vue/逻辑，未构建/部署/打包/开端口/操作浏览器或业务数据。
- 未改 Codex 正在写的程序、信号、体积守恒、机构物料联动、查看器、会话/运动测试；Codex 可继续按真实数据接体积/进度。
- **CSS SHA256**：`49676B3679C75C18A461D2FFCD1AB19432C6F85942322939A2B8597B3089D2F8`
- **CSS 静态校验**：PostCSS 解析通过，134 条规则，1082 行，25,715 字节；未执行浏览器渲染/截图（不另开预览端口、不抢占窗口）。
- **本文件 SHA256**：未写死在自身内（写入会改变自身哈希）；以交付回复中的最终 `Get-FileHash` 为准。
- 实际完成时间：**2026-11-04 23:41:36 +08:00**（配合 Codex 23:25 集成版本复核）；此后 CSS 不再改动。
