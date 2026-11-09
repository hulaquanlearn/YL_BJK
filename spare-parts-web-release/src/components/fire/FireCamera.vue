<template>
 <input v-if="nativeAndroid" ref="input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden @change="receive" />
 <el-alert v-if="error" class="camera-error" :title="error" type="warning" :closable="true" @close="error=''" />
 <el-dialog v-model="visible" title="拍摄现场照片" width="min(640px,96vw)" append-to-body align-center :close-on-click-modal="false" @closed="close">
  <video ref="video" class="fire-live-camera" autoplay playsinline muted aria-label="现场相机预览" />
  <p class="camera-note">靠近检查标签，拍清表头、月份标记和本月完整检查行。筒体贴标可分正面、左侧、右侧补拍，保留重叠文字。</p>
  <template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="!ready || disabled" @click="capture">拍照并使用</el-button></template>
 </el-dialog>
</template>
<script setup>
import {ref,nextTick,onBeforeUnmount,watch} from 'vue'
const props=defineProps({disabled:Boolean}),emit=defineEmits(['capture'])
const nativeAndroid=/\bDigitalWorkbenchAndroid\//.test(navigator.userAgent)
const input=ref(null),video=ref(null),visible=ref(false),ready=ref(false),error=ref('')
let stream=null,request=0,disposed=false
function close(){request++;ready.value=false;visible.value=false;stream?.getTracks().forEach(t=>t.stop());stream=null;if(video.value)video.value.srcObject=null}
async function open(){
 if(props.disabled||disposed)return
 error.value=''
 if(nativeAndroid){input.value?.click();return}
 if(!navigator.mediaDevices?.getUserMedia){error.value='当前环境无法使用相机，请在App或支持相机的安全浏览器中拍照。';return}
 close();visible.value=true;const id=++request
 try{
  const current=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}},audio:false})
  if(disposed||id!==request||props.disabled){current.getTracks().forEach(t=>t.stop());return}
  stream=current;await nextTick();if(!video.value)throw Error()
  video.value.srcObject=stream;await video.value.play();if(id===request)ready.value=true
 }catch{if(id===request){close();error.value='无法打开相机，请允许相机权限后重试。消防照片仅支持现场拍摄。'}}
}
function receive(event){const file=event.target.files?.[0];event.target.value='';if(file&&!props.disabled&&!disposed)emit('capture',{target:{files:[file],value:''}})}
async function capture(){
 if(!ready.value||props.disabled||!video.value?.videoWidth)return
 const id=request,canvas=document.createElement('canvas'),scale=Math.min(1,3200/video.value.videoWidth,3200/video.value.videoHeight)
 canvas.width=Math.round(video.value.videoWidth*scale);canvas.height=Math.round(video.value.videoHeight*scale)
 const ctx=canvas.getContext('2d');if(!ctx)return
 ctx.drawImage(video.value,0,0,canvas.width,canvas.height);ready.value=false
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95))
 if(disposed||id!==request||props.disabled)return
 if(!blob){ready.value=true;error.value='拍摄失败，请重新拍照。';return}
 const file=new File([blob],'现场照片-'+Date.now()+'.jpg',{type:'image/jpeg',lastModified:Date.now()});close();emit('capture',{target:{files:[file],value:''}})
}
function hidden(){if(document.hidden)close()}
watch(()=>props.disabled,value=>{if(value)close()})
document.addEventListener('visibilitychange',hidden);window.addEventListener('auth-changed',close)
onBeforeUnmount(()=>{disposed=true;close();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('auth-changed',close)})
defineExpose({open,close})
</script>
<style scoped>.fire-live-camera{display:block;width:100%;max-height:65dvh;object-fit:contain;background:#172737;border-radius:10px}.camera-note{color:#748694;line-height:1.7;font-size:13px}.camera-error{margin-top:10px}</style>
