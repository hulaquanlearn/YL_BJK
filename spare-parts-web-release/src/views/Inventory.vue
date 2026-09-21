<template>
  <div class="inventory-page">
    <section class="panel filter-panel">
      <div class="filter-row">
        <div class="filter-field">
          <label>车间</label>
          <el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="workshopChanged">
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
    <details class="inventory-summary" open><summary>库存概况 <span>{{ formatNumber(dashboard.partTypes) }} 种 · 低库存 {{ formatNumber(dashboard.lowStock) }} 条</span></summary>
    <div class="page-head">
      <div>
        <span class="summary-scope">当前筛选范围</span>
        
      </div>
      <div class="head-actions">
        <el-button :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon>刷新数据
        </el-button>
      </div>
    </div>

    <section class="metric-grid inventory-metric-grid" aria-label="库存指标">
      <button type="button" class="metric-card is-parts is-clickable" @click="typeBreakdownVisible=true">
        <div class="metric-top"><span>备件种类</span><span class="metric-icon"><el-icon><Tickets /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.partTypes) }}</div>
        <div class="metric-note">当前筛选 · 点击查看类型构成</div>
      </button>
      <button type="button" class="metric-card is-stock is-clickable" @click="goStatistics()">
        <div class="metric-top"><span>库存总量</span><span class="metric-icon"><el-icon><Box /></el-icon></span></div>
        <div class="metric-unit-list" :title="unitSummary"><span v-for="item in dashboard.unitTotals" :key="item.unit"><strong>{{ formatNumber(item.total) }}</strong>{{ item.unit }}</span><span v-if="!dashboard.unitTotals.length">暂无库存</span></div>
        <div class="metric-note">不同单位分别统计，不混合相加</div>
      </button>
      <button type="button" class="metric-card is-value is-clickable" @click="goStatistics()">
        <div class="metric-top"><span>{{dashboard.missingPrice?'已知库存价值':'库存总价值'}}</span><span class="metric-icon"><el-icon><Money /></el-icon></span></div>
        <div class="metric-value">{{ formatCurrency(dashboard.totalValue) }}</div>
        <div class="metric-note">库存 × 不含税单价<span v-if="dashboard.missingPrice"> · {{ dashboard.missingPrice }} 条缺价格</span></div>
      </button>
      <button v-if="dashboard.lowStock || query.lowStock" type="button" class="metric-card is-alert is-clickable" @click="showLowStock">
        <div class="metric-top"><span>低库存预警</span><span class="metric-icon"><el-icon><Warning /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.lowStock) }}</div>
        <div class="metric-note">已配置订购点且库存达到或低于订购点</div>
      </button>
      <button v-if="dashboard.missingReorderPoint" type="button" class="metric-card is-quality is-clickable" @click="goScoped('/data-quality', { issue:'missing_reorder_point' })">
        <div class="metric-top"><span>订购点未配置</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.missingReorderPoint) }}</div>
        <div class="metric-note">含零库存记录 · 未配置记录不参与低库存判断</div>
      </button>
      <button v-if="dashboard.pendingApproval" type="button" class="metric-card is-pending is-clickable" @click="goScoped('/check', { status:'待审批' })">
        <div class="metric-top"><span>待审批盘点</span><span class="metric-icon"><el-icon><DocumentChecked /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.pendingApproval) }}</div>
        <div class="metric-note">点击进入盘点审批</div>
      </button>
    </section>

    </details>
    <el-dialog v-model="typeBreakdownVisible" title="备件种类与价值分布" width="min(1240px,96vw)" align-center>
      <p class="scope-dialog-note">按当前筛选统计各车间、货区；数量按单位列出，价值按库存 × 不含税单价计算。相同备件出现在多个货区时，货区种类数不能直接相加。</p>
      <div class="scope-dialog-total"><strong>共 {{ formatNumber(dashboard.partTypes) }} 种</strong><span>已知库存价值 {{ formatCurrency(dashboard.totalValue) }}</span><span v-if="dashboard.missingPrice">{{ dashboard.missingPrice }} 条未填写价格</span></div>
      <el-table class="scope-breakdown-table" :data="dashboard.scopeBreakdown || []" stripe max-height="58vh" empty-text="当前筛选没有库存">
        <el-table-column prop="workshopName" label="车间" width="110" fixed />
        <el-table-column prop="warehouseAreaName" label="货区" min-width="120" fixed />
        <el-table-column v-for="type in ['易损件','质保件']" :key="type" :label="type">
          <el-table-column label="种类" width="75"><template #default="{row}">{{ scopeType(row,type).partTypes || 0 }}</template></el-table-column>
          <el-table-column label="库存数量" min-width="155"><template #default="{row}">{{ quantities(scopeType(row,type).unitTotals) }}</template></el-table-column>
          <el-table-column label="库存价值" min-width="150"><template #default="{row}">{{ formatCurrency(scopeType(row,type).totalValue) }}<small v-if="scopeType(row,type).missingPrice" class="scope-missing">{{ scopeType(row,type).missingPrice }} 条缺价格</small></template></el-table-column>
        </el-table-column>
        <el-table-column label="合计价值" min-width="145"><template #default="{row}">{{ formatCurrency(row.totalValue) }}</template></el-table-column>
      </el-table>
      <template #footer><el-button @click="typeBreakdownVisible=false">关闭</el-button><el-button type="primary" @click="goStatistics()">查看统计大屏</el-button></template>
    </el-dialog>



    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <strong>{{ query.lowStock ? '低库存备件' : '库存明细' }}</strong>
          <span class="result-count">共 {{ total }} 条</span>
        </div>
        <div class="table-actions">
          <el-button v-write v-if="$showControl(canEditAny)" size="small" :loading="exporting" :disabled="!total || loading" @click="exportCurrent">导出当前结果</el-button>
          <template v-if="selectedRows.length">
            <span class="selection-count" aria-live="polite">已选 {{ selectedRows.length }} 条</span>
            <el-dropdown v-write trigger="click" @command="command=>command==='stock'?openBatch():openBatchDelete()">
              <el-button size="small">批量操作<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown><el-dropdown-menu><el-dropdown-item command="stock">批量出入库</el-dropdown-item><el-dropdown-item command="delete">批量删除</el-dropdown-item></el-dropdown-menu></template>
            </el-dropdown>
            <el-button size="small" text @click="clearSelection">取消选择</el-button>
          </template>
          <el-button v-write v-if="$showControl(canEditAny)" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon>新增备件</el-button>
          <el-button v-write v-if="$showControl(canEditAny)" type="success" plain size="small" @click="openImport"><el-icon><Upload /></el-icon>导入备件</el-button>
          <el-button v-if="query.lowStock" type="danger" plain size="small" @click="clearLowStock">退出预警筛选</el-button>
          <el-popover placement="bottom-end" :width="220" trigger="click"><template #reference><el-button size="small"><el-icon><Grid /></el-icon>自定义列</el-button></template><div class="column-picker"><strong>显示字段</strong><el-checkbox-group v-model="visibleColumns"><el-checkbox v-for="item in columnOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></div></el-popover>
        </div>
      </div>

      <div class="mobile-parts" v-loading="loading">
        <article v-for="row in list" :key="row._id" class="mobile-part">
          <header><el-checkbox v-if="$showControl(canEditAny)" :aria-label="'选择 '+row.materialDesc" :model-value="selectedRows.some(item=>item._id===row._id)" @change="value=>inventoryTable?.toggleRowSelection(row,value)"/><strong>{{ row.materialDesc || '未命名备件' }}</strong><b :class="{'is-low':isLow(row)}">{{ row.totalStock }} {{ row.unit || '个' }}</b></header>
          <p>{{ row.materialCode }} · {{ row.spec || '规格未填写' }}</p><p>{{ locationText(row) }}</p>
          <footer><el-tag :type="inventoryHealth(row).type" size="small">{{ inventoryHealth(row).label }}</el-tag><el-button link @click="openDetail(row)">详情</el-button><el-button link @click="locate3d(row)">3D定位</el-button><el-button v-write v-if="$showControl(canEditWorkshop(row.workshopCode))" link :disabled="!$showControl(false) && row.inventoryStatus === '待审批'" @click="openStock(row)">出入库</el-button></footer>
        </article><el-empty v-if="!loading&&!list.length" description="没有找到符合条件的备件"/>
      </div>
      <el-table class="desktop-inventory-table" ref="inventoryTable" :data="list" v-loading="loading" row-key="_id" empty-text="没有找到符合条件的备件" @selection-change="onSelectionChange">
        <el-table-column v-if="$showControl(canEditAny)" type="selection" width="180" reserve-selection :selectable="row=>$showControl(canEditWorkshop(row.workshopCode))">
          <template #header>
            <div class="selection-header">
              <el-checkbox :model-value="pageSelected" :indeterminate="pageIndeterminate" @change="toggleCurrentPage" />
              <button v-if="total > list.length && !allFilteredSelected" type="button" class="select-filtered-link" :disabled="selectingAll || loading" @click.stop="selectAllFiltered">选择全部 {{ total }} 条筛选结果</button>
              <span v-else-if="allFilteredSelected" class="all-selected-label">已选全部</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="名称" min-width="230" fixed="left">
          <template #default="{ row }">
            <strong class="material-name-cell" :title="row.materialDesc">{{ row.materialDesc || '未命名备件' }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="138">
          <template #default="{ row }"><code class="material-code-cell">{{ row.materialCode || '-' }}</code></template>
        </el-table-column>
        <el-table-column v-if="columnVisible('spec')" prop="spec" label="规格型号" min-width="220" show-overflow-tooltip>
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
        <el-table-column v-if="columnVisible('partType')" prop="partType" min-width="118" show-overflow-tooltip>
          <template #header><div class="table-filter-head"><span>备件类型</span><el-popover trigger="click" placement="bottom" :width="210"><template #reference><button class="header-filter-button" :class="{active:query.partType}" title="筛选备件类型"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.partType" clearable filterable placeholder="全部类型" style="width:100%" @change="search"><el-option v-for="item in partTypes" :key="item" :label="item" :value="item" /></el-select></el-popover></div></template>
          <template #default="{ row }">{{ row.partType || '未填写' }}</template>
        </el-table-column>
        <el-table-column v-if="columnVisible('workshop')" prop="workshopName" min-width="112" show-overflow-tooltip>
          <template #header><div class="table-filter-head"><span>所属车间</span><el-popover trigger="click" placement="bottom" :width="210"><template #reference><button class="header-filter-button" :class="{active:query.workshopCode}" title="筛选车间"><el-icon><Filter /></el-icon></button></template><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="search"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-popover></div></template>
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
        <el-table-column label="操作" width="215" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="locate3d(row)">3D定位</el-button>
            <el-button v-write v-if="$showControl(canEditWorkshop(row.workshopCode))" link type="primary" :disabled="!$showControl(false) && row.inventoryStatus === '待审批'" @click="openStock(row)">出入库</el-button>
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

    <el-dialog v-model="detailVisible" title="备件详情" class="inventory-detail-dialog" width="min(900px, 94vw)" :show-close="false" align-center append-to-body>
          <div v-if="currentPart" class="detail-card">
            <div class="detail-card-body">
              <div class="detail-hero">
                <div class="detail-heading">
                  <h2>{{ currentPart.materialDesc }}</h2>
                  <p>{{ currentPart.materialCode }}</p>
                </div>
                <div class="detail-stock">
                  <strong>{{ currentPart.totalStock }} {{ currentPart.unit || '个' }}</strong>
                  <span>当前库存</span>
                </div>
                <el-button class="detail-close" aria-label="关闭备件详情" circle text @click="detailVisible=false"><el-icon><Close /></el-icon></el-button>
              </div>
              <PartModelDetail v-if="detailVisible" :part="currentPart" />
              <div class="drawer-section">
                <h3>库存与位置</h3>
                <dl class="detail-fields">
                  <div v-if="currentPart.warehouseAreaName" class="detail-field"><dt>货区</dt><dd>{{ currentPart.warehouseAreaName }}</dd></div>
                  <div v-if="currentPart.workshopName" class="detail-field"><dt>所属车间</dt><dd>{{ currentPart.workshopName }}</dd></div>
                  <div class="detail-field detail-field-wide"><dt>存放位置</dt><dd>{{ locationText(currentPart) }}</dd></div>
                  <div v-if="currentPart.shelf" class="detail-field"><dt>货架</dt><dd>{{ valueText(currentPart.shelf, '号') }}</dd></div>
                  <div v-if="currentPart.layer" class="detail-field"><dt>层数</dt><dd>{{ valueText(currentPart.layer, '层') }}</dd></div>
                  <div v-if="currentPart.position" class="detail-field"><dt>方位</dt><dd>{{ sideText(currentPart.position) }}</dd></div>
                  <div v-if="currentPart.location != null" class="detail-field"><dt>货位</dt><dd>{{ currentPart.location }}</dd></div>
                </dl>
              </div>
              <div class="drawer-section">
                <h3>物料信息</h3>
                <dl class="detail-fields">
                  <div v-if="currentPart.spec" class="detail-field detail-field-wide"><dt>规格型号</dt><dd>{{ currentPart.spec }}</dd></div>
                  <div v-if="currentPart.usageDescription" class="detail-field detail-field-wide"><dt>用途</dt><dd>{{ currentPart.usageDescription }}</dd></div>
                  <div v-if="currentPart.partType" class="detail-field"><dt>备件类型</dt><dd>{{ currentPart.partType }}</dd></div>
                  <div v-if="currentPart.reorderPoint != null" class="detail-field"><dt>订购点</dt><dd>{{ currentPart.reorderPoint }}</dd></div>
                  <div v-if="currentPart.maxStock != null" class="detail-field"><dt>最高储备</dt><dd>{{ currentPart.maxStock }}</dd></div>
                  <div v-if="currentPart.price != null" class="detail-field"><dt>不含税单价</dt><dd>{{ currentPart.price }} 元</dd></div>
                  <div class="detail-field"><dt>盘点状态</dt><dd>
                    <el-tag :type="inventoryTag(currentPart.inventoryStatus)" effect="plain" size="small">{{ currentPart.inventoryStatus || '未盘点' }}</el-tag>
                  </dd></div>
                  <div v-if="currentPart.lastInventoryDate" class="detail-field"><dt>最近盘点</dt><dd>{{ currentPart.lastInventoryDate }}</dd></div>
                </dl>
              </div>
            </div>
            <div class="detail-card-footer">
              <el-button v-write v-if="$showControl(canEditWorkshop(currentPart.workshopCode))" :disabled="!$showControl(false) && currentPart.inventoryStatus === '待审批'" @click="openEdit(currentPart)">编辑信息</el-button>
              <el-button v-write v-if="$showControl(canEditWorkshop(currentPart.workshopCode))" type="danger" plain @click="removePart(currentPart)">删除备件</el-button>
              <el-button v-if="isLow(currentPart)" type="danger" plain @click="goReplenishment"><el-icon><ShoppingCartFull /></el-icon>补货</el-button>
            </div>
          </div>
    </el-dialog>

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
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button v-write type="primary" :loading="createSubmitting" @click="submitCreate">保存备件</el-button></template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑备件信息" width="min(760px, 96vw)" align-center append-to-body destroy-on-close>
      <el-alert title="库存数量请通过“出入库”调整，编辑信息不会改写历史流水。" type="info" :closable="false" show-icon />
      <el-form label-position="top" class="part-form-grid">
        <el-form-item label="所属车间"><el-input :model-value="workshopName(editForm.workshopCode)" disabled /></el-form-item>
        <el-form-item label="物料编码" required><el-input v-model="editForm.materialCode" maxlength="60" /></el-form-item>
        <el-form-item label="物料名称" required class="span-2"><el-input v-model="editForm.materialDesc" maxlength="300" /></el-form-item>
        <el-form-item label="规格型号"><el-input v-model="editForm.spec" maxlength="180" /></el-form-item>
        <el-form-item label="备件类型"><el-input v-model="editForm.partType" maxlength="80" /></el-form-item>
        <el-form-item label="品牌"><el-input v-model="editForm.brand" maxlength="100" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="editForm.unit" maxlength="20" /></el-form-item>
        <el-form-item v-if="editUsesArea" label="货区/仓库名称" required><el-input v-model="editForm.warehouseAreaName" maxlength="100" /></el-form-item>
        <el-form-item v-if="editUsesArea" label="六位库位码"><el-input v-model="editForm.locationCode" maxlength="6" placeholder="例如：011101；无固定库位可留空" /></el-form-item>
        <el-form-item v-if="editUsesArea&&!editForm.locationCode" label="无固定库位说明" class="span-2"><el-input v-model="editForm.locationNote" maxlength="200" placeholder="例如：货区内待确认位置" /></el-form-item>
        <el-form-item v-if="!editUsesArea" label="存放位置" class="span-2"><el-input v-model="editForm.locationNote" maxlength="200" /></el-form-item>
        <el-form-item label="订购点"><el-input-number v-model="editForm.reorderPoint" :min="0" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="最高储备"><el-input-number v-model="editForm.maxStock" :min="0" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="不含税单价"><el-input-number v-model="editForm.price" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="用途"><el-input v-model="editForm.usageDescription" maxlength="300" /></el-form-item>
        <el-form-item label="备注" class="span-2"><el-input v-model="editForm.remark" type="textarea" :rows="2" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button v-write type="primary" :loading="editSubmitting" @click="submitEdit">保存修改</el-button></template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入备件台账" width="min(760px, 94vw)" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="导入到车间" required><div class="import-workshop-row"><el-select v-model="importWorkshopCode"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code" /></el-select><el-button :loading="templateDownloading" @click="downloadImportTemplate">下载当前车间模板</el-button></div><small class="field-hint">本次只处理所选车间；校验通过前不会写入任何数据。</small></el-form-item>
        <el-form-item label="Excel 台账（.xlsx）" required>
          <el-upload v-write ref="importUploadRef" drag :auto-upload="false" :limit="1" accept=".xlsx" :on-change="handleImportFile" :on-remove="clearImportFile" style="width:100%">
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入台账，或<em>点击选择</em></div>
          </el-upload>
        </el-form-item>
      </el-form>
      <div v-if="importPreview" class="import-preview" :class="{'has-errors':importPreview.errorCount}"><div class="import-preview-head"><strong>{{ importPreview.errorCount ? `发现 ${importPreview.errorCount} 个问题` : `校验通过，共 ${importPreview.total} 条` }}</strong><el-button v-if="importPreview.errorCount" type="warning" plain :loading="errorReportDownloading" @click="downloadImportErrorReport">下载错误修正台账</el-button></div><el-table v-if="importPreview.errors?.length" :data="importPreview.errors" size="small" border max-height="220"><el-table-column prop="row" label="行" width="64"/><el-table-column prop="field" label="字段" width="110"/><el-table-column prop="reason" label="原因" min-width="190"/><el-table-column prop="suggestion" label="修改建议" min-width="190"/></el-table></div>
      <template #footer><el-button @click="importVisible=false">取消</el-button><el-button v-write :loading="importPreviewing" @click="previewImport">校验文件</el-button><el-button v-write type="primary" :disabled="!importPreview||importPreview.errorCount>0" :loading="importSubmitting" @click="submitImport">确认导入</el-button></template>
    </el-dialog>

    <el-dialog v-model="deleteVisible" title="批量删除备件" width="min(800px, 96vw)" :close-on-click-modal="!deleteSubmitting" :close-on-press-escape="!deleteSubmitting" :show-close="!deleteSubmitting" destroy-on-close>
      <p class="delete-summary">本次选择 {{ deletePreview.results.length }} 条，<strong>可删除 {{ deletePreview.eligibleCount }} 条</strong><span v-if="deletePreview.blockedCount">，{{ deletePreview.blockedCount }} 条不能删除，将保留</span>。</p>
      <p class="form-tip">只删除下方“可删除”记录，历史流水保留。提交时会再次校验库存、盘点和设备关系。</p>
      <el-table :data="deletePreview.results" max-height="350" border>
        <el-table-column prop="materialCode" label="物料编码" width="130" />
        <el-table-column prop="materialDesc" label="备件名称" min-width="210" />
        <el-table-column label="校验结果" min-width="250"><template #default="{row}"><span :class="row.canDelete?'deletion-allowed':'deletion-blocked'">{{ row.canDelete?'可删除':row.reason }}</span></template></el-table-column>
      </el-table>
      <template #footer><el-button :disabled="deleteSubmitting" @click="deleteVisible=false">取消</el-button><el-button v-write type="danger" :disabled="!deletePreview.eligibleCount" :loading="deleteSubmitting" @click="submitBatchDelete">确认删除 {{ deletePreview.eligibleCount }} 条</el-button></template>
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
        <el-button v-write type="primary" :loading="stockSubmitting" @click="submitStock">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量出入库" width="min(820px, 96vw)" destroy-on-close>
      <el-form label-position="top"><div class="stock-meta-grid"><el-form-item label="操作类型"><el-segmented v-model="batchForm.type" :options="[{label:'批量入库',value:'in'},{label:'批量出库',value:'out'}]" block /></el-form-item><el-form-item label="原因分类" required><el-select v-model="batchForm.reasonCode" placeholder="请选择原因" style="width:100%"><el-option v-for="item in batchReasonOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div><el-form-item label="领用/经办人"><el-input v-model="batchForm.recipient" maxlength="50" placeholder="填写本次领用人或经办人" /></el-form-item><el-form-item label="原因说明"><el-input v-model="batchForm.reasonDetail" type="textarea" :rows="2" maxlength="200" show-word-limit /></el-form-item></el-form>
      <el-table :data="batchRows" border max-height="320"><el-table-column label="备件" min-width="300"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }} · 当前 {{ row.totalStock }} {{ row.unit }}</span></div></template></el-table-column><el-table-column label="本次数量" width="180"><template #default="{row}"><el-input-number v-model="row.quantity" :min="1" :max="batchForm.type==='out'?Number(row.totalStock):999999" controls-position="right" style="width:100%" /></template></el-table-column></el-table>
      <template #footer><el-button @click="batchVisible=false">取消</el-button><el-button v-write type="primary" :loading="batchSubmitting" @click="submitBatch">确认批量调整</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import PartModelDetail from '../components/PartModelDetail.vue'
