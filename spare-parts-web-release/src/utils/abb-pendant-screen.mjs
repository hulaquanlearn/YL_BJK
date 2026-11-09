import {screenAreas} from './abb-pendant-controls.mjs'

// Layout follows the user's field photographs; state values come from the
// local simulator, rather than copying an emergency/automatic state from a photo.
export function drawPendantScreen(canvas,{title,step={},status=''}={}){
 const c=canvas.getContext('2d'),page=step.page||'menu',choices=screenAreas(step.choices||[]),teal='#138e9b',plum='#813555'
 const font=(size,bold=false)=>{c.font=(bold?'bold ':'')+size+'px Arial,"Microsoft YaHei",sans-serif'}
 const text=(s,x,y,size=17,color='#171717',bold=false)=>{font(size,bold);c.fillStyle=color;c.fillText(s,x,y)}
 const line=(x1,y1,x2,y2,color=plum,width=2)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
 const circle=(x,y,r,color=plum)=>{c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke()}
 const box=(x,y,w,h,color='#aaa')=>{c.strokeStyle=color;c.lineWidth=1;c.strokeRect(x,y,w,h)}
 function icon(id,x,y){
  if(id==='jog'||id==='remote'){circle(x+13,y+5,5);line(x+13,y+10,x+13,y+24);line(x+3,y+25,x+24,y+25);line(x+3,y+25,x+3,y+30);line(x+24,y+25,x+24,y+30);line(x+3,y+30,x+24,y+30);return}
  if(id==='io'){line(x+1,y+10,x+25,y+10);line(x+25,y+10,x+18,y+3);line(x+25,y+10,x+18,y+17);line(x+25,y+23,x+1,y+23);line(x+1,y+23,x+8,y+16);line(x+1,y+23,x+8,y+30);return}
  if(id==='info'||id==='frames'){circle(x+10,y+7,7);box(x+2,y+17,25,16,plum);text('i',x+8,y+11,13,plum,true);return}
  if(id==='control'){line(x+3,y+29,x+18,y+12,plum,5);line(x+18,y+12,x+12,y+6);line(x+12,y+6,x+18,y+1);line(x+18,y+1,x+19,y+7);line(x+19,y+7,x+25,y+8);line(x+25,y+8,x+28,y+3);line(x+28,y+3,x+30,y+10);line(x+30,y+10,x+24,y+16);line(x+24,y+16,x+18,y+12);return}
  if(id==='logs'){circle(x+9,y+7,6);line(x+4,y+13,x+4,y+30);line(x+4,y+30,x+27,y+30);line(x+27,y+30,x+27,y+8);return}
  if(id==='backup'){box(x+2,y+8,27,24,plum);line(x+4,y+15,x+27,y+15);line(x+15,y,x+15,y+19);line(x+9,y+13,x+15,y+19);line(x+15,y+19,x+21,y+13);return}
  if(id==='files'){line(x+1,y+6,x+12,y+6);line(x+12,y+6,x+17,y+12);line(x+17,y+12,x+29,y+12);line(x+29,y+12,x+29,y+30);line(x+29,y+30,x+1,y+30);line(x+1,y+30,x+1,y+6);return}
  if(id==='calibrate'){box(x+1,y+11,29,13,plum);for(let j=0;j<6;j++)line(x+5+j*4,y+24,x+5+j*4,y+17);return}
  if(id==='lock'){box(x+2,y+13,27,19,plum);c.strokeStyle=plum;c.beginPath();c.arc(x+15,y+13,8,Math.PI,Math.PI*2);c.stroke();return}
  if(id==='hotedit'){line(x+24,y+3,x+24,y+25);circle(x+24,y+28,4);line(x+2,y+28,x+2,y+3);line(x+2,y+28,x+19,y+28);line(x+2,y+28,x+16,y+12);for(let i=0;i<4;i++)line(x+27,y+6+i*4,x+31,y+6+i*4);return}
  if(id==='program'){line(x+1,y+12,x+14,y+1);line(x+14,y+1,x+27,y+10);line(x+27,y+10,x+14,y+21);line(x+14,y+21,x+1,y+12);box(x+3,y+23,27,10,plum);return}
  box(x+2,y+9,27,22,plum);line(x+6,y+16,x+24,y+16);line(x+6,y+23,x+24,y+23)
 }
 c.clearRect(0,0,645,483);c.fillStyle='#fff';c.fillRect(0,0,645,483)
 box(1,1,643,49,'#aaa');box(1,1,83,49,teal)
 c.fillStyle=teal;for(let i=0;i<3;i++)c.fillRect(12,12+i*8,25,4)
 line(49,18,61,32,teal,2);line(61,32,74,18,teal,2)
 circle(109,21,7);line(98,43,98,36);line(98,36,109,28);line(109,28,120,36);line(120,36,120,43);line(98,43,120,43);box(91,3,13,14,plum);text('i',95,14,12,plum)
 text(step.programRunning?'自动':'手动',132,18,14,'#171717',true);text('IRB 6700',132,40,15)
 text(step.emergency?'紧急停止':(step.enableState===1||step.programRunning)?'电机开启':'电机关闭',284,18,14,step.emergency?'#bd253e':'#333',true)
 const running=step.programRunning??/正在执行/.test(status);text((running?'运行中':'已停止')+'（速度 '+(step.speedPercent??100)+'%）',365,40,14)
 line(615,14,632,35,teal,3);line(632,14,615,35,teal,3)
 if(page==='menu'){
  box(2,53,638,383,teal)
 }else{
  c.fillStyle='#eee';c.fillRect(2,52,641,25);text(page==='production'?'自动生产窗口：'+(step.routine?.name||'未选择程序'):title||'手动操纵',8,70,16,'#222',true)
 }
 if(['program','production','source-view'].includes(page)){
  const current=step.current
  for(const [i,row] of (current?.excerpt||[]).entries()){
   const y=132+i*27;if(y>390)break
   if(row.line===current.line){c.fillStyle='#e7e9ff';c.fillRect(31,y-21,610,27);text('➜',4,y,16,'#9c2757')}
   text(String(row.line),5,y,12,'#777');text(row.text.trim().slice(0,58),39,y,17,'#008025')
  }
  if(!current)text('请在程序面板选择备份和例程',20,145,17,'#666')
 }
 if(page==='jog'){
  text('位置 / 关节',365,110,15,'#666');(step.joints||[]).forEach((v,i)=>text('J'+(i+1)+'   '+Number(v).toFixed(3)+'°',365,150+i*34,18))
 }
 if(step.rows?.length)step.rows.forEach((row,i)=>text(String(row).slice(0,64),15,110+i*28,16))
 if(page==='quickset'){box(292,80,302,352,teal);text('速度',308,108,22);text((step.speedPercent??100)+' %',421,161,24);line(488,161,584,161,teal,2)}
 for(const area of choices){
  if(page==='menu'){
   icon(area.id,area.left+9,area.top+3);text(area.label,area.left+50,area.top+27,area.id==='files'?16:18)
  }else if(page==='quickset'&&area.id.startsWith('speed-')){
   const x=(area.left+area.right)/2,y=(area.top+area.bottom)/2;circle(x,y,area.id.startsWith('speed-set-')?26:23);text(area.label,area.left+8,y+6,17,plum)
  }else{
   c.fillStyle='#f2f2f2';c.fillRect(area.left,area.top,area.right-area.left,area.bottom-area.top);box(area.left,area.top,area.right-area.left,area.bottom-area.top)
   text(area.label,area.left+12,area.top+(area.bottom-area.top)/2+6,area.id.startsWith('remote-')?26:17)
  }
 }
 if(page==='menu'){text('⌁  注销',18,421,14,plum);text('Default User',68,421,13,'#555');text('⏻  重新启动',335,421,15,plum)}
 c.fillStyle='#f7f7f7';c.fillRect(2,441,641,40);box(2,441,641,40,'#bbb');box(5,444,145,35,teal)
 text(page==='production'?'自动生产窗口':page==='program'?'程序编辑器':'手动操纵',17,466,15,'#333');text('⚙',582,465,27,teal);text('⚙',607,474,20,teal)
 return [...choices,...(page==='menu'?[{id:'session-logout',label:'注销模拟会话',left:10,top:393,right:250,bottom:437},{id:'session-restart',label:'重启模拟会话',left:315,top:393,right:630,bottom:437}]:[]),{id:'menu',label:'ABB菜单',left:0,top:0,right:85,bottom:49},{id:'close',label:'关闭',left:600,top:0,right:645,bottom:49},{id:'quickset',label:'快速设置',left:570,top:441,right:645,bottom:483}]
}
