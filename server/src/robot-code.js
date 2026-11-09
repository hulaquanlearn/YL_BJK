'use strict';
// Shared by ZIP indexing, motion plans and the browser's offline interpreter.
function codePart(line){let quoted=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue}quoted=!quoted}else if(line[i]==='!'&&!quoted)return line.slice(0,i)}return line}
module.exports={codePart};
