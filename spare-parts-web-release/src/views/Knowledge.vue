<template>
  <div class="knowledge-page">
    <nav v-if="!nativeAndroid" class="knowledge-library-switch" aria-label="知识资料库"><button type="button" :class="{active:filters.category!=='备件资料'}" @click="setCategory('')">工程知识</button><button type="button" :class="{active:filters.category==='备件资料'}" @click="setCategory('备件资料')">备件资料库</button></nav>
    <section v-if="!nativeAndroid && filters.category==='备件资料'" class="spare-document-filters" aria-label="按备件资料分类查找"><div><strong>备件资料库</strong><p>按部件、厂家、型号查找原厂资料与研究记录</p></div><el-select v-model="filters.referenceFamily" clearable placeholder="全部部件类别" @change="search"><el-option v-for="item in spareDocumentFamilies" :key="item" :label="item" :value="item"/></el-select><el-select v-model="filters.documentKind" clearable placeholder="全部文件类型" @change="search"><el-option v-for="item in spareDocumentKinds" :key="item" :label="item" :value="item"/></el-select><el-select v-model="filters.referenceManufacturer" filterable clearable placeholder="全部厂家" @change="search"><el-option v-for="item in referenceManufacturers" :key="item" :label="item" :value="item"/></el-select></section>
    <div class="knowledge-layout">
      <aside v-if="!nativeAndroid" class="knowledge-sidebar" :class="{'mobile-categories-open':mobileCategoriesOpen}" aria-label="知识分类">
        <div class="sidebar-heading">知识类型</div>
        <nav class="type-navigation"><button :class="{active:!filters.type}" @click="setType('')"><el-icon><Collection /></el-icon><span>全部知识</span><b>{{ stats.total }}</b></button><button :class="{active:filters.type==='document'}" @click="setType('document')"><el-icon><Document /></el-icon><span>资料文档</span><b>{{ stats.documents }}</b></button><button :class="{active:filters.type==='fault'}" @click="setType('fault')"><el-icon><Warning /></el-icon><span>故障知识</span><b>{{ stats.faults }}</b></button></nav>
        <button type="button" class="business-mobile-only mobile-category-toggle" :aria-expanded="mobileCategoriesOpen" @click="mobileCategoriesOpen=!mobileCategoriesOpen"><span>{{filters.category || '按资料分类查找'}}</span><span>{{mobileCategoriesOpen?'收起分类':'选择分类'}} <el-icon><ArrowDown /></el-icon></span></button>
        <div class="sidebar-heading category-heading"><span>资料分类</span><el-button v-if="$showControl(canMaintain)" text aria-label="分类配置" title="分类配置" @click="openStageManager"><el-icon><Setting /></el-icon></el-button></div>
        <nav class="category-navigation"><button :class="{active:!filters.category}" @click="setCategory('')"><span>全部分类</span></button><button v-for="item in categories" :key="item.category" :class="{active:filters.category===item.category}" @click="setCategory(item.category)"><span>{{ item.category }}</span><b>{{ item.total }}</b></button></nav>
        <div class="sidebar-foot"><el-icon><View /></el-icon>累计查阅 {{ stats.views }} 次</div>
      </aside>
      <main class="knowledge-main">
        <section v-if="!nativeAndroid" class="knowledge-filter" aria-label="搜索知识">
          <el-input v-model="filters.search" clearable placeholder="搜索标题、设备、故障或标签" @keyup.enter="search" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
          <el-select v-model="filters.workshopCode" placeholder="全部车间" @change="workshopChanged"><el-option label="全部车间" value=""/><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code"/></el-select>
          <el-button :loading="loading" @click="search">查询</el-button><el-button v-if="filters.search || filters.workshopCode || filters.type || filters.category" text @click="reset">重置</el-button><el-button v-if="canEditAny" class="knowledge-ai-entry" text @click="openAssistant()"><el-icon><ChatDotRound /></el-icon>问 AI</el-button>
        </section>
        <div v-if="!nativeAndroid && (filters.category||filters.type)" class="active-filters"><span>当前筛选</span><el-tag v-if="filters.type" closable @close="setType('')">{{ filters.type==='fault'?'故障知识':'资料文档' }}</el-tag><el-tag v-if="filters.category" closable @close="setCategory('')">{{ filters.category }}</el-tag></div>
        <section v-if="nativeAndroid" class="app-knowledge-tools" aria-label="查找知识">
          <nav class="app-library-tabs" aria-label="知识资料库">
            <button type="button" :aria-pressed="filters.category!=='备件资料'" @click="setCategory('')">工程知识</button>
            <button type="button" :aria-pressed="filters.category==='备件资料'" @click="setCategory('备件资料')">备件资料库</button>
          </nav>
          <form class="app-knowledge-search" @submit.prevent="search">
            <el-input v-model="filters.search" clearable placeholder="搜标题、设备、故障或标签" aria-label="搜索知识" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
            <el-button native-type="submit" :loading="loading">搜索</el-button>
          </form>
          <div class="app-knowledge-actions">
            <el-button :aria-expanded="appFiltersOpen" aria-controls="app-knowledge-filters" @click="appFiltersOpen=!appFiltersOpen">筛选 <span v-if="appFilterCount" class="app-filter-count">{{appFilterCount}}</span></el-button>
            <el-button v-if="canEditAny" class="knowledge-ai-entry" @click="openAssistant()">问 AI</el-button>
          </div>
          <div v-show="appFiltersOpen" id="app-knowledge-filters" class="app-knowledge-filters">
            <label>类型<el-select :model-value="filters.type" aria-label="类型" placeholder="全部类型" @change="setType"><el-option label="全部类型" value=""/><el-option label="资料文档" value="document"/><el-option label="故障知识" value="fault"/></el-select></label>
            <label>分类<el-select :model-value="filters.category" aria-label="分类" placeholder="全部分类" @change="setCategory"><el-option label="全部分类" value=""/><el-option v-for="item in appCategories" :key="item" :label="item" :value="item"/></el-select></label>
            <label>车间<el-select v-model="filters.workshopCode" aria-label="车间" placeholder="全部车间" @change="workshopChanged"><el-option label="全部车间" value=""/><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code"/></el-select></label>
            <el-button @click="reset">清除筛选</el-button>
            <div v-if="filters.category==='备件资料'" class="app-spare-filters" aria-label="备件资料筛选"><el-select v-model="filters.referenceFamily" clearable placeholder="全部部件类别" @change="search"><el-option v-for="item in spareDocumentFamilies" :key="item" :label="item" :value="item"/></el-select><el-select v-model="filters.documentKind" clearable placeholder="全部文件类型" @change="search"><el-option v-for="item in spareDocumentKinds" :key="item" :label="item" :value="item"/></el-select><el-select v-model="filters.referenceManufacturer" filterable clearable placeholder="全部厂家" @change="search"><el-option v-for="item in referenceManufacturers" :key="item" :label="item" :value="item"/></el-select></div>
          </div>
        </section>
    <section class="knowledge-content">
      <div class="content-head"><div><strong>知识条目</strong><span>共 {{ total }} 条</span></div><div class="knowledge-view-controls"><el-radio-group v-model="entryView" size="small" aria-label="知识展示方式"><el-radio-button value="list">列表</el-radio-button><el-radio-button value="cards">卡片</el-radio-button></el-radio-group><el-button v-write="canEditAny" v-if="!nativeAndroid && ($showControl(canMaintain))" type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增知识</el-button></div></div>
      <div v-loading="loading" class="knowledge-grid" :class="{'is-list':entryView==='list'}">
        <article v-for="item in entries" :key="item.id" class="knowledge-card" tabindex="0" role="button" :aria-label="`查看${item.title}`" @click="openDetail(item)" @keydown.enter="openDetail(item)" @keydown.space.prevent="openDetail(item)">
          <div class="card-top"><span class="type-chip" :class="`is-${item.entryType}`"><el-icon><Document v-if="item.entryType==='document'"/><Warning v-else/></el-icon>{{ item.entryType==='document'?'资料文档':'故障知识' }}</span><span class="card-date">{{ formatDate(item.createdAt) }}</span></div>
          <h3>{{ item.title }}</h3>
          <p v-if="item.faultSymptom || item.summary">{{ item.entryType==='fault' ? (item.faultSymptom || item.summary) : item.summary }}</p>
          <div class="card-meta"><span><el-icon><FolderOpened /></el-icon>{{ item.referenceMetadata?.family || item.category }}</span><span v-if="item.referenceMetadata?.manufacturer">{{item.referenceMetadata.manufacturer}} · {{item.referenceMetadata.documentKind}}</span><span v-if="item.processStage"><el-icon><Guide /></el-icon>{{ item.processStage }}</span><span v-if="item.equipmentName"><el-icon><SetUp /></el-icon>{{ item.equipmentName }}</span><span v-if="item.tags?.length" class="inline-tags"><el-tag v-for="tag in item.tags.slice(0,3)" :key="tag" size="small" effect="plain">{{ tag }}</el-tag></span></div>
          <footer><span>{{ item.uploadedByName || '系统用户' }}</span><span><el-tag v-if="item.hasFile&&item.indexStatus==='failed'" size="small" :type="indexTagType(item.indexStatus)" effect="plain">{{ indexStatusLabel(item.indexStatus) }}</el-tag><el-icon><View /></el-icon>{{ item.viewCount }}<span v-if="item.hasFile" class="attachment-indicator"><el-icon><Paperclip /></el-icon>附件</span></span></footer>
        </article>
      </div>
      <el-empty v-if="!loading&&!entries.length" description="没有找到符合条件的知识" />
      <div v-if="total>filters.pageSize" class="knowledge-pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" :total="total" layout="prev, pager, next" @current-change="load"/></div>
    </section>

      </main>
    </div>
    <el-dialog v-model="assistantVisible" class="knowledge-assistant-dialog" title="设备故障知识问答" width="min(820px, calc(100vw - 28px))" align-center append-to-body destroy-on-close>
    <section class="knowledge-assistant assistant-panel"><AiModelInfo feature="knowledge"/>
      <div v-if="aiContext" class="assistant-current-file"><el-icon><Document /></el-icon><span>{{aiContext.title}}</span><el-button text @click="openAssistant()">切换到知识库</el-button></div>
      <div class="assistant-session"><span>可连续追问，问题与资料引用会保留在本次对话中</span><el-button text @click="newAssistantConversation">新对话</el-button></div>
      <div class="assistant-conversation" aria-label="问答内容"><div v-if="!aiTurns.length" class="assistant-welcome"><strong>需要排查什么设备问题？</strong><p>写清设备、现象或报警信息，也可以先选一个例子。</p><button type="button" @click="aiQuestion='潜伏式AGV急停无法解除，应该如何排查？'">潜伏式AGV急停无法解除</button><button type="button" @click="aiQuestion='如何排查电机启动后频繁跳闸？'">电机启动后频繁跳闸</button></div><article v-for="turn in aiTurns" :key="turn.id" class="assistant-turn">
        <div class="assistant-user"><strong>你的问题</strong><p>{{turn.question}}</p></div>
        <p v-if="turn.pending" role="status">正在检索资料并生成回答…</p>
        <p v-if="turn.error" role="alert" class="assistant-error">{{turn.error}}；问题已保留，可重试。</p>
        <div v-if="turn.answer" class="assistant-answer"><small v-if="turn.ai" class="ai-answer-model">{{turn.ai.label}} · {{turn.ai.model}}</small><div class="md-content" v-html="renderMd(turn.answer)"></div><div v-if="turn.evidence.length" class="assistant-evidence"><span>检索依据</span><button v-for="item in turn.evidence" :key="`${item.sourceType}-${item.sourceId}`" type="button" @click="openEvidenceSource(item)"><b>[{{ item.citation || `${evidenceLabel(item)}#${item.sourceId}` }}]</b>{{ item.title }}<small v-if="item.excerpt">{{ item.excerpt }}</small></button></div></div>
      </article></div>
      <div class="assistant-query"><el-input v-model="aiQuestion" type="textarea" :rows="3" maxlength="1000" show-word-limit aria-label="设备故障问题" :placeholder="aiTurns.length?'继续追问，也可以提出新的设备问题':aiContext?'描述当前文件中的设备或故障问题':'描述设备、故障现象或要查找的资料'" @keyup.ctrl.enter="askAssistant"/><el-button type="primary" :loading="aiLoading" :disabled="!aiQuestion.trim()" @click="askAssistant">{{aiTurns.length?'发送':'提问'}}</el-button></div>
    </section>

    </el-dialog>
    <el-dialog v-model="createVisible" class="knowledge-editor-dialog" :title="editingId?'编辑工程知识':'新增工程知识'" width="min(1160px,96vw)" top="5vh" destroy-on-close :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting" :before-close="beforeEditorClose" @closed="resetForm">
      <div class="entry-type-switch"><button :class="{active:form.entryType==='document'}" :disabled="submitting" @click="form.entryType='document'"><el-icon><Document /></el-icon>资料文档</button><button :class="{active:form.entryType==='fault'}" :disabled="submitting" @click="form.entryType='fault'"><el-icon><Warning /></el-icon>故障知识</button></div>
      <el-form label-position="top" class="knowledge-editor-form" :disabled="submitting">
        <section class="knowledge-form-basics" aria-label="知识基本信息">
        <el-form-item label="所属车间 *"><el-select v-model="form.workshopCode" :disabled="!isAdmin" @change="formWorkshopChanged"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code"/></el-select></el-form-item>
        <div class="form-grid"><el-form-item label="标题 *"><el-input v-model="form.title" maxlength="200" show-word-limit/></el-form-item><el-form-item label="分类 *"><el-select v-model="form.category" filterable allow-create default-first-option placeholder="选择或输入分类"><el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item"/></el-select></el-form-item></div>
        <div class="form-grid"><el-form-item label="工序 / 区域"><el-select v-model="form.processStage" clearable filterable placeholder="选择已配置的工序/区域"><el-option v-for="item in activeStages" :key="item.id" :label="item.name" :value="item.name"/></el-select></el-form-item><el-form-item label="关联设备型号"><el-select v-model="form.equipmentName" filterable remote clearable placeholder="输入名称搜索设备型号" :remote-method="searchEquipment" :loading="equipmentLoading"><el-option v-for="item in equipmentOptions" :key="item.id" :label="item.name" :value="item.name"/></el-select><small class="field-help">设备型号在“设备与备件”中统一维护。</small></el-form-item></div>
        <el-form-item label="标签"><el-select v-model="form.tagList" multiple filterable allow-create default-first-option placeholder="可选已有标签，也可输入后回车新增临时标签" :reserve-keyword="false" @change="updateTags"><el-option v-for="tag in tagSuggestions" :key="tag" :label="tag" :value="tag"/></el-select></el-form-item>
        </section>
        <section class="knowledge-form-content" aria-label="知识内容与附件">
        <section v-if="form.category==='备件资料'" class="reference-metadata-editor" aria-label="备件资料分类与来源"><el-form-item label="适用范围"><el-select v-model="form.referenceMetadata.applicability"><el-option label="各车间通用资料" value="shared"/><el-option label="所属车间专用资料" value="workshop"/></el-select></el-form-item><div class="form-grid"><el-form-item label="部件类别"><el-select v-model="form.referenceMetadata.family"><el-option v-for="item in spareDocumentFamilies" :key="item" :label="item" :value="item"/></el-select></el-form-item><el-form-item label="文件类型"><el-select v-model="form.referenceMetadata.documentKind"><el-option v-for="item in spareDocumentKinds" :key="item" :label="item" :value="item"/></el-select></el-form-item></div><div class="form-grid"><el-form-item label="厂家"><el-input v-model="form.referenceMetadata.manufacturer" maxlength="100"/></el-form-item><el-form-item label="适用型号 / 系列"><el-select v-model="form.referenceMetadata.models" multiple filterable allow-create default-first-option placeholder="输入完整型号后回车"/></el-form-item></div><el-form-item label="原始来源链接"><el-input v-model="form.referenceMetadata.sourceUrl" maxlength="1500" placeholder="https://..."/></el-form-item><div class="form-grid"><el-form-item label="资料版本"><el-input v-model="form.referenceMetadata.documentVersion" maxlength="160"/></el-form-item><el-form-item label="参考页"><el-input v-model="form.referenceMetadata.sourcePages" maxlength="160" placeholder="例如 PDF第3页 / 印刷第39页"/></el-form-item></div><el-form-item label="资料核实状态"><el-select v-model="form.referenceMetadata.verification"><el-option v-for="(label,value) in referenceStatusLabels" :key="value" :label="label" :value="value"/></el-select></el-form-item><el-form-item label="已核实范围"><el-input v-model="form.referenceMetadata.verifiedScope" type="textarea" :rows="2" maxlength="2000"/></el-form-item><el-form-item label="未核实部位 / 版本或品牌差异"><el-input v-model="form.referenceMetadata.limitations" type="textarea" :rows="2" maxlength="2000"/></el-form-item></section>
        <template v-if="form.entryType==='document'">
          <el-form-item label="资料摘要"><el-input v-model="form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="说明资料用途和适用范围，便于检索"/></el-form-item>
          <el-form-item v-if="editingId&&detail?.hasFile" label="附件显示名"><el-input v-model="form.originalFilename" maxlength="255"/><small class="field-help">可修正历史乱码文件名，必须保留原扩展名。</small></el-form-item>
          <el-form-item :label="editingId&&detail?.hasFile?'替换资料附件（可选）':'资料附件 *'"><el-upload v-write ref="uploadRef" class="knowledge-file-upload" v-model:file-list="uploadFiles" drag :auto-upload="false" :limit="1" :on-change="fileChanged" :on-remove="fileRemoved"><el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入文件，或<em>点击选择</em></div><template #tip><div class="el-upload__tip">Office、PDF、图片支持在线预览；CAD、压缩包等可查看文件信息并下载。</div></template></el-upload></el-form-item>
        </template>
        <div v-else class="knowledge-fault-fields">
          <el-form-item label="故障现象 *"><el-input v-model="form.faultSymptom" type="textarea" :rows="3" maxlength="4000" placeholder="描述时间、位置、表现、报警或异常参数"/></el-form-item>
          <el-form-item label="原因分析"><el-input v-model="form.faultCause" type="textarea" :rows="3" maxlength="4000" placeholder="填写已确认的直接原因和根本原因"/></el-form-item>
          <el-form-item label="处理方法 *" class="fault-solution"><el-input v-model="form.solution" type="textarea" :rows="4" maxlength="20000" placeholder="按执行顺序填写安全措施、检查步骤和处理办法"/></el-form-item>
          <el-form-item label="预防措施"><el-input v-model="form.preventiveAction" type="textarea" :rows="3" maxlength="4000" placeholder="填写点检、保养或工艺控制建议"/></el-form-item>
        </div>
        </section>
      </el-form>
      <el-progress v-if="submitting&&uploadProgress>0" :percentage="uploadProgress" :status="uploadProgress===100?'success':''" />
      <template #footer><el-button :disabled="submitting" @click="closeEditor">取消</el-button><el-button v-if="!nativeAndroid" v-write type="primary" :loading="submitting" @click="submit">{{ submitting ? `正在处理 ${uploadProgress}%` : (editingId?'保存修订':'提交知识') }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="stageVisible" title="知识选项配置" width="min(760px,94vw)">
      <el-select v-model="stageWorkshopCode" :disabled="!isAdmin" style="width:100%;margin-bottom:12px" @change="loadManagerData"><el-option v-for="item in managerWorkshops" :key="item.code" :label="item.name" :value="item.code"/></el-select>
      <h3 class="manager-heading">工序 / 区域</h3>
      <div class="stage-create"><el-input v-write v-model="newStage.name" maxlength="80" placeholder="新增工序或区域名称" @keyup.enter="addStage"/><el-input-number v-write v-model="newStage.sortOrder" :min="0" :max="99999"/><el-button v-write type="primary" :loading="stageSaving" @click="addStage">新增</el-button></div>
      <div class="stage-list">
        <div v-for="item in stageRows" :key="item.id" class="stage-row">
          <el-input v-write v-model="item.name" maxlength="80"/>
          <el-input-number v-write v-model="item.sortOrder" :min="0" :max="99999"/>
          <el-switch v-write v-model="item.enabled" inline-prompt active-text="启用" inactive-text="停用"/>
          <el-button v-write :loading="item.saving" @click="saveStage(item)">保存</el-button>
          <el-button v-if="!nativeAndroid" v-write type="danger" plain @click="deleteStage(item)">删除</el-button>
        </div>
      </div>
      <div class="stage-footer"><p class="stage-tip">停用后不会再出现在上传选择框中，已有资料的工序信息仍会保留。</p><el-button v-write type="primary" :loading="stageSaving" @click="saveAllStages">一键保存全部</el-button></div>
      <el-divider />
      <div class="manager-section"><div><h3>关联设备型号</h3></div><el-button type="primary" plain @click="goEquipment"><el-icon><SetUp /></el-icon>打开设备型号库</el-button></div>
      <el-divider />
      <div class="manager-section is-tags"><div><h3>常用标签</h3></div><div class="tag-create"><el-input v-write v-model="newTag" maxlength="60" placeholder="输入常用标签" @keyup.enter="addTag"/><el-button v-write type="primary" :loading="tagSaving" @click="addTag">新增标签</el-button></div></div>
      <div class="managed-tags"><el-tag v-write v-for="item in tagRows" :key="item.id" closable effect="plain" @close="removeTag(item)">{{ item.name }}</el-tag><el-empty v-if="!tagRows.length" :image-size="42" description="当前车间还没有常用标签"/></div>
    </el-dialog>

    <el-dialog v-model="detailVisible" class="knowledge-detail-dialog" width="min(1000px,94vw)" align-center append-to-body destroy-on-close @closed="detailRequest++;detailLoading=false" :title="detail?.entryType==='fault'?'故障知识详情':'资料详情'">
      <p v-if="detailLoading" role="status">正在加载资料…</p><div v-else-if="detailError" role="alert" class="assistant-error">{{detailError}}<el-button text @click="openDetail(detailTarget)">重试</el-button></div><div v-else-if="detail" class="knowledge-detail">
        <div class="detail-heading"><span class="type-chip" :class="`is-${detail.entryType}`">{{ detail.entryType==='fault'?'故障知识':'资料文档' }}</span><h2>{{ detail.title }}</h2><p>{{ detail.category }}<template v-if="detail.processStage"> · {{ detail.processStage }}</template><template v-if="detail.equipmentName"> · {{ detail.equipmentName }}</template></p></div>
        <div class="detail-tags"><el-tag v-for="tag in detail.tags" :key="tag" effect="plain">{{ tag }}</el-tag></div>
        <SpareDocumentInfo :metadata="detail.referenceMetadata"/>
        <template v-if="detail.entryType==='fault'"><section><h3>故障现象</h3><div class="md-content" v-html="renderMd(knowledgeSection(detail.faultSymptom,'故障现象',false))"></div></section><section v-if="detail.faultCause"><h3>原因分析</h3><div class="md-content" v-html="renderMd(knowledgeSection(detail.faultCause,'原因分析',false))"></div></section><section><h3>处理方法</h3><div class="md-content" v-html="renderMd(knowledgeSection(detail.solution,'处理方法',true))"></div></section><section v-if="detail.preventiveAction"><h3>预防措施</h3><div class="md-content" v-html="renderMd(knowledgeSection(detail.preventiveAction,'预防措施',false))"></div></section></template>
        <template v-else><section><h3>资料摘要</h3><div class="md-content" v-html="renderMd(detail.summary || '暂无摘要')"></div></section><section v-if="detail.contentText"><h3>文本内容</h3><div class="md-content" v-html="renderMd(detail.contentText)"></div></section></template>
        <div class="detail-file" v-if="detail.hasFile"><el-icon><Document /></el-icon><div><strong>{{ detail.originalFilename }}</strong><small>{{ formatSize(detail.fileSize) }} · {{ indexStatusLabel(detail.indexStatus) }}<template v-if="detail.indexMessage"> · {{ detail.indexMessage }}</template></small></div><div class="file-actions"><el-button v-if="canPreview(detail)" type="primary" :loading="previewLoading" @click="openPreview(detail)">在线阅读</el-button><el-button plain :loading="downloading" @click="download(detail)"><el-icon><Download /></el-icon>下载</el-button></div></div>
        <footer class="detail-footer"><span>上传人：{{ detail.uploadedByName }}</span><span>V{{ detail.revisionNo||1 }} · {{ formatTime(detail.createdAt) }} · 已查阅 {{ detail.viewCount }} 次</span></footer>
      </div>
      <template #footer><div class="knowledge-detail-actions"><el-dropdown v-if="$showControl(detail?.canEdit)" trigger="click" @command="detailMore"><el-button :disabled="reindexing">更多<el-icon><ArrowDown /></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="history">修订历史</el-dropdown-item><el-dropdown-item v-if="detail?.hasFile&&detail.indexStatus!=='ready'" command="index">重建全文索引</el-dropdown-item><el-dropdown-item v-if="!nativeAndroid&&detail?.canDelete&&!isAdmin" command="delete" divided>删除资料</el-dropdown-item></el-dropdown-menu></template></el-dropdown><span/><el-button v-if="!nativeAndroid&&$showControl(detail?.canEdit)" v-write="detail?.canEdit" @click="openEdit(detail)">编辑资料</el-button><el-button v-if="canEditAny" type="primary" :disabled="aiLoading||!detail" @click="openAssistant(detail)"><el-icon><ChatDotRound /></el-icon>问 AI</el-button></div></template>
    </el-dialog>
    <el-dialog v-model="historyVisible" title="修订历史" width="min(760px,94vw)"><el-alert :title="`当前版本 V${detail?.revisionNo||1}；下方是每次修改前自动保留的版本。`" type="info" :closable="false"/><div v-loading="historyLoading" class="revision-list"><article v-for="item in revisions" :key="item.revisionNo"><div><strong>V{{ item.revisionNo }} · {{ item.title }}</strong><small>{{ formatTime(item.createdAt) }} · {{ item.createdByName||'系统用户' }}<template v-if="item.originalFilename"> · {{ item.originalFilename }}</template></small><p v-if="item.changeSummary">{{ item.changeSummary }}</p></div><el-button v-write="detail?.canEdit" v-if="$showControl(detail?.canEdit)" plain @click="restoreRevision(item)">恢复为新版本</el-button></article><el-empty v-if="!historyLoading&&!revisions.length" :image-size="54" description="尚无历史修订"/></div></el-dialog>
    <el-dialog v-model="previewVisible" append-to-body class="knowledge-file-reader" :title="detail?.originalFilename||'在线阅读'" width="min(1180px,96vw)" top="3vh" destroy-on-close @closed="closePreview"><el-alert v-if="previewNotice" :title="previewNotice" type="warning" :closable="false" show-icon/><div class="file-preview" :class="{'is-pdf':previewKind==='pdf'}"><el-image v-if="previewKind==='image'" :src="previewUrl" :preview-src-list="[previewUrl]" alt="资料预览，点击放大" fit="contain" preview-teleported /><video v-else-if="previewKind==='video'" :src="previewUrl" controls/><audio v-else-if="previewKind==='audio'" :src="previewUrl" controls/><PdfReader v-else-if="previewKind==='pdf'" :file="previewFile"/><iframe v-else :src="previewUrl" title="资料在线预览" sandbox></iframe></div><template #footer><el-button v-if="canEditAny" @click="openAssistant(detail)">问 AI</el-button><el-button @click="download(detail)">下载原文件</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import {isAppSurface} from '../app/surface.mjs'
