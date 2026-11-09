// IK samples describe one path. Ease once over that path, not at every sample.
export function sampleJointPath(frames,elapsed,duration,{continuous=false}={}){
 const end=frames.length-1
 if(end<1)return {joints:frames[0]?.slice()||[],complete:true}
 const progress=Math.max(0,Math.min(1,elapsed/Math.max(.001,duration)))
 if(progress>=1)return {joints:frames[end].slice(),complete:true}
 const t=continuous?progress:progress*progress*(3-2*progress),position=t*end,index=Math.min(end-1,Math.floor(position)),fraction=position-index
 return {joints:frames[index].map((value,i)=>value+(frames[index+1][i]-value)*fraction),complete:false}
}
