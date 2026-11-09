<template>
 <div class="app-count-orders">
  <nav class="count-status-tabs" aria-label="盘点状态">
   <button v-for="tab in tabs" :key="tab.value" type="button" :class="{active:query.status===tab.value}" :aria-pressed="query.status===tab.value" @click="$emit('status',tab.value)"><span>{{ tab.label }}</span><b>{{ error?'—':summary[tab.key]||0 }}</b></button>
  </nav>
  <section class="count-app-filters" aria-label="筛选盘点记录">
   <div class="count-app-field"><span>{{ query.date || '全部日期' }}</span><el-icon><Calendar /></el-icon><input aria-label="筛选盘点日期" type="date" :value="query.date" @change="$emit('date',$event.target.value)" /></div>
   <button class="count-refresh" type="button" aria-label="刷新盘点记录" :disabled="loading" @click="$emit('refresh')"><el-icon><Refresh /></el-icon>{{ loading?'刷新中':'刷新' }}</button>
   <button v-if="hasFilters" class="count-clear-filters" type="button" @click="$emit('reset')">清除筛选</button>
  </section>
  <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button @click="$emit('refresh')">重试</el-button></el-alert>
  <div class="count-app-list" v-loading="loading" aria-label="盘点单列表">
   <button v-for="row in rows" :key="row._id" type="button" class="count-order-card" @click="$emit('detail',row)">
    <header><strong>{{ row.inventoryDate || '日期未记录' }} 盘点</strong><span class="count-order-status" :class="{'approved':row.approveStatus==='已通过','rejected':row.approveStatus==='已驳回'}">{{ row.approveStatus }}</span></header>
    <p>{{ workshopName(row.workshopCode) }}<span>·</span>{{ row.inventoryUser }}</p>
    <div class="count-order-result"><span>盘点 <b>{{ row.inventoryAllList?.length || 0 }}</b> 项</span><span v-if="count(row).differenceCount" class="difference"><b>{{ count(row).differenceCount }}</b> 项账实不符</span><span v-else-if="!count(row).unverifiedCount">账实一致</span><span v-if="count(row).unverifiedCount" class="difference">{{ count(row).unverifiedCount }} 项实盘数待核实</span></div>
    <p v-if="row.inventoryRemark && row.inventoryRemark!=='无说明'" class="count-order-note">{{ row.inventoryRemark }}</p>
    <footer><small>{{ row.inventoryNo }}</small><span>详情<el-icon><ArrowRight /></el-icon></span></footer>
   </button>
   <el-empty v-if="!loading&&!error&&!rows.length" :description="hasFilters?'没有符合筛选条件的盘点单':'还没有盘点记录'" />
  </div>
  <div v-if="total>query.pageSize" class="count-app-pagination"><el-pagination :current-page="query.page" :page-size="query.pageSize" :total="total" layout="prev, pager, next" :pager-count="5" @current-change="$emit('page',$event)" /></div>
  <div v-if="canCreate" class="count-app-create"><button type="button" @click="$emit('create')"><el-icon><Plus /></el-icon>开始新盘点</button></div>
 </div>
