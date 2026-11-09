<template>
 <section class="crane-guide" aria-label="智能行车技术资料">
  <nav aria-label="智能行车资料系统"><button v-for="section in craneGuideSections" :key="section.id" :aria-pressed="selected.id===section.id" @click="selected=section">{{section.title}}</button><button :aria-pressed="selected.id==='program'" @click="selected={id:'program'}">程序与运动轴</button></nav>
  <article v-if="selected.id!=='program'"><div><h3>{{selected.title}}</h3><p>{{selected.summary}}</p><table><caption>主要元器件</caption><thead><tr><th>代号 / 部件</th><th>用途</th></tr></thead><tbody><tr v-for="[name,description] in selected.equipment" :key="name"><th scope="row">{{name}}</th><td>{{description}}</td></tr></tbody></table><p>{{selected.note}}</p></div><div v-if="figures.length" class="crane-figures"><figure v-for="figure in figures" :key="figure.url"><el-image :src="figure.url" :preview-src-list="figures.map(f=>f.url)" fit="contain" preview-teleported/><figcaption>{{figure.label}}</figcaption></figure></div></article>
  <section v-else class="crane-program" aria-label="行车程序与运动轴">
   <h3>机构与运动轴</h3><p>9 个机构、16 个伺服轴。主程序根据运行模式、料斗状态和调度任务选择工艺分支。</p>
   <div class="crane-axis-table"><table><caption>运动轴对应关系</caption><thead><tr><th>机构</th><th>控制轴</th><th>单位</th><th>动作说明</th></tr></thead><tbody><tr v-for="axis in craneProgramAxes" :key="axis.id"><th scope="row">{{axis.label}}</th><td>{{axis.controllerAxes.join(' / ')}}</td><td>{{axis.unit}}</td><td>{{axis.description}}</td></tr></tbody></table></div>
   <label class="crane-flow-picker">工艺流程<select v-model="flowId"><option v-for="flow in craneProgramFlows" :key="flow.id" :value="flow.id">{{flow.label}}</option></select></label>
   <ol><li v-for="(step,index) in currentFlow.steps" :key="index">{{step}}</li></ol>
   <details><summary>全部调度动作（{{craneProgramActions.length}}）</summary><p>{{craneProgramActions.map(a=>a.label).join('、')}}</p></details>
  </section>
 </section>
</template>
<script setup>
import {ref,computed} from 'vue'
import {craneGuideSections} from '../../utils/crane-guide.mjs'
import {craneProgramAxes,craneProgramActions,craneProgramFlows} from '../../utils/crane-program.mjs'
import grab from '../../assets/crane/grab-assembly.png'
import actuator from '../../assets/crane/grab-actuator.png'
import trolley from '../../assets/crane/transfer-trolley.png'
import turnover from '../../assets/crane/turnover-assembly.png'
import assemblySide from '../../assets/crane/assembly-side.png'
import assemblyTop from '../../assets/crane/assembly-top.png'
import assemblyEnd from '../../assets/crane/assembly-end.png'
const selected=ref(craneGuideSections[0])
const flowId=ref(craneProgramFlows[0].id)
const currentFlow=computed(()=>craneProgramFlows.find(flow=>flow.id===flowId.value)||craneProgramFlows[0])
const figures=computed(()=>({assembly:[{url:assemblySide,label:'整机侧视图'},{url:assemblyTop,label:'整机俯视图'},{url:assemblyEnd,label:'整机端视图'}],grab:[{url:grab,label:'抓斗部装'},{url:actuator,label:'抓斗电动推杆'}],transfer:[{url:trolley,label:'周转小车与提升部装'}],turnover:[{url:turnover,label:'周转翻转部装'}]}[selected.value.id]||[]))
</script>
<style scoped>
.crane-program p,.crane-program li{font-size:14px;line-height:1.8}.crane-program li{margin:6px 0}.crane-axis-table{overflow:auto}.crane-program tbody th{width:22%}.crane-program td{min-width:70px}.crane-program td:last-child{min-width:260px}.crane-flow-picker{display:flex;align-items:center;gap:12px;font-weight:600;margin:20px 0 10px}.crane-flow-picker select{padding:10px 12px;border:1px solid #d5e4ec;border-radius:8px;color:#294858;background:white}.crane-program summary{cursor:pointer;color:#127e8f}.crane-figures{flex-direction:column}.crane-figures figure{width:100%}
.crane-guide{padding:12px;color:#294858}.crane-guide nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.crane-guide nav button{border:1px solid #d5e4ec;border-radius:10px;padding:10px 14px;background:white;color:inherit;cursor:pointer}.crane-guide button[aria-pressed=true]{background:#e4f2f5;color:#127e8f;font-weight:600}.crane-guide article{display:grid;grid-template-columns:minmax(280px,1.2fr) minmax(280px,1fr);gap:24px}.crane-guide article p{font-size:14px;line-height:1.8}.crane-guide table{border-collapse:collapse;width:100%;font-size:13px;text-align:left}.crane-guide caption{text-align:left;padding:10px 0;font-weight:600}.crane-guide th,.crane-guide td{padding:10px;border-bottom:1px solid #e4edf2}.crane-guide thead{background:#f0f6f9}.crane-guide tbody th{font-weight:500;width:32%}.crane-figures{display:flex;gap:12px;align-items:start}.crane-figures figure{margin:0;flex:1;min-width:0}.crane-figures .el-image{width:100%;height:340px;background:#f5f8fa;border-radius:12px}.crane-figures figcaption{font-size:12px;color:#6c8699;line-height:1.7;margin-top:8px}@media(max-width:800px){.crane-guide article{display:block}.crane-figures{margin-top:18px}.crane-figures .el-image{height:260px}}
</style>
