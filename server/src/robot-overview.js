// Source excerpts and a structural index, not a fabricated interpretation of module names.
function overviewContext(report,{question=''}={}){
 const context={backupHash:report.sha256,robotWare:report.robotWare,robotModel:report.robotModel,coverage:report.statistics,scope:{type:'program-overview',completeBackup:false,instructions:'结构索引来自可读文件解析；正文仅提供ranges。不得用名称推测代替事实，缺失实现须明确说明。'},files:[],signals:[],hooks:[],moduleIndexOmitted:Math.max(0,report.files.length-300),moduleIndex:report.files.slice(0,300).map(file=>({fileId:file.id,name:file.name,path:file.path,task:file.task,readable:file.readable,lineCount:file.lineCount,routineCount:file.routines.length}))};
 const source=new Map(report.files.filter(f=>f.readable).map(f=>[f.id,f.text.split(/\r\n|\n|\r/)]));
 function include(file,start,end){
  const previous=context.files.find(f=>f.id===file.id),ranges=[...(previous?.ranges||[]),{startLine:Math.max(1,start),endLine:Math.min(file.lineCount,end)}].sort((a,b)=>a.startLine-b.startLine),merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range.startLine<=last.endLine+1)last.endLine=Math.max(last.endLine,range.endLine);else merged.push({...range})}
  const item={id:file.id,path:file.path,task:file.task,kind:file.kind,lineCount:file.lineCount,ranges:merged,source:merged.map(r=>source.get(file.id).slice(r.startLine-1,r.endLine).map((line,i)=>`${r.startLine+i}|${line}`).join('\n')).join('\n[未提供的行已省略]\n')};
  const files=previous?context.files.map(f=>f.id===file.id?item:f):[...context.files,item];if(JSON.stringify({...context,files}).length>168000)return false;context.files=files;return true;
 }
 const files=report.files.filter(f=>f.readable&&f.kind==='program');
 // Entry points and direct calls get evidence first, before optional declarations.
 const terms=new Set((question.match(/[A-Za-z_]\w*/g)||[]).map(word=>word.toLowerCase()));
for(const file of files)for(const routine of file.routines)if(terms.has(routine.name.toLowerCase())){if(!include(file,routine.startLine,routine.endLine))include(file,routine.startLine,Math.min(routine.endLine,routine.startLine+149));}
const entries=files.flatMap(file=>file.routines.filter(r=>/^main$/i.test(r.name)).map(routine=>({file,routine})));
 for(const {file,routine}of entries){if(!include(file,routine.startLine,routine.endLine))include(file,routine.startLine,Math.min(routine.endLine,routine.startLine+149));}
 for(const {routine}of entries)for(const call of routine.calls||[])for(const target of call.targets||[]){const file=files.find(f=>f.id===target.fileId),related=file?.routines.find(r=>r.startLine===target.line);if(related&&!include(file,related.startLine,related.endLine))include(file,related.startLine,Math.min(related.endLine,related.startLine+79));}
 for(const file of files)include(file,1,Math.min(60,file.lineCount));
 for(const file of files)for(const routine of file.routines){include(file,routine.startLine,Math.min(routine.startLine+6,routine.endLine));for(const call of routine.calls||[])include(file,call.line,call.line);}
 for(const file of report.files.filter(f=>f.readable&&f.kind==='config'))include(file,1,file.lineCount);
 for(const file of files)include(file,1,file.lineCount);
 context.scope.providedLines=context.files.reduce((n,f)=>n+f.ranges.reduce((sum,r)=>sum+r.endLine-r.startLine+1,0),0);context.scope.totalReadableLines=report.files.filter(f=>f.readable).reduce((n,f)=>n+f.lineCount,0);
 return context;
}
module.exports={overviewContext};
