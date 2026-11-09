// A vertical cell expands with the same taper as the pot. Its volume is the
// integral of its horizontal area, rather than a height-clipped rectangular box.
export function depositIntegral(height,alpha){return height+alpha*height*height+alpha*alpha*height*height*height/3}
export function diskRectangleArea(x0,x1,y0,y1,r){
 const primitive=x=>.5*(x*Math.sqrt(Math.max(0,r*r-x*x))+r*r*Math.asin(Math.max(-1,Math.min(1,x/r))))
 const quarter=(x,y)=>{x=Math.min(r,Math.abs(x));y=Math.min(r,Math.abs(y));const split=Math.sqrt(Math.max(0,r*r-y*y));return x<=split?x*y:split*y+primitive(x)-primitive(split)}
 const signed=(x,y)=>Math.sign(x)*Math.sign(y)*quarter(x,y)
 return Math.max(0,signed(x1,y1)-signed(x0,y1)-signed(x1,y0)+signed(x0,y0))
}
export function depositColumn(entry,cell,dimensions){
 const radius=dimensions.lowerRadius,alpha=(dimensions.upperRadius-radius)/dimensions.height/radius
 const grid=Math.max(1,Number(cell.depositGridSize)||24),rawWidth=2*radius/grid,target=Math.max(.001,Math.min(dimensions.height,Number(cell.targetHeight)/1000))
 const capacity=Number(entry.capacity),effectiveArea=Number(entry.area)
 const baseArea=Number(entry.baseArea)>0?Number(entry.baseArea):capacity>0?capacity/depositIntegral(target,alpha):effectiveArea>0?effectiveArea*target/depositIntegral(target,alpha):rawWidth*rawWidth
 const volume=Math.max(0,Number(entry.volume)||0)
 const height=alpha?Math.expm1(Math.log1p(3*alpha*volume/baseArea)/3)/alpha:volume/baseArea,width=entry.clipped?rawWidth:Math.sqrt(baseArea),scale=entry.clipped?1:width/rawWidth
 return {x:(Number(entry.u)||0)*radius*scale,z:(Number(entry.v)||0)*radius*scale,height,width,baseArea,alpha,volume,renderedVolume:baseArea*depositIntegral(height,alpha)}
}

export function depositEntries(cell){
 const grid=cell?.depositGrid
 if(!grid)return Object.values(cell?.depositCells||{})
 const size=grid.gridSize,height=grid.targetHeightM||grid.targetHeight/1000,r=grid.lowerRadius,step=2*r/size,baseTotal=Math.PI*r*r
 return Object.entries(grid.cells||{}).map(([key,value])=>{const [ix,iy]=key.split(':').map(Number),baseArea=diskRectangleArea(ix*step-r,(ix+1)*step-r,iy*step-r,(iy+1)*step-r,r),capacity=grid.targetVolume*baseArea/baseTotal;return {u:(ix+.5)/size*2-1,v:(iy+.5)/size*2-1,volume:Number(value?.volume??value)||0,capacity,baseArea,area:capacity/height,clipped:true}})
}

