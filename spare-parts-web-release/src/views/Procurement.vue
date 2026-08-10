<template>
  <div class="procurement-page">
    <div class="page-head"><div><h2>补货采购跟踪</h2><p>从补货建议到采购、在途、部分到货和完成入库，全过程可追溯。</p></div><div class="head-actions"><el-button @click="$router.push('/replenishment')"><el-icon><ShoppingCartFull /></el-icon>生成补货单</el-button><el-button v-if="isAdmin" type="primary" plain @click="supplierVisible=true"><el-icon><Plus /></el-icon>供应商</el-button><el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button></div></div>

    <section class="procurement-metrics">
      <button type="button" :class="{active:!query.status}" @click="setStatus('')"><span>全部采购单</span><strong>{{ allTotal }}</strong><small>查看完整历史</small></button>
      <button type="button" :class="{active:query.status==='purchasing'}" @click="setStatus('purchasing')"><span>采购中</span><strong>{{ statusCount.purchasing }}</strong><small>数量已计入在途</small></button>
      <button type="button" :class="{active:query.status==='partial_received'}" @click="setStatus('partial_received')"><span>部分到货</span><strong>{{ statusCount.partial_received }}</strong><small>仍有未收数量</small></button>
      <button type="button" :class="{active:query.status==='completed'}" @click="setStatus('completed')"><span>已完成</span><strong>{{ statusCount.completed }}</strong><small>全部入库完成</small></button>
    </section>

    <section class="panel table-panel">
      <div class="table-toolbar"><div><strong>{{ statusLabel(query.status) }}</strong><span class="result-count">共 {{ total }} 条</span></div><span class="procurement-tip">收货后自动增加库存并减少在途</span></div>
      <el-table :data="list" v-loading="loading" row-key="id" empty-text="暂无采购补货单">
        <el-table-column label="采购单" min-width="190"><template #default="{row}"><div class="material-cell"><strong>{{ row.orderNo }}</strong><span>{{ formatTime(row.createdAt) }} · {{ row.createdByName || '管理员' }}</span></div></template></el-table-column>
        <el-table-column label="状态" width="115"><template #default="{row}"><el-tag :type="statusTag(row.status)" effect="light" round>{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="150"><template #default="{row}">{{ row.supplierName || '未指定供应商' }}</template></el-table-column>
        <el-table-column label="到货进度" min-width="210"><template #default="{row}"><div class="progress-copy"><el-progress :percentage="progress(row)" :stroke-width="8" :color="progress(row)===100?'#15936b':'#c91f2c'" /><small>{{ row.receivedItemCount || 0 }} / {{ row.itemCount }} 种已收齐</small></div></template></el-table-column>
        <el-table-column label="预计到货" width="120"><template #default="{row}">{{ row.expectedDate || '未设置' }}</template></el-table-column>
        <el-table-column label="预计金额" width="135" align="right"><template #default="{row}">¥ {{ money(row.estimatedAmount) }}</template></el-table-column>
        <el-table-column label="操作" width="170" align="right"><template #default="{row}"><el-button link type="primary" @click="openDetail(row)">详情</el-button><el-button v-if="isAdmin&&canReceive(row)" link type="success" @click="openReceive(row)">登记到货</el-button><el-button v-if="isAdmin&&canReceive(row)" link type="danger" @click="cancelOrder(row)">取消</el-button></template></el-table-column>
      </el-table>
      <div class="pagination-bar"><span>第 {{ query.page }} 页，每页 {{ query.pageSize }} 条</span><el-pagination v-model:current-page="query.page" :page-size="query.pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></div>
    </section>

    <el-drawer v-model="detailVisible" title="采购单详情" size="min(760px, 94vw)">
      <template v-if="detail"><div class="order-hero"><div><h2>{{ detail.order_no }}</h2><p>{{ detail.supplierName || '未指定供应商' }} · {{ detail.expected_date || '未设置预计到货日' }}</p></div><el-tag :type="statusTag(detail.status)" size="large" round>{{ statusLabel(detail.status) }}</el-tag></div><el-table :data="detail.items" border style="margin-top:18px"><el-table-column label="备件" min-width="260"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</span></div></template></el-table-column><el-table-column label="订购" width="95" align="center"><template #default="{row}">{{ row.orderedQuantity }} {{ row.unit }}</template></el-table-column><el-table-column label="已到" width="95" align="center"><template #default="{row}">{{ row.receivedQuantity }} {{ row.unit }}</template></el-table-column><el-table-column label="未到" width="95" align="center"><template #default="{row}">{{ remaining(row) }} {{ row.unit }}</template></el-table-column></el-table></template>
    </el-drawer>

    <el-dialog v-model="receiveVisible" title="登记采购到货" width="min(760px, 94vw)" destroy-on-close>
      <template v-if="receiveOrder"><div class="receive-tip"><strong>{{ receiveOrder.order_no }}</strong><span>只填写本次实际到货数量；可分多次收货。</span></div><el-form-item label="到货批次号（选填）"><el-input v-model="batchNo" placeholder="例如：送货单号或批次号" /></el-form-item><el-table :data="receiveItems" border max-height="380"><el-table-column label="备件" min-width="270"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }}</span></div></template></el-table-column><el-table-column label="未到数量" width="110" align="center"><template #default="{row}">{{ row.remaining }} {{ row.unit }}</template></el-table-column><el-table-column label="本次到货" width="165"><template #default="{row}"><el-input-number v-model="row.quantity" :min="0" :max="row.remaining" controls-position="right" style="width:100%" /></template></el-table-column></el-table></template>
      <template #footer><el-button @click="receiveVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="submitReceive">确认入库</el-button></template>
    </el-dialog>

    <el-dialog v-model="supplierVisible" title="新增供应商" width="min(560px, 92vw)" destroy-on-close><el-form label-position="top"><div class="supplier-grid"><el-form-item label="供应商编码" required><el-input v-model="supplierForm.supplierCode" /></el-form-item><el-form-item label="供应商名称" required><el-input v-model="supplierForm.supplierName" /></el-form-item><el-form-item label="联系人"><el-input v-model="supplierForm.contactName" /></el-form-item><el-form-item label="联系电话"><el-input v-model="supplierForm.contactPhone" /></el-form-item><el-form-item label="常规交货周期（天）"><el-input-number v-model="supplierForm.leadTimeDays" :min="0" :max="3650" controls-position="right" style="width:100%" /></el-form-item><el-form-item label="默认最小起订量"><el-input-number v-model="supplierForm.minOrderQty" :min="0" controls-position="right" style="width:100%" /></el-form-item></div></el-form><template #footer><el-button @click="supplierVisible=false">取消</el-button><el-button type="primary" :loading="supplierSaving" @click="saveSupplier">保存</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createSupplier, getProcurementOrder, getProcurementOrders, receiveProcurementOrder, updateProcurementOrderStatus } from '../api'