</template>
<script setup>
import {inventoryCountSummary} from '../utils/inventory-count.mjs'
const props=defineProps({query:{type:Object,required:true},summary:{type:Object,required:true},rows:{type:Array,default:()=>[]},total:Number,loading:Boolean,error:String,isAdmin:Boolean,canCreate:Boolean,hasFilters:Boolean,workshops:{type:Array,required:true}})
defineEmits(['status','date','reset','refresh','detail','page','create'])
const tabs=[{label:'全部',value:'',key:'total'},{label:'待审批',value:'待审批',key:'pending'},{label:'已通过',value:'已通过',key:'approved'},{label:'已驳回',value:'已驳回',key:'rejected'}]
const workshopName=code=>props.workshops.find(w=>w.code===code)?.name||''
const count=inventoryCountSummary
</script>
<style scoped>
.app-count-orders{padding-bottom:88px;color:#203449}.count-refresh{white-space:nowrap;color:#617386;display:flex;align-items:center;gap:5px;padding:8px 10px;min-height:44px;border:0;background:none;font:inherit}.count-status-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid #e2e7ed;margin-bottom:18px;gap:6px}.count-status-tabs button{position:relative;display:flex;justify-content:center;align-items:center;gap:5px;min-height:48px;padding:6px 0 13px;background:none;border:0;color:#617386;font:inherit;font-size:13px;white-space:nowrap}.count-status-tabs button.active{color:#ab2843;font-weight:700}.count-status-tabs button.active:after{content:'';position:absolute;left:22%;right:22%;height:3px;bottom:-1px;background:#ab2843;border-radius:3px}.count-status-tabs b{font-size:11px;padding:2px 5px;border-radius:5px;background:#e9edf2;font-variant-numeric:tabular-nums}.count-status-tabs .active b{background:#f6e6ea}
.count-app-filters{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:18px}.count-app-field{position:relative;display:flex;align-items:center;justify-content:space-between;gap:6px;height:46px;box-sizing:border-box;min-width:0;width:100%;padding:0 12px;background:#fff;border:1px solid #dce3eb;border-radius:10px;color:#263d50;font-size:14px;line-height:20px}.count-app-field>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.count-app-field>.el-icon{color:#8392a0;flex:none}.count-app-field>select,.count-app-field>input{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;opacity:0;font:inherit;cursor:pointer}.count-app-field:focus-within{outline:2px solid #b3465b;outline-offset:2px}.count-clear-filters{grid-column:1/-1;justify-self:end;background:none;border:0;padding:4px 0;color:#9b3048;font:inherit;font-size:12px;min-height:32px}
.count-app-list{display:grid;gap:12px;min-height:70px}.count-order-card{display:block;width:100%;min-width:0;text-align:left;background:#fff;border:1px solid #e0e6ed;border-radius:14px;padding:16px;color:inherit;font:inherit}.count-order-card:focus-visible{outline:2px solid #ab2843;outline-offset:2px}.count-order-card header{display:flex;justify-content:space-between;align-items:center;gap:10px}.count-order-card header strong{font-size:16px;font-weight:650;line-height:24px}.count-order-status{flex:none;font-size:11px;background:#fff3db;color:#8c6517;border-radius:5px;padding:4px 7px}.count-order-status.approved{background:#eaf5ef;color:#2d7d51}.count-order-status.rejected{background:#fbecef;color:#ac3b53}.count-order-card p{display:flex;gap:8px;margin:8px 0 0;font-size:13px;color:#6b7c8f;line-height:20px;overflow-wrap:anywhere}.count-order-result{display:flex;align-items:baseline;gap:20px;flex-wrap:wrap;padding:13px 0;font-size:12px;color:#65798c}.count-order-result b{font-size:18px;color:#203449;margin:0 3px}.count-order-result .difference,.count-order-result .difference b{color:#b43f40}.count-order-card .count-order-note{display:block;margin:0 0 10px}.count-order-card footer{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #f0f2f5;padding-top:11px;font-size:12px;color:#9b3048}.count-order-card footer small{min-width:0;color:#8b98a4;font-size:11px;overflow-wrap:anywhere}.count-order-card footer>span{display:flex;align-items:center;gap:4px;flex:none}.count-app-pagination{display:flex;justify-content:center;margin-top:16px}.count-app-create{position:fixed;bottom:0;left:0;right:0;z-index:20;background:rgba(248,249,252,.97);border-top:1px solid #e7ebf0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));box-sizing:border-box}.count-app-create button{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:48px;border:0;border-radius:11px;background:#ac2d48;color:white;font:inherit;font-size:15px;font-weight:600}
@media(max-width:350px){.count-status-tabs button{font-size:12px;gap:3px}.count-order-card{padding:13px}.count-order-result{gap:12px}}
</style>
