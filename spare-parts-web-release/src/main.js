import { createApp, h } from 'vue'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './styles.css'
import './ux-refinements.css'
import './sites-refinement.css'
import './ledger-entry.css'
import './summary-cards.css'
import { isViewer, showControl } from './auth'
import { createWritePermissionDirective } from './utils/write-permission.mjs'
import { isPageAssetError } from './utils/page-load-error.mjs'

let pageLoadNotice
function showPageLoadError(error) {
  if (!isPageAssetError(error) || pageLoadNotice) return
  pageLoadNotice = ElNotification({
    title: '页面未能加载', type: 'warning', duration: 0,
    message: h('div', [h('p', '页面文件可能已更新，或网络连接中断。请先保存当前内容，再刷新页面。'), h('button', { type: 'button', onClick: () => window.location.reload(), style: 'padding:8px 12px;border:1px solid #a8b1c0;border-radius:6px;background:white;cursor:pointer' }, '刷新页面')]),
    onClose: () => { pageLoadNotice = undefined }
  })
}
router.onError(showPageLoadError)
window.addEventListener('vite:preloadError', event => showPageLoadError(event.payload))

const app = createApp(App)
app.config.globalProperties.$showControl = showControl
app.directive('write', createWritePermissionDirective(isViewer, message => ElMessage.error({message, grouping:true})))

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

app.use(ElementPlus, { locale: zhCn })
app.use(router)
app.mount('#app')
