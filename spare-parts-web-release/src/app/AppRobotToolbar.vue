<template>
  <section class="app-robot-toolbar" aria-label="程序备份">
    <label><span>当前备份</span><select :value="projectId" :disabled="busy||!library.length" aria-label="选择程序备份" @change="$emit('select',$event.target.value)"><option v-if="!library.length" value="">暂无备份</option><option v-for="item in library" :key="item.id" :value="item.id">{{item.displayName||item.filename}}</option></select></label>
    <el-dropdown trigger="click" :disabled="busy" @command="value=>$emit(value)"><button type="button" class="app-more-button" aria-label="备份更多操作"><el-icon><MoreFilled/></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="refresh">刷新备份</el-dropdown-item><el-dropdown-item v-if="canManage" command="import">导入备份</el-dropdown-item><el-dropdown-item v-if="canManage&&projectId" command="rename">重命名</el-dropdown-item><el-dropdown-item command="export" :disabled="!hasAnalysis">导出注释</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
  </section>
</template>
<script setup>
defineProps({projectId:String,library:{type:Array,default:()=>[]},busy:Boolean,canManage:Boolean,hasAnalysis:Boolean})
defineEmits(['select','refresh','import','rename','export'])
</script>
