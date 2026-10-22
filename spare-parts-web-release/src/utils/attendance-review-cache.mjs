// One in-memory session only. Files, attendance and drafts never go into browser storage.
export function createAttendanceReviewCache() {
  let owner='',snapshot=null;
  return {
    read(session){return session&&session===owner?snapshot:null},
    write(session,state){if(!session)return;owner=session;snapshot=state},
    clear(){owner='';snapshot=null}
  }
}
export const attendanceReviewCache=createAttendanceReviewCache()