import { collectFilteredParts } from '../utils/selection.mjs'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { batchDeleteParts, batchUpdateStock, createPart, deletePart, downloadPartsImportErrorReport, downloadPartsImportTemplate, exportParts, getDashboard, getFilters, getMovementReasons, getPart, getParts, importParts, previewPartsImport, updatePart, updateStock } from '../api'
import { canEditAnyWorkshop, canEditWorkshop, showControl } from '../auth'
import { INVENTORY_SCOPE_KEYS, inventoryScope, inventoryRouteQuery } from '../utils/inventory-scope.mjs'

const router = useRouter()
const route = useRoute()
function readStored(key, fallback) { try { const value=JSON.parse(window.localStorage.getItem(key)||'null'); return value ?? fallback } catch { return fallback } }
const loading = ref(false)
const list = ref([])
const total = ref(0)
const areas = ref([])
const partTypes = ref([])
const workshops = ref([])
const dashboard = ref({ partTypes: 0, inventoryRecords: 0, totalStock: 0, totalValue: 0, lowStock: 0, missingReorderPoint:0, unconfiguredStock: 0, pendingApproval: 0, unitTotals: [] })
const hasRouteScope = route.query.scope || INVENTORY_SCOPE_KEYS.some(key => route.query[key] !== undefined)
const savedQuery = hasRouteScope ? {} : readStored('spare-parts-inventory-filters', {})
const routeWorkshop = ['raw_grain','qu_making','brewing'].includes(String(route.query.workshopCode || '')) ? String(route.query.workshopCode) : ''
const query = reactive({ page: 1, pageSize: 20, searchKeyword: '', workshopCode: routeWorkshop, warehouseAreaName: '', partType: '', stockStatus: '', sort: 'name', lowStock: undefined, ...savedQuery, ...(hasRouteScope ? inventoryScope(route.query) : {}) })
const typeBreakdownVisible = ref(false)
function scopeType(row,type){ return row.typeSummaries?.find(item=>item.partType===type) || {} }
function quantities(items=[]){ return items.map(item=>`${formatNumber(item.total)}${item.unit}`).join('、') || '—' }
const detailVisible = ref(false)
const currentPart = ref(null)
const stockVisible = ref(false)
const stockPart = ref(null)
const stockSubmitting = ref(false)
const stockForm = reactive({ type: 'in', quantity: 1, reasonCode: '', reasonDetail: '', recipient: '' })
const movementReasons = ref({ in: [], out: [] })
const selectedRows = ref([])
const inventoryTable = ref(null)
const selectingAll = ref(false)
const exporting = ref(false)
const selectablePageRows = computed(() => list.value.filter(row => showControl(canEditWorkshop(row.workshopCode))))
const pageSelected = computed(() => selectablePageRows.value.length > 0 && selectablePageRows.value.every(row => selectedRows.value.some(item => item._id === row._id)))
const pageIndeterminate = computed(() => !pageSelected.value && selectablePageRows.value.some(row => selectedRows.value.some(item => item._id === row._id)))
const allFilteredSelected = computed(() => total.value > 0 && selectedRows.value.length >= total.value)
let selectAllToken = 0, syncingSelection = false
function onSelectionChange(rows) { if (!syncingSelection) selectedRows.value = rows }
function toggleCurrentPage(value) {
  syncingSelection = true
  for (const row of selectablePageRows.value) inventoryTable.value?.toggleRowSelection(row, value)
  syncingSelection = false
  selectedRows.value = value ? [...new Map([...selectedRows.value, ...selectablePageRows.value].map(row => [row._id, row])).values()] : selectedRows.value.filter(row => !selectablePageRows.value.some(item => item._id === row._id))
}
async function selectAllFiltered() {
  const token = ++selectAllToken
  const filters = { ...query }
  selectingAll.value = true
  try {
    const rows = await collectFilteredParts(getParts, filters, row => showControl(canEditWorkshop(row.workshopCode)), () => token === selectAllToken)
    if (!rows) return
    syncingSelection = true
    inventoryTable.value?.clearSelection()
    for (const row of rows) inventoryTable.value?.toggleRowSelection(row, true)
    selectedRows.value = rows
    if (!rows.length) ElMessage.info('当前筛选没有可操作的备件')
  } catch (error) { ElMessage.warning(error.message || '全选失败，请重试') }
  finally { syncingSelection = false; if (token === selectAllToken) selectingAll.value = false }
}
const deleteVisible = ref(false)
const deleteChecking = ref(false)
const deleteSubmitting = ref(false)
const deletePreview = ref({results:[],eligibleIds:[],eligibleCount:0,blockedCount:0})
const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchRows = ref([])
const batchForm = reactive({ type: 'out', reasonCode: '', reasonDetail: '', recipient: '' })
const columnOptions = [
  { value: 'workshop', label: '所属车间' }, { value: 'partType', label: '备件类型' }, { value: 'spec', label: '规格型号' },
  { value: 'location', label: '货区 / 库位' }, { value: 'reorderPoint', label: '订购点' }, { value: 'status', label: '库存状态' }
]
const visibleColumns = ref(readStored('spare-parts-inventory-columns-v2', ['spec','location','reorderPoint','status']))
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
const editVisible = ref(false)
const editSubmitting = ref(false)
const editTarget = ref(null)
const editForm = reactive({ workshopCode:'', materialCode:'', materialDesc:'', spec:'', partType:'', brand:'', unit:'个', warehouseAreaName:'', locationCode:'', locationNote:'', reorderPoint:null, maxStock:null, price:null, usageDescription:'', remark:'' })
let listRequestToken = 0
const editableWorkshops = computed(() => workshops.value.filter(item => canEditWorkshop(item.code)))
const currentWorkshopName = computed(() => query.workshopCode ? `${workshops.value.find(item => item.code === query.workshopCode)?.name || '当前车间'}的` : '全部车间的')
const currentReasonOptions = computed(() => movementReasons.value[stockForm.type] || [])
const batchReasonOptions = computed(() => movementReasons.value[batchForm.type] || [])
const createUsesArea = computed(() => createForm.workshopCode !== 'qu_making')
const editUsesArea = computed(() => editForm.workshopCode !== 'qu_making')
const unitSummary = computed(() => {
  const totals = dashboard.value.unitTotals || []
  if (!totals.length) return '库存数量按单位独立统计'
  return totals.map(item => `${formatNumber(item.total)}${item.unit}`).join('、')
})

