<template>
  <div>
    <div class="page-head">
      <div>
        <h2>备件库存一览</h2>
        <p>快速定位备件、查看库位，并处理库存预警。</p>
      </div>
      <div class="head-actions">
        <el-button @click="goScoped('/movements')"><el-icon><Switch /></el-icon>库存流水</el-button>
        <el-button @click="goScoped('/replenishment')"><el-icon><ShoppingCartFull /></el-icon>补货清单</el-button>
        <el-button type="primary" plain @click="goScoped('/statistics')"><el-icon><DataAnalysis /></el-icon>备件统计</el-button>
        <el-button :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon>刷新数据
        </el-button>
      </div>
    </div>

    <section class="metric-grid inventory-metric-grid" aria-label="库存指标">
      <article class="metric-card is-parts">
        <div class="metric-top"><span>备件种类</span><span class="metric-icon"><el-icon><Tickets /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.partTypes) }}</div>
        <div class="metric-note">{{ currentWorkshopName }}物料种类</div>
      </article>
      <article class="metric-card is-stock">
        <div class="metric-top"><span>库存总量</span><span class="metric-icon"><el-icon><Box /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.totalStock) }}</div>
        <div class="metric-note" :title="unitSummary">{{ unitSummary }}</div>
      </article>
      <article class="metric-card is-value">
        <div class="metric-top"><span>库存总价值</span><span class="metric-icon"><el-icon><Money /></el-icon></span></div>
        <div class="metric-value">{{ formatCurrency(dashboard.totalValue) }}</div>
        <div class="metric-note">按当前库存 × 不含税单价汇总</div>
      </article>
      <button v-if="dashboard.lowStock || query.lowStock" type="button" class="metric-card is-alert is-clickable" @click="showLowStock">
        <div class="metric-top"><span>低库存预警</span><span class="metric-icon"><el-icon><Warning /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.lowStock) }}</div>
        <div class="metric-note">点击只看需要补充的备件</div>
      </button>
      <button v-if="dashboard.unconfiguredStock" type="button" class="metric-card is-quality is-clickable" @click="goScoped('/data-quality', { issue:'missing_reorder_point' })">
        <div class="metric-top"><span>订购点未配置</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.unconfiguredStock) }}</div>
        <div class="metric-note">点击进入数据质量修复</div>
      </button>
      <button v-if="dashboard.pendingApproval" type="button" class="metric-card is-pending is-clickable" @click="goScoped('/check', { status:'待审批' })">
        <div class="metric-top"><span>待审批盘点</span><span class="metric-icon"><el-icon><DocumentChecked /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.pendingApproval) }}</div>
        <div class="metric-note">点击进入盘点审批</div>
      </button>
    </section>

    <section class="panel filter-panel">
      <div class="filter-row">
        <div class="filter-field">
          <label>车间</label>
          <el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="search">
            <el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </div>
        <div class="filter-field">
          <label for="part-search">关键词</label>
          <el-input id="part-search" v-model="query.searchKeyword" clearable placeholder="输入编码、名称、规格、品牌或库位" @keyup.enter="search" @clear="search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="filter-field">
          <label>货区</label>
          <el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" style="width:100%" @change="search">
            <el-option v-for="area in areas" :key="area" :label="area" :value="area" />
          </el-select>
        </div>
        <div class="filter-field">
          <label>排序方式</label>
          <el-select v-model="query.sort" style="width:100%" @change="search">
            <el-option label="名称顺序" value="name" />
            <el-option label="库存从低到高" value="stockAsc" />
            <el-option label="库存从高到低" value="stockDesc" />
            <el-option label="编码顺序" value="codeAsc" />
          </el-select>
        </div>
        <div class="filter-actions">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
        </div>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <strong>{{ query.lowStock ? '低库存备件' : '库存明细' }}</strong>
          <span class="result-count">共 {{ total }} 条</span>
        </div>
        <div class="table-actions">
          <el-button v-if="canEditAny" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon>新增备件</el-button>
          <el-button v-if="canEditAny" type="success" plain size="small" @click="openImport"><el-icon><Upload /></el-icon>导入备件</el-button>
          <el-button v-if="query.lowStock" type="danger" plain size="small" @click="clearLowStock">退出预警筛选</el-button>
          <el-button v-if="canEditAny" :disabled="!selectedRows.length" type="primary" plain size="small" @click="openBatch"><el-icon><Operation /></el-icon>批量出入库（{{ selectedRows.length }}）</el-button>
          <el-popover placement="bottom-end" :width="220" trigger="click"><template #reference><el-button size="small"><el-icon><Grid /></el-icon>自定义列</el-button></template><div class="column-picker"><strong>显示字段</strong><el-checkbox-group v-model="visibleColumns"><el-checkbox v-for="item in columnOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></div></el-popover>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" row-key="_id" empty-text="没有找到符合条件的备件" @selection-change="selectedRows=$event">
        <el-table-column v-if="canEditAny" type="selection" width="48" reserve-selection :selectable="row=>canEditWorkshop(row.workshopCode)" />
        <el-table-column label="物料名称" min-width="340" fixed="left">
          <template #default="{ row }">
            <strong class="material-name-cell">{{ row.materialDesc || '未命名备件' }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="138">
          <template #default="{ row }"><code class="material-code-cell">{{ row.materialCode || '-' }}</code></template>
        </el-table-column>
        <el-table-column v-if="columnVisible('partType')" prop="partType" min-width="118" show-overflow-tooltip>
          <template #header><div class="table-filter-head"><span>备件类型</span><el-popover trigger="click" placement="bottom" :width="210"><template #reference><button class="header-filter-button" :class="{active:query.partType}" title="筛选备件类型"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.partType" clearable filterable placeholder="全部类型" style="width:100%" @change="search"><el-option v-for="item in partTypes" :key="item" :label="item" :value="item" /></el-select></el-popover></div></template>
          <template #default="{ row }">{{ row.partType || '未填写' }}</template>
        </el-table-column>
        <el-table-column v-if="columnVisible('workshop')" prop="workshopName" min-width="112" show-overflow-tooltip>
          <template #header><div class="table-filter-head"><span>所属车间</span><el-popover trigger="click" placement="bottom" :width="210"><template #reference><button class="header-filter-button" :class="{active:query.workshopCode}" title="筛选车间"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="search"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-popover></div></template>
        </el-table-column>
        <el-table-column v-if="columnVisible('spec')" prop="spec" label="规格型号" min-width="150" show-overflow-tooltip>
          <template #default="{ row }"><span class="spec-cell">{{ row.spec || '未填写' }}</span></template>
        </el-table-column>
        <el-table-column v-if="columnVisible('location')" min-width="190">
          <template #header><div class="table-filter-head"><span>货区 / 库位</span><el-popover trigger="click" placement="bottom" :width="230"><template #reference><button class="header-filter-button" :class="{active:query.warehouseAreaName}" title="筛选货区"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" style="width:100%" @change="search"><el-option v-for="area in areas" :key="area" :label="area" :value="area" /></el-select></el-popover></div></template>
          <template #default="{ row }">
            <span class="location-cell"><el-icon><Location /></el-icon>{{ locationText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="当前库存" width="112" align="center" sortable :sort-method="(a,b) => a.totalStock-b.totalStock">
          <template #default="{ row }">
            <span class="stock-number" :class="{ 'is-low': isLow(row) }">{{ row.totalStock }}</span>
            <span style="margin-left:4px;color:#8a93a4;font-size:11px">{{ row.unit || '个' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="columnVisible('reorderPoint')" label="订购点" width="100" align="center">
          <template #default="{ row }">{{ row.reorderPoint ?? '-' }}</template>
        </el-table-column>
        <el-table-column v-if="columnVisible('status')" width="132" align="center">
          <template #header><div class="table-filter-head is-center"><span>库存状态</span><el-popover trigger="click" placement="bottom" :width="210"><template #reference><button class="header-filter-button" :class="{active:query.stockStatus}" title="筛选库存状态"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.stockStatus" clearable placeholder="全部状态" style="width:100%" @change="search"><el-option label="零库存" value="zero"/><el-option label="需要补充" value="low"/><el-option label="库存正常" value="normal"/><el-option label="订购点未配置" value="unconfigured"/></el-select></el-popover></div></template>
          <template #default="{ row }">
            <el-tag :type="inventoryHealth(row).type" effect="light" round size="small">
              {{ inventoryHealth(row).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="205" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="locate3d(row)">3D定位</el-button>
            <el-button v-if="canEditWorkshop(row.workshopCode)" link type="primary" :disabled="row.inventoryStatus === '待审批'" @click="openStock(row)">出入库</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <span>第 {{ query.page }} 页，每页 {{ query.pageSize }} 条</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="sizes, prev, pager, next"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </section>

    <Teleport to="body">
      <Transition name="card-slide">
        <div v-if="detailVisible && currentPart" class="detail-card-overlay" @click.self="detailVisible=false">
          <div class="detail-card">
            <div class="detail-card-body">
              <div class="detail-hero">
                <div>
                  <h2>{{ currentPart.materialDesc }}</h2>
                  <p>{{ currentPart.materialCode }}</p>
                </div>
                <div class="detail-stock">
                  <strong>{{ currentPart.totalStock }} {{ currentPart.unit || '个' }}</strong>
                  <span>当前库存</span>
                </div>
                <el-button class="detail-close" circle text @click="detailVisible=false"><el-icon><Close /></el-icon></el-button>
              </div>
              <div class="drawer-section">
                <h3>库存与位置</h3>
                <el-descriptions :column="2" border>
                  <el-descriptions-item v-if="currentPart.warehouseAreaName" label="货区">{{ currentPart.warehouseAreaName }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.workshopName" label="所属车间">{{ currentPart.workshopName }}</el-descriptions-item>
                  <el-descriptions-item label="存放位置">{{ locationText(currentPart) }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.shelf" label="货架">{{ valueText(currentPart.shelf, '号') }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.layer" label="层数">{{ valueText(currentPart.layer, '层') }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.position" label="方位">{{ sideText(currentPart.position) }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.location != null" label="货位">{{ currentPart.location }}</el-descriptions-item>
                </el-descriptions>
              </div>
              <div class="drawer-section">
                <h3>物料信息</h3>
                <el-descriptions :column="2" border>
                  <el-descriptions-item v-if="currentPart.spec" label="规格型号" :span="2">{{ currentPart.spec }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.partType" label="备件类型">{{ currentPart.partType }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.usageDescription" label="用途">{{ currentPart.usageDescription }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.reorderPoint != null" label="订购点">{{ currentPart.reorderPoint }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.maxStock != null" label="最高储备">{{ currentPart.maxStock }}</el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.price != null" label="不含税单价">{{ currentPart.price }} 元</el-descriptions-item>
                  <el-descriptions-item label="盘点状态">
                    <el-tag :type="inventoryTag(currentPart.inventoryStatus)" effect="plain" size="small">{{ currentPart.inventoryStatus || '未盘点' }}</el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item v-if="currentPart.lastInventoryDate" label="最近盘点">{{ currentPart.lastInventoryDate }}</el-descriptions-item>
                </el-descriptions>
              </div>
            </div>
            <div class="detail-card-footer">
              <el-button type="primary" @click="locate3d(currentPart)"><el-icon><LocationFilled /></el-icon>3D定位</el-button>
              <el-button v-if="isLow(currentPart)" type="danger" plain @click="goReplenishment"><el-icon><ShoppingCartFull /></el-icon>补货</el-button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <el-dialog v-model="createVisible" title="新增备件" width="min(760px, 96vw)" destroy-on-close>
      <el-alert title="所有账号都能查看新增后的备件；只有该车间管理员和总管理员可继续修改。" type="info" :closable="false" show-icon />
      <el-form label-position="top" class="part-form-grid">
        <el-form-item label="所属车间" required><el-select v-model="createForm.workshopCode" style="width:100%"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item>
        <el-form-item label="物料编码" required><el-input v-model="createForm.materialCode" maxlength="60" /></el-form-item>
        <el-form-item label="物料名称" required class="span-2"><el-input v-model="createForm.materialDesc" maxlength="300" /></el-form-item>
        <el-form-item label="规格型号"><el-input v-model="createForm.spec" maxlength="180" /></el-form-item>
        <el-form-item label="备件类型"><el-input v-model="createForm.partType" maxlength="80" placeholder="例如：易损件" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="createForm.unit" maxlength="20" /></el-form-item>
        <el-form-item label="初始库存"><el-input-number v-model="createForm.totalStock" :min="0" :max="999999999" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item v-if="createUsesArea" label="货区/仓库名称" required><el-input v-model="createForm.warehouseAreaName" maxlength="100" placeholder="例如：五粮货区" /></el-form-item>
        <el-form-item v-if="createUsesArea" label="六位库位码"><el-input v-model="createForm.locationCode" maxlength="6" placeholder="例如：011101；无固定库位可留空" /></el-form-item>
        <el-form-item v-else label="存放位置"><el-input v-model="createForm.locationNote" maxlength="200" placeholder="例如：备件库东侧A柜" /></el-form-item>
        <el-form-item label="订购点"><el-input-number v-model="createForm.reorderPoint" :min="0" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="最高储备"><el-input-number v-model="createForm.maxStock" :min="0" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="不含税单价"><el-input-number v-model="createForm.price" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="用途"><el-input v-model="createForm.usageDescription" maxlength="300" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="createSubmitting" @click="submitCreate">保存备件</el-button></template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入备件台账" width="min(760px, 94vw)" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="导入到车间" required><div class="import-workshop-row"><el-select v-model="importWorkshopCode"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code" /></el-select><el-button :loading="templateDownloading" @click="downloadImportTemplate">下载当前车间模板</el-button></div><small class="field-hint">本次只处理所选车间；校验通过前不会写入任何数据。</small></el-form-item>
        <el-form-item label="Excel 台账（.xlsx）" required>
          <el-upload ref="importUploadRef" drag :auto-upload="false" :limit="1" accept=".xlsx" :on-change="handleImportFile" :on-remove="clearImportFile" style="width:100%">
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入台账，或<em>点击选择</em></div>
          </el-upload>
        </el-form-item>
      </el-form>
      <div v-if="importPreview" class="import-preview" :class="{'has-errors':importPreview.errorCount}"><div class="import-preview-head"><strong>{{ importPreview.errorCount ? `发现 ${importPreview.errorCount} 个问题` : `校验通过，共 ${importPreview.total} 条` }}</strong><el-button v-if="importPreview.errorCount" type="warning" plain :loading="errorReportDownloading" @click="downloadImportErrorReport">下载错误修正台账</el-button></div><el-table v-if="importPreview.errors?.length" :data="importPreview.errors" size="small" border max-height="220"><el-table-column prop="row" label="行" width="64"/><el-table-column prop="field" label="字段" width="110"/><el-table-column prop="reason" label="原因" min-width="190"/><el-table-column prop="suggestion" label="修改建议" min-width="190"/></el-table></div>
      <template #footer><el-button @click="importVisible=false">取消</el-button><el-button :loading="importPreviewing" @click="previewImport">校验文件</el-button><el-button type="primary" :disabled="!importPreview||importPreview.errorCount>0" :loading="importSubmitting" @click="submitImport">确认导入</el-button></template>
    </el-dialog>

    <el-dialog v-model="stockVisible" title="库存调整" width="min(460px, 92vw)" destroy-on-close>
      <template v-if="stockPart">
        <div class="detail-hero" style="margin-bottom:18px">
          <div><h2 style="font-size:16px">{{ stockPart.materialDesc }}</h2><p>{{ stockPart.materialCode }}</p></div>
          <div class="detail-stock"><strong style="font-size:23px">{{ stockPart.totalStock }}</strong><span>调整前库存</span></div>
        </div>
        <el-form label-position="top">
          <el-form-item label="操作类型">
            <el-segmented v-model="stockForm.type" :options="[{label:'入库',value:'in'},{label:'出库',value:'out'}]" block />
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number v-model="stockForm.quantity" :min="1" :max="999999" controls-position="right" style="width:100%" />
          </el-form-item>
          <el-form-item label="原因分类" required><el-select v-model="stockForm.reasonCode" placeholder="请选择原因" style="width:100%"><el-option v-for="item in currentReasonOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="原因说明"><el-input v-model="stockForm.reasonDetail" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可填写维修内容、送货单或补充说明" /></el-form-item>
          <el-form-item label="领用/经办人"><el-input v-model="stockForm.recipient" maxlength="50" placeholder="填写本次领用人或经办人" /></el-form-item>
        </el-form>
        <p class="form-tip">出库数量不能超过当前库存。待审批盘点中的备件将暂停出入库。</p>
      </template>
      <template #footer>
        <el-button @click="stockVisible=false">取消</el-button>
        <el-button type="primary" :loading="stockSubmitting" @click="submitStock">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量出入库" width="min(820px, 96vw)" destroy-on-close>
      <el-form label-position="top"><div class="stock-meta-grid"><el-form-item label="操作类型"><el-segmented v-model="batchForm.type" :options="[{label:'批量入库',value:'in'},{label:'批量出库',value:'out'}]" block /></el-form-item><el-form-item label="原因分类" required><el-select v-model="batchForm.reasonCode" placeholder="请选择原因" style="width:100%"><el-option v-for="item in batchReasonOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div><el-form-item label="领用/经办人"><el-input v-model="batchForm.recipient" maxlength="50" placeholder="填写本次领用人或经办人" /></el-form-item><el-form-item label="原因说明"><el-input v-model="batchForm.reasonDetail" type="textarea" :rows="2" maxlength="200" show-word-limit /></el-form-item></el-form>
      <el-table :data="batchRows" border max-height="320"><el-table-column label="备件" min-width="300"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }} · 当前 {{ row.totalStock }} {{ row.unit }}</span></div></template></el-table-column><el-table-column label="本次数量" width="180"><template #default="{row}"><el-input-number v-model="row.quantity" :min="1" :max="batchForm.type==='out'?Number(row.totalStock):999999" controls-position="right" style="width:100%" /></template></el-table-column></el-table>
      <template #footer><el-button @click="batchVisible=false">取消</el-button><el-button type="primary" :loading="batchSubmitting" @click="submitBatch">确认批量调整</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { batchUpdateStock, createPart, downloadPartsImportErrorReport, downloadPartsImportTemplate, getDashboard, getFilters, getMovementReasons, getParts, importParts, previewPartsImport, updateStock } from '../api'
import { canEditAnyWorkshop, canEditWorkshop } from '../auth'

const router = useRouter()
const route = useRoute()
function readStored(key, fallback) { try { const value=JSON.parse(window.localStorage.getItem(key)||'null'); return value ?? fallback } catch { return fallback } }
const loading = ref(false)
const list = ref([])
const total = ref(0)
const areas = ref([])
const partTypes = ref([])
const workshops = ref([])
const dashboard = ref({ partTypes: 0, inventoryRecords: 0, totalStock: 0, totalValue: 0, lowStock: 0, unconfiguredStock: 0, pendingApproval: 0, unitTotals: [] })
const savedQuery = readStored('spare-parts-inventory-filters', {})
const routeWorkshop = ['raw_grain','qu_making','brewing'].includes(String(route.query.workshopCode || '')) ? String(route.query.workshopCode) : ''
const query = reactive({ page: 1, pageSize: 20, searchKeyword: '', workshopCode: routeWorkshop, warehouseAreaName: '', partType: '', stockStatus: '', sort: 'name', lowStock: undefined, ...savedQuery, ...(routeWorkshop ? { workshopCode: routeWorkshop } : {}) })
const detailVisible = ref(false)
const currentPart = ref(null)
const stockVisible = ref(false)
const stockPart = ref(null)
const stockSubmitting = ref(false)
const stockForm = reactive({ type: 'in', quantity: 1, reasonCode: '', reasonDetail: '', recipient: '' })
const movementReasons = ref({ in: [], out: [] })
const selectedRows = ref([])
const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchRows = ref([])
const batchForm = reactive({ type: 'out', reasonCode: '', reasonDetail: '', recipient: '' })
const columnOptions = [
  { value: 'workshop', label: '所属车间' }, { value: 'partType', label: '备件类型' }, { value: 'spec', label: '规格型号' },
  { value: 'location', label: '货区 / 库位' }, { value: 'reorderPoint', label: '订购点' }, { value: 'status', label: '库存状态' }
]
const visibleColumns = ref(readStored('spare-parts-inventory-columns', ['workshop','partType','spec','location','reorderPoint','status']))
const canEditAny = canEditAnyWorkshop()
const createVisible = ref(false)
const createSubmitting = ref(false)
const importVisible = ref(false)
const importSubmitting = ref(false)
const importPreviewing = ref(false)
const templateDownloading = ref(false)
const errorReportDownloading = ref(false)
const importWorkshopCode = ref('')
const importFile = ref(null)
const importPreview = ref(null)
const importUploadRef = ref(null)
const createForm = reactive({ workshopCode:'', materialCode:'', materialDesc:'', spec:'', partType:'', unit:'个', totalStock:0, warehouseAreaName:'', locationCode:'', locationNote:'', reorderPoint:null, maxStock:null, price:null, usageDescription:'' })
const editableWorkshops = computed(() => workshops.value.filter(item => canEditWorkshop(item.code)))
const currentWorkshopName = computed(() => query.workshopCode ? `${workshops.value.find(item => item.code === query.workshopCode)?.name || '当前车间'}的` : '全部车间的')
const currentReasonOptions = computed(() => movementReasons.value[stockForm.type] || [])
const batchReasonOptions = computed(() => movementReasons.value[batchForm.type] || [])
const createUsesArea = computed(() => createForm.workshopCode !== 'qu_making')
const unitSummary = computed(() => {
  const totals = dashboard.value.unitTotals || []
  if (!totals.length) return '库存数量按单位独立统计'
  const text = totals.slice(0, 3).map(item => `${formatNumber(item.total)}${item.unit}`).join('、')
  return totals.length > 3 ? `${text} 等 ${totals.length} 种单位` : text
})

function formatNumber(value) { return new Intl.NumberFormat('zh-CN').format(Number(value) || 0) }
function formatCurrency(value) { return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(Number(value)||0) }
function columnVisible(value) { return visibleColumns.value.includes(value) }
function isLow(row) { return row.reorderPoint != null && Number(row.totalStock) <= Number(row.reorderPoint) }
function inventoryHealth(row) {
  if (Number(row.totalStock) <= 0) return { label: '零库存', type: 'danger' }
  if (row.reorderPoint == null) return { label: '订购点未配置', type: 'info' }
  return isLow(row) ? { label: '需要补充', type: 'warning' } : { label: '库存正常', type: 'success' }
}
function valueText(value, suffix) { return value === null || value === undefined || value === '' ? '-' : `${value}${suffix}` }
function locationText(row) {
  if (row.locationType === 'free_text') return [row.warehouseAreaName, row.locationNote].filter(Boolean).join(' · ') || '位置待确认'
  if (row.locationCode) return `${row.warehouseAreaName || '未指定'} · ${row.locationCode}`
  const bits = [row.warehouseAreaName, valueText(row.shelf, '号架'), valueText(row.layer, '层')].filter(value => value && value !== '-')
  return bits.join(' · ') || '未设置库位'
}
function inventoryTag(status) { return status === '已完成' ? 'success' : status === '待审批' ? 'warning' : 'info' }
function sideText(value) { return String(value) === '1' ? '东侧' : String(value) === '2' ? '西侧' : '-' }

async function load() {
  loading.value = true
  try {
    const result = await getParts({ ...query })
    list.value = result.data || []
    total.value = Number(result.total) || 0
  } finally {
    loading.value = false
  }
}

async function loadDashboard() {
  const result = await getDashboard({ workshopCode: query.workshopCode || undefined })
  dashboard.value = result.data?.dashboard || dashboard.value
}

async function loadFilters() {
  const result = await getFilters({ workshopCode: query.workshopCode || undefined })
  areas.value = result.data?.areas || []
  partTypes.value = result.data?.partTypes || []
  workshops.value = result.data?.workshops || []
}

async function loadOperationOptions() {
  if (!canEditAny) return
  const reasons = await getMovementReasons()
  movementReasons.value = reasons.data || { in: [], out: [] }
}

async function refreshAll() {
  await Promise.allSettled([load(), loadDashboard(), loadFilters()])
}

function search() { query.page = 1; Promise.allSettled([load(), loadDashboard(), loadFilters()]) }
function resetFilters() {
  Object.assign(query, { page: 1, searchKeyword: '', workshopCode: '', warehouseAreaName: '', partType: '', stockStatus: '', sort: 'name', lowStock: undefined })
  Promise.allSettled([load(), loadDashboard(), loadFilters()])
}
function showLowStock() { query.lowStock = '1'; query.sort = 'stockAsc'; query.page = 1; load() }
function clearLowStock() { query.lowStock = undefined; query.sort = 'name'; query.page = 1; load() }
function openDetail(row) {
  currentPart.value = row
  detailVisible.value = true
}
function locate3d(row) { router.push({ path: '/warehouse-3d', query: { partId: row._id, workshopCode: row.workshopCode } }) }
function goScoped(path, extra={}) { router.push({ path, query: { ...extra, ...(query.workshopCode ? { workshopCode:query.workshopCode } : {}) } }) }
function goReplenishment() { goScoped('/replenishment') }

function defaultEditableWorkshop() {
  return canEditWorkshop(query.workshopCode) ? query.workshopCode : (editableWorkshops.value[0]?.code || '')
}
function openCreate() {
  const workshopCode = defaultEditableWorkshop()
  const workshopName = workshops.value.find(item => item.code === workshopCode)?.name || '车间'
  Object.assign(createForm, { workshopCode, materialCode:'', materialDesc:'', spec:'', partType:'', unit:'个', totalStock:0, warehouseAreaName:workshopCode==='qu_making'?'':`${workshopName}备件库`, locationCode:'', locationNote:'', reorderPoint:null, maxStock:null, price:null, usageDescription:'' })
  createVisible.value = true
}
async function submitCreate() {
  if (!createForm.workshopCode || !createForm.materialCode.trim() || !createForm.materialDesc.trim() || (createUsesArea.value && !createForm.warehouseAreaName.trim())) return ElMessage.warning(`请完整填写车间、物料编码、物料名称${createUsesArea.value?'和货区':''}`)
  if (createForm.locationCode && !/^\d{6}$/.test(createForm.locationCode)) return ElMessage.warning('六位库位码必须是6位数字')
  const location = createForm.locationCode ? { shelf:Number(createForm.locationCode.slice(0,2)), position:Number(createForm.locationCode.slice(2,3)), layer:Number(createForm.locationCode.slice(3,4)), location:Number(createForm.locationCode.slice(4,6)), locationType:'shelf' } : { locationType:'free_text', locationNote:createForm.locationNote||'新增时未设置固定库位' }
  createSubmitting.value = true
  try { await createPart({ ...createForm, ...location }); ElMessage.success('备件已新增'); createVisible.value=false; query.workshopCode=createForm.workshopCode; await refreshAll() } finally { createSubmitting.value=false }
}
function openImport() { importWorkshopCode.value=defaultEditableWorkshop(); importFile.value=null; importPreview.value=null; importUploadRef.value?.clearFiles(); importVisible.value=true }
function handleImportFile(file) { importFile.value=file.raw || null; importPreview.value=null }
function clearImportFile() { importFile.value=null; importPreview.value=null }
function saveBlob(blob, name) { const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url) }
async function downloadImportTemplate() { if(!importWorkshopCode.value)return ElMessage.warning('请先选择车间');templateDownloading.value=true;try{const blob=await downloadPartsImportTemplate(importWorkshopCode.value);const name=workshops.value.find(item=>item.code===importWorkshopCode.value)?.name||'车间';saveBlob(blob,`${name}备件导入模板.xlsx`)}finally{templateDownloading.value=false} }
async function previewImport() {
  if (!importWorkshopCode.value || !importFile.value) return ElMessage.warning('请选择车间和 .xlsx 台账文件')
  const formData=new FormData();formData.append('workshopCode',importWorkshopCode.value);formData.append('file',importFile.value)
  importPreviewing.value=true;try{const result=await previewPartsImport(formData);importPreview.value=result.data;ElMessage[result.data?.errorCount?'warning':'success'](result.msg)}catch(error){importPreview.value=error.response?.data?.details||null}finally{importPreviewing.value=false}
}
async function downloadImportErrorReport() {
  if (!importWorkshopCode.value || !importFile.value || !importPreview.value?.errorCount) return ElMessage.warning('请先校验存在问题的台账')
  const formData = new FormData(); formData.append('workshopCode', importWorkshopCode.value); formData.append('file', importFile.value)
  errorReportDownloading.value = true
  try {
    const blob = await downloadPartsImportErrorReport(formData)
    const name = workshops.value.find(item => item.code === importWorkshopCode.value)?.name || '车间'
    saveBlob(blob, `${name}备件导入错误修正表.xlsx`)
  } finally { errorReportDownloading.value = false }
}
async function submitImport() {
  if (!importWorkshopCode.value) return ElMessage.warning('请选择导入车间')
  if (!importFile.value) return ElMessage.warning('请选择 .xlsx 台账文件')
  if (!importPreview.value || importPreview.value.errorCount) return ElMessage.warning('请先完成文件校验并修正全部问题')
  const formData = new FormData(); formData.append('workshopCode', importWorkshopCode.value); formData.append('file', importFile.value)
  importSubmitting.value=true
  try { const result=await importParts(formData); ElMessage.success(result.msg || '导入完成'); importVisible.value=false; query.workshopCode=importWorkshopCode.value; await refreshAll() } finally { importSubmitting.value=false }
}
function openStock(row) {
  if (!canEditWorkshop(row.workshopCode)) return ElMessage.warning('当前账号只能调整所属车间库存')
  stockPart.value = row
  Object.assign(stockForm, { type: 'in', quantity: 1, reasonCode: '', reasonDetail: '', recipient: '' })
  stockVisible.value = true
}

async function submitStock() {
  if (!stockPart.value || stockForm.quantity < 1) return
  if (!stockForm.reasonCode) return ElMessage.warning('请选择出入库原因')
  const action = stockForm.type === 'in' ? '入库' : '出库'
  try {
    await ElMessageBox.confirm(`确认${action} ${stockForm.quantity} ${stockPart.value.unit || '个'}？`, `${action}确认`, { type: 'warning' })
  } catch { return }
  stockSubmitting.value = true
  try {
    await updateStock(stockPart.value._id, { ...stockForm })
    ElMessage.success(`${action}完成`)
    stockVisible.value = false
    await Promise.all([load(), loadDashboard()])
  } finally { stockSubmitting.value = false }
}

function openBatch() {
  batchRows.value = selectedRows.value.map(row => ({ ...row, quantity: 1 }))
  Object.assign(batchForm, { type: 'out', reasonCode: '', reasonDetail: '', recipient: '' })
  batchVisible.value = true
}

async function submitBatch() {
  if (!batchForm.reasonCode) return ElMessage.warning('请选择批量出入库原因')
  const items = batchRows.value.map(row => ({ inventoryId: row._id, quantity: row.quantity }))
  try {
    await ElMessageBox.confirm(`确认对 ${items.length} 条库存执行批量${batchForm.type === 'in' ? '入库' : '出库'}？`, '批量操作确认', { type: 'warning' })
  } catch { return }
  batchSubmitting.value = true
  try {
    await batchUpdateStock({ ...batchForm, items })
    ElMessage.success('批量库存操作已完成')
    batchVisible.value = false
    selectedRows.value = []
    await Promise.all([load(), loadDashboard()])
  } finally { batchSubmitting.value = false }
}

watch(query, value => window.localStorage.setItem('spare-parts-inventory-filters', JSON.stringify({ pageSize: value.pageSize, searchKeyword: value.searchKeyword, workshopCode:value.workshopCode, warehouseAreaName: value.warehouseAreaName, partType:value.partType, stockStatus:value.stockStatus, sort: value.sort, lowStock: value.lowStock })), { deep: true })
watch(visibleColumns, value => window.localStorage.setItem('spare-parts-inventory-columns', JSON.stringify(value)), { deep: true })
watch(() => stockForm.type, () => { stockForm.reasonCode = '' })
watch(() => batchForm.type, () => { batchForm.reasonCode = '' })
watch(importWorkshopCode, () => { importPreview.value = null })
watch(() => createForm.workshopCode, code => {
  if (code === 'qu_making') { createForm.warehouseAreaName=''; createForm.locationCode='' }
})
onMounted(() => Promise.allSettled([refreshAll(), loadOperationOptions()]))
</script>

<style scoped>
.inventory-metric-grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.metric-card:is(button){width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer}.metric-card.is-quality{border-top-color:#7a8798}.metric-card.is-quality .metric-icon{color:#536171;background:#f1f3f5}.filter-row{grid-template-columns:minmax(135px,.7fr) minmax(300px,1.65fr) minmax(175px,.85fr) minmax(165px,.8fr) auto;align-items:end}.filter-actions{display:flex;gap:8px;white-space:nowrap}.table-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.column-picker strong{display:block;margin-bottom:8px}.column-picker .el-checkbox-group{display:grid}.stock-meta-grid,.part-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.part-form-grid{margin-top:16px}.part-form-grid .span-2{grid-column:1/-1}.detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.table-filter-head{display:flex;align-items:center;gap:5px}.table-filter-head.is-center{justify-content:center}.header-filter-button{display:inline-grid;place-items:center;padding:2px;border:0;background:transparent;color:#a0a8b5;cursor:pointer}.header-filter-button:hover,.header-filter-button.active{color:var(--primary)}
.material-name-cell{display:block;overflow:visible;white-space:normal;overflow-wrap:anywhere;word-break:break-word;color:var(--ink);font-size:13px;line-height:1.55}.material-code-cell{display:block;color:#667085;background:transparent;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;white-space:normal;overflow-wrap:anywhere}.material-cell{min-width:0;overflow:hidden;display:flex;align-items:center;gap:8px}.material-cell strong{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:13px;flex:1;min-width:0}.material-cell span{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px;flex-shrink:0;max-width:130px}.spec-cell{display:block;color:#4b5563;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.location-cell{display:inline-flex;align-items:center;gap:6px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.stock-number{font-size:15px;font-weight:800}.stock-number.is-low{color:var(--danger)}
.import-workshop-row{width:100%;display:grid;grid-template-columns:1fr auto;gap:10px}.field-hint{display:block;margin-top:6px;color:#7c8798}.import-preview{padding:12px;border:1px solid #b7e4ce;border-radius:12px;background:#f0fbf5}.import-preview.has-errors{border-color:#f2c0c4;background:#fff5f5}.import-preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
:deep(.el-table .cell){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1250px){.filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-actions{grid-column:span 2;justify-content:flex-end}}@media(max-width:680px){.inventory-metric-grid{grid-template-columns:1fr}.filter-row{grid-template-columns:1fr}.filter-actions{grid-column:auto}.stock-meta-grid{grid-template-columns:1fr}.detail-actions .el-button{flex:1}.import-workshop-row{grid-template-columns:1fr}}
</style>
