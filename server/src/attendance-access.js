function canManageAttendance(user){return ['admin','raw_grain'].includes(user?.role)}
function canReadAttendance(user){return canManageAttendance(user)||user?.role==='viewer'&&user.staffWorkshopCode==='raw_grain'&&user.staffPosition==='shift_leader'}
module.exports={canReadAttendance,canManageAttendance};
