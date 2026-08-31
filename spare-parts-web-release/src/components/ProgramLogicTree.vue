<template>
  <ul v-if="node" class="logic-tree">
    <li>
      <div class="logic-node" :class="`kind-${node.type || 'step'}`">
        <span>{{ icon }}</span>
        <div><strong>{{ node.label || '未命名步骤' }}</strong><small v-if="node.line">第 {{ node.line }} 行</small></div>
      </div>
      <ProgramLogicTree v-for="(child, index) in node.children || []" :key="`${child.line || 0}-${index}-${child.label}`" :node="child" />
    </li>
  </ul>
</template>

<script setup>
import { computed } from 'vue'
defineOptions({ name: 'ProgramLogicTree' })
const props = defineProps({ node: { type: Object, default: null } })
const icon = computed(() => ({ routine: '◆', if: '◇', branch: '↳', case: '▦', test: '▦', while: '↻', for: '↻', motion: '➜', io: '◉', flow: '■', call: 'ƒ' }[props.node?.type] || '•'))
</script>

<style scoped>
.logic-tree{margin:0;padding-left:22px;list-style:none;position:relative}.logic-tree:before{content:"";position:absolute;left:7px;top:0;bottom:12px;border-left:1px solid #b9d5d4}.logic-tree>li{position:relative;padding:5px 0}.logic-tree>li:before{content:"";position:absolute;left:-15px;top:23px;width:14px;border-top:1px solid #b9d5d4}.logic-node{display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border:1px solid #dce9e9;border-radius:10px;background:#fff}.logic-node>span{color:#0b8f88;font-weight:900}.logic-node strong,.logic-node small{display:block}.logic-node strong{font-size:13px;word-break:break-word}.logic-node small{margin-top:3px;color:#83959f;font-size:11px}.kind-if,.kind-test,.kind-while,.kind-for{background:#eef9f8;border-color:#bfe3df}.kind-motion{background:#fff7e8;border-color:#f3d59c}.kind-io{background:#eef4ff;border-color:#cad9f7}
</style>
