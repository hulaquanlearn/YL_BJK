<template>
  <div :class="{ 'mobile-workspace': enabled, 'mobile-home-page': enabled && home, 'app-task-page': enabled && !home && route.path!=='/account' }">
    <header v-if="enabled && !nativeAndroid" class="mobile-app-header">
      <button v-if="canReturnToPart" type="button" class="mobile-icon-button" aria-label="返回备件详情" @click="router.back()"><el-icon><ArrowLeft /></el-icon></button>
      <router-link v-else-if="!home" class="mobile-icon-button" to="/portal" aria-label="返回工作台"><el-icon><ArrowLeft /></el-icon></router-link>
      <span v-else class="mobile-app-mark"><el-icon><Grid /></el-icon></span>
      <div class="mobile-app-title"><h1>{{ home ? '数字工作台' : route.meta.title }}</h1></div>
      <div class="mobile-header-actions"><button v-if="route.path==='/account'" class="mobile-icon-button" type="button" aria-label="退出登录" @click="$emit('logout')"><el-icon><SwitchButton /></el-icon></button><button v-if="!home" class="mobile-icon-button" type="button" aria-label="打开功能目录" @click="catalogVisible = true"><el-icon><Menu /></el-icon></button><ServiceStatus v-if="home" :status="health" /><router-link v-if="home" to="/account" class="mobile-account-avatar" aria-label="个人中心">{{ initial }}</router-link></div>
    </header>


    <main v-if="enabled && home" class="mobile-home-content">
      <el-input v-model="search" class="mobile-feature-search" placeholder="查找功能，例如库存、消防" clearable aria-label="查找业务功能"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <section v-for="group in filteredModules" :key="group.id" class="mobile-feature-group" :class="group.id">
        <div class="mobile-group-heading"><span class="mobile-group-icon"><el-icon><component :is="group.icon" /></el-icon></span><div><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div><span class="mobile-group-count">{{ group.links.length }}</span></div>
        <div class="mobile-feature-grid"><router-link v-for="link in group.links" :key="link.path" :to="link.disabled ? route.fullPath : link.path" :aria-disabled="link.disabled||undefined" :class="{'is-locked':link.disabled}" @click="link.disabled ? $event.preventDefault() : catalogVisible=false"><el-icon><component :is="link.icon" /></el-icon><span>{{ link.label }}</span><el-icon><ArrowRight /></el-icon></router-link></div>
      </section>
      <el-empty v-if="search && !filteredModules.length" description="没有匹配的功能，换个关键词试试" />
      <section class="mobile-account-links"><h2>我的工作台</h2><router-link v-for="link in accountLinks" :key="link.path" :to="link.disabled ? route.fullPath : link.path" :aria-disabled="link.disabled||undefined" :class="{'is-locked':link.disabled}" @click="link.disabled ? $event.preventDefault() : catalogVisible=false"><el-icon><component :is="link.icon" /></el-icon><span>{{ link.label }}</span><el-icon><ArrowRight /></el-icon></router-link></section>
      <!-- Compatibility contract for installed android.1–5 clients; never shown as phone UI. -->
      <div v-if="legacyNative" class="workbench mobile-legacy-portal" hidden aria-hidden="true"><div class="portal-account"><small>{{ role }}</small></div><article v-for="group in catalogGroups" :key="group.id" class="module-card"><h2>{{ group.title }}</h2><p>{{ group.description }}</p><a class="module-enter" :href="group.path">{{ group.enter }}</a><nav class="workspace-links"><a v-for="link in group.links" :key="link.path" :href="link.path">{{ link.label }}</a></nav></article></div>
    </main>
    <slot v-else />

    <nav v-if="enabled && !nativeAndroid && (home || route.path==='/account')" class="mobile-bottom-nav" aria-label="App 主导航">
      <router-link to="/portal" :class="{ 'is-active': home }"><el-icon><Grid /></el-icon><span>首页</span></router-link>
      <router-link v-for="group in catalogGroups" :key="group.id" :to="group.path" :class="{ 'is-active': currentGroup?.id === group.id }"><el-icon><component :is="group.icon" /></el-icon><span>{{ ({spare:'备件',engineering:'工程',work:'工作'})[group.id] }}</span></router-link>
      <router-link to="/account" :class="{ 'is-active': route.path === '/account' }"><el-icon><User /></el-icon><span>我的</span></router-link>
    </nav>

    <el-drawer v-model="catalogVisible" title="功能目录" direction="btt" size="min(78dvh,640px)" class="mobile-catalog-drawer" :before-close="closeCatalog">
      <div v-for="group in catalogGroups" :key="group.id" class="mobile-catalog-group"><h3>{{ group.title }}</h3><div class="mobile-feature-grid"><router-link v-for="link in group.links" :key="link.path" :to="link.disabled ? route.fullPath : link.path" :aria-disabled="link.disabled||undefined" :class="{'is-locked':link.disabled}" @click="link.disabled ? $event.preventDefault() : catalogVisible=false"><el-icon><component :is="link.icon" /></el-icon><span>{{ link.label }}</span><el-icon><ArrowRight /></el-icon></router-link></div></div>
      <div class="mobile-catalog-group"><h3>我的</h3><div class="mobile-feature-grid"><router-link v-for="link in accountLinks" :key="link.path" :to="link.disabled ? route.fullPath : link.path" :aria-disabled="link.disabled||undefined" :class="{'is-locked':link.disabled}" @click="link.disabled ? $event.preventDefault() : catalogVisible=false"><el-icon><component :is="link.icon" /></el-icon><span>{{link.label}}</span><el-icon><ArrowRight /></el-icon></router-link></div></div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { inventoryDetailBack, mobileAccountLinks, nativeFieldPaths } from '../utils/mobile-workspace.mjs'
