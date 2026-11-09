import {createApp,h,ref,onMounted} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import PdfReader from '../../src/components/PdfReader.vue'
createApp({setup(){
 const file=ref(),entry=ref(20),error=ref('')
 async function open(){
  if(!['127.0.0.1','localhost'].includes(location.hostname))return
  const response=await fetch('/api/knowledge/'+entry.value+'/preview',{headers:{Authorization:'Bearer raw-preview-admin'}})
  if(!response.ok){error.value='本地隔离资料不可用';return}
  file.value=await response.blob()
 }
 onMounted(open)
 return ()=>h('main',{style:'max-width:1100px;margin:20px auto;font-family:system-ui'},[
  h('h1','PDF 安全策略回归预览'),h('p',"与线上相同的 connect-src self；仅使用本地隔离资料。"),
  h('label',['资料 ',h('select',{value:entry.value,onChange:e=>{entry.value=Number(e.target.value)}},[[20,'整车电路图'],[19,'无线供取电'],[17,'超级电容'],[12,'供电站']].map(([value,label])=>h('option',{value},label)))]),
  h('button',{onClick:open},'打开'),error.value?h('p',error.value):null,
  file.value?h(PdfReader,{file:file.value,initialPage:entry.value===12?18:2}):null
 ])
}}).use(ElementPlus).mount('#reader')
