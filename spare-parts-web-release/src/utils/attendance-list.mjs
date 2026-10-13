const nonWorkTypes=new Set(['rest','leave','blank'])
const nonWorkLabels={rest:'休息',leave:'请假',blank:'空排班'}
const personKey=id=>String(id??'').toUpperCase()
const dayKey=(id,date)=>`${personKey(id)}|${date}`
const compareText=(a,b)=>String(a??'')<String(b??'')?-1:String(a??'')>String(b??'')?1:0
const sourceRow=row=>typeof row.scheduleRow==='number'&&Number.isFinite(row.scheduleRow)?row.scheduleRow:Infinity

// Schedule-only days provide context, never a generated attendance finding.
export function attendanceListRows(analysis) {
  const work=Array.isArray(analysis?.results)?analysis.results:[]
  const rows=[...work],seen=new Set(work.map(row=>dayKey(row.id,row.date)))
  for(const person of Array.isArray(analysis?.people)?analysis.people:[]){
    const department=work.find(row=>personKey(row.id)===personKey(person.id)&&row.department)?.department||''
    for(const day of Array.isArray(person.days)?person.days:[]){
      if(!nonWorkTypes.has(day.type)||typeof day.date!=='string'||!day.date||seen.has(dayKey(person.id,day.date)))continue
      seen.add(dayKey(person.id,day.date))
      rows.push({key:`${person.id}|${day.date}|@${day.type}`,id:person.id,name:person.name,date:day.date,shift:day.label||nonWorkLabels[day.type],rowType:'schedule',scheduleType:day.type,status:day.type,scheduleRow:person.scheduleRow??person.row,department,finalExit:null,advanceSeconds:null,timeline:[],findings:[]})
    }
  }
  return rows
}

function chronological(a,b) {
  const date=compareText(a.date,b.date)
  if(date)return date
  const rowA=sourceRow(a),rowB=sourceRow(b)
  return (rowA<rowB?-1:rowA>rowB?1:0)||compareText(a.id,b.id)||compareText(a.shift,b.shift)||compareText(a.key,b.key)
}
const advanceValue=row=>typeof row.advanceSeconds==='number'&&Number.isFinite(row.advanceSeconds)&&row.advanceSeconds>=0?row.advanceSeconds:null

export function sortAttendanceRows(rows,{field='date',order='asc'}={}) {
  const direction=order==='desc'?-1:1
  return [...rows].sort((a,b)=>{
    if(field==='advance'){
      const valueA=advanceValue(a),valueB=advanceValue(b)
      if(valueA===null&&valueB!==null)return 1
      if(valueB===null&&valueA!==null)return -1
      if(valueA!==null&&valueB!==null&&valueA!==valueB)return direction*(valueA-valueB)
      return chronological(a,b)
    }
    const date=compareText(a.date,b.date)
    return date?direction*date:chronological(a,b)
  })
}