function formatNumber(value) { return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:4}).format(Number(value) || 0) }
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
function workshopName(code) { return workshops.value.find(item => item.code === code)?.name || code || '未分车间' }

async function load() {
  const token = ++listRequestToken
  loading.value = true
  try {
    const result = await getParts({ ...query })
    if (token !== listRequestToken) return
    list.value = result.data || []
    total.value = Number(result.total) || 0
  } finally {
    if (token === listRequestToken) loading.value = false
  }
}

async function loadDashboard() {
  const token=++dashboardToken
  const result = await getDashboard({ ...query })
  if(token!==dashboardToken)return
  dashboard.value = result.data?.dashboard || dashboard.value
}
let dashboardToken=0

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

function search() { query.page = 1; clearSelection(); Promise.allSettled([load(), loadDashboard(), loadFilters()]) }
function workshopChanged(){ query.warehouseAreaName=''; search() }
function resetFilters() {
  Object.assign(query, { page: 1, searchKeyword: '', workshopCode: '', warehouseAreaName: '', partType: '', stockStatus: '', sort: 'name', lowStock: undefined })
  clearSelection()
  Promise.allSettled([load(), loadDashboard(), loadFilters()])
}
function showLowStock() { query.lowStock = '1'; query.sort = 'stockAsc'; search() }
function clearLowStock() { query.lowStock = undefined; query.sort = 'name'; search() }
function openDetail(row) {
  currentPart.value = row
  detailVisible.value = true
}
async function openLinkedPart(){const id=route.query.inventoryId;if(typeof id!=='string'||!/^\d+$/.test(id))return;try{const result=await getPart(id);if(result.data)openDetail(result.data)}catch{ElMessage.warning('引用的库存记录不存在或已停用')}}
function locate3d(row) { router.push({ path: '/warehouse-3d', query: { partId: row._id, workshopCode: row.workshopCode } }) }
function goScoped(path, extra={}) { router.push({ path, query: inventoryRouteQuery(query,extra) }) }
function goStatistics(partType) { goScoped('/statistics',partType?{partType}:{}) }
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
function openEdit(row) {
  if (!canEditWorkshop(row.workshopCode)) return ElMessage.warning('当前账号只能编辑所属车间备件')
  editTarget.value = row
  Object.assign(editForm, {
    workshopCode:row.workshopCode, materialCode:row.materialCode||'', materialDesc:row.materialDesc||'',
    spec:row.spec||'', partType:row.partType||'', brand:row.brand||'', unit:row.unit||'个',
    warehouseAreaName:row.warehouseAreaName||'', locationCode:row.locationType==='free_text'?'':(row.locationCode||''),
    locationNote:row.locationNote||'', reorderPoint:row.reorderPoint ?? null, maxStock:row.maxStock ?? null,
    price:row.price ?? null, usageDescription:row.usageDescription||'', remark:row.remark||''
  })
  detailVisible.value = false
  editVisible.value = true
}
async function submitEdit() {
  if (!editTarget.value || !editForm.materialCode.trim() || !editForm.materialDesc.trim() || (editUsesArea.value && !editForm.warehouseAreaName.trim())) return ElMessage.warning(`请完整填写物料编码、物料名称${editUsesArea.value?'和货区':''}`)
  if (editForm.locationCode && !/^\d{6}$/.test(editForm.locationCode)) return ElMessage.warning('六位库位码必须是6位数字')
  editSubmitting.value=true
  try {
    const result=await updatePart(editTarget.value._id,{...editForm,locationType:editUsesArea.value&&editForm.locationCode?'shelf':'free_text'})
    ElMessage.success(result.msg||'备件信息已保存')
    editVisible.value=false
    if(currentPart.value?._id===editTarget.value._id)currentPart.value=result.data
    await refreshAll()
  } finally { editSubmitting.value=false }
}
async function removePart(row) {
  try {
    await ElMessageBox.confirm(`确认删除“${row.materialCode} ${row.materialDesc}”吗？仅零库存、无待审批盘点且未关联设备型号的备件可以删除；历史流水会保留。`,'删除备件',{type:'warning',confirmButtonText:'确认删除'})
  } catch { return }
  try { await deletePart(row._id) } catch(error) {
    const reason=error.response?.data?.details?.results?.find(item=>!item.canDelete)?.reason
    if(reason)ElMessage.warning(reason)
    return
  }
  ElMessage.success('备件已从一览中删除，历史流水已保留')
  if(currentPart.value?._id===row._id){detailVisible.value=false;currentPart.value=null}
  clearSelection()
  await refreshAll()
}
function clearSelection(){selectAllToken++;selectingAll.value=false;inventoryTable.value?.clearSelection();selectedRows.value=[]}
async function openBatchDelete(){
  if(!selectedRows.value.length)return
  if(selectedRows.value.length>200)return ElMessage.warning('每次最多删除200条备件，请减少选择')
  deleteChecking.value=true
  try{const result=await batchDeleteParts(selectedRows.value.map(row=>row._id),true);deletePreview.value=result.data;deleteVisible.value=true}finally{deleteChecking.value=false}
}
async function submitBatchDelete(){
  const ids=[...deletePreview.value.eligibleIds]
  if(!ids.length||deleteSubmitting.value)return
  deleteSubmitting.value=true
  try{
    const result=await batchDeleteParts(ids)
    ElMessage.success(result.msg);deleteVisible.value=false
    if(ids.includes(currentPart.value?._id)){detailVisible.value=false;currentPart.value=null}
    clearSelection();await refreshAll()
  }catch(error){
    if(error.response?.data?.details?.results)deletePreview.value=error.response.data.details
  }finally{deleteSubmitting.value=false}
}
function openImport() { importWorkshopCode.value=defaultEditableWorkshop(); importFile.value=null; importPreview.value=null; importUploadRef.value?.clearFiles(); importVisible.value=true }
function handleImportFile(file) { importFile.value=file.raw || null; importPreview.value=null }
function clearImportFile() { importFile.value=null; importPreview.value=null }
function saveBlob(blob, name) { const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url) }
async function exportCurrent() { exporting.value=true; try { const blob=await exportParts({ ...query, page: undefined, pageSize: undefined }); saveBlob(blob, `备件台账-${new Date().toISOString().slice(0,10)}.xlsx`); ElMessage.success(`已导出 ${total.value} 条当前筛选结果`) } finally { exporting.value=false } }
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
    clearSelection()
    await Promise.all([load(), loadDashboard()])
  } finally { batchSubmitting.value = false }
}

