// Rendering cost must not change programmed speed. Inactive tabs reset the
// clock instead of accumulating an invisible movement while they are hidden.
export function createModelAnimationClock(){
 let last=null,wasActive=false
 return (time,active=true)=>{
  const delta=last===null||!wasActive||!active?0:Math.max(0,(time-last)/1000)
  last=time;wasActive=active;return delta
 }
}
