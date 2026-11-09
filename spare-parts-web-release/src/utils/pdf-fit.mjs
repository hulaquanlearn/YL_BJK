export function pdfFitScale(page,space,mode='page'){
 const width=Math.max(1,Number(space.width)||1),height=Math.max(1,Number(space.height)||1),pw=Math.max(1,Number(page.width)||1),ph=Math.max(1,Number(page.height)||1)
 const fitWidth=width/pw
 return mode==='page'?Math.min(fitWidth,height/ph):mode==='width'?fitWidth:fitWidth*Math.max(.1,Number(mode)||1)
}
