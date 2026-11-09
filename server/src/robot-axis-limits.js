'use strict';
const DEFAULT_AXIS_LIMITS=[[-170,170],[-65,85],[-180,70],[-300,300],[-130,130],[-360,360]];
function axisLimits(report){
 const joints=report?.motionConfig?.joints;
 return Array.isArray(joints)&&joints.length===6&&joints.every(j=>Number.isFinite(j.lowerDegrees)&&Number.isFinite(j.upperDegrees)&&j.lowerDegrees<j.upperDegrees)?joints.map(j=>[j.lowerDegrees,j.upperDegrees]):DEFAULT_AXIS_LIMITS.map(r=>r.slice());
}
module.exports={DEFAULT_AXIS_LIMITS,axisLimits};
