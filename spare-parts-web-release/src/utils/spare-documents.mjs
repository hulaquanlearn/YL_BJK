export const spareDocumentFamilies=['轴承与轴承座','气动元件','电气与供电','传动与减速机','密封件','输送与制作件','其他备件']
export const spareDocumentKinds=['说明书','尺寸图','接线图','选型手册','产品数据表','研究整理']
export const referenceStatusLabels={source_checked:'来源已核查',partial:'部分内容已核实',conflicting:'资料存在冲突',unverified:'来源待核实'}
export const emptyReferenceMetadata=()=>({applicability:'shared',family:'其他备件',documentKind:'产品数据表',manufacturer:'',models:[],sourceUrl:'',documentVersion:'',sourcePages:'',verification:'unverified',verifiedScope:'',limitations:''})
export function safeReferenceUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}}
export function spareDocumentQuery(part){
 const text=String(part?.spec || part?.name || '').normalize('NFKC')
 const model=text.match(/(?:^|[^A-Za-z0-9])([A-Za-z]{1,12}[- ]?\d[A-Za-z0-9_.×*\/-]*|\d{4,6}(?:[-/][A-Za-z0-9]+)*)(?=$|[^A-Za-z0-9])/)
 const search=model?.[1].trim().replace(/^((?:SC|SAI|SDA|MA)\d+)[×x*].*$/i,'$1')
 return {path:'/knowledge',query:{library:'parts',...(search?{search}: {})}}
}
