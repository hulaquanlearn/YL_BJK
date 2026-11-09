export function knowledgeSection(value,title,ordered=false){
 if(/```/.test(String(value||'')))return String(value||'').trim();
 const aliases={故障现象:['故障现象'],原因分析:['原因分析','故障原因'],处理方法:['处理方法','解决方法','处理步骤'],预防措施:['预防措施']};
 const lines=String(value||'').split(/\r?\n/).filter(line=>!((aliases[title]||[title]).includes(line.trim().replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'').replace(/[：:]$/,'').trim()))).map(line=>line.replace(/^\s*[-*+•]\s+(?=\d+[.、）)])/,'').replace(/^\s*(\d+)[、）)]\s*/,'$1. ').replace(/^\s*•\s*/,'- '));
 const nonempty=lines.map(x=>x.trim()).filter(Boolean);
 if(nonempty.length>1&&!nonempty.some(line=>/^(?:#{1,6}\s|[-*+]\s|\d+\.\s|```|>|\|)/.test(line)))return nonempty.map((line,i)=>ordered?`${i+1}. ${line}`:`- ${line}`).join('\n');
 return lines.join('\n').trim();
}
