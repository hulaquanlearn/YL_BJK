<template>
  <div class="plc-page">
    <section class="plc-commandbar">
      <div class="command-copy">
        <span class="eyebrow">PROGRAM INTELLIGENCE · READ ONLY</span>
        <h2>工业程序智能解析台</h2>
        <p>看清项目、文件、例程与 I/O 的关系，再进入具体程序证据。</p>
      </div>
      <div class="compact-stats" aria-label="程序统计">
        <span><b>{{ stats.projects }}</b>项目</span><span><b>{{ stats.items }}</b>条目</span><span><b>{{ stats.blocks }}</b>程序块</span><span :class="{ warning: stats.protectedBlocks }"><b>{{ stats.protectedBlocks }}</b>加密</span>
      </div>
      <div class="hero-actions"><el-button @click="showGuide = true">本机解析助手</el-button><el-button v-if="isAdmin" type="primary" @click="uploadVisible = true">导入程序项目</el-button><el-tag v-else effect="plain">项目只读</el-tag></div>
    </section>

    <section class="plc-workbench">
      <aside class="project-rail">
        <div class="panel-heading"><div><span>PROJECTS</span><h3>程序项目</h3></div><el-button text type="primary" @click="loadAll">刷新</el-button></div>
        <el-input v-model="projectSearch" clearable placeholder="搜索项目或控制器" @keyup.enter="loadProjects" />
        <div class="project-list">
          <button v-for="project in projects" :key="project.id" type="button" class="project-card" :class="{ active: project.id === selectedId }" @click="selectProject(project.id)">
            <div class="project-card-top"><span class="version-chip">{{ project.programFamily === 'abb_rapid' ? 'ABB RAPID' : project.tiaVersion }}</span><span class="status-dot" :class="project.parseStatus"></span></div>
            <strong>{{ project.name }}</strong><small>{{ platformSummary(project) }}</small>
            <p><b>{{ project.blockCount }}</b> 块 · <b>{{ project.tagCount }}</b> 变量 · <b>{{ project.itemCount }}</b> 条目</p>
          </button>
          <el-empty v-if="!projects.length && !loading" description="还没有程序项目" :image-size="68" />
        </div>
      </aside>

      <main class="program-panel">
        <template v-if="currentProject">
          <div class="project-overview">
            <div><span class="eyebrow">{{ currentProject.programFamily === 'abb_rapid' ? 'ABB RAPID' : currentProject.tiaVersion }} PROGRAM MAP</span><h3>{{ currentProject.name }}</h3><p>{{ platformSummary(currentProject) }}</p></div>
            <div class="project-tags"><el-tag>{{ currentProject.programFamily === 'abb_rapid' ? '机器人程序' : 'PLC 程序' }}</el-tag><el-tag :type="currentProject.parseStatus === 'parsed' ? 'success' : 'warning'">{{ parseStatusLabel(currentProject.parseStatus) }}</el-tag><el-button v-if="isAdmin" type="danger" plain size="small" @click="removeCurrentProject">删除项目</el-button></div>
          </div>

          <el-alert v-if="currentProject.parseStatus === 'requires_extractor' || currentProject.parseStatus === 'partial'" type="warning" :closable="false" show-icon>
            <template #title>该项目需要本机解析助手</template>{{ currentProject.parseMessage }}。解析必须在安装对应 TIA Portal 的 Windows 电脑上完成。
          </el-alert>
          <el-alert v-if="currentProject.protectedCount" type="warning" :closable="false" show-icon><template #title>检测到 {{ currentProject.protectedCount }} 个受保护条目</template>密码只允许在本机解析时自愿输入，不上传、不保存。</el-alert>

          <el-tabs v-model="activeTab" class="program-tabs">
            <el-tab-pane label="程序关系" name="map">
              <div class="relation-path">
                <button type="button" class="relation-node root-node"><span>项目</span><b>{{ currentProject.name }}</b></button><i>→</i>
                <button type="button" class="relation-node"><span>源文件 / 模块</span><b>{{ programGroups.length }}</b></button><i>→</i>
                <button type="button" class="relation-node"><span>例程 / 程序块</span><b>{{ relationCounts.blocks }}</b></button><i>→</i>
                <button type="button" class="relation-node"><span>变量 / I/O</span><b>{{ relationCounts.signals }}</b></button>
              </div>
              <div class="relationship-browser" v-loading="mapLoading">
                <aside class="module-browser">
                  <div class="browser-title"><b>文件与模块</b><small>选择后查看内部程序</small></div>
                  <button v-for="group in programGroups" :key="group.key" type="button" :class="{ active: group.key === activeGroupKey }" @click="activeGroupKey = group.key">
                    <el-icon><FolderOpened /></el-icon><span><strong>{{ group.name }}</strong><small>{{ group.blocks }} 个程序 · {{ group.signals }} 个变量/I/O</small></span><el-icon><ArrowRight /></el-icon>
                  </button>
                  <el-empty v-if="!programGroups.length && !mapLoading" description="暂无可建立关系的解析条目" :image-size="64" />
                </aside>
                <section class="module-detail" v-if="activeGroup">
                  <header><div><span>当前模块</span><h4>{{ activeGroup.name }}</h4><p>{{ activeGroup.role }}</p></div><el-tag type="info">{{ activeGroup.items.length }} 个对象</el-tag></header>
                  <div class="object-groups">
                    <article v-for="section in activeGroup.sections" :key="section.type">
                      <div class="object-section-title"><b>{{ section.label }}</b><small>{{ section.items.length }} 项</small></div>
                      <div class="object-cards">
                        <button v-for="item in section.items" :key="item.id" type="button" @click="openItem(item)">
                          <span class="item-type">{{ typeLabel(item.itemType) }}</span><strong>{{ item.name }}</strong><small>{{ item.meaning || item.commentText || item.address || '点击查看程序证据和逻辑树' }}</small><el-icon><View /></el-icon>
                        </button>
                      </div>
                    </article>
                  </div>
                </section>
                <section v-else class="module-detail empty-map"><el-empty description="选择左侧文件或模块" /></section>
              </div>
            </el-tab-pane>

            <el-tab-pane label="全部程序对象" name="objects">
              <div class="search-bar">
                <el-input v-model="itemSearch" clearable placeholder="搜索块名、变量、I/O 地址、报警或注释" @keyup.enter="loadItems"><template #prefix>⌕</template></el-input>
                <el-select v-model="itemType" @change="loadItems"><el-option label="全部类型" value="" /><el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                <el-button type="primary" @click="loadItems">检索程序</el-button>
              </div>
              <div class="item-table-wrap">
                <el-table :data="items" v-loading="itemsLoading" @row-click="openItem">
                  <el-table-column prop="itemType" label="类型" width="90"><template #default="scope"><span class="item-type">{{ typeLabel(scope.row.itemType) }}</span></template></el-table-column>
                  <el-table-column prop="name" label="程序对象" min-width="210"><template #default="scope"><strong>{{ scope.row.name }}</strong><small class="source-line">{{ scope.row.sourcePath || scope.row.sourceRef || '结构化解析包' }}</small></template></el-table-column>
                  <el-table-column prop="language" label="语言" width="86" />
                  <el-table-column prop="address" label="地址 / 信号" min-width="150"><template #default="scope"><code>{{ scope.row.address || '—' }}</code></template></el-table-column>
                  <el-table-column prop="meaning" label="作用与含义" min-width="260" show-overflow-tooltip><template #default="scope">{{ scope.row.meaning || scope.row.commentText || '点击查看源码与逻辑树' }}</template></el-table-column>
                  <el-table-column label="状态" width="92"><template #default="scope"><el-tag v-if="scope.row.isProtected" type="warning" size="small">受保护</el-tag><span v-else class="safe-state">可检索</span></template></el-table-column>
                </el-table>
                <el-pagination v-if="itemTotal > itemPageSize" v-model:current-page="itemPage" layout="prev, pager, next, total" :total="itemTotal" :page-size="itemPageSize" @current-change="loadItems" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="项目归档" name="storage">
              <section class="storage-card">
                <div><span>原文件</span><strong>服务器文件系统</strong><small>{{ currentProject.storage?.root || '服务器程序文件目录' }}</small></div>
                <div><span>数据库</span><strong>索引与解析结果</strong><small>保存校验值、关系、变量、I/O 和分析证据</small></div>
                <div><span>已保存文件</span><strong>{{ currentProject.files?.length || 0 }} 个</strong><small>随机文件名保存，原始名称保留在数据库</small></div>
              </section>
            </el-tab-pane>
          </el-tabs>
        </template>
        <div v-else class="empty-stage"><div class="circuit-mark">AI</div><h3>选择或导入一个程序项目</h3><p>TIA 使用完整归档或 .plcai；ABB 可一次选择整个 RAPID 程序文件夹。</p></div>
      </main>

      <aside class="ai-panel">
        <div class="ai-heading"><div class="ai-orb">AI</div><div><span>只读证据分析</span><h3>程序研判助手</h3></div></div>
        <p class="ai-intro">先检索程序证据，再生成结论；证据可回到对应程序对象。</p>
        <div class="prompt-chips"><button v-for="prompt in prompts" :key="prompt" type="button" @click="question = prompt">{{ prompt }}</button></div>
        <el-input v-model="question" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="输入要追踪的信号、程序或执行流程" />
        <el-button class="analyze-button" type="primary" :loading="analyzing" :disabled="!currentProject" @click="analyze">开始证据分析</el-button>
        <div v-if="analysis.answer" class="analysis-result"><div class="result-title"><span>ANALYSIS</span><strong>分析结论</strong></div><pre>{{ analysis.answer }}</pre><div v-if="analysis.evidence?.length" class="evidence-list"><button v-for="evidence in analysis.evidence" :key="evidence.id" type="button" @click="openEvidence(evidence)"><b>[{{ evidence.label }}]</b><span>{{ evidence.name }}</span><small>{{ evidence.address || evidence.sourcePath }}</small></button></div></div>
        <div class="safety-banner"><b>安全边界</b><span>不接入在线 PLC，不执行下载、强制、启停或写入操作。</span></div>
      </aside>
    </section>

    <el-dialog v-model="uploadVisible" title="导入工业程序项目" width="680px" destroy-on-close @closed="resetUploadForm">
      <el-form label-position="top">
        <el-form-item label="程序平台 *"><el-radio-group v-model="form.programFamily" @change="clearFiles"><el-radio-button value="siemens_tia">Siemens TIA V16/V17</el-radio-button><el-radio-button value="abb_rapid">ABB RobotWare / RAPID</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="项目名称 *"><el-input v-model="form.name" placeholder="仅用于你识别，例如：一楼主控程序或包装机器人" /></el-form-item>
        <el-form-item label="程序文件 *">
          <input v-if="form.programFamily === 'siemens_tia'" ref="fileInput" class="native-upload" type="file" multiple accept=".ap16,.ap17,.zap16,.zap17,.xml,.scl,.awl,.stl,.csv,.json,.plcai,.txt,.md" @change="pickFiles" />
          <input v-else ref="folderInput" class="native-upload" type="file" webkitdirectory directory multiple @change="pickRapidFolder" />
          <div v-if="uploadFiles.length" class="selected-files"><div><strong>已选择 {{ uploadFiles.length }} 个文件</strong><button type="button" @click="clearFiles">重新选择</button></div><span v-for="file in uploadFiles.slice(0, 6)" :key="`${file.relativePath || file.name}-${file.size}`">{{ file.relativePath || file.name }} · {{ formatFileSize(file.size) }}</span><small v-if="uploadFiles.length > 6">另有 {{ uploadFiles.length - 6 }} 个文件</small></div>
          <el-alert v-if="nativeProjectOnly" class="native-project-notice" type="warning" :closable="false" show-icon title="这是原生 TIA 项目入口，将先上传登记">`.ap16/.ap17` 只是项目入口文件，上传后由对应版本的 Windows 解析节点定位完整项目并回传解析结果。</el-alert>
          <small v-if="form.programFamily === 'siemens_tia'" class="field-help">TIA 版本、CPU、设备和网络由解析节点自动识别；也可直接上传 `.plcai`。</small>
          <small v-else class="field-help">选择 RAPID 根文件夹，系统递归收集 `.mod/.modx/.sys/.sysx/.cfg/.pgf/.rapid` 并保留相对目录。</small>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="uploadVisible = false">取消</el-button><el-button type="primary" :loading="uploading" @click="submitProject">{{ submitLabel }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="showGuide" title="PLC 解析助手怎么用" width="720px"><div class="helper-steps"><article><b>1</b><div><strong>安装一次</strong><p>在工具目录双击 `Install-PlcAnalysisHelper.cmd`。本机 TIA V17 选择 1，V16 虚拟机选择 2；安装后桌面会出现对应快捷方式。</p></div></article><article><b>2</b><div><strong>生成 .plcai</strong><p>双击桌面助手，选择 `.ap17` 或 `.ap16` 项目入口和输出目录。完成后资源管理器会自动选中生成的 `.plcai`。</p></div></article><article><b>3</b><div><strong>在本页导入</strong><p>点“导入程序项目”，程序平台选 Siemens TIA，直接选择刚生成的 `.plcai`。系统即可展示程序块、调用关系和 I/O 证据。</p></div></article></div><el-alert type="info" :closable="false" title="V16 工程必须在装有 TIA V16 的虚拟机解析；V17 工程在本机解析。助手只读打开工程，不连接或写入 PLC。" /></el-dialog>

    <el-drawer v-model="itemDrawer" size="58%" title="程序证据与逻辑树">
      <template v-if="activeItem">
        <div class="item-detail-head"><span class="item-type">{{ typeLabel(activeItem.itemType) }}</span><h3>{{ activeItem.name }}</h3><code>{{ activeItem.address || '无地址' }}</code></div>
        <dl class="item-meta"><div><dt>语言</dt><dd>{{ activeItem.language || '—' }}</dd></div><div><dt>源文件</dt><dd>{{ activeItem.sourcePath || '—' }}</dd></div><div><dt>网络 / 行号</dt><dd>{{ activeItem.networkNo || activeMetadata.startLine || '—' }}</dd></div><div><dt>保护状态</dt><dd>{{ activeItem.isProtected ? '受保护' : '可检索' }}</dd></div></dl>
        <section v-if="activeMetadata.analysis" class="explanation-grid">
          <article><span>这段程序的作用</span><p>{{ activeMetadata.analysis.purpose }}</p></article>
          <article><span>怎么执行</span><ol><li v-for="(step,index) in activeMetadata.analysis.execution" :key="`step-${index}`">{{ step }}</li></ol></article>
          <article><span>条件与分支</span><ul><li v-for="(condition,index) in activeMetadata.analysis.conditions" :key="`condition-${index}`">{{ condition }}</li></ul></article>
          <article v-if="activeMetadata.analysis.calls?.length"><span>调用关系</span><ul><li v-for="name in activeMetadata.analysis.calls" :key="`call-${name}`">调用 {{ name }}</li></ul></article>
          <article v-if="activeMetadata.analysis.motionTargets?.length"><span>点位 / 工具 / 坐标数据</span><ul><li v-for="name in activeMetadata.analysis.motionTargets" :key="`target-${name}`">{{ name }}</li></ul></article>
          <article v-if="activeMetadata.analysis.ioSignals?.length"><span>I/O 信号</span><ul><li v-for="name in activeMetadata.analysis.ioSignals" :key="`io-${name}`">{{ name }}</li></ul></article>
          <article v-if="activeMetadata.analysis.declarations?.length"><span>变量与数据声明</span><ul><li v-for="item in activeMetadata.analysis.declarations" :key="`decl-${item.dataType}-${item.name}`"><b>{{ item.dataType }}</b> {{ item.name }}</li></ul></article>
        </section>
        <section v-else-if="activeMetadata.meaning" class="meaning-card"><span>程序含义</span><p>{{ activeMetadata.meaning }}</p></section>
        <section v-if="activeMetadata.logicTree" class="logic-panel"><h4>程序逻辑树</h4><p>条件、循环、动作、I/O 与子程序调用均来自源程序。</p><ProgramLogicTree :node="activeMetadata.logicTree" /></section>
        <pre class="code-view">{{ activeItem.contentText || activeItem.commentText || '该条目没有文本内容' }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { analyzePlcProject, createPlcProject, deletePlcProject, getPlcItem, getPlcItems, getPlcProject, getPlcProjects, getPlcStats } from '../api'
import { getUser } from '../auth'
import ProgramLogicTree from '../components/ProgramLogicTree.vue'

const stats = reactive({ projects: 0, items: 0, blocks: 0, protectedBlocks: 0 })
const isAdmin = getUser()?.role === 'admin'
const projects = ref([]), selectedId = ref(''), currentProject = ref(null), projectSearch = ref(''), loading = ref(false)
const items = ref([]), allItems = ref([]), itemSearch = ref(''), itemType = ref(''), itemTotal = ref(0), itemPage = ref(1), itemPageSize = 20, itemsLoading = ref(false), mapLoading = ref(false)
const activeTab = ref('map'), activeGroupKey = ref('')
const uploadVisible = ref(false), uploading = ref(false), uploadFiles = ref([]), fileInput = ref(null), folderInput = ref(null), showGuide = ref(false)
const itemDrawer = ref(false), activeItem = ref(null), question = ref(''), analyzing = ref(false), analysis = reactive({ answer: '', evidence: [] })
const form = reactive({ name: '', programFamily: 'siemens_tia' })
const typeOptions = [{ value: 'block', label: '程序块' }, { value: 'network', label: '网络' }, { value: 'tag', label: '变量' }, { value: 'io', label: 'I/O' }, { value: 'alarm', label: '报警' }, { value: 'document', label: '文档' }]
const prompts = computed(() => currentProject.value?.programFamily === 'abb_rapid' ? ['解释 Main 例程的完整执行流程', '罗列所有运动指令和目标点', '哪些 I/O 信号控制机器人节拍？'] : ['沿启动信号链分析联锁条件', '查找与变频器故障相关的逻辑', '这个输出地址由哪些条件控制？'])
const typeLabel = value => typeOptions.find(item => item.value === value)?.label || value
const parseStatusLabel = value => ({ parsed: '解析完成', partial: '部分解析', requires_extractor: '等待本机解析', failed: '解析失败' }[value] || '已归档')
const platformSummary = project => { const metadata = project?.platformMetadata || {}; if (project?.programFamily === 'abb_rapid') return [metadata.controllerFamily || project.cpuModel, metadata.robotWareVersion, metadata.moduleCount ? `${metadata.moduleCount} 个模块` : ''].filter(Boolean).join(' · ') || 'ABB RAPID'; return [project?.tiaVersion, metadata.cpuModel || project?.cpuModel, metadata.deviceCount ? `${metadata.deviceCount} 个设备` : ''].filter(Boolean).join(' · ') || 'Siemens TIA' }
const nativeProjectOnly = computed(() => uploadFiles.value.length > 0 && uploadFiles.value.every(file => /\.(?:ap|zap)1[67]$/i.test(file.name)))
const submitLabel = computed(() => nativeProjectOnly.value ? '上传并登记' : '导入并解析')
const activeMetadata = computed(() => { const value = activeItem.value?.metadata; if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value) } catch { return {} } })
const sectionOrder = ['block', 'network', 'io', 'tag', 'alarm', 'document']
const programGroups = computed(() => {
  const groups = new Map()
  for (const item of allItems.value) {
    const key = item.sourcePath || item.sourceRef || '结构化解析结果'
    if (!groups.has(key)) groups.set(key, { key, name: key.split(/[\\/]/).pop() || key, items: [] })
    groups.get(key).items.push(item)
  }
  return [...groups.values()].map(group => {
    const blocks = group.items.filter(item => item.itemType === 'block').length
    const signals = group.items.filter(item => item.itemType === 'tag' || item.itemType === 'io').length
    const lead = group.items.find(item => item.itemType === 'block' && item.meaning) || group.items.find(item => item.meaning)
    const sections = sectionOrder.map(type => ({ type, label: typeLabel(type), items: group.items.filter(item => item.itemType === type) })).filter(section => section.items.length)
    return { ...group, blocks, signals, role: lead?.meaning || `${group.name} 中包含 ${blocks} 个程序块和 ${signals} 个变量/I/O。`, sections }
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const activeGroup = computed(() => programGroups.value.find(group => group.key === activeGroupKey.value) || programGroups.value[0] || null)
const relationCounts = computed(() => ({ blocks: allItems.value.filter(item => item.itemType === 'block').length, signals: allItems.value.filter(item => item.itemType === 'tag' || item.itemType === 'io').length }))

async function loadProjects() { loading.value = true; try { projects.value = (await getPlcProjects({ search: projectSearch.value })).data || [] } finally { loading.value = false } }
async function selectProject(id) { selectedId.value = id; itemPage.value = 1; analysis.answer = ''; analysis.evidence = []; currentProject.value = (await getPlcProject(id)).data; await Promise.all([loadItems(), loadMapItems()]); activeTab.value = 'map' }
async function loadItems() { if (!selectedId.value) return; itemsLoading.value = true; try { const result = await getPlcItems(selectedId.value, { page: itemPage.value, pageSize: itemPageSize, type: itemType.value, search: itemSearch.value }); items.value = result.data || []; itemTotal.value = result.total || 0 } finally { itemsLoading.value = false } }
async function loadMapItems() { if (!selectedId.value) return; const requestId = selectedId.value; mapLoading.value = true; try { const collected = []; let page = 1; let total = 0; do { const result = await getPlcItems(requestId, { page, pageSize: 100 }); if (requestId !== selectedId.value) return; collected.push(...(result.data || [])); total = Number(result.total || 0); page += 1 } while (collected.length < total && page <= 100); allItems.value = collected; activeGroupKey.value = programGroups.value[0]?.key || '' } finally { if (requestId === selectedId.value) mapLoading.value = false } }
async function loadAll() { const [statResult] = await Promise.all([getPlcStats(), loadProjects()]); Object.assign(stats, statResult.data || {}); if (selectedId.value) await selectProject(selectedId.value) }
function pickFiles(event) { uploadFiles.value = Array.from(event?.target?.files || []) }
function pickRapidFolder(event) { const allowed = /\.(?:modx?|sysx?|cfg|pgf|rapid)$/i; uploadFiles.value = Array.from(event?.target?.files || []).filter(file => allowed.test(file.name)); if (!uploadFiles.value.length) ElMessage.warning('所选文件夹内没有可解析的 ABB RAPID 程序文件') }
function clearFiles() { uploadFiles.value = []; if (fileInput.value) fileInput.value.value = ''; if (folderInput.value) folderInput.value.value = '' }
function resetUploadForm() { clearFiles(); form.name = '' }
function formatFileSize(size) { if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`; return `${(size / 1024 / 1024).toFixed(1)} MB` }
async function submitProject() { if (!form.name.trim()) return ElMessage.warning('请填写项目名称'); const files = uploadFiles.value.slice(); if (!files.length) return ElMessage.warning(form.programFamily === 'abb_rapid' ? '请选择包含 RAPID 程序的文件夹' : '请选择 TIA 项目入口、归档、导出文件或 .plcai 解析包'); uploading.value = true; try { const data = new FormData(); Object.entries(form).forEach(([key, value]) => data.append(key, value)); data.append('relativePaths', JSON.stringify(files.map(file => file.relativePath || file.webkitRelativePath || file.name))); files.forEach(file => data.append('files', file, file.name)); const result = await createPlcProject(data); ElMessage.success(result.msg); uploadVisible.value = false; await loadAll(); await selectProject(result.data.id) } finally { uploading.value = false } }
async function openItem(row) { activeItem.value = (await getPlcItem(selectedId.value, row.id)).data; itemDrawer.value = true }
async function openEvidence(evidence) { activeItem.value = (await getPlcItem(selectedId.value, evidence.id)).data; itemDrawer.value = true }
async function removeCurrentProject() { const project = currentProject.value; if (!project) return; await ElMessageBox.confirm(`将永久删除“${project.name}”及服务器保存的原始文件、程序索引和分析记录。此操作不可恢复。`,'删除程序项目',{type:'warning',confirmButtonText:'永久删除',cancelButtonText:'取消'}); await deletePlcProject(project.id); ElMessage.success('程序项目已删除'); selectedId.value=''; currentProject.value=null; items.value=[]; allItems.value=[]; activeItem.value=null; itemDrawer.value=false; await loadAll() }
async function analyze() { if (!question.value.trim()) return ElMessage.warning('请输入分析问题'); analyzing.value = true; analysis.answer = ''; try { const result = await analyzePlcProject(selectedId.value, { question: question.value }); Object.assign(analysis, result.data || {}) } finally { analyzing.value = false } }
onMounted(loadAll)
</script>

<style scoped>
.plc-page{--ink:#10283a;--teal:#087c78;--line:#dce7eb;color:var(--ink);display:grid;gap:14px}.plc-commandbar{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(360px,1fr) auto auto;align-items:center;gap:22px;min-height:104px;padding:20px 24px;border-radius:18px;color:#fff;background:radial-gradient(circle at 72% 0,#1bc5bb33,transparent 38%),linear-gradient(120deg,#0a2738,#0b5557 62%,#087c78);box-shadow:0 14px 34px #0b35431f}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;color:#52ded5}.command-copy h2{margin:5px 0 4px;font-size:25px}.command-copy p{margin:0;color:#d8eeee;font-size:13px}.hero-actions{display:flex;gap:8px}.compact-stats{display:flex;align-items:center;gap:7px}.compact-stats span{min-width:68px;padding:8px 10px;border:1px solid #ffffff24;border-radius:11px;color:#cfe7e7;background:#ffffff0d;text-align:center;font-size:11px}.compact-stats b{display:block;color:#fff;font-size:19px}.compact-stats .warning b{color:#ffc36a}.plc-workbench{display:grid;grid-template-columns:250px minmax(560px,1fr) 320px;min-height:690px;border:1px solid var(--line);border-radius:20px;background:#fff;overflow:hidden;box-shadow:0 14px 38px #1731430d}.project-rail,.ai-panel{padding:18px;background:#f7fafb}.project-rail{border-right:1px solid var(--line)}.ai-panel{border-left:1px solid var(--line);background:linear-gradient(180deg,#f4fbfb,#f8fafb)}.panel-heading,.project-overview,.ai-heading{display:flex;justify-content:space-between;align-items:center}.panel-heading span,.result-title span{font-size:10px;letter-spacing:.18em;color:#78909c}.panel-heading h3,.project-overview h3,.ai-heading h3{margin:3px 0}.project-list{display:grid;gap:9px;margin-top:12px;padding:2px;max-height:610px;overflow:auto}.project-card{width:100%;min-width:0;padding:14px;text-align:left;border:1px solid #e1e9ec;border-radius:14px;background:#fff;cursor:pointer;transition:.2s}.project-card:hover{border-color:#25aaa4;box-shadow:0 7px 18px #087c7817;transform:translateY(-1px)}.project-card.active{border-color:#25aaa4;background:#eaf8f6;box-shadow:inset 4px 0 #087c78,0 7px 18px #087c7817}.project-card-top{display:flex;justify-content:space-between;align-items:center}.project-card strong,.project-card small,.project-card p{display:block;min-width:0;overflow-wrap:anywhere}.project-card strong{margin:7px 0 4px;font-size:14px}.project-card small{color:#748694;line-height:1.45}.project-card p{margin:9px 0 0;color:#627784;font-size:11px}.version-chip{font-size:10px;font-weight:800;color:#087c78}.status-dot{width:8px;height:8px;border-radius:50%;background:#20ae78}.status-dot.requires_extractor{background:#e8a02b}.status-dot.failed{background:#da4f53}.program-panel{min-width:0;padding:20px}.project-overview{gap:16px;padding-bottom:10px}.project-overview p{margin:3px 0;color:#718392}.project-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.program-tabs{margin-top:12px}.relation-path{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin:4px 0 14px}.relation-path>i{color:#8aa0aa;font-style:normal}.relation-node{min-width:0;padding:10px;border:1px solid #d5e5e6;border-radius:12px;color:#37636b;background:#f5fbfb;text-align:left}.relation-node span,.relation-node b{display:block}.relation-node span{font-size:10px;color:#7a929a}.relation-node b{margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.root-node{color:#fff;border-color:#087c78;background:#087c78}.root-node span{color:#c9f3ef}.relationship-browser{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:485px;border:1px solid var(--line);border-radius:14px;overflow:hidden}.module-browser{padding:12px;border-right:1px solid var(--line);background:#f7fafb;overflow:auto}.browser-title{padding:5px 5px 10px}.browser-title b,.browser-title small{display:block}.browser-title small{margin-top:3px;color:#81919a}.module-browser>button{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;margin-bottom:7px;padding:10px;border:1px solid transparent;border-radius:10px;color:#405b66;background:transparent;text-align:left;cursor:pointer}.module-browser>button:hover,.module-browser>button.active{border-color:#b9dcda;background:#fff}.module-browser>button.active{color:#087c78;box-shadow:0 6px 15px #087c7812}.module-browser strong,.module-browser small{display:block;overflow-wrap:anywhere}.module-browser small{margin-top:3px;color:#83939c;font-size:10px!important}.module-detail{min-width:0;padding:16px;overflow:auto}.module-detail>header{display:flex;justify-content:space-between;gap:14px;padding-bottom:13px;border-bottom:1px solid var(--line)}.module-detail header span{color:#81919a;font-size:10px}.module-detail h4{margin:3px 0;font-size:18px}.module-detail p{margin:0;color:#60747e;font-size:12px;line-height:1.55}.object-groups{display:grid;gap:15px;margin-top:14px}.object-section-title{display:flex;justify-content:space-between;margin-bottom:7px}.object-section-title small{color:#8a99a4}.object-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.object-cards button{position:relative;min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto auto;gap:3px 8px;padding:11px;border:1px solid #e3eaed;border-radius:11px;color:#263f4b;background:#fff;text-align:left;cursor:pointer}.object-cards button:hover{border-color:#72c5c0;background:#f6fcfb}.object-cards strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.object-cards small{grid-column:2/4;color:#7b8d96;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-type{display:inline-block;align-self:start;padding:3px 7px;border-radius:6px;color:#087c78;background:#e6f7f5;font-size:11px;font-weight:700}.search-bar{display:grid;grid-template-columns:1fr 130px auto;gap:9px;margin:4px 0 12px}.item-table-wrap{border:1px solid var(--line);border-radius:14px;overflow:hidden}.source-line{display:block;margin-top:4px;color:#8a99a4}.safe-state{color:#29956e;font-size:12px}.el-pagination{justify-content:flex-end;padding:12px}.storage-card{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px;border:1px solid #d5e8e7;border-radius:14px;background:#f3faf9}.storage-card div{min-width:0;padding:12px}.storage-card span,.storage-card small{display:block;color:#728791;font-size:12px}.storage-card strong{display:block;margin:4px 0;color:#174f55}.storage-card small{word-break:break-all}.empty-stage{height:100%;display:grid;place-content:center;text-align:center;color:#738794}.circuit-mark{width:82px;height:82px;margin:auto;display:grid;place-items:center;border:1px solid #70d9d3;border-radius:22px;color:#087c78;font-size:24px;font-weight:900;background:linear-gradient(135deg,#e6fbf9,#fff)}.ai-heading{justify-content:flex-start;gap:10px}.ai-orb{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;color:#fff;font-weight:900;background:linear-gradient(135deg,#0a4b60,#0da59d)}.ai-heading span{font-size:11px;color:#718392}.ai-intro{color:#607480;line-height:1.6;font-size:13px}.prompt-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.prompt-chips button{border:1px solid #cde3e3;border-radius:999px;padding:6px 9px;color:#27656a;background:#fff;cursor:pointer;font-size:12px}.analyze-button{width:100%;height:40px;margin-top:10px}.analysis-result{margin-top:14px;padding:13px;border:1px solid #cce7e4;border-radius:13px;background:#fff}.result-title{display:flex;justify-content:space-between}.analysis-result pre,.code-view{white-space:pre-wrap;word-break:break-word;font-family:inherit;line-height:1.7}.evidence-list{display:grid;gap:7px}.evidence-list button{display:grid;grid-template-columns:auto 1fr;text-align:left;border:0;border-top:1px solid #e4ecee;padding:9px 0;background:transparent;cursor:pointer}.evidence-list small{grid-column:2;color:#82949e}.safety-banner{display:grid;gap:4px;margin-top:14px;padding:12px;border-radius:12px;color:#516b76;background:#e9f1f3;font-size:12px}.native-upload{width:100%;padding:16px;border:1px dashed #aacbc9;border-radius:10px;background:#f4fbfa}.selected-files{width:100%;display:grid;gap:5px;margin-top:10px;padding:12px;border:1px solid #b9ddd9;border-radius:10px;background:#f0faf8}.selected-files div{display:flex;justify-content:space-between;align-items:center}.selected-files button{border:0;color:#087c78;background:transparent;cursor:pointer}.selected-files span,.selected-files small{color:#607984;font-size:12px;word-break:break-all}.native-project-notice{margin-top:10px}.field-help{display:block;margin-top:7px;color:#7b8e98}.guide-list{display:grid;gap:12px;padding-left:22px;line-height:1.7}.item-detail-head code{display:block;color:#087c78}.item-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.item-meta div{padding:12px;background:#f5f8f9}.item-meta dt{color:#82949e;font-size:12px}.item-meta dd{margin:5px 0 0}.meaning-card,.logic-panel{margin:16px 0;padding:16px;border:1px solid #cfe5e3;border-radius:14px;background:#f4fbfa}.meaning-card span{color:#087c78;font-size:12px;font-weight:800}.meaning-card p,.logic-panel>p{margin:7px 0 0;color:#526d77;line-height:1.7}.explanation-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.explanation-grid article{padding:15px;border:1px solid #cfe5e3;border-radius:13px;background:#f4fbfa}.explanation-grid article:first-child{grid-column:1/-1}.explanation-grid span{color:#087c78;font-size:12px;font-weight:800}.explanation-grid p,.explanation-grid ol,.explanation-grid ul{margin:8px 0 0;padding-left:20px;color:#526d77;line-height:1.75}.logic-panel{max-height:46vh;overflow:auto}.logic-panel h4{margin:0}.code-view{padding:18px;border-radius:12px;color:#d7edf0;background:#0d2531;font-family:Consolas,monospace;max-height:60vh;overflow:auto}
@media(max-width:1450px){.plc-commandbar{grid-template-columns:1fr auto}.compact-stats{grid-row:2;grid-column:1/-1}.plc-workbench{grid-template-columns:230px minmax(520px,1fr)}.ai-panel{grid-column:1/-1;border-left:0;border-top:1px solid var(--line)}}
@media(max-width:900px){.plc-commandbar{grid-template-columns:1fr}.compact-stats,.hero-actions{grid-column:1}.compact-stats{overflow-x:auto}.plc-workbench{grid-template-columns:1fr}.project-rail{border-right:0;border-bottom:1px solid var(--line)}.project-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:310px}.relationship-browser{grid-template-columns:1fr}.module-browser{border-right:0;border-bottom:1px solid var(--line);max-height:260px}.object-cards{grid-template-columns:1fr}.relation-path{grid-template-columns:1fr 1fr}.relation-path>i{display:none}.search-bar,.storage-card{grid-template-columns:1fr}}
.helper-steps{display:grid;gap:10px;margin-bottom:16px}.helper-steps article{display:grid;grid-template-columns:36px 1fr;gap:12px;padding:13px;border:1px solid #d5e7e6;border-radius:12px;background:#f5fbfa}.helper-steps b{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;color:#fff;background:#087c78}.helper-steps strong{display:block}.helper-steps p{margin:4px 0 0;color:#607984;line-height:1.65}
</style>
