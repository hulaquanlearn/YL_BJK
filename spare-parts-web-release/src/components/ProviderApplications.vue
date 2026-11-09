<template><section class="provider-applications" aria-label="应用与模型"><h4>应用与模型</h4><ul v-if="groups.length"><li v-for="item in groups" :key="item.key"><div class="application-heading"><strong>{{item.app}}</strong><span>{{item.route}}</span></div><code>{{item.model}}</code><p>{{item.purposes.join('、')}}</p><small v-if="item.accountLabel">当前使用 {{item.accountLabel}}</small><p v-if="item.estimatedCalls" class="application-expense"><strong>{{item.unknownCalls?'已知调用估算':'本月用途估算'}} ${{money(item.min)}}–${{money(item.max)}}</strong><a :href="usage?.expenses?.priceSource||'https://api-docs.deepseek.com/quick_start/pricing/'" target="_blank" rel="noopener noreferrer" title="按用途汇总，可能含切换前密钥；区间包含峰谷和缓存差异，不是当前账户实付账单">估算依据 ↗</a><small>{{item.expenseFrom}} 至 {{item.expenseTo}}<template v-if="item.unknownCalls"> · 另有 {{item.unknownCalls}} 次费用待核</template></small></p><p v-else-if="item.hasExpenses" class="expense-note">{{item.unknownCalls?item.unknownCalls+' 次调用费用待核':'本月暂无已记录调用'}}</p><p v-else-if="provider==='glm'&&usage?.glm?.totalSpent!=null" class="expense-note">平台累计 ¥{{usage.glm.totalSpent}} · 共享账单未拆分</p><p v-else-if="provider==='hunyuan'&&usage?.hunyuan?.status==='ok'" class="expense-note">平台套餐已用 {{credits(usage.hunyuan.plans?.reduce((n,p)=>n+(Number(p.used)||0),0))}} 积分 · 共享额度</p><p v-else class="expense-note">应用费用未提供</p></li></ul><p v-else class="empty">暂无已读取的启用配置</p></section></template>
<script setup>
import {computed} from 'vue'
const props=defineProps({provider:String,inventory:Object,usage:Object})
const money=value=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8})
const credits=value=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2})
const groups=computed(()=>{
 const map=new Map()
 for(const row of props.inventory?.rows||[]){
  if(row.provider!==props.provider||!row.enabled||!row.model)continue
  const route=row.route?.startsWith('OpenClaw')?'经 OpenClaw':row.route||'API',key=[row.app,row.model,route,row.accountMatch,row.accountLabel||''].join('|')
  if(!map.has(key))map.set(key,{key,app:row.app,model:row.model,route,accountMatch:row.accountMatch,accountLabel:row.accountLabel,purposes:[],min:0,max:0,estimatedCalls:0,unknownCalls:0,hasExpenses:false})
  if(!map.get(key).purposes.includes(row.purpose))map.get(key).purposes.push(row.purpose)
  if(row.expense){const item=map.get(key);item.hasExpenses=true;for(const k of ['min','max','estimatedCalls','unknownCalls'])item[k]+=row.expense[k]||0;item.expenseFrom=row.expenseFrom;item.expenseTo=row.expenseTo}
 }
 return [...map.values()]
})
</script>
<style scoped>
.provider-applications{border-top:1px solid #e7edf1;padding-top:16px;margin-top:20px;min-width:0}.provider-applications h4{font-size:12px;font-weight:500;color:#7a8b99;margin:0 0 12px}.provider-applications ul{list-style:none;margin:0;padding:0;display:grid;gap:16px}.application-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:5px}.application-heading strong{font-size:14px;color:#2c4559}.application-heading span{font-size:10px;color:#7a8b99;white-space:nowrap}.provider-applications code{display:inline-block;max-width:100%;overflow-wrap:anywhere;border-radius:4px;padding:3px 6px;background:#f0f5f8;color:#285776;font-size:12px}.provider-applications p{font-size:12px;line-height:1.7;color:#617588;margin:5px 0 0}.provider-applications small{font-size:11px;color:#956b37;line-height:1.6}.empty{color:#7a8b99}
.application-expense{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap}.application-expense>strong{font-size:13px;color:#285e53}.application-expense>a{font-size:11px;color:#087f83;text-decoration:none}.application-expense>small{width:100%;color:#7a8b99}.provider-applications .expense-note{color:#667b8c;font-size:12px}
</style>
