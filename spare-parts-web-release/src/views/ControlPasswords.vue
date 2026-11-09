<template>
  <main class="control-password-page" v-loading="loading">
    <div v-if="failed" class="control-failed">
      <div class="control-failed-card"><strong>资料读取失败</strong><p>请检查网络后重试，已录入资料不会受影响。</p><el-button type="primary" :loading="loading" @click="load">重新获取</el-button></div>
    </div>
    <template v-else-if="ready">
      <div class="control-layout">
        <section class="control-model-panel" aria-label="控制室电脑三维布局">
          <header class="panel-head"><strong>控制室平面</strong><span>拖动旋转 · 点编号选电脑</span></header>
          <ControlRoomModel :selected="selected" @select="select"/>
        </section>
        <section class="control-picker-panel" aria-label="选择电脑">
          <label for="control-computer">选择电脑</label>
          <el-select id="control-computer" class="control-computer-select workbench-picker" :model-value="selected" :disabled="editing" aria-label="选择电脑" popper-class="workbench-picker-menu" fit-input-width :show-arrow="false" :offset="6" @change="select">
            <el-option v-for="row in rows" :key="row.id" :label="`${String(row.id).padStart(2,'0')} · ${row.name}`" :value="row.id">
              <span class="workbench-picker-option">
                <span class="control-computer-name">{{String(row.id).padStart(2,'0')}} · {{row.name}}</span>
                <small class="control-option-state" :class="row.configured?'is-ok':'is-pending'">{{row.configured?'已录入':'待录入'}}</small>
                <el-icon v-if="selected===row.id" aria-hidden="true"><Check /></el-icon>
              </span>
            </el-option>
          </el-select>
          <button type="button" class="control-refresh" :disabled="loading || editing" aria-label="刷新电脑资料" @click="load">刷新</button>
        </section>
        <section v-if="current" class="control-details" :aria-label="`${current.id}号电脑登录资料`">
          <header class="control-detail-head">
            <span class="control-device-number">{{String(current.id).padStart(2,'0')}}</span>
            <div class="control-detail-title">
              <h2>{{current.name}}</h2>
              <p class="computer-location">{{location}}<span class="control-state" :class="current.configured?'is-ok':'is-pending'">{{current.configured?'已录入':'待录入'}}</span></p>
            </div>
          </header>
          <dl class="control-detail-list">
            <div class="control-detail-row"><dt>登录账号</dt><dd>{{current.username||'尚未录入'}}</dd></div>
            <div class="control-detail-row control-detail-secret"><dt>电脑密码</dt><dd class="control-secret">
              <span v-if="!current.configured" class="control-empty">尚未录入</span>
              <template v-else><code>{{revealed?secret:'••••••••'}}</code><el-button text :loading="revealing" @click="toggleSecret">{{revealed?'隐藏密码':'查看密码'}}</el-button></template>
            </dd></div>
            <div v-if="current.note" class="control-detail-row"><dt>备注</dt><dd class="control-note">{{current.note}}</dd></div>
          </dl>
          <p v-if="current.updatedAt" class="control-updated">{{current.updatedBy}} · {{formatTime(current.updatedAt)}} 更新</p>
          <el-button v-if="canManage" type="primary" class="control-edit" @click="openEditor">维护此电脑资料</el-button>
        </section>
      </div>
    </template>
    <el-dialog v-model="editing" :title="`维护${selected}号电脑资料`" width="480px" :close-on-click-modal="false" :close-on-press-escape="!saving" :before-close="closeEditor" destroy-on-close @closed="clearDraft">
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="电脑名称" required><el-input v-model="draft.name" maxlength="80" /></el-form-item>
        <el-form-item label="登录账号"><el-input v-model="draft.username" maxlength="120" autocomplete="off" /></el-form-item>
        <el-form-item label="电脑密码"><el-input v-model="draft.password" type="password" show-password maxlength="256" autocomplete="new-password" :placeholder="current?.configured?'留空保留原密码':'输入电脑登录密码'" /></el-form-item>
        <el-form-item v-if="current?.configured"><el-checkbox v-model="draft.clearPassword">清空已录入的密码</el-checkbox></el-form-item>
        <el-form-item label="备注"><el-input v-model="draft.note" type="textarea" :rows="3" maxlength="500" placeholder="例如用途、登录注意事项" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="cancelEdit">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ControlRoomModel from '../components/ControlRoomModel.vue'
