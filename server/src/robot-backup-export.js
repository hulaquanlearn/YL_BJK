const archiver=require('archiver');
const {ApiError}=require('./utils');
const {validateResult}=require('./robot-agent');
function reportText(report,result){
 const files=new Map(report.files.map(f=>[f.id,f]));
 const reference=r=>`${files.get(r.fileId)?.path}:${r.startLine}-${r.endLine}`;
 return [`# ${report.filename} · 机器人程序分析`, `原始ZIP SHA256：${report.sha256}`,`RobotWare：${report.robotWare||'未识别'}；机器人：${report.robotModel||'未识别'}`,`可读模块 ${report.statistics.readableModules}/${report.statistics.modules}；例程 ${report.statistics.routines}；信号 ${report.statistics.signals}`,
  '## 分析结论',result?.summary||'尚未生成AI分析。',...(result?.sections||[]).flatMap(s=>['## '+s.title,s.content,...s.refs.map(r=>'依据：'+reference(r))]),
  '## 待确认事项',...(result?.questions||[]).map(q=>'- '+q),'## 未读取内容',...report.warnings.map(w=>'- '+w),
  '## 使用说明','original/为备份中的原始RAPID文件，字节保持不变。reading/为UTF-8中文注释阅读副本（.txt）。proposal/仅在明确确认后生成修改阅读稿和差异。阅读稿未经过RobotStudio编译、仿真和现场验证，不是可直接恢复的控制器备份。账号、许可证、HOME日志等未纳入阅读包。'].join('\n\n');
}
function annotatedText(file,annotations){
 const grouped=new Map();for(const a of annotations.filter(a=>a.fileId===file.id)){if(!grouped.has(a.line))grouped.set(a.line,[]);grouped.get(a.line).push(a.text)}
 const nl=file.text.includes('\r\n')?'\r\n':'\n';
 return file.text.split(/\r\n|\n|\r/).flatMap((line,i)=>{const comments=(grouped.get(i+1)||[]).map(t=>(line.match(/^\s*/)?.[0]||'')+(file.kind==='config'?'#':'!')+' [中文注释] '+t.replace(/[\r\n]/g,' '));return /^\s*MODULE\b/i.test(line)?[line,...comments]:[...comments,line]}).join(nl);
}
async function exportBackup(report,input,{confirmChanges=false}={}){
 let result=null;if(input){if(input.sourceHash!==report.sha256)throw new ApiError(409,'分析结果与当前备份不一致，请重新读取');result={...validateResult(input,report,{allowChanges:input.mode==='modify',accumulated:true}),sourceHash:report.sha256,mode:input.mode,model:input.model,generatedAt:input.generatedAt}}
 const chunks=[],zip=archiver('zip',{zlib:{level:6}});let size=0;
 const done=new Promise((resolve,reject)=>{zip.on('data',b=>{size+=b.length;if(size>32*1024*1024){zip.abort();reject(new ApiError(413,'导出阅读包超过32MB'))}else chunks.push(b)});zip.on('error',reject);zip.on('end',()=>resolve(Buffer.concat(chunks)))});
 zip.append(reportText(report,result),{name:'程序分析说明.md'});
 zip.append(JSON.stringify({sourceHash:report.sha256,statistics:report.statistics,files:report.files.map(({id,path,sha256,bytes,encoding,readable})=>({id,path,sha256,bytes,encoding,readable})),analysis:result},null,2),{name:'analysis.json'});
 for(const file of report.files){
  zip.append(file.originalBytes,{name:'original/'+file.path});
  if(!file.readable)continue;
  zip.append(annotatedText(file,result?.annotations||[]),{name:'reading/'+file.path+'.annotated.txt'});
  const changes=(result?.changes||[]).filter(c=>c.fileId===file.id).sort((a,b)=>b.startLine-a.startLine);
  if(confirmChanges&&changes.length){const lines=file.text.split(/\r\n|\n|\r/);for(const c of changes)lines.splice(c.startLine-1,c.endLine-c.startLine+1,...c.replacement.split('\n'));zip.append(lines.join(file.text.includes('\r\n')?'\r\n':'\n'),{name:'proposal/'+file.path+'.proposed.txt'});zip.append(changes.slice().reverse().map(c=>`@@ 原始行 ${c.startLine}-${c.endLine} @@\n${c.reason}\n${c.original.split('\n').map(l=>'- '+l).join('\n')}\n${c.replacement.split('\n').map(l=>'+ '+l).join('\n')}\n需验证：${c.tests.join('；')}`).join('\n\n'),{name:'proposal/'+file.path+'.diff.txt'})}
 }
 await zip.finalize();return done;
}
module.exports={reportText,annotatedText,exportBackup};