const nativeAndroid=isAppSurface()

import AiModelInfo from '../components/AiModelInfo.vue'
import PdfReader from '../components/PdfReader.vue'
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import SpareDocumentInfo from '../components/SpareDocumentInfo.vue'
import {spareDocumentFamilies,spareDocumentKinds,referenceStatusLabels,emptyReferenceMetadata} from '../utils/spare-documents.mjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { marked } from 'marked'
import { knowledgeSection } from '../utils/knowledge-section.mjs'
import DOMPurify from 'dompurify'
import { chatKnowledgeAssistant, createKnowledgeEntry, createKnowledgeProcessStage, createKnowledgeTag, deleteKnowledgeEntry, deleteKnowledgeProcessStage, deleteKnowledgeTag, downloadKnowledgeFile, getEquipment, getKnowledgeEntries, getKnowledgeReferenceFacets, getKnowledgeEntry, getKnowledgeProcessStages, getKnowledgeRevision, getKnowledgeRevisions, getKnowledgeStats, getKnowledgeTags, previewKnowledgeFileResponse, reindexKnowledgeEntry, restoreKnowledgeRevision, saveKnowledgeProcessStages, updateKnowledgeEntry, updateKnowledgeProcessStage } from '../api'
import { canEditAnyWorkshop, getUser, userWorkshopCode, isViewer } from '../auth'