import ServiceStatus from '../components/ServiceStatus.vue'
const props=defineProps({enabled:Boolean,user:Object,modules:{type:Array,default:()=>[]},role:String,health:{type:String,default:'checking'}})
defineEmits(['logout'])
const route=useRoute(),router=useRouter(),search=ref(''),catalogVisible=ref(false)
const canReturnToPart=computed(()=>inventoryDetailBack(route,router.options.history.state))
const home=computed(()=>Boolean(route.meta.portal))
const initial=computed(()=>(props.user?.displayName||props.user?.username||'用').slice(0,1))
const catalogGroups=computed(()=>props.modules.map(group=>({...group,links:group.links.filter(link=>nativeFieldPaths.has(link.path)||link.path==='/robot-program')})).filter(group=>group.links.length))
const accountLinks=computed(()=>mobileAccountLinks(props.user).filter(link=>link.path==='/account'))
const currentGroup=computed(()=>props.modules.find(group=>group.links.some(link=>link.path===route.path)))
const filteredModules=computed(()=>catalogGroups.value.map(group=>({...group,links:group.links.filter(link=>!search.value.trim()||`${group.title} ${link.label}`.includes(search.value.trim()))})).filter(group=>group.links.length))
const nativeBuild=Number(navigator.userAgent.match(/DigitalWorkbenchAndroid\/[^\s]*android\.(\d+)/)?.[1])
const nativeAndroid=/DigitalWorkbenchAndroid\//.test(navigator.userAgent)
const legacyNative=Boolean(nativeBuild&&nativeBuild<6)
function closeCatalog(done){catalogVisible.value=false;done()}
watch(()=>route.fullPath,()=>{catalogVisible.value=false})
watch(()=>props.enabled,enabled=>{if(!enabled)catalogVisible.value=false})
</script>
<style scoped>.mobile-feature-grid a.is-locked{opacity:.55;cursor:default}</style>

<style src="../mobile-app.css"></style>
<style src="../mobile-business.css"></style>
<style src="../mobile-spare.css"></style>
<style src="../app-polish.css"></style>
<style src="./app-layout.css"></style>
