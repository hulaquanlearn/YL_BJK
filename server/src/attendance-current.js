const IMPORT_LOCK='spare_parts_attendance_current_raw_grain';
async function removePreviousReports(db,currentId){
 if(!Number.isSafeInteger(Number(currentId))||Number(currentId)<1)throw Error('Invalid current attendance report');
 const [rows]=await db.query("SELECT id FROM attendance_reports WHERE workshop_code='raw_grain' AND id<>? ORDER BY id FOR UPDATE",[Number(currentId)]);
 for(const row of rows){
  await db.query('DELETE FROM attendance_notes WHERE report_id=?',[row.id]);
  await db.query('DELETE FROM attendance_sources WHERE report_id=?',[row.id]);
  await db.query("DELETE FROM attendance_reports WHERE id=? AND workshop_code='raw_grain'",[row.id]);
 }
 return rows.length;
}
module.exports={IMPORT_LOCK,removePreviousReports};
