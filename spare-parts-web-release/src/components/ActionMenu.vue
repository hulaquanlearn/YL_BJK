<template>
  <el-dropdown v-if="visibleItems.length" trigger="click" :disabled="disabled" @command="select">
    <el-button class="content-more" :disabled="disabled" :aria-label="ariaLabel || label"><el-icon><MoreFilled /></el-icon><span>{{label}}</span></el-button>
    <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="item in visibleItems" :key="item.key" :command="item.key" :disabled="disabled || item.disabled" :divided="item.divided" :class="{'is-danger':item.danger}">{{item.label}}</el-dropdown-item></el-dropdown-menu></template>
  </el-dropdown>
</template>
<script setup>
import {computed} from 'vue'
import {MoreFilled} from '@element-plus/icons-vue'
const props=defineProps({items:{type:Array,default:()=>[]},disabled:Boolean,label:{type:String,default:'更多'},ariaLabel:String})
const emit=defineEmits(['select'])
const visibleItems=computed(()=>props.items.filter(item=>item && item.visible!==false))
function select(key){const item=visibleItems.value.find(item=>item.key===key);if(item && !props.disabled && !item.disabled)emit('select',key)}
</script>
<style scoped>
.content-more{margin:0;gap:6px}.is-danger{color:var(--el-color-danger)}
</style>
