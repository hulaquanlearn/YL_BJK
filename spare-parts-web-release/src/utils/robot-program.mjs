export function annotationBatches(report,size=150){
 const batches=[]
 for(const file of report.files.filter(f=>f.readable&&f.kind==='program'))for(let startLine=1;startLine<=file.lineCount;startLine+=size){const endLine=Math.min(startLine+size-1,file.lineCount);batches.push({key:`${file.id}:${startLine}-${endLine}`,fileId:file.id,startLine,endLine})}
 return batches
}
export function annotationCoverage(file,notes=[]){
 const lines=new Set(notes.filter(n=>n.fileId===file.id).map(n=>n.line))
 return {lines:lines.size,routines:file.routines.filter(r=>[...lines].some(n=>n>=r.startLine&&n<=r.endLine)).length,totalRoutines:file.routines.length}
}
export function missingRoutineBatches(file,notes=[]){
 const lines=notes.filter(n=>n.fileId===file.id).map(n=>n.line),batches=[]
 for(const routine of file.routines.filter(r=>!lines.some(n=>n>=r.startLine&&n<=r.endLine)))for(let startLine=routine.startLine;startLine<=routine.endLine;startLine+=150){const endLine=Math.min(startLine+149,routine.endLine);batches.push({key:`${file.id}:${startLine}-${endLine}`,fileId:file.id,startLine,endLine})}
 return batches
}
// Targeted review flags, not a RAPID semantic verifier. Keep model text intact.
export function explanationReview(text=''){
 const flags=[]
 if(/(?:ERROR|异常|错误)[^。\n]{0,100}(?:不会|不可能|绝不)[^。\n]{0,30}(?:触发|发生|执行)/i.test(text))flags.push('异常路径结论需复核：单个等待未设超时，不能证明整个例程的错误处理永不触发。')
 if(/(?:工具朝下|与基座[^。\n]{0,12}对齐|姿态[^。\n]{0,12}单位四元数)/.test(text))flags.push('姿态结论需复核：核对robtarget四元数、轴配置以及工具和工件坐标，不能只凭名称或轴配置判断朝向。')
 return flags
}
