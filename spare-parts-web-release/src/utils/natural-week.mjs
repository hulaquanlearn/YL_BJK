export function addDays(date,days){return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)}
export function weekCode(monday){
  const thursday=new Date(Date.parse(monday+'T00:00:00Z')+3*86400000),year=thursday.getUTCFullYear();
  const jan4=new Date(Date.UTC(year,0,4));
  const first=jan4.getTime()-((jan4.getUTCDay()+6)%7)*86400000;
  return `${year}-W${String(Math.floor((Date.parse(monday+'T00:00:00Z')-first)/604800000)+1).padStart(2,'0')}`;
}
export function weekMonday(code){
  if(!/^\d{4}-W\d{2}$/.test(code))return '';
  const [year,week]=code.split('-W').map(Number);
  if(year<1000||week<1||week>53)return '';
  const jan4=new Date(Date.UTC(year,0,4)),first=jan4.getTime()-((jan4.getUTCDay()+6)%7)*86400000;
  const start=new Date(first+(week-1)*604800000).toISOString().slice(0,10);
  return weekCode(start)===code?start:'';
}
