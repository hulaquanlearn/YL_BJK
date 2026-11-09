// This compatibility registration adds the actual route to the running workbench.
// Complete builds use the same Vue page through src/router/index.js directly.
(() => {
  const path='/control-passwords',label='中控密码管理',script=document.currentScript||document.querySelector('script[data-control-entry]'),initialPath=location.pathname
  const widgetUrl=script?.dataset.controlWidget,styleUrl=script?.dataset.controlStyle
  const user=()=>{try{return JSON.parse(localStorage.getItem('spare_parts_auth_user')||'null')}catch{return null}}
  const allowed=()=>{const u=user();return ['admin','qu_making'].includes(u?.role)||(u?.role==='viewer'&&u.staffWorkshopCode==='qu_making')}
  let scheduled=false,router,registered=false,originalNavigate,wrappedNavigate
  function createEntry(host){
    const enabled=allowed(),entry=document.createElement(enabled?'a':'span')
    entry.dataset.controlPasswordEntry='true'
    if(enabled){
      entry.href=path
      entry.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(allowed())router?.push(path)})
    }else{entry.setAttribute('aria-disabled','true');entry.title='仅系统管理员和制曲人员可以查看';entry.style.cssText='display:flex;align-items:center;gap:11px;min-height:44px;padding:9px 10px;box-sizing:border-box;border-radius:8px;color:#879aaf;font-size:13px;opacity:.65;cursor:default'}
    const icon=document.createElement('i');icon.className='el-icon';icon.setAttribute('aria-hidden','true');icon.style.flex='0 0 auto'
    icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>'
    const text=document.createElement('span');text.textContent=label;text.style.cssText='flex:1;min-width:0;text-align:left';entry.append(icon,text)
    if(!host.classList.contains('section-nav')){const arrow=document.createElement('i');arrow.className='el-icon';arrow.setAttribute('aria-hidden','true');arrow.style.flex='0 0 auto';arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 5 7 7-7 7"/></svg>';entry.append(arrow)}
    return entry
  }
  function register(){
    const app=document.getElementById('app')?.__vue_app__
    router=app?.config.globalProperties.$router
    if(!router||registered)return
    registered=true
    router.addRoute({path,name:'ControlPasswords',meta:{module:'work',title:label,description:''},component:{
      name:'ControlPasswordsRoute',render(){return null},
      async mounted(){
        this.controlAlive=true
        const container=document.createElement('div');container.className='control-passwords-route';this.controlHost=container
        this.$el.parentNode.insertBefore(container,this.$el)
        if(styleUrl&&!document.querySelector('[data-control-password-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=styleUrl;link.dataset.controlPasswordStyle='true';document.head.append(link)}
        try{
          const module=await import(widgetUrl)
          if(!this.controlAlive)return
          const mounted=await module.mountControlPasswords(container)
          if(!this.controlAlive)mounted.unmount();else this.controlModule=mounted
        }catch{if(this.controlAlive)container.textContent='页面加载失败，请刷新后重试'}
      },
      beforeRouteLeave(){return this.controlModule?.canLeave?.()??true},
      beforeUnmount(){this.controlAlive=false;this.controlModule?.unmount();this.controlHost?.remove()}
    }})
    router.beforeEach(async to=>{
      if(to.path!==path)return true
      const token=localStorage.getItem('spare_parts_auth_token')
      if(!token)return '/login'
      try{
        const response=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'})
        if(!response.ok)return response.status===401?'/login':'/portal'
        const body=await response.json(),current=body.data?.user||body.data
        if(localStorage.getItem('spare_parts_auth_token')!==token)return false
        localStorage.setItem('spare_parts_auth_user',JSON.stringify(current));window.dispatchEvent(new Event('auth-changed'))
        return allowed()?true:'/portal'
      }catch{return false}
    })
    // Register before initial navigation settles, including direct links/refreshes.
    if(initialPath===path)router.replace(path)
  }
  function refresh(){
    scheduled=false;register()
    if(!user()||!localStorage.getItem('spare_parts_auth_token'))return
    const hosts=[...document.querySelectorAll('.work-card .workspace-links,.app-shell.is-work .section-nav,.mobile-feature-group.work .mobile-feature-grid')]
    for(const group of document.querySelectorAll('.mobile-catalog-group'))if(group.querySelector('h3')?.textContent.trim()==='工作管理')hosts.push(group.querySelector('.mobile-feature-grid'))
    for(const host of hosts.filter(Boolean)){
      let existing=host.querySelector('[data-control-password-entry]')||host.querySelector('a[href="/control-passwords"]')
      if(existing)existing.dataset.controlPasswordEntry='true'
      if(!existing||Boolean(existing.getAttribute('href'))!==allowed()){existing?.remove();existing=createEntry(host);host.append(existing)}
      const active=router?.currentRoute.value.path===path
      existing.classList.toggle('router-link-active',active);existing.classList.toggle('router-link-exact-active',active)
    }
    const state=window.__WORKBENCH_MOBILE__
    if(state?.version===1&&state.accountId&&state.modules){
      let work=state.modules.find(group=>group.id==='work')
      if(!work){work={id:'work',title:'工作管理',description:'',path:'/portal',icon:'Calendar',links:[]};state.modules.push(work)}
      const existing=work.links.find(link=>link.path===path)
      if(!existing)work.links.push({path,label,icon:'Lock',disabled:!allowed()});else existing.disabled=!allowed()
    }
    if(window.__WORKBENCH_NAVIGATE__&&window.__WORKBENCH_NAVIGATE__!==wrappedNavigate){
      originalNavigate=window.__WORKBENCH_NAVIGATE__
      wrappedNavigate=async target=>{
        if(target!==path)return originalNavigate(target)
        if(!allowed()||!router)return false
        try{const failure=await router.push(path);return !failure&&router.currentRoute.value.path===path}catch{return false}
      }
      window.__WORKBENCH_NAVIGATE__=wrappedNavigate
    }
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(refresh)}}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true})
  window.addEventListener('auth-changed',schedule);window.addEventListener('storage',schedule)
  setInterval(refresh,1000);schedule()
})()
