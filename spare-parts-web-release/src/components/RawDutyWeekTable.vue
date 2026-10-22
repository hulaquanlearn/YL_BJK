<template>
 <section class="week-record">
  <header class="week-record-heading"><strong>{{ name ? name+' · 每周工作记录' : '每周工作记录' }}</strong><span>{{ start }} 至 {{ model.days[6]?.date }}</span></header>
  <p class="week-mobile-tip">左右滑动查看周一至周日，点击记录格查看详情</p>
  <div class="week-sheet-scroll"><table class="week-sheet" aria-label="每周工作记录表">
   <colgroup><col class="category-col"/><col class="content-col"/><col class="frequency-col"/><col class="evidence-col"/><col v-for="d in model.days" :key="d.date"/></colgroup>
   <thead><tr><th class="category-head">工作事项</th><th class="content-head">工作内容</th><th>频次</th><th>输出依据</th><th v-for="d in model.days" :key="d.date" class="date-head"><b>{{ d.name }} · 验证记录</b><span>{{ d.shortDate }}</span></th></tr></thead>
   <tbody><tr v-for="row in groupedRows" :key="row.id">
    <th v-if="row.categorySpan" :rowspan="row.categorySpan" class="category-cell">{{ row.category || '其他' }}</th>
    <th class="content-cell"><strong>{{ row.title }}</strong><small v-if="row.legacySummary">{{ row.legacySummary }}</small></th>
    <td class="frequency-cell">{{ row.frequency==='每班'?'每日':row.frequency }}</td><td class="evidence-cell">{{ row.evidence || '—' }}</td>
    <td v-for="c in row.cells" :key="c.date" :colspan="c.span" class="record-cell"><button type="button" :class="c.tone" :aria-label="row.title+' '+c.date+' '+c.text" @click="$emit('choose',row,c.date)"><span class="cell-result">{{ c.text }}</span><small v-if="c.detail">{{ c.detail }}</small><small v-if="c.text!=='—' && c.result && c.photoCount">{{ c.photoCount }}张图片</small></button></td>
   </tr></tbody>
  </table></div>
 </section>
</template>
<script setup>
import {computed} from 'vue'
import {weekTable} from '../utils/raw-duty-week-table.mjs'
const props=defineProps({entries:Array,checks:Array,calendar:Object,start:String,today:String,legacy:Boolean,name:String})
defineEmits(['choose'])
const model=computed(()=>weekTable(props.entries||[],props.checks||[],props.calendar||{},props.start,props.today,props.legacy))
const groupedRows=computed(()=>{
 const rows=model.value.rows.map(row=>({...row,categorySpan:0}))
 for(let index=0;index<rows.length;){let end=index+1;while(end<rows.length&&rows[end].category===rows[index].category)end++;rows[index].categorySpan=end-index;index=end}
 return rows
})
</script>
<style scoped>
.week-record{min-width:0;margin-bottom:20px}.week-record-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:4px 0 14px;color:#263b52}.week-record-heading strong{font-size:18px;font-weight:650}.week-record-heading>span{color:#7b8ba0;font-size:13px;white-space:nowrap}.week-sheet-scroll{overflow:auto;max-height:58dvh;border:1px solid #dfe6ef;background:#fff}.week-sheet{width:100%;min-width:1320px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:13px;color:#344b62}.category-col{width:82px}.content-col{width:254px}.frequency-col{width:64px}.evidence-col{width:122px}.week-sheet th,.week-sheet td{border-right:1px solid #e0e7ef;border-bottom:1px solid #e0e7ef;vertical-align:top;overflow-wrap:anywhere}.week-sheet th:last-child,.week-sheet td:last-child{border-right:0}.week-sheet tbody tr:last-child>*{border-bottom:0}.week-sheet thead th{position:sticky;top:0;z-index:3;padding:14px 10px;background:#f3f6fa;text-align:left;font-weight:600;line-height:1.6}.date-head b{font-weight:600;white-space:nowrap}.date-head>span{display:block;margin-top:4px;font-size:12px;font-weight:400;color:#8190a4}.category-head,.category-cell{position:sticky;left:0;background:#f3f6fa!important}.week-sheet thead .category-head{z-index:5}.content-head,.content-cell{position:sticky;left:82px;background:#f3f6fa!important}.week-sheet thead .content-head{z-index:5}.week-sheet .category-cell{z-index:2;padding:16px 10px;vertical-align:middle;text-align:left;font-weight:600;line-height:1.7}.week-sheet .content-cell{z-index:2;padding:13px 12px;text-align:left;line-height:1.8}.content-cell strong{font-size:13px;font-weight:600}.week-sheet small{display:block;color:#8290a2;font-size:11px;font-weight:400;line-height:1.6}.content-cell small{margin-top:7px}.frequency-cell,.evidence-cell{padding:13px 10px;line-height:1.8}.frequency-cell{white-space:nowrap}.record-cell{padding:0}.record-cell button{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:5px;width:100%;min-height:82px;height:100%;padding:13px 10px;border:0;border-radius:0;background:#fff;font:inherit;line-height:1.7;text-align:left;cursor:pointer;color:#667990;white-space:normal}.record-cell button:hover{background:#f5f6fd}.record-cell .done .cell-result{color:#16867e;background:#eff8f4}.record-cell .bad .cell-result,.record-cell .missing .cell-result{color:#d14658;background:#fff1f3}.record-cell .pending .cell-result{color:#b57925}.record-cell .muted .cell-result{color:#98a2b2}.record-cell button:focus-visible{outline:2px solid #6263a8;outline-offset:-3px}@media(max-width:760px){.week-record-heading{align-items:flex-start;flex-direction:column;gap:5px}.week-record-heading strong{font-size:16px}.week-sheet-scroll{max-height:50dvh}.week-sheet{min-width:1200px}.category-col{width:72px}.content-col{width:200px}.content-head,.content-cell{left:72px}.week-sheet .content-cell{padding:10px}.week-sheet .category-cell{padding:10px 8px}}
</style>
<style scoped>
.week-mobile-tip{display:none}
@media(max-width:760px){.week-mobile-tip{display:block;font-size:12px;line-height:1.7;color:#7b8ba0;margin:0 0 10px}.category-head,.week-sheet .category-cell{position:static}.content-col{width:160px}.content-head,.content-cell{left:0}.week-sheet-scroll{overscroll-behavior:contain}.week-sheet .content-cell{padding:10px 8px}.content-cell strong{font-size:12px}}
</style>
