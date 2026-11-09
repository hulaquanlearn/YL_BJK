// Mount inside an existing work-centre route when publishing against a held
// baseline. The full application imports ControlPasswords.vue normally.
import {createApp,h,ref} from 'vue'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {ElAlert,ElButton,ElDialog,ElForm,ElFormItem,ElInput,ElCheckbox,ElLoading,ElConfigProvider} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import Page from '../views/ControlPasswords.vue'

export async function mountControlPasswords(element,{service}={}){
  const page=ref(),router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>h(Page,{ref:page,...(service?{service}:{})})}}]})
  const app=createApp({render:()=>h(ElConfigProvider,{locale:zhCn},()=>h(RouterView))})
  for(const component of [ElAlert,ElButton,ElDialog,ElForm,ElFormItem,ElInput,ElCheckbox])app.component(component.name,component)
  app.directive('loading',ElLoading.directive).use(router)
  await router.isReady()
  app.mount(element)
  return {unmount:()=>app.unmount(),canLeave:()=>page.value?.canLeave?.()??true}
}