import { controlComputers } from '../utils/control-room.mjs'
import { getControlPasswords, getControlPassword, updateControlPassword } from '../api'
import { getToken, getUser } from '../auth'
import { canReadFeature } from '../utils/feature-access.mjs'
const props=defineProps({service:{type:Object,default:()=>({list:getControlPasswords,reveal:getControlPassword,update:updateControlPassword})}})
const loading = ref(false), ready = ref(false), failed = ref(false), rows = ref([]), revision = ref(''), canManage = ref(false), selected = ref(1)
const secret = ref(''), revealed = ref(false), revealing = ref(false), editing = ref(false), saving = ref(false)
const draft = reactive({ name:'', username:'', password:'', note:'', clearPassword:false })
const current = computed(() => rows.value.find(row => row.id === selected.value))
const location = computed(() => controlComputers.find(row => row.id === selected.value)?.row)
let active = true, request = 0, concealTimer, editorRevision = '', originalDraft = '', session = getToken()
function hideSecret() { request++; clearTimeout(concealTimer); secret.value = ''; revealed.value = false; revealing.value = false }
function select(id) { if(editing.value)return; hideSecret(); selected.value = id }
function formatTime(value) { return new Date(value).toLocaleString('zh-CN',{hour12:false}) }
async function load() {
  if(loading.value)return
  hideSecret(); loading.value = true; failed.value = false
  try { const response = await props.service.list(); if(!active||getToken()!==session)return; rows.value = response.data.rows; revision.value = response.data.revision; canManage.value = response.data.canManage; ready.value = true }
  catch { if(active) { failed.value = true; ready.value = false; rows.value = [] } }
  finally { if(active)loading.value = false }
}
async function toggleSecret() {
  if(revealed.value) { hideSecret(); return }
  const id = selected.value, ticket = ++request; revealing.value = true
  try {
    const response = await props.service.reveal(id)
    if(!active||ticket!==request||id!==selected.value||getToken()!==session||document.hidden)return
    secret.value = response.data.password; revealed.value = true
    concealTimer = setTimeout(hideSecret, 30000)
  } catch { /* The API client displays the safe error message. */ }
  finally { if(active&&ticket===request)revealing.value = false }
}
function clearDraft() { Object.assign(draft,{name:'',username:'',password:'',note:'',clearPassword:false}); originalDraft='' }
function openEditor() { hideSecret(); Object.assign(draft,{name:current.value.name,username:current.value.username,password:'',note:current.value.note,clearPassword:false}); originalDraft=JSON.stringify(draft); editorRevision=revision.value; editing.value=true }
async function allowClose() {
  if(getToken()!==session)return true
  if(saving.value)return false
  if(!editing.value||JSON.stringify(draft)===originalDraft)return true
  try { await ElMessageBox.confirm('资料尚未保存，确定放弃本次修改吗？','未保存的修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续填写',type:'warning'}); return true } catch { return false }
}
async function closeEditor(done) { if(await allowClose())done() }
async function cancelEdit() { if(await allowClose())editing.value=false }
async function save() {
  if(saving.value)return
  if(!draft.name.trim()) { ElMessage.warning('请填写电脑名称'); return }
  if(draft.clearPassword&&draft.password) { ElMessage.warning('清空密码和填写新密码只能选择一项'); return }
  const body={name:draft.name,username:draft.username,note:draft.note,revision:editorRevision}
  if(draft.password||draft.clearPassword)body.password=draft.clearPassword?'':draft.password
  saving.value=true
  try { const response=await props.service.update(selected.value,body); if(!active||getToken()!==session)return; rows.value=rows.value.map(row=>row.id===response.data.row.id?response.data.row:row); revision.value=response.data.revision; editing.value=false; clearDraft(); ElMessage.success('电脑资料已保存') }
  catch { /* Keep the user's draft on validation, conflict or network failure. */ }
  finally { if(active)saving.value=false }
}
function visibility() { if(document.hidden)hideSecret() }
function beforeUnload(event) { if(editing.value&&JSON.stringify(draft)!==originalDraft){event.preventDefault();event.returnValue=''} }
function authChanged() { if(getToken()!==session||!canReadFeature(getUser(),'/control-passwords')) { hideSecret(); rows.value=[]; ready.value=false; editing.value=false; clearDraft() } }
onBeforeRouteLeave(async()=>{const allowed=await allowClose();if(allowed)hideSecret();return allowed})
defineExpose({canLeave:allowClose})
onMounted(()=>{document.addEventListener('visibilitychange',visibility);window.addEventListener('auth-changed',authChanged);window.addEventListener('pagehide',hideSecret);window.addEventListener('beforeunload',beforeUnload);load()})
onBeforeUnmount(()=>{active=false;hideSecret();clearDraft();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('auth-changed',authChanged);window.removeEventListener('pagehide',hideSecret);window.removeEventListener('beforeunload',beforeUnload)})
</script>

