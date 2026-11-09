// Start with an interactive scene and location markers; hydrate only a few GLBs
// at a time. A superseded view stops scheduling jobs, including cached ones.
export async function streamModelJobs(jobs,{concurrency=3,isCurrent=()=>true,yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
 let cursor=0
 await yieldFrame()
 await Promise.all(Array.from({length:Math.min(jobs.length,Math.max(1,concurrency))},async()=>{
  while(isCurrent()&&cursor<jobs.length){const job=jobs[cursor++];await job();await yieldFrame()}
 }))
}
