<template>
  <section v-if="metadata" class="spare-document-info" aria-label="备件资料来源与适用范围">
    <header><strong>{{metadata.family}} · {{metadata.documentKind}}</strong><span>{{referenceStatusLabels[metadata.verification] || '来源待核实'}}</span></header>
    <dl><div><dt>适用范围</dt><dd>{{metadata.applicability==='workshop'?'所属车间专用资料':'各车间通用资料'}}</dd></div><div v-if="metadata.manufacturer"><dt>厂家</dt><dd>{{metadata.manufacturer}}</dd></div><div v-if="metadata.models?.length"><dt>适用型号 / 系列</dt><dd>{{metadata.models.join('、')}}</dd></div><div v-if="metadata.documentVersion"><dt>资料版本</dt><dd>{{metadata.documentVersion}}</dd></div><div v-if="metadata.sourcePages"><dt>参考页</dt><dd>{{metadata.sourcePages}}</dd></div></dl>
    <p v-if="metadata.verifiedScope"><b>已核实范围：</b>{{metadata.verifiedScope}}</p><p v-if="metadata.limitations" class="reference-limitations"><b>未核实 / 差异：</b>{{metadata.limitations}}</p>
    <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a>
  </section>
</template>
<script setup>
import {computed} from 'vue'
import {safeReferenceUrl,referenceStatusLabels} from '../utils/spare-documents.mjs'
const props=defineProps({metadata:Object})
const sourceUrl=computed(()=>safeReferenceUrl(props.metadata?.sourceUrl))
</script>
<style scoped>
.spare-document-info{padding:16px;background:#f3f8fa;border:1px solid #dce9ed;border-radius:12px;color:#294d60;overflow-wrap:anywhere}.spare-document-info header{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}.spare-document-info header span{font-size:12px;color:#566c79}.spare-document-info dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.spare-document-info dt{font-size:12px;color:#687e8b;margin-bottom:4px}.spare-document-info dd{margin:0;font-size:14px;line-height:1.6}.spare-document-info p{font-size:13px;line-height:1.7;margin:8px 0}.reference-limitations{color:#775a39}.spare-document-info a{display:inline-block;min-height:32px;line-height:32px;color:#17677d;font-size:13px}@media(max-width:540px){.spare-document-info{padding:12px}.spare-document-info dl{grid-template-columns:minmax(0,1fr);gap:10px}}
</style>