marked.setOptions({ breaks: true, gfm: true })
const router=useRouter()
const entryView=ref('list'),assistantVisible=ref(false),mobileCategoriesOpen=ref(false),appFiltersOpen=ref(false)
const detailLoading=ref(false),detailError=ref(''),detailTarget=ref(null)
let knowledgeDisposed=false,detailRequest=0,previewRequest=0,statsRequest=0
function renderMd(text) {
  if (!text) return ''
  return DOMPurify.sanitize(marked.parse(String(text)), {
    USE_PROFILES: { html: true }
  })
}

const isAdmin = getUser()?.role === 'admin'
const canEditAny = canEditAnyWorkshop()
const canMaintain = !nativeAndroid && canEditAny
const workshops=[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}]
const ownWorkshop=userWorkshopCode()||'raw_grain'
const editableWorkshops=isAdmin?workshops:workshops.filter(item=>item.code===ownWorkshop)
const managerWorkshops=isViewer()?workshops:editableWorkshops
const loading=ref(false), submitting=ref(false), downloading=ref(false), createVisible=ref(false), detailVisible=ref(false), stageVisible=ref(false), stageSaving=ref(false), uploadRef=ref()
const previewVisible=ref(false),previewLoading=ref(false),previewUrl=ref(''),previewFile=ref(null),previewKind=ref('document'),previewNotice=ref('')
const editingId=ref(''),historyVisible=ref(false),historyLoading=ref(false),reindexing=ref(false),revisions=ref([])
const aiQuestion=ref(''),aiLoading=ref(false),aiAnswer=ref(''),aiEvidence=ref([]),aiMessages=ref([]),aiContext=ref(null)
const aiTurns=ref([])
let aiTurnId=0
function assistantSessionKey(){const id=getUser()?.id;return id?'knowledge-chat:'+id+':'+(aiContext.value?aiContext.value.entryId+':'+aiContext.value.revisionNo:'library'):null}
function saveAssistantConversation(){
  try{const key=assistantSessionKey();if(!key||typeof sessionStorage==='undefined')return;let turns=aiTurns.value.filter(t=>!t.pending).slice(-20);let record={schema:1,at:Date.now(),messages:aiMessages.value,turns};while(JSON.stringify(record).length>500000&&turns.length>1){turns=turns.slice(1);record.turns=turns}sessionStorage.setItem(key,JSON.stringify(record))}catch{}
}
function restoreAssistantConversation(){
  try{const key=assistantSessionKey();if(!key||typeof sessionStorage==='undefined')return;const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.schema!==1||Date.now()-saved.at>86400000||!Array.isArray(saved.messages)||!Array.isArray(saved.turns))return;aiMessages.value=saved.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-12);aiTurns.value=saved.turns.filter(t=>typeof t.question==='string'&&typeof t.answer==='string'&&Array.isArray(t.evidence)).slice(-20).map(t=>({...t,id:++aiTurnId,pending:false}));const last=aiTurns.value.at(-1);aiAnswer.value=last?.answer||'';aiEvidence.value=last?.evidence||[]}catch{}
}
function newAssistantConversation(){if(aiLoading.value)return;aiMessages.value=[];aiTurns.value=[];aiQuestion.value='';aiAnswer.value='';aiEvidence.value=[];saveAssistantConversation()}
const uploadProgress=ref(0), stageWorkshopCode=ref(ownWorkshop)
const entries=ref([]), total=ref(0), detail=ref(null), selectedFile=ref(null), uploadFiles=ref([])
const stats=reactive({total:0,documents:0,faults:0,views:0,categories:[]})
const filters=reactive({search:String(router.currentRoute.value.query.search||'').slice(0,100),workshopCode:'',type:'',category:router.currentRoute.value.query.library==='parts'?'备件资料':'',referenceFamily:'',referenceManufacturer:'',documentKind:'',page:1,pageSize:24})
const defaultCategories=['备件资料','工艺资料','设备资料','PLC程序','机器人程序','故障经验','安全规范','操作规程','其他']
const categoryOptions=ref(defaultCategories)
const referenceManufacturers=ref([])
const categories=ref([]), activeStages=ref([]), stageRows=ref([])
const equipmentOptions=ref([]), equipmentLoading=ref(false)
const tagSuggestions=ref([])
const tagRows=ref([]), newTag=ref(''), tagSaving=ref(false)
const newStage=reactive({name:'',sortOrder:100})
const emptyForm=()=>({workshopCode:filters.workshopCode||(isAdmin?'':ownWorkshop),entryType:'document',title:'',category:filters.category||'',referenceMetadata:emptyReferenceMetadata(),processStage:'',equipmentName:'',summary:'',tags:'',tagList:[],faultSymptom:'',faultCause:'',solution:'',preventiveAction:'',originalFilename:''})
const form=reactive(emptyForm())
let editorBaseline='',editorCloseRequest=null
function editorSnapshot(){return JSON.stringify({...form,file:selectedFile.value?{name:selectedFile.value.name,size:selectedFile.value.size,lastModified:selectedFile.value.lastModified}:null})}
function editorDirty(){return createVisible.value&&editorSnapshot()!==editorBaseline}
function markEditorClean(){editorBaseline=editorSnapshot()}
async function approveEditorClose(){
  if(!createVisible.value)return true
  if(submitting.value){ElMessage.warning('正在提交知识，请等待处理完成后再离开');return false}
  if(!editorDirty())return true
  if(!editorCloseRequest)editorCloseRequest=ElMessageBox.confirm('内容尚未保存，离开后本次填写内容将丢失。是否放弃修改？','尚未保存',{type:'warning',confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'}).then(()=>!submitting.value,()=>false).finally(()=>{editorCloseRequest=null})
  return editorCloseRequest
}
async function beforeEditorClose(done){if(await approveEditorClose())done()}
async function closeEditor(){if(await approveEditorClose())createVisible.value=false}
function beforeKnowledgeUnload(event){if(createVisible.value&&(submitting.value||editorDirty())){event.preventDefault();event.returnValue=''}}
onBeforeRouteLeave(approveEditorClose)
onBeforeUnmount(()=>{knowledgeDisposed=true;detailRequest++;closePreview();window.removeEventListener('beforeunload',beforeKnowledgeUnload)})

async function loadStats(){const request=++statsRequest,workshopCode=filters.workshopCode;const result=await getKnowledgeStats({workshopCode:workshopCode||undefined});if(knowledgeDisposed||request!==statsRequest||workshopCode!==filters.workshopCode)return;Object.assign(stats,result.data||{});categories.value=result.data?.categories||[];categoryOptions.value=[...new Set([...defaultCategories,...(result.data?.categories||[]).map(item=>item.category)])];tagSuggestions.value=result.data?.tags||[]}
async function loadStages(includeDisabled=false,workshopCode=includeDisabled?stageWorkshopCode.value:form.workshopCode){const result=await getKnowledgeProcessStages(includeDisabled,workshopCode);const rows=(result.data||[]).map(item=>({...item,enabled:item.status==='active',saving:false}));if(includeDisabled)stageRows.value=rows;activeStages.value=rows.filter(item=>item.enabled)}
async function loadTags(includeDisabled=false,workshopCode=includeDisabled?stageWorkshopCode.value:form.workshopCode){const result=await getKnowledgeTags(includeDisabled,workshopCode);const rows=result.data||[];if(includeDisabled)tagRows.value=rows;tagSuggestions.value=[...new Set([...tagSuggestions.value,...rows.filter(item=>item.status==='active').map(item=>item.name)])]}
async function loadManagerData(){await Promise.all([loadStages(true),loadTags(true)])}
let loadToken=0
async function load(){const token=++loadToken;loading.value=true;try{const result=await getKnowledgeEntries({...filters});if(token!==loadToken)return;entries.value=result.data||[];total.value=Number(result.total)||0}finally{if(token===loadToken)loading.value=false}}
const appCategories=computed(()=>[...new Set([...categories.value.map(item=>item.category),filters.category].filter(Boolean))])
const appFilterCount=computed(()=>[filters.type,filters.category!=='备件资料'&&filters.category,filters.workshopCode,filters.referenceFamily,filters.documentKind,filters.referenceManufacturer].filter(Boolean).length)
function setType(type){filters.type=type;search()}
function setCategory(category){filters.category=category;filters.referenceFamily='';filters.referenceManufacturer='';filters.documentKind='';search()}
function search(){filters.page=1;load()}
function reset(){Object.assign(filters,{search:'',workshopCode:'',type:'',category:'',referenceFamily:'',referenceManufacturer:'',documentKind:'',page:1,pageSize:24});Promise.all([load(),loadStats()])}
async function workshopChanged(){filters.page=1;if(filters.category!=='备件资料')filters.category='';await Promise.all([load(),loadStats()])}
async function openCreate(){
  editingId.value=''
  Object.assign(form,emptyForm())
  selectedFile.value=null;uploadFiles.value=[];uploadProgress.value=0;markEditorClean()
  createVisible.value=true
  if(!form.workshopCode){activeStages.value=[];return}
  try{await Promise.all([loadStages(false,form.workshopCode),loadTags(false,form.workshopCode)])}catch{activeStages.value=[]}
}
async function openEdit(item){
  editingId.value=String(item.id)
  Object.assign(form,emptyForm(),{
    workshopCode:item.workshopCode||ownWorkshop,entryType:item.entryType||'document',title:item.title||'',
    category:item.category||'',processStage:item.processStage||'',equipmentName:item.equipmentName||'',
    referenceMetadata:{...emptyReferenceMetadata(),...(item.referenceMetadata||{})},summary:item.summary||'',tags:(item.tags||[]).join(','),tagList:[...(item.tags||[])],
    faultSymptom:item.faultSymptom||'',faultCause:item.faultCause||'',solution:item.solution||'',
    preventiveAction:item.preventiveAction||'',originalFilename:item.originalFilename||''
  })
  selectedFile.value=null;uploadFiles.value=[];uploadProgress.value=0
  markEditorClean()
  await Promise.all([loadStages(false,form.workshopCode),loadTags(false,form.workshopCode)])
  createVisible.value=true
}
async function formWorkshopChanged(){form.processStage='';form.equipmentName='';form.tagList=[];form.tags='';equipmentOptions.value=[];await Promise.all([loadStages(false,form.workshopCode),loadTags(false,form.workshopCode)])}
function rawFile(file){const value=file?.raw||file;return typeof Blob!=='undefined'&&value instanceof Blob?value:null}
function resetForm(){Object.assign(form,emptyForm());form.tagList=[];selectedFile.value=null;uploadFiles.value=[];uploadProgress.value=0;editingId.value='';uploadRef.value?.clearFiles();markEditorClean()}
function fileChanged(file,files=[]){
  const picked=rawFile(file)||rawFile(files.at(-1))
  if(!picked){selectedFile.value=null;uploadFiles.value=[];uploadRef.value?.clearFiles();return ElMessage.error('浏览器未能读取所选文件，请重新选择')}
  if(Number(picked.size)>500*1024*1024){ElMessage.warning('附件不能超过500MB');selectedFile.value=null;uploadFiles.value=[];uploadRef.value?.clearFiles();return}
  selectedFile.value=picked
  uploadFiles.value=files.slice(-1)
}
function fileRemoved(_file,files=[]){uploadFiles.value=files;selectedFile.value=rawFile(files.at(-1))}
async function openStageManager(){stageWorkshopCode.value=ownWorkshop;await loadManagerData();stageVisible.value=true}
async function addStage(){if(!newStage.name.trim())return ElMessage.warning('请填写工序/区域名称');stageSaving.value=true;try{await createKnowledgeProcessStage({workshopCode:stageWorkshopCode.value,name:newStage.name.trim(),sortOrder:newStage.sortOrder});newStage.name='';newStage.sortOrder=100;await loadStages(true);ElMessage.success('已新增')}finally{stageSaving.value=false}}
async function saveStage(item){if(!item.name.trim())return ElMessage.warning('名称不能为空');item.saving=true;try{await updateKnowledgeProcessStage(item.id,{name:item.name.trim(),sortOrder:item.sortOrder,status:item.enabled?'active':'disabled'});await loadStages(true);ElMessage.success('已保存')}finally{item.saving=false}}
async function saveAllStages(){stageSaving.value=true;try{await saveKnowledgeProcessStages({workshopCode:stageWorkshopCode.value,items:stageRows.value.map(item=>({id:item.id,name:item.name.trim(),sortOrder:item.sortOrder,status:item.enabled?'active':'disabled'}))});await loadStages(true);ElMessage.success('全部配置已保存')}finally{stageSaving.value=false}}
async function deleteStage(item){try{const usageCount=Number(item.usageCount)||0;await ElMessageBox.confirm(`确认删除工序"${item.name}"？${usageCount>0?`该工序下有 ${usageCount} 条知识，删除后相关知识的工序字段将被清空。`:''}`,'删除工序',{type:'warning',confirmButtonText:'确认删除'});await deleteKnowledgeProcessStage(item.id);await loadStages(true);ElMessage.success('已删除')}catch{ /* 用户取消 */ }}
async function searchEquipment(keyword){if(!keyword){equipmentOptions.value=[];return}equipmentLoading.value=true;try{const result=await getEquipment({searchKeyword:keyword,workshopCode:form.workshopCode});equipmentOptions.value=(result.data||[]).map(item=>({id:item.id,name:item.equipmentName}))}finally{equipmentLoading.value=false}}
async function addTag(){if(!newTag.value.trim())return ElMessage.warning('请填写标签名称');tagSaving.value=true;try{await createKnowledgeTag({workshopCode:stageWorkshopCode.value,name:newTag.value.trim()});newTag.value='';await loadTags(true);ElMessage.success('标签已新增')}finally{tagSaving.value=false}}
async function removeTag(item){try{await ElMessageBox.confirm(`从可选标签中删除“${item.name}”？已有知识上的标签文字会保留。`,'删除标签',{type:'warning'});await deleteKnowledgeTag(item.id);await loadTags(true);ElMessage.success('标签已删除')}catch{/* 用户取消 */}}
function goEquipment(){stageVisible.value=false;router.push({path:'/equipment',query:{workshopCode:stageWorkshopCode.value}})}
function updateTags(val){form.tags=Array.isArray(val)?val.join(','):''}
async function submit(){
  if(submitting.value)return
  if(!canEditAny)return ElMessage.warning('当前账号不能提交知识')
  if(!editableWorkshops.some(item=>item.code===form.workshopCode))return ElMessage.warning('请选择知识所属车间')
  if(!form.title.trim()||!form.category.trim())return ElMessage.warning('请填写标题和分类')
  const pickedFile=selectedFile.value||rawFile(uploadFiles.value.at(-1))||rawFile(uploadRef.value?.uploadFiles?.at(-1))
  if(form.entryType==='document'&&!pickedFile&&!(editingId.value&&detail.value?.hasFile))return ElMessage.warning('请选择资料附件')
  if(form.entryType==='fault'&&(!form.faultSymptom.trim()||!form.solution.trim()))return ElMessage.warning('请填写故障现象和处理方法')
  const data=new FormData();Object.entries(form).forEach(([key,value])=>{if(key==='tagList')return;data.append(key,key==='referenceMetadata'?JSON.stringify(value):value)});if(pickedFile)data.append('file',pickedFile,pickedFile.name||'knowledge-upload.bin')
  submitting.value=true;uploadProgress.value=0;try{const result=editingId.value?await updateKnowledgeEntry(editingId.value,data):await createKnowledgeEntry(data,event=>{if(event.total)uploadProgress.value=Math.min(99,Math.round(event.loaded*100/event.total))});uploadProgress.value=100;ElMessage.success(result.msg||(editingId.value?'知识已修订':'知识已提交'));const changedId=editingId.value;createVisible.value=false;await Promise.all([load(),loadStats()]);if(changedId){const refreshed=await getKnowledgeEntry(changedId);detail.value=refreshed.data}}finally{submitting.value=false}
}
async function openDetail(item){if(!item?.id||detailLoading.value&&detailTarget.value?.id===item.id)return;const request=++detailRequest;detailTarget.value=item;detailVisible.value=true;detailLoading.value=true;detailError.value='';detail.value=null;try{const result=await getKnowledgeEntry(item.id);if(knowledgeDisposed||request!==detailRequest)return;detail.value=result.data;item.viewCount=detail.value.viewCount}catch(e){if(!knowledgeDisposed&&request===detailRequest)detailError.value=e.response?.data?.msg||'资料加载失败，请重试'}finally{if(request===detailRequest)detailLoading.value=false}}
async function download(item){downloading.value=true;try{const blob=await downloadKnowledgeFile(item.id);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=item.originalFilename||'知识附件';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}finally{downloading.value=false}}

function canPreview(item){return Boolean(item?.hasFile)}
function closePreview(){previewRequest++;previewLoading.value=false;if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value='';previewFile.value=null;previewNotice.value=''}
function previewKindFor(blob){const type=String(blob?.type||'').toLowerCase();if(type.includes('pdf'))return'pdf';if(type.startsWith('image/'))return'image';if(type.startsWith('video/'))return'video';if(type.startsWith('audio/'))return'audio';return'document'}
async function openPreview(item){if(previewLoading.value)return;closePreview();const request=++previewRequest;previewLoading.value=true;try{const result=await previewKnowledgeFileResponse(item.id);if(knowledgeDisposed||request!==previewRequest)return;const blob=result.blob;previewKind.value=previewKindFor(blob);const encoded=result.headers?.['x-preview-notice']||'';try{previewNotice.value=decodeURIComponent(encoded)}catch{previewNotice.value=String(encoded)}if(previewKind.value==='pdf')previewFile.value=blob;else previewUrl.value=URL.createObjectURL(blob);previewVisible.value=true}catch(e){if(!knowledgeDisposed&&request===previewRequest)ElMessage.warning(e.response?.data?.msg||'资料预览失败，请重试或下载原文件')}finally{if(request===previewRequest)previewLoading.value=false}}
function evidenceLabel(item){return item.sourceType==='knowledge'?'知识':item.sourceType==='part'?'备件':'设备型号'}
function openAssistant(item=null){
  if(!canEditAny)return ElMessage.warning('仅系统管理员和车间管理员可以使用知识问答')
  if(aiLoading.value)return ElMessage.warning('请等待当前问题回答完成')
  const next=item?{entryId:Number(item.id),revisionNo:Number(item.revisionNo||1),title:item.originalFilename||item.title}:null
  if(aiContext.value?.entryId!==next?.entryId||aiContext.value?.revisionNo!==next?.revisionNo){aiMessages.value=[];aiTurns.value=[];aiQuestion.value='';aiAnswer.value='';aiEvidence.value=[]}
  aiContext.value=next;detailVisible.value=false;previewVisible.value=false;assistantVisible.value=true
  if(!aiTurns.value.length)restoreAssistantConversation()
}
async function openEvidenceSource(item){if(item.sourceType==='knowledge'){assistantVisible.value=false;await openDetail({id:item.sourceId});return}if(item.url)await router.push(item.url)}
async function askAssistant(){
  const question=aiQuestion.value.trim();if(!question||aiLoading.value)return
  if(!canEditAny)return ElMessage.warning('仅系统管理员和车间管理员可以使用知识问答')
  const owner=getUser()?.id
  const isCurrent=()=>!knowledgeDisposed&&getUser()?.id===owner
  aiLoading.value=true
  aiTurns.value=[...aiTurns.value,{id:++aiTurnId,question,answer:'',evidence:[],pending:true,error:''}].slice(-20)
  const turn=aiTurns.value.at(-1)
  try{const messages=[...aiMessages.value,{role:'user',content:question}].slice(-11);const result=await chatKnowledgeAssistant(messages,aiContext.value);if(!isCurrent())return;turn.ai=result.data?.ai;aiAnswer.value=result.data?.answer||'模型未返回答案';aiEvidence.value=result.data?.evidence||[];turn.answer=aiAnswer.value;turn.evidence=aiEvidence.value;if(!result.data?.degraded&&!result.data?.restricted){aiMessages.value=[...messages,{role:'assistant',content:aiAnswer.value}].slice(-12);aiQuestion.value=''}}catch(e){if(isCurrent())turn.error=e.response?.data?.msg||'请求失败，请稍后重试'}finally{turn.pending=false;aiLoading.value=false;if(isCurrent())saveAssistantConversation()}
}
function indexStatusLabel(value){return({ready:'全文可检索',pending:'内容处理中',empty:'无可提取文字',failed:'内容处理失败'}[value]||'内容处理中')}
function indexTagType(value){return value==='failed'?'danger':value==='empty'?'info':'warning'}
async function retryIndex(item){reindexing.value=true;try{const result=await reindexKnowledgeEntry(item.id);ElMessage.success(result.msg);const refreshed=await getKnowledgeEntry(item.id);detail.value=refreshed.data;await load()}finally{reindexing.value=false}}
async function openHistory(item){historyLoading.value=true;historyVisible.value=true;try{const result=await getKnowledgeRevisions(item.id);revisions.value=result.data||[]}finally{historyLoading.value=false}}
async function restoreRevision(item){await ElMessageBox.confirm(`将 V${item.revisionNo} 的文字、字段和附件恢复为新版本？当前版本仍会保留在历史中。`,'恢复历史版本',{type:'warning',confirmButtonText:'恢复为新版'});await getKnowledgeRevision(detail.value.id,item.revisionNo);const result=await restoreKnowledgeRevision(detail.value.id,item.revisionNo);ElMessage.success(result.msg);historyVisible.value=false;const refreshed=await getKnowledgeEntry(detail.value.id);detail.value=refreshed.data;await Promise.all([load(),loadStats()])}
async function removeEntry(item){await ElMessageBox.confirm(`确认彻底删除“${item.title}”吗？数据库记录和服务器附件都将删除，且无法恢复。`,'彻底删除知识',{type:'error',confirmButtonText:'彻底删除'});await deleteKnowledgeEntry(item.id);ElMessage.success('知识及附件已彻底删除');detailVisible.value=false;await Promise.all([load(),loadStats()])}
function detailMore(command){if(!detail.value)return;if(command==='history')openHistory(detail.value);if(command==='index')retryIndex(detail.value);if(command==='delete')removeEntry(detail.value)}
function formatDate(value){return String(value||'').slice(0,10)}
function formatTime(value){return String(value||'').replace('T',' ').slice(0,16)}
function formatSize(bytes){const value=Number(bytes)||0;if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`}
watch(()=>router.currentRoute.value.query,(query)=>{if(query.library==='parts'){filters.category='备件资料';filters.search=String(query.search||'').slice(0,100);filters.page=1;load()}})
onMounted(async()=>{window.addEventListener('beforeunload',beforeKnowledgeUnload);try{await Promise.all([load(),loadStats(),loadStages(false),loadTags(false),getKnowledgeReferenceFacets().then(result=>{if(!knowledgeDisposed)referenceManufacturers.value=result.data?.manufacturers||[]})]);const entryId=router.currentRoute.value.query.entryId;if(entryId)await openDetail({id:entryId})}catch{ /* 全局请求拦截器已提示 */ }})
</script>
<style>
.assistant-welcome{padding:24px 12px;text-align:center;color:#607086}.assistant-welcome strong{font-size:17px;color:#263c50}.assistant-welcome p{font-size:13px;line-height:1.7}.assistant-welcome>button{display:block;max-width:100%;margin:10px auto;padding:10px 14px;border:1px solid #e0e6ee;border-radius:9px;background:#f5f7fa;color:#40566b;cursor:pointer;font:inherit;font-size:13px;text-align:left}
body.workbench-mobile .knowledge-assistant-dialog .assistant-panel{display:flex;flex-direction:column;flex:1;min-height:0;height:100%;margin:0;border:0;border-radius:0;background:white;gap:8px}
body.workbench-mobile .knowledge-assistant-dialog .assistant-session{flex:none;justify-content:flex-end}
body.workbench-mobile .knowledge-assistant-dialog .assistant-session>span{display:none}
body.workbench-mobile .knowledge-assistant-dialog .assistant-conversation{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:16px}
body.workbench-mobile .knowledge-assistant-dialog .assistant-welcome{margin:auto 0;padding:16px 8px}
body.workbench-mobile .knowledge-assistant-dialog .assistant-query{flex:none;position:static;margin:0;padding-bottom:4px}
body.workbench-mobile .knowledge-assistant-dialog .assistant-current-file{flex:none}

.app-knowledge-tools{display:grid;gap:10px;padding:12px;margin-bottom:12px;background:#fff;border:1px solid var(--line);border-radius:14px}
.app-library-tabs{display:flex;gap:18px;border-bottom:1px solid var(--line)}
.app-library-tabs button{min-height:40px;padding:0 2px;border:0;border-bottom:2px solid transparent;background:transparent;color:#5c7282;font:inherit;cursor:pointer}
.app-library-tabs button[aria-pressed=true]{border-bottom-color:#0c6e76;color:#0c6e76;font-weight:700}
.app-knowledge-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.app-knowledge-search :deep(.el-input__wrapper),.app-knowledge-search>.el-button{min-height:44px}
.app-knowledge-search>.el-button{background:#0c6e76;border-color:#0c6e76;color:#fff}
.app-knowledge-actions{display:flex;justify-content:space-between;gap:8px}
.app-knowledge-actions>.el-button{min-height:38px;margin:0}
.app-filter-count{margin-left:4px;background:#e8f3f3;color:#0c6e76;padding:1px 5px;border-radius:8px}
.app-knowledge-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-top:10px;border-top:1px solid var(--line)}
.app-knowledge-filters>label{display:grid;gap:4px;font-size:12px;color:#5c7282}
.app-knowledge-filters :deep(.el-select__wrapper),.app-knowledge-filters>.el-button{min-height:40px}
.app-knowledge-filters>.el-button{align-self:end}
.app-spare-filters{display:grid;grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
</style>

<style scoped>
.knowledge-library-switch{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}.knowledge-library-switch button{border:1px solid #dce6ec;background:#fff;color:#425b6c;border-radius:10px;padding:9px 18px;min-height:44px;font:inherit;cursor:pointer}.knowledge-library-switch button.active{background:#e9f5f5;color:#087a84;border-color:#acd6d8;font-weight:600}.spare-document-filters{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(140px,1fr));align-items:center;gap:12px;padding:16px;margin-bottom:14px;border:1px solid #dce6ec;border-radius:12px;background:#fff}.spare-document-filters>*{min-width:0}.spare-document-filters p{margin:5px 0 0;color:#637a8a;font-size:12px}.reference-metadata-editor{margin-bottom:16px;padding:14px;border:1px solid #dce9ed;border-radius:10px;background:#f7fafb}@media(max-width:760px){.spare-document-filters{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;gap:10px}.spare-document-filters>div:first-child{grid-column:1/-1}.spare-document-filters>:last-child{grid-column:1/-1}}

.knowledge-page{--knowledge:#087f78;--knowledge-dark:#075f5b}.knowledge-hero{position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px;padding:30px;border-radius:22px;color:#effffd;background:linear-gradient(135deg,#073d46,#087f78 62%,#16a394);box-shadow:0 18px 45px rgba(8,127,120,.18)}.knowledge-hero:after{content:"";position:absolute;right:-60px;top:-100px;width:260px;height:260px;border:1px solid rgba(255,255,255,.12);border-radius:50%;box-shadow:0 0 0 38px rgba(255,255,255,.04),0 0 0 76px rgba(255,255,255,.03)}.knowledge-hero>div{position:relative;z-index:1}.knowledge-hero span{font-size:10px;font-weight:800;letter-spacing:.19em;color:#8ff5e7}.knowledge-hero h2{max-width:680px;margin:10px 0 8px;font-size:28px}.knowledge-hero p{margin:0;color:#b8e5df;font-size:13px}.hero-actions{display:flex;gap:10px}.ghost-button{color:#fff;border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.1)}
.knowledge-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.knowledge-metrics article{display:flex;align-items:center;gap:14px;padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.metric-symbol{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;font-size:20px}.metric-symbol.is-all{color:#0f766e;background:#ccfbf1}.metric-symbol.is-doc{color:#2563eb;background:#dbeafe}.metric-symbol.is-fault{color:#c2410c;background:#ffedd5}.metric-symbol.is-view{color:#7c3aed;background:#ede9fe}.knowledge-metrics strong,.knowledge-metrics small{display:block}.knowledge-metrics strong{font-size:22px}.knowledge-metrics small{margin-top:3px;color:var(--muted)}
.knowledge-filter{display:grid;grid-template-columns:minmax(260px,1.5fr) 150px 190px auto auto;gap:10px;margin-bottom:14px;padding:14px;border:1px solid var(--line);border-radius:16px;background:#fff}.knowledge-assistant{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(380px,1.2fr);gap:14px;margin-bottom:14px;padding:16px;border:1px solid #a8ddd6;border-radius:16px;background:linear-gradient(135deg,#f3fffc,#f8fbff)}.assistant-query{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:end}.assistant-answer{grid-column:1/-1;padding:12px 14px;border-radius:11px;background:#fff}.assistant-evidence{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e5eeec}.assistant-evidence>span{color:#667085;font-size:11px;font-weight:800}.knowledge-content{padding:16px;border:1px solid var(--line);border-radius:18px;background:#fff}.content-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.content-head strong{font-size:16px}.content-head span{margin-left:8px;color:var(--muted);font-size:12px}.knowledge-grid{min-height:140px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.knowledge-card{min-height:190px;display:flex;flex-direction:column;padding:14px;border:1px solid #e5e9ef;border-radius:14px;background:linear-gradient(180deg,#fff,#fbfcfd);cursor:pointer;transition:.2s ease}.knowledge-card:hover{transform:translateY(-2px);border-color:#85d8ce;box-shadow:0 10px 24px rgba(7,95,91,.1)}.card-top,.knowledge-card footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.type-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:700}.type-chip.is-document{color:#1d4ed8;background:#eff6ff}.type-chip.is-fault{color:#b45309;background:#fff7ed}.card-date{color:#94a3b8;font-size:10px}.knowledge-card h3{margin:11px 0 6px;font-size:15px;line-height:1.4}.knowledge-card>p{display:-webkit-box;overflow:hidden;margin:0;color:#697386;font-size:11px;line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:2}.card-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;color:#536174;font-size:10px}.card-meta span{display:flex;align-items:center;gap:4px}.tag-row{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}.knowledge-card footer{margin-top:auto;padding-top:9px;border-top:1px solid #eef0f4;color:#8893a4;font-size:10px}.knowledge-card footer span{display:flex;align-items:center;gap:4px}.knowledge-pagination{display:flex;justify-content:center;margin-top:16px}
.entry-type-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;padding:5px;border-radius:12px;background:#f2f5f7}.entry-type-switch button{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:0;border-radius:9px;color:#64748b;background:transparent;cursor:pointer}.entry-type-switch button.active{color:#087f78;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.08);font-weight:800}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.knowledge-detail{padding:0 4px 30px}.detail-heading{padding:20px;border-radius:16px;background:#f4faf9}.detail-heading h2{margin:14px 0 8px;font-size:22px}.detail-heading p{margin:0;color:#64748b}.detail-tags{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}.knowledge-detail section{padding:16px 2px;border-bottom:1px solid var(--line)}.knowledge-detail section h3{margin:0 0 9px;font-size:14px}.knowledge-detail section p{margin:0;white-space:pre-wrap;color:#465266;font-size:13px;line-height:1.85}.detail-file{display:flex;align-items:center;gap:12px;margin-top:18px;padding:14px;border:1px solid #cde9e5;border-radius:14px;background:#f2fbfa}.detail-file>.el-icon{font-size:24px;color:#087f78}.detail-file div{min-width:0;flex:1}.detail-file strong,.detail-file small{display:block}.detail-file strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-file small{margin-top:4px;color:#83909f}.detail-footer{display:flex;justify-content:space-between;gap:12px;margin-top:18px;color:#8994a5;font-size:11px}.archive-button{width:100%;margin-top:24px}
.detail-file .file-actions{display:flex;flex:0 0 auto;gap:8px}.file-preview{height:min(78vh,900px);display:grid;place-items:center;overflow:auto;background:#eef1f4}.file-preview iframe{width:100%;height:100%;border:0;background:#fff}.file-preview>.el-image{width:100%;height:100%;min-height:0;cursor:zoom-in}
.stage-create,.stage-row{display:grid;grid-template-columns:minmax(220px,1fr) 130px 92px auto auto;gap:10px;align-items:center}.stage-create{padding-bottom:14px;border-bottom:1px solid var(--line)}.stage-list{max-height:420px;overflow:auto}.stage-row{padding:10px 0;border-bottom:1px solid #edf1f3}.stage-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px}.stage-tip{margin:0;color:#7b8795;font-size:12px}.knowledge-filter{grid-template-columns:minmax(260px,1.5fr) 150px 150px 190px auto auto}
.field-help{display:block;margin-top:5px;color:#8a94a4;font-size:11px}.manager-heading,.manager-section h3{margin:0 0 8px;font-size:14px}.manager-section{display:flex;align-items:center;justify-content:space-between;gap:16px}.manager-section p{margin:0;color:#7b8795;font-size:12px}.manager-section.is-tags{align-items:flex-end}.tag-create{display:flex;gap:8px;width:min(390px,100%)}.managed-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px;border-radius:10px;background:#f7f9fb}.managed-tags .el-empty{width:100%;padding:5px 0}
@media(max-width:1150px){.knowledge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-filter{grid-template-columns:1fr 1fr 1fr auto auto}}
@media(max-width:760px){.knowledge-hero{align-items:stretch;flex-direction:column;padding:22px}.knowledge-hero h2{font-size:22px}.hero-actions{flex-wrap:wrap}.hero-actions .el-button{flex:1}.knowledge-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-filter,.knowledge-assistant,.assistant-query{grid-template-columns:1fr}.knowledge-grid{grid-template-columns:1fr}.form-grid,.stage-create,.stage-row{grid-template-columns:1fr}.detail-footer{flex-direction:column}}
.md-content{line-height:1.8;color:#374151;word-break:break-word}.md-content :is(h1,h2,h3,h4){margin:14px 0 6px;color:#1d2b3a}.md-content h1{font-size:20px}.md-content h2{font-size:18px}.md-content h3{font-size:16px}.md-content p{margin:6px 0}.md-content ul,.md-content ol{margin:6px 0;padding-left:22px}.md-content li{margin:3px 0}.md-content code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:13px;color:#c41d4f}.md-content pre{background:#1d2b3a;color:#e2e8f0;padding:12px 14px;border-radius:8px;overflow-x:auto;margin:10px 0}.md-content pre code{background:transparent;color:inherit;padding:0}.md-content blockquote{border-left:3px solid #94a3b8;margin:8px 0;padding:4px 14px;color:#64748b;background:#f8fafc}.md-content a{color:#2563eb;text-decoration:underline}.md-content table{border-collapse:collapse;width:100%;margin:10px 0}.md-content th,.md-content td{border:1px solid #e3e8ef;padding:6px 10px;text-align:left}.md-content th{background:#f8fafc;font-weight:600}
.knowledge-view-controls{display:flex;align-items:center;gap:8px}.knowledge-card{min-height:0}.knowledge-card footer{margin-top:12px}.knowledge-card:focus-visible{outline:3px solid #0d9488;outline-offset:2px}.knowledge-grid.is-list{display:flex;flex-direction:column;gap:0;min-height:0}.is-list .knowledge-card{display:grid;grid-template-columns:130px minmax(0,1fr) 200px;gap:4px 16px;padding:12px 8px;border:0;border-bottom:1px solid #e5e9ef;border-radius:0;background:#fff;transition:background .15s}.is-list .knowledge-card:hover{transform:none;box-shadow:none;background:#f3faf8}.is-list .card-top{grid-column:1;grid-row:1/4;align-self:start;align-items:flex-start;flex-direction:column;gap:8px}.is-list h3{grid-column:2;grid-row:1;margin:0;font-size:14px;overflow-wrap:anywhere}.is-list .knowledge-card>p{grid-column:2;grid-row:2;-webkit-line-clamp:1;font-size:12px}.is-list .card-meta{grid-column:2;grid-row:3;margin:0;font-size:12px}.is-list .tag-row{grid-column:2;grid-row:4;margin:0}.is-list footer{grid-column:3;grid-row:1/5;align-self:center;align-items:flex-end;flex-direction:column;gap:8px;border:0;margin:0;padding:0;font-size:12px}.knowledge-card .card-date{font-size:12px}.knowledge-card .type-chip{font-size:11px}@media(min-width:1550px){.knowledge-grid:not(.is-list){grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:760px){.content-head{align-items:flex-start;gap:10px;flex-direction:column}.is-list .knowledge-card{grid-template-columns:1fr;gap:6px;padding:12px 0}.is-list .card-top{grid-column:1;grid-row:auto;flex-direction:row;justify-content:space-between;width:100%}.is-list h3,.is-list .knowledge-card>p,.is-list .card-meta,.is-list .tag-row,.is-list footer{grid-column:1;grid-row:auto}.is-list footer{flex-direction:row;align-items:center}}
.knowledge-hero{padding:18px 22px;min-height:0}.knowledge-hero>div>span{display:none}.knowledge-hero h2{font-size:23px;margin-top:0}.knowledge-hero p{margin-bottom:0}.knowledge-card .inline-tags{display:inline-flex;flex-wrap:wrap;gap:4px}.is-list .knowledge-card{padding:9px 8px}.is-list .card-meta{align-items:center}.knowledge-filter>*{min-width:0}@media(min-width:761px) and (max-width:1150px){.knowledge-filter{grid-template-columns:minmax(180px,2fr) repeat(3,minmax(100px,1fr))}.knowledge-filter>.el-button{margin:0}.knowledge-filter>.el-input{grid-column:1/-1}}
.assistant-evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}.assistant-evidence>span{grid-column:1/-1}.assistant-evidence button{min-width:0;padding:9px 10px;border:1px solid #d8e9e6;border-radius:9px;color:#344b55;background:#f8fdfc;text-align:left;cursor:pointer}.assistant-evidence button:hover{border-color:#65bdb5;background:#effaf8}.assistant-evidence b,.assistant-evidence small{display:block}.assistant-evidence b{margin-bottom:3px;color:#087f78;font-size:11px}.assistant-evidence small{margin-top:4px;overflow:hidden;color:#7b8994;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.detail-manage{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.file-preview video{max-width:100%;max-height:100%;object-fit:contain}.file-preview audio{width:min(720px,90%)}.revision-list{display:grid;gap:8px;margin-top:14px;max-height:58vh;overflow:auto}.revision-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;border:1px solid #e3eaed;border-radius:11px;background:#fff}.revision-list strong,.revision-list small{display:block}.revision-list small{margin-top:4px;color:#7d8b96}.revision-list p{margin:5px 0 0;color:#536873;font-size:12px}@media(max-width:760px){.assistant-evidence{grid-template-columns:1fr}.revision-list article{align-items:flex-start;flex-direction:column}}

.knowledge-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:20px;align-items:start}.knowledge-sidebar{position:relative;padding:18px 12px;background:#fff;border:1px solid var(--line);border-radius:14px}.sidebar-heading{padding:0 10px;margin-bottom:12px;color:#87929f;font-size:11px;font-weight:700;letter-spacing:1px}.category-heading{margin-top:26px;display:flex;align-items:center;justify-content:space-between;gap:8px}.category-heading .el-button{width:30px;min-width:30px;padding:0;flex:none}.knowledge-sidebar nav{display:flex;flex-direction:column;gap:4px}.knowledge-sidebar button{display:flex;align-items:center;gap:10px;width:100%;padding:11px 10px;border:0;border-radius:8px;background:transparent;color:#536174;font:inherit;font-size:13px;text-align:left;cursor:pointer}.knowledge-sidebar button:hover{background:#f4f8f7}.knowledge-sidebar button.active{color:#076c65;background:#eaf7f3;font-weight:650}.knowledge-sidebar button span{flex:1;min-width:0;overflow-wrap:anywhere}.knowledge-sidebar button b{color:#81918f;font-size:11px;font-weight:500}.sidebar-foot{display:flex;gap:7px;margin-top:24px;padding:16px 10px 0;border-top:1px solid #edf1f2;color:#91a09f;font-size:11px}.knowledge-main{min-width:0}.knowledge-filter{display:flex;align-items:center;flex-wrap:wrap;gap:8px;border-radius:12px;padding:12px;margin-bottom:12px}.knowledge-filter>.el-input{flex:1;min-width:180px}.knowledge-filter>.el-select{width:150px;flex:none}.knowledge-filter .el-button{margin:0}.knowledge-ai-entry{color:#087f83}.knowledge-view-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.knowledge-view-controls>.el-button{margin:0}.active-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px;font-size:12px;color:#7b8795}.knowledge-content{padding:18px 20px;border-radius:14px}.content-head{padding-bottom:14px;margin:0;border-bottom:1px solid #edf0f3}.content-head strong{font-size:14px}.is-list .knowledge-card{grid-template-columns:94px minmax(0,1fr) 112px;gap:7px 16px;padding:20px 2px}.is-list h3{font-size:16px;font-weight:600;line-height:1.5}.is-list .knowledge-card>p{font-size:13px;line-height:1.7;color:#7a8696}.is-list .card-meta{font-size:11px;color:#8995a2;gap:7px 12px}.is-list .card-meta .el-tag{font-size:10px;--el-tag-bg-color:#f8fafb;--el-tag-border-color:#e8edef;--el-tag-text-color:#74858c}.is-list footer{font-size:11px;color:#97a0ae}.knowledge-card .card-date{font-size:11px}.knowledge-card .type-chip{font-size:10px;padding:5px 7px}.assistant-panel{display:flex;flex-direction:column;margin:0;padding:0;background:#fff;border:0;gap:20px}.assistant-panel .assistant-query{grid-template-columns:1fr;gap:12px}.assistant-current-file{display:flex;align-items:center;gap:8px;min-width:0;color:#526775;font-size:13px}.assistant-current-file>span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.assistant-current-file .el-button{margin:0;flex:none}.assistant-panel .assistant-query .el-button{justify-self:end}.assistant-panel .assistant-answer{padding:16px;background:#f6faf9;border:1px solid #e0eeeb}.assistant-panel .assistant-evidence{grid-template-columns:1fr}.knowledge-sidebar button:focus-visible{outline:2px solid #087f78;outline-offset:1px}
@media(max-width:1100px){.knowledge-layout{grid-template-columns:180px minmax(0,1fr);gap:14px}.is-list .knowledge-card{grid-template-columns:94px minmax(0,1fr)}.is-list footer{grid-column:2;grid-row:4;flex-direction:row;align-items:center;justify-content:flex-start}}
@media(max-width:760px){.knowledge-layout{grid-template-columns:1fr}.knowledge-sidebar{position:relative;padding:10px}.knowledge-sidebar .sidebar-heading,.knowledge-sidebar .sidebar-foot{display:none}.knowledge-sidebar .category-heading{display:flex;position:absolute;right:10px;bottom:10px;margin:0;padding:0;background:white;z-index:1}.knowledge-sidebar .category-heading>span{display:none}.knowledge-sidebar .type-navigation{flex-direction:row}.knowledge-sidebar .type-navigation button{gap:5px;padding:10px 6px;font-size:12px}.knowledge-sidebar .category-navigation{flex-direction:row;overflow-x:auto;padding-top:7px;padding-right:40px;margin-top:6px;border-top:1px solid #eef2f3}.category-navigation button{width:auto;flex:none;max-width:180px}.knowledge-filter>.el-input{flex-basis:100%}.knowledge-filter>.el-select{flex:1;min-width:100px}.knowledge-content{padding:14px}.content-head{flex-direction:row;align-items:center;flex-wrap:wrap}.is-list .knowledge-card{grid-template-columns:1fr;padding:16px 0}.is-list .card-top{grid-column:1;grid-row:auto;flex-direction:row}.is-list h3,.is-list .knowledge-card>p,.is-list .card-meta,.is-list footer{grid-column:1;grid-row:auto}.is-list footer{justify-content:space-between}.knowledge-grid:not(.is-list){grid-template-columns:1fr}}
.is-list .knowledge-card{grid-template-columns:90px minmax(0,1fr) 150px;padding:14px 0}.is-list footer{min-width:0}.attachment-indicator{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}@media(max-width:1100px){.is-list .knowledge-card{grid-template-columns:90px minmax(0,1fr)}}@media(max-width:760px){.is-list .knowledge-card{grid-template-columns:1fr}}
.assistant-turn{min-width:0;display:grid;gap:12px}.assistant-user{padding:14px 16px;border:1px solid #dce6f0;background:#f2f6fb;border-radius:11px}.assistant-user strong{font-size:12px;color:#526775}.assistant-user p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.assistant-error{color:#b42318;font-size:13px}
.assistant-session{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#667085}.assistant-panel .assistant-query{position:sticky;bottom:-1px;background:white;padding:14px 0 4px;border-top:1px solid #e4e9ee;z-index:2}
</style>

<style>
.knowledge-assistant-dialog{max-height:88dvh}.knowledge-assistant-dialog .el-dialog__body{padding-top:20px;overflow:auto;overscroll-behavior:contain}.knowledge-assistant-dialog .assistant-answer{overflow-wrap:anywhere}.knowledge-assistant-dialog .assistant-answer .md-content pre{max-width:100%;overflow:auto}
.knowledge-detail-dialog{display:flex;flex-direction:column;max-height:88vh;max-height:88dvh;margin:0;padding:0;border-radius:16px;overflow:hidden}
.knowledge-detail-dialog .el-dialog__header{flex:none;margin:0;padding:20px 60px 18px 24px;border-bottom:1px solid #edf0f3}
.knowledge-detail-dialog .el-dialog__headerbtn{top:10px;right:12px;width:40px;height:40px}
.knowledge-detail-dialog .el-dialog__body{min-height:0;padding:20px 24px;overflow-y:auto;overscroll-behavior:contain}
.knowledge-detail-dialog .knowledge-detail{padding:0;overflow-wrap:anywhere}
.knowledge-detail-dialog .el-dialog__footer{flex:none;padding:14px 24px;border-top:1px solid #edf0f3}
@media(max-width:760px){
  .knowledge-detail-dialog{max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);border-radius:12px}
  .knowledge-detail-dialog .el-dialog__header{padding:18px 56px 16px 16px}
  .knowledge-detail-dialog .el-dialog__body{padding:16px}
  .knowledge-detail-dialog .el-dialog__footer{padding:12px 16px}
  .knowledge-detail-dialog .detail-heading{padding:16px}
  .knowledge-detail-dialog .detail-file{align-items:flex-start;flex-wrap:wrap}
  .knowledge-detail-dialog .detail-file .file-actions{flex:1 0 100%;flex-wrap:wrap}
  .knowledge-detail-dialog .detail-manage{justify-content:flex-start}
  .knowledge-detail-dialog .detail-manage .el-button{margin-left:0}
}
.knowledge-editor-dialog{display:flex;flex-direction:column;max-height:90vh;margin-bottom:0;padding:22px 24px;border-radius:16px}
.knowledge-editor-dialog .el-dialog__header{flex:none;margin:0;padding:0 32px 18px 0}
.knowledge-editor-dialog .el-dialog__body{min-height:0;overflow-y:auto;padding:0 2px;overscroll-behavior:contain}
.knowledge-editor-dialog .el-dialog__footer{flex:none;padding:16px 0 0;margin-top:6px;border-top:1px solid #edf0f3}
.knowledge-editor-dialog .entry-type-switch{max-width:440px;margin-bottom:20px}
.knowledge-editor-dialog .knowledge-editor-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}
.knowledge-editor-dialog .knowledge-form-basics,.knowledge-editor-dialog .knowledge-form-content{min-width:0}
.knowledge-editor-dialog .knowledge-form-content{padding-left:28px;border-left:1px solid #e9edef}
.knowledge-editor-dialog .el-form-item{margin-bottom:16px}
.knowledge-editor-dialog .el-form-item__label{margin-bottom:6px;line-height:22px}
.knowledge-editor-dialog .el-form-item__content{min-width:0}
.knowledge-editor-dialog .el-select{width:100%}
.knowledge-editor-dialog .field-help,.knowledge-editor-dialog .el-upload__tip{line-height:1.6}
.knowledge-editor-dialog .knowledge-file-upload{width:100%}
.knowledge-editor-dialog .el-upload{width:100%}
.knowledge-editor-dialog .el-upload-dragger{padding:22px 12px}
.knowledge-editor-dialog .el-icon--upload{margin:0 0 10px;font-size:42px;line-height:1}
.knowledge-editor-dialog .knowledge-fault-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.knowledge-editor-dialog .fault-solution,.knowledge-editor-dialog .knowledge-fault-fields>.el-form-item:last-child{grid-column:1/-1}
@media(max-width:760px){
  .knowledge-editor-dialog{padding:18px 16px}
  .knowledge-editor-dialog .knowledge-editor-form{grid-template-columns:1fr;gap:4px}
  .knowledge-editor-dialog .knowledge-form-content{padding:16px 0 0;border-left:0;border-top:1px solid #e9edef}
  .knowledge-editor-dialog .entry-type-switch{max-width:none}
  .knowledge-editor-dialog .knowledge-fault-fields{grid-template-columns:1fr}
}
.assistant-turn{min-width:0;display:grid;gap:12px}.assistant-user{padding:14px 16px;border:1px solid #dce6f0;background:#f2f6fb;border-radius:11px}.assistant-user strong{font-size:12px;color:#526775}.assistant-user p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.assistant-error{color:#b42318;font-size:13px}
.assistant-session{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#667085}.assistant-panel .assistant-query{position:sticky;bottom:-1px;background:white;padding:14px 0 4px;border-top:1px solid #e4e9ee;z-index:2}
</style>

<style>
.knowledge-detail-actions{display:flex;align-items:center;gap:10px;width:100%}.knowledge-detail-actions>span{flex:1}.knowledge-detail-actions>.el-button{margin:0;min-height:40px}.knowledge-detail-dialog .detail-heading{padding:18px 20px}.knowledge-detail-dialog .detail-heading h2{font-size:21px;margin:10px 0}.knowledge-detail-dialog .detail-tags:empty{display:none}.knowledge-detail-dialog .el-dialog__footer{border-top:1px solid #e8edf2;padding-top:16px}.knowledge-detail-dialog .detail-footer{margin-bottom:0}.knowledge-assistant .ai-answer-model{display:block;color:#718599;margin:0 0 10px;font-size:11px}.file-preview.is-pdf{height:100%;min-height:0;display:flex;flex:1;overflow:hidden;background:#edf1f5}@media(max-width:600px){.knowledge-detail-actions{gap:6px}.knowledge-detail-actions>.el-button{padding:9px 12px}.knowledge-detail-dialog .detail-file{flex-wrap:wrap}.knowledge-detail-dialog .file-actions{width:100%;justify-content:flex-end}}
</style>

<style>.knowledge-file-reader.el-dialog{margin:3dvh auto!important;max-height:94dvh;display:flex;flex-direction:column;overflow:hidden}.knowledge-file-reader .el-dialog__body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.knowledge-file-reader .pdf-reader{flex:1;min-height:0}</style>