watch(query, value => window.localStorage.setItem('spare-parts-inventory-filters', JSON.stringify({ pageSize: value.pageSize, searchKeyword: value.searchKeyword, workshopCode:value.workshopCode, warehouseAreaName: value.warehouseAreaName, partType:value.partType, stockStatus:value.stockStatus, sort: value.sort, lowStock: value.lowStock })), { deep: true })
watch(visibleColumns, value => window.localStorage.setItem('spare-parts-inventory-columns-v2', JSON.stringify(value)), { deep: true })
watch(() => stockForm.type, () => { stockForm.reasonCode = '' })
watch(() => batchForm.type, () => { batchForm.reasonCode = '' })
watch(importWorkshopCode, () => { importPreview.value = null })
watch(() => createForm.workshopCode, code => {
  if (code === 'qu_making') { createForm.warehouseAreaName=''; createForm.locationCode='' }
})
watch(()=>route.query.inventoryId,openLinkedPart)
onMounted(() => Promise.allSettled([refreshAll(), loadOperationOptions(),openLinkedPart()]))
</script>

<style scoped>
.table-toolbar{gap:12px;flex-wrap:wrap}.table-actions .el-button+.el-button{margin-left:0}.selection-count{color:var(--primary);font-size:12px;white-space:nowrap}.table-actions{margin-left:auto}
.selection-header{display:flex;align-items:center;gap:6px;white-space:nowrap}.select-filtered-link{border:0;background:transparent;color:var(--primary);cursor:pointer;font-size:12px;padding:0}.select-filtered-link:disabled{cursor:not-allowed;opacity:.55}.all-selected-label{color:var(--success,#198754);font-size:12px}

.metric-unit-list{display:flex;flex-wrap:wrap;gap:5px 12px;margin:12px 0;line-height:1.5}.metric-unit-list span{white-space:nowrap;font-size:13px}.metric-unit-list strong{margin-right:3px;font-size:20px}.scope-dialog-note{color:#667085;line-height:1.7;font-size:13px}.scope-dialog-total{display:flex;gap:20px;flex-wrap:wrap;padding:12px 0 18px}.scope-dialog-total strong{color:#9d1822}.scope-missing{display:block;color:#b45309;margin-top:4px}
.inventory-selection-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:var(--brand-soft);border-bottom:1px solid var(--line)}.inventory-selection-bar strong{font-size:13px}.inventory-selection-bar strong span{font-size:12px;font-weight:400;color:var(--muted)}.inventory-selection-bar>div{display:flex;flex-wrap:wrap;gap:6px}.inventory-selection-bar .el-button+.el-button{margin-left:0}.delete-summary{line-height:1.7}.deletion-allowed{color:var(--success)}.deletion-blocked{color:var(--danger);white-space:normal}.inventory-detail-dialog .detail-card{width:100%;max-height:84vh;box-shadow:none;border:0}.detail-card-footer{flex-wrap:wrap}:global(.inventory-detail-dialog){display:block;max-height:84vh;padding:0;border-radius:20px;overflow:hidden}:global(.inventory-detail-dialog .el-dialog__header){padding:0;height:0;overflow:hidden}:global(.inventory-detail-dialog .el-dialog__body){padding:0}@media(max-width:680px){.inventory-selection-bar{align-items:flex-start;flex-direction:column}.part-form-grid{grid-template-columns:1fr}.part-form-grid .span-2{grid-column:auto}}
.inventory-metric-grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.metric-card:is(button){width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer}.metric-card.is-quality{border-top-color:#7a8798}.metric-card.is-quality .metric-icon{color:#536171;background:#f1f3f5}.filter-row{grid-template-columns:minmax(135px,.7fr) minmax(300px,1.65fr) minmax(175px,.85fr) minmax(165px,.8fr) auto;align-items:end}.filter-actions{display:flex;gap:8px;white-space:nowrap}.table-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.column-picker strong{display:block;margin-bottom:8px}.column-picker .el-checkbox-group{display:grid}.stock-meta-grid,.part-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.part-form-grid{margin-top:16px}.part-form-grid .span-2{grid-column:1/-1}.detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.table-filter-head{display:flex;align-items:center;gap:5px}.table-filter-head.is-center{justify-content:center}.header-filter-button{display:inline-grid;place-items:center;padding:2px;border:0;background:transparent;color:#a0a8b5;cursor:pointer}.header-filter-button:hover,.header-filter-button.active{color:var(--primary)}
.material-name-cell{display:block;overflow:visible;white-space:normal;overflow-wrap:anywhere;word-break:break-word;color:var(--ink);font-size:13px;line-height:1.55}.material-code-cell{display:block;color:#667085;background:transparent;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;white-space:normal;overflow-wrap:anywhere}.material-cell{min-width:0;overflow:hidden;display:flex;align-items:center;gap:8px}.material-cell strong{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:13px;flex:1;min-width:0}.material-cell span{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px;flex-shrink:0;max-width:130px}.spec-cell{display:block;color:#4b5563;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.location-cell{display:inline-flex;align-items:center;gap:6px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.stock-number{font-size:15px;font-weight:800}.stock-number.is-low{color:var(--danger)}
.import-workshop-row{width:100%;display:grid;grid-template-columns:1fr auto;gap:10px}.field-hint{display:block;margin-top:6px;color:#7c8798}.import-preview{padding:12px;border:1px solid #b7e4ce;border-radius:12px;background:#f0fbf5}.import-preview.has-errors{border-color:#f2c0c4;background:#fff5f5}.import-preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
:deep(.el-table .cell){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1250px){.filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-actions{grid-column:span 2;justify-content:flex-end}}@media(max-width:680px){.inventory-metric-grid{grid-template-columns:1fr}.filter-row{grid-template-columns:1fr}.filter-actions{grid-column:auto}.stock-meta-grid{grid-template-columns:1fr}.detail-actions .el-button{flex:1}.import-workshop-row{grid-template-columns:1fr}}
.inventory-type-links{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.inventory-type-links button{padding:8px 12px;border:1px solid #e0e5ed;border-radius:8px;color:#334155;background:#fff;cursor:pointer;font:inherit;font-size:13px}.inventory-type-links span{margin-left:8px;color:#a51c26}.inventory-type-links button:hover{border-color:#a51c26}
:deep(.scope-breakdown-table .cell){white-space:normal;overflow-wrap:anywhere;line-height:1.6}

.detail-card .detail-heading{flex:1;min-width:0}
.detail-card .detail-heading h2{font-size:19px;line-height:1.5;overflow-wrap:anywhere}
.detail-card .detail-heading p{overflow-wrap:anywhere}
.detail-card .detail-stock{flex:0 0 auto;min-width:100px;white-space:nowrap}
.detail-card .detail-stock strong{font-size:28px;line-height:1.4}
.detail-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;border-top:1px solid var(--line);border-left:1px solid var(--line)}
.detail-field{display:grid;grid-template-columns:100px minmax(0,1fr);min-width:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.detail-field-wide{grid-column:1/-1}
.detail-field dt,.detail-field dd{margin:0;padding:12px;line-height:1.65;overflow-wrap:anywhere}
.detail-field dt{background:#f5f7fa;font-weight:600;border-right:1px solid var(--line)}
.detail-field dd{white-space:pre-wrap;min-width:0}
@media(max-width:680px){
.detail-card .detail-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px}
.detail-card .detail-heading h2{font-size:16px}
.detail-card .detail-stock{grid-column:1/-1;text-align:left}
.detail-fields{grid-template-columns:minmax(0,1fr)}
.detail-field{grid-template-columns:88px minmax(0,1fr)}
.detail-field dt,.detail-field dd{padding:10px}
}
.summary-scope{font-size:12px;color:var(--muted)}
.material-name-cell,.spec-cell{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;line-height:1.6}
.spec-cell{font-weight:400;font-size:13px}
</style>