import { getUser } from '../auth'
const loading=ref(false),list=ref([]),total=ref(0),allTotal=ref(0),detailVisible=ref(false),detail=ref(null),receiveVisible=ref(false),receiveOrder=ref(null),receiveItems=ref([]),batchNo=ref(''),submitting=ref(false),supplierVisible=ref(false),supplierSaving=ref(false)
const query=reactive({page:1,pageSize:30,status:''}),supplierForm=reactive({supplierCode:'',supplierName:'',contactName:'',contactPhone:'',leadTimeDays:null,minOrderQty:null})
const isAdmin=getUser()?.role==='admin'
const allRows=ref([])
const statusCount=computed(()=>({purchasing:allRows.value.filter(x=>x.status==='purchasing').length,partial_received:allRows.value.filter(x=>x.status==='partial_received').length,completed:allRows.value.filter(x=>x.status==='completed').length}))
function statusLabel(status){return ({'':'全部采购单',purchasing:'采购中',partial_received:'部分到货',completed:'已完成',cancelled:'已取消'})[status]||status}
function statusTag(status){return status==='completed'?'success':status==='cancelled'?'info':status==='partial_received'?'warning':'danger'}
function progress(row){return Math.min(Math.max(Number(row.receiptProgress)||0,0),100)}
function money(v){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function formatTime(v){return v?String(v).replace('T',' ').slice(0,16):'-'}
function canReceive(row){return ['purchasing','partial_received'].includes(row.status)}
function remaining(row){return Math.max(Number(row.orderedQuantity)-Number(row.receivedQuantity),0)}
async function load(){loading.value=true;try{const [result,all]=await Promise.all([getProcurementOrders({...query}),getProcurementOrders({page:1,pageSize:200})]);list.value=result.data||[];total.value=Number(result.total)||0;allRows.value=all.data||[];allTotal.value=Number(all.total)||0}finally{loading.value=false}}
function setStatus(status){query.status=status;query.page=1;load()}
async function openDetail(row){const result=await getProcurementOrder(row.id);detail.value=result.data;detailVisible.value=true}
async function openReceive(row){const result=await getProcurementOrder(row.id);receiveOrder.value=result.data;receiveItems.value=(result.data.items||[]).map(item=>({...item,remaining:remaining(item),quantity:0})).filter(item=>item.remaining>0);batchNo.value='';receiveVisible.value=true}
async function submitReceive(){const items=receiveItems.value.filter(item=>Number(item.quantity)>0).map(item=>({itemId:item.id,quantity:item.quantity}));if(!items.length)return ElMessage.warning('请填写至少一条本次到货数量');submitting.value=true;try{await receiveProcurementOrder(receiveOrder.value.id,{items,batchNo:batchNo.value});ElMessage.success('到货已入库');receiveVisible.value=false;await load()}finally{submitting.value=false}}
async function cancelOrder(row){try{await ElMessageBox.confirm('取消后，未到货数量将从“在途”中释放。','确认取消采购单',{type:'warning'})}catch{return}await updateProcurementOrderStatus(row.id,{status:'cancelled'});ElMessage.success('采购单已取消');load()}
async function saveSupplier(){if(!supplierForm.supplierCode.trim()||!supplierForm.supplierName.trim())return ElMessage.warning('请填写供应商编码和名称');supplierSaving.value=true;try{await createSupplier({...supplierForm});ElMessage.success('供应商已创建');supplierVisible.value=false;Object.assign(supplierForm,{supplierCode:'',supplierName:'',contactName:'',contactPhone:'',leadTimeDays:null,minOrderQty:null})}finally{supplierSaving.value=false}}
onMounted(load)
</script>

<style scoped>
.procurement-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:18px}.procurement-metrics button{padding:18px 20px;border:1px solid #e3e6eb;border-top:3px solid #dba1a6;border-radius:16px;color:#172033;background:#fff;box-shadow:0 8px 22px #1720330a;cursor:pointer;text-align:left;transition:.2s}.procurement-metrics button:hover,.procurement-metrics button.active{transform:translateY(-2px);border-color:#d5757e;box-shadow:0 12px 28px #8f172015}.procurement-metrics span,.procurement-metrics strong,.procurement-metrics small{display:block}.procurement-metrics span{color:#687386;font-size:12px;font-weight:800}.procurement-metrics strong{margin-top:8px;font-size:27px}.procurement-metrics small{margin-top:5px;color:#8a93a4;font-size:12px}.procurement-tip{color:#758094;font-size:12px}.progress-copy small{display:block;margin-top:4px;color:#7e8795;font-size:12px}.order-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px;border-radius:15px;background:#f7f8fa}.order-hero h2{margin:0;font-size:21px}.order-hero p{margin:5px 0 0;color:#758094}.receive-tip{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding:13px 15px;border-radius:11px;color:#355044;background:#eefaf6}.receive-tip span{font-size:12px}.supplier-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}@media(max-width:900px){.procurement-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.procurement-metrics,.supplier-grid{grid-template-columns:1fr}}
</style>