<style scoped>
.control-password-page{--cp-ink:#22384b;--cp-muted:#74899a;--cp-line:#dfe9f0;--cp-accent:var(--mobile-accent,#0f7383);--cp-soft:#eef6f8;display:flex;flex-direction:column;gap:12px;color:var(--cp-ink)}
.control-failed{display:grid;place-items:center;min-height:260px;padding:20px}
.control-failed-card{width:min(420px,100%);padding:22px;border:1px solid var(--cp-line);border-radius:20px;background:#fff;text-align:center}
.control-failed-card strong{font-size:17px}.control-failed-card p{margin:8px 0 16px;color:var(--cp-muted);font-size:13px;line-height:1.7}
.control-refresh{flex:none;min-height:40px;padding:0 14px;border:1px solid var(--cp-line);border-radius:12px;background:#fff;color:#48677d;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;box-shadow:0 2px 8px #1b34400a}
.control-refresh:disabled{opacity:.55;cursor:default}
.control-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,340px);grid-template-areas:"model details" "picker details";gap:14px;align-items:start}
.control-model-panel,.control-picker-panel,.control-details{border:1px solid var(--cp-line);border-radius:20px;background:#fff;box-shadow:0 10px 28px #1b344010;overflow:hidden;min-width:0}
.control-model-panel{grid-area:model}
.control-picker-panel{grid-area:picker;display:flex;align-items:center;gap:10px;padding:8px 12px}
.control-picker-panel label{flex:none;font-size:13px;font-weight:600}
.control-computer-select{flex:1;min-width:0}
.control-computer-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.control-option-state{flex:none;padding:2px 5px;border-radius:5px;font-size:11px;line-height:1.4}
.control-option-state.is-ok{background:#e9f7ef;color:#2b7a5a}
.control-option-state.is-pending{background:#fdf3e6;color:#a76d24}
.control-details{grid-area:details;position:sticky;top:20px;overflow:visible;padding:18px}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:13px 14px 10px}
.panel-head strong{font-size:14px;font-weight:700;color:#2a4659}.panel-head span{font-size:11.5px;color:var(--cp-muted)}
.control-model-panel :deep(.control-room-model){border:0;border-radius:0;background:#e7eff3}
.control-model-panel :deep(.room-toolbar){padding:6px 12px 10px;background:transparent;font-size:12px;color:#4f6b7d;justify-content:flex-end}
.control-model-panel :deep(.room-toolbar button){min-height:32px;padding:4px 10px;border-radius:9px;font-size:12px}
.control-model-panel :deep(.room-canvas){height:clamp(300px,38vh,480px)}
.control-detail-head{display:flex;align-items:center;gap:12px}
.control-device-number{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:16px;background:var(--cp-soft);color:var(--cp-accent);font-size:22px;font-weight:760;letter-spacing:-.02em}
.control-detail-title{min-width:0}
.control-detail-title h2{margin:0;font-size:20px;font-weight:750;line-height:1.3;overflow-wrap:anywhere}
.computer-location{display:flex;align-items:center;gap:8px;margin:4px 0 0;color:var(--cp-muted);font-size:12px}
.control-state{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:650}
.control-state.is-ok{background:#e9f7ef;color:#2b7a5a}.control-state.is-pending{background:#fdf3e6;color:#a76d24}
.control-detail-list{margin:14px 0 0}
.control-detail-row{padding:13px 0;border-top:1px solid #edf3f7}
.control-detail-row:first-child{border-top:0;padding-top:4px}
.control-detail-row dt{margin:0 0 6px;color:var(--cp-muted);font-size:11.5px;font-weight:600}
.control-detail-row dd{margin:0;font-size:15px;font-weight:550;color:#2a4659;overflow-wrap:anywhere}
.control-empty{color:#95a6b2;font-weight:400}
.control-secret{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:32px}
.control-secret code{display:inline-block;max-width:100%;padding:7px 10px;border-radius:10px;background:#f4f9fb;color:#1f5367;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:14px;letter-spacing:.09em;white-space:pre-wrap;overflow-wrap:anywhere}
.control-secret :deep(.el-button){min-height:34px;padding:0 10px;border-radius:9px;background:#eef6f8;color:var(--cp-accent);font-size:12px;font-weight:650}
.control-note{white-space:pre-wrap;line-height:1.7;font-weight:400;color:#4b6579}
.control-updated{margin:14px 0 0;color:#93a3ae;font-size:11.5px;line-height:1.6}
.control-edit{width:100%;min-height:46px;margin-top:16px;border-radius:14px;font-weight:700;--el-color-primary:var(--cp-accent);--el-color-primary-light-3:color-mix(in srgb,var(--cp-accent) 72%,#fff);--el-color-primary-dark-2:color-mix(in srgb,var(--cp-accent) 82%,#000)}
.control-password-page :deep(.el-dialog){width:min(92vw,480px);border-radius:20px}
.control-password-page :deep(.el-dialog__header){padding:18px 20px 8px;margin-right:0}
.control-password-page :deep(.el-dialog__body){padding:6px 20px 10px}
.control-password-page :deep(.el-dialog__footer){padding:8px 20px 18px}
.control-password-page :deep(.el-message-box){width:min(90vw,420px);border-radius:18px}
.control-password-page button:focus-visible{outline:2px solid var(--cp-accent);outline-offset:2px}
@media(min-width:1200px){.control-layout{grid-template-columns:minmax(0,1fr) 360px}}
@media(max-width:1100px){.control-layout{grid-template-columns:minmax(0,1fr) 300px}.control-details{padding:16px}}
@media(max-width:760px){
  .control-password-page{gap:10px}
  .control-refresh{min-height:44px;padding:0 10px;font-size:12px;border-radius:10px}
  .control-layout{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"picker" "details" "model";gap:10px}
  .control-model-panel,.control-picker-panel,.control-details{border-radius:18px}
  .control-details{position:static;padding:14px}
  .panel-head{padding:11px 12px 8px}.panel-head strong{font-size:13px}.panel-head span{font-size:10.5px}
  .control-device-number{width:44px;height:44px;border-radius:13px;font-size:19px}
  .control-detail-title h2{font-size:18px}
  .control-model-panel :deep(.room-canvas){height:230px}
  .control-model-panel :deep(.room-toolbar){padding:4px 10px 8px}
  .control-model-panel :deep(.room-number){width:30px;height:30px;font-size:14px}
  .control-edit{min-height:44px;margin-top:12px}
}
</style>
