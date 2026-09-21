import { createApp } from 'vue'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './styles.css'
import './ux-refinements.css'
import { isViewer, showControl } from './auth'
import { createWritePermissionDirective } from './utils/write-permission.mjs'

const app = createApp(App)
app.config.globalProperties.$showControl = showControl
app.directive('write', createWritePermissionDirective(isViewer, message => ElMessage.error({message, grouping:true})))

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

app.use(ElementPlus, { locale: zhCn })
app.use(router)
app.mount('#app')
