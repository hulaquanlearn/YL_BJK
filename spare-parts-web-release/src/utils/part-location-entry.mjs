export const emptyPartLocation = () => ({ locationType:'shelf', shelf:null, layer:null, position:null, location:null, locationNote:'' })
export function locationEntryPayload(value, workshopCode) {
  if(workshopCode==='qu_making' || value.locationType==='free_text') {
    const locationNote=String(value.locationNote||'').trim()
    if(workshopCode!=='qu_making' && !locationNote) throw new Error('请填写具体存放位置')
    return {locationType:'free_text',locationNote,locationCode:null,shelf:null,layer:null,position:null,location:null}
  }
  const number=(n,min,max,label,required=false)=>{
    if(n==null || n==='') { if(required) throw new Error(`请选择${label}`); return null }
    const result=Number(n)
    if(!Number.isInteger(result)||result<min||result>max) throw new Error(`${label}须为${min}至${max}的整数`)
    return result
  }
  const shelf=number(value.shelf,1,99,'货架',true), layer=number(value.layer,1,4,'层数',true)
  const position=number(value.position,1,2,'方位'), location=number(value.location,1,99,'货位')
  const locationCode=position!=null && location!=null ? `${String(shelf).padStart(2,'0')}${position}${layer}${String(location).padStart(2,'0')}` : null
  return {locationType:'shelf',locationNote:null,shelf,layer,position,location,locationCode}
}
