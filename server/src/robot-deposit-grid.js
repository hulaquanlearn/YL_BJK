'use strict';
// Offline deposit-grid geometry. Pure data: no Three.js, no ZIP/program access.
// u/v are pot-local normalized coordinates in [-1,1] relative to the pot lower radius.
// Each cell stores an effective horizontal area and a column height, so a renderer can
// draw a box of area×height and its visible volume equals the stored volume exactly.
const DEFAULT_GRID=24;
const DEFAULT_LOWER_RADIUS=1.09;
const DEFAULT_UPPER_RADIUS=1.2;
const DEFAULT_POT_HEIGHT=.97;
const DEFAULT_POUR_WIDTH=.30;
const footprints=new Map();
const profiles=new Map();
const integral=(h,a)=>h+a*h*h+a*a*h*h*h/3;
const volumeHeight=(volume,area,a)=>a?Math.expm1(Math.log1p(3*a*Math.max(0,volume)/area)/3)/a:Math.max(0,volume)/area;
function diskRectangleArea(x0,x1,y0,y1,r){
 const primitive=x=>.5*(x*Math.sqrt(Math.max(0,r*r-x*x))+r*r*Math.asin(Math.max(-1,Math.min(1,x/r))));
 const quarter=(x,y)=>{x=Math.min(r,Math.abs(x));y=Math.min(r,Math.abs(y));const split=Math.sqrt(Math.max(0,r*r-y*y));return x<=split?x*y:split*y+primitive(x)-primitive(split)};
 const signed=(x,y)=>Math.sign(x)*Math.sign(y)*quarter(x,y);
 return Math.max(0,signed(x1,y1)-signed(x0,y1)-signed(x1,y0)+signed(x0,y0));
}

function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback}
function potVolumeAtHeight(heightM,{lowerRadius=1.09,upperRadius=1.2,potHeight=.97}={}){
 const h=Math.max(0,Math.min(potHeight,finite(heightM,0))),k=(upperRadius-lowerRadius)/potHeight;
 return Math.PI*(lowerRadius*lowerRadius*h+lowerRadius*k*h*h+k*k*h*h*h/3);
}
function createDepositGrid({
 targetHeight=800,
 targetVolume=null,
 lowerRadius=DEFAULT_LOWER_RADIUS,
 upperRadius=DEFAULT_UPPER_RADIUS,
 potHeight=DEFAULT_POT_HEIGHT,
 gridSize=DEFAULT_GRID,
 pourWidthM=DEFAULT_POUR_WIDTH,
 bowlDepthM=.04
}={}){
 const targetHeightM=Math.max(.001,Math.min(potHeight,finite(targetHeight,800)/1000));
 const volume=Number.isFinite(Number(targetVolume))&&Number(targetVolume)>0?Number(targetVolume):potVolumeAtHeight(targetHeightM,{lowerRadius,upperRadius,potHeight});
 const size=Math.max(8,Math.min(64,Math.trunc(finite(gridSize,DEFAULT_GRID))));
 const cells={};
 let inside=footprints.get(size+':'+lowerRadius);
 const half=lowerRadius,cellBaseArea=(2*half/size)*(2*half/size);
 if(!inside){
  inside=[];
  for(let ix=0;ix<size;ix++)for(let iy=0;iy<size;iy++){
   const u=(ix+.5)/size*2-1,v=(iy+.5)/size*2-1,step=2*half/size,baseArea=diskRectangleArea(ix*step-half,(ix+1)*step-half,iy*step-half,(iy+1)*step-half,half);
   if(baseArea>1e-12)inside.push({ix,iy,u,v,key:ix+':'+iy,baseArea});
  }
  if(footprints.size>=32)footprints.delete(footprints.keys().next().value);
  footprints.set(size+':'+lowerRadius,inside);
 }
 const alpha=(upperRadius-lowerRadius)/potHeight/lowerRadius,depth=Math.min(.08,targetHeightM,Math.max(0,finite(bowlDepthM,.04)));
 const profileKey=[size,lowerRadius,upperRadius,potHeight,volume,depth].join(':');let profile=profiles.get(profileKey);
 if(!profile){
  // A shallow concave surface: edge higher than centre. The datum is solved
  // against volume, so shaping the surface never creates additional material.
  let low=0,high=potHeight;
  for(let i=0;i<40;i++){const mid=(low+high)/2,sum=inside.reduce((n,c)=>n+c.baseArea*integral(Math.min(potHeight,mid+depth*Math.min(1,c.u*c.u+c.v*c.v)),alpha),0);if(sum>volume)high=mid;else low=mid}
  profile=inside.map(item=>{const target=(low+high)/2+depth*Math.min(1,item.u*item.u+item.v*item.v),capacity=item.baseArea*integral(Math.min(potHeight,target),alpha);return {...item,capacity,area:capacity/targetHeightM}});
  if(profiles.size>=32)profiles.delete(profiles.keys().next().value);profiles.set(profileKey,profile);
 }
 for(const item of profile)cells[item.key]={...item,volume:0,baseHeight:0,height:0};
 return {schema:'abb-deposit-grid@2',targetHeight:targetHeightM*1000,targetHeightM,targetVolume:volume,gridSize:size,lowerRadius,upperRadius,potHeight,pourWidthM,alpha,bowlDepthM:depth,cells,insideCount:inside.length,depositedVolume:0,overflowVolume:0,completed:false};
}
function addCellVolume(grid,cell,amount){
 if(!(amount>0))return 0;
 const room=Math.max(0,cell.capacity-cell.volume),accepted=Math.min(room,amount);
 cell.volume+=accepted;cell.height=volumeHeight(cell.volume,cell.baseArea,grid.alpha);
 return accepted;
}
function neighbors(grid,cell){
 const out=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const other=grid.cells[(cell.ix+dx)+':'+(cell.iy+dy)];if(other)out.push(other)}return out;
}
function spill(grid,source,amount){
 const queue=[...neighbors(grid,source)],seen=new Set(queue.map(c=>c.ix+':'+c.iy));let remaining=amount;
 while(remaining>1e-12&&queue.length){
  const target=queue.shift();const accepted=addCellVolume(grid,target,remaining);remaining-=accepted;
  for(const next of neighbors(grid,target)){const key=next.ix+':'+next.iy;if(!seen.has(key)){seen.add(key);queue.push(next)}}
 }
 return remaining;
}
function addToCell(grid,cell,amount){
 const accepted=addCellVolume(grid,cell,amount),remaining=amount-accepted
 const left=remaining>1e-12?spill(grid,cell,remaining):0
 grid.depositedVolume+=amount-left
 grid.overflowVolume+=left
}
function relaxSurface(grid){
 // Conservative local granular settling. A footprint may form a thin ridge;
 // it cannot stay as an isolated full-height pillar beside an empty cell.
 const cells=Object.values(grid.cells),slope=.10,step=2*grid.lowerRadius/grid.gridSize;
 for(let pass=0;pass<8;pass++)for(const cell of cells)for(const [dx,dy] of [[1,0],[0,1]]){
  const other=grid.cells[(cell.ix+dx)+':'+(cell.iy+dy)];if(!other)continue;
  const bias=c=>grid.bowlDepthM*Math.min(1,c.u*c.u+c.v*c.v);
  const difference=(cell.height-bias(cell))-(other.height-bias(other)),excess=Math.abs(difference)-slope*step;if(excess<=1e-6)continue;
  const source=difference>0?cell:other,target=difference>0?other:cell;
  const a=source.baseArea*(1+grid.alpha*source.height)**2,b=target.baseArea*(1+grid.alpha*target.height)**2;
  const transfer=Math.min(source.volume,Math.max(0,target.capacity-target.volume),excess/(1/a+1/b)*.65);if(transfer<=1e-12)continue;
  source.volume-=transfer;target.volume+=transfer;source.height=volumeHeight(source.volume,source.baseArea,grid.alpha);target.height=volumeHeight(target.volume,target.baseArea,grid.alpha);
 }
}
function normalizedCell(grid,u,v){
 const iu=Math.max(-1,Math.min(1,finite(u,0))),iv=Math.max(-1,Math.min(1,finite(v,0)));
 const ix=Math.min(grid.gridSize-1,Math.max(0,Math.floor((iu+1)*.5*grid.gridSize))),iy=Math.min(grid.gridSize-1,Math.max(0,Math.floor((iv+1)*.5*grid.gridSize)));
 return grid.cells[ix+':'+iy]||null;
}
function depositSegment(grid,{fromU=0,fromV=0,toU=0,toV=0,volume=0,widthM=null}={}){
 if(!grid||grid.completed)return {added:0,covered:0,overflow:grid?.overflowVolume||0};
 const amount=Math.max(0,finite(volume,0));if(!(amount>0))return {added:0,covered:0,overflow:grid.overflowVolume};
 const width=Math.max(.02,Math.min(1,finite(widthM,grid.pourWidthM))),radius=width/2,lower=grid.lowerRadius;
 const ax=finite(fromU,0),ay=finite(fromV,0),bx=finite(toU,ax),by=finite(toV,ay);
 const physicalLength=Math.hypot((bx-ax)*lower,(by-ay)*lower),steps=Math.max(2,Math.min(96,Math.ceil(physicalLength/Math.max(.01,width/2))));
 const weights=new Map();
 for(let i=0;i<steps;i++){
  const t=(i+.5)/steps,px=ax+(bx-ax)*t,py=ay+(by-ay)*t;
  for(const cell of Object.values(grid.cells)){
   const dx=(cell.u-px)*lower,dy=(cell.v-py)*lower,distance=Math.hypot(dx,dy);
   if(distance>radius*1.6)continue;
   const weight=Math.exp(-(distance*distance)/(2*Math.max(.001,radius/2)**2));
   weights.set(cell.key,(weights.get(cell.key)||0)+weight);
  }
 }
 if(!weights.size){const cell=normalizedCell(grid,ax,ay);if(cell)weights.set(cell.key,1)}
 const totalWeight=[...weights.values()].reduce((n,v)=>n+v,0)||1;
 for(const [key,weight] of weights){addToCell(grid,grid.cells[key],amount*weight/totalWeight)}
 relaxSurface(grid);
 if(grid.depositedVolume>=grid.targetVolume-1e-9){finalizeDepositGrid(grid)}
 return {added:Math.min(amount,grid.targetVolume),covered:Object.values(grid.cells).filter(c=>c.volume>1e-12).length,overflow:grid.overflowVolume,completed:grid.completed};
}
function finalizeDepositGrid(grid){
 if(!grid)return grid;
 const target=grid.targetVolume;
 if(grid.depositedVolume<target-1e-9)return grid;
 // Total volume should already be at target. Fill any gaps with their capacity so the
 // completed pot is visibly full; volume is not created: the sum stays target.
 let sum=Object.values(grid.cells).reduce((n,c)=>n+c.volume,0);
 if(sum<target-1e-9){
  for(const cell of Object.values(grid.cells)){if(sum>=target-1e-9)break;const add=Math.min(cell.capacity-cell.volume,target-sum);cell.volume+=add;cell.height=volumeHeight(cell.volume,cell.baseArea,grid.alpha);sum+=add}
 }
 // Guard the opposite way: if rounding produced a tiny excess, remove it from the
 // largest cells, never from the coverage map.
 if(sum>target+1e-9){let excess=sum-target;for(const cell of Object.values(grid.cells).sort((a,b)=>b.volume-a.volume)){if(excess<=1e-12)break;const take=Math.min(cell.volume,excess);cell.volume-=take;cell.height=volumeHeight(cell.volume,cell.baseArea,grid.alpha);excess-=take}}
 grid.depositedVolume=target;grid.completed=true;return grid;
}
function depositCells(grid){
 return Object.entries(grid?.cells||{}).filter(([,cell])=>cell.volume>1e-12).map(([key,cell])=>({key,u:cell.u,v:cell.v,volume:cell.volume,baseHeight:cell.baseHeight,height:cell.height,area:cell.area,capacity:cell.capacity})).sort((a,b)=>a.key.localeCompare(b.key));
}
function depositStats(grid){
 const values=Object.values(grid?.cells||{}),covered=values.filter(c=>c.volume>1e-12),volume=values.reduce((n,c)=>n+c.volume,0);
 return {targetHeight:grid?.targetHeight||0,targetVolume:grid?.targetVolume||0,depositedVolume:grid?.depositedVolume||0,visibleVolume:volume,coveredCells:covered.length,gridCells:values.length,completed:!!grid?.completed,overflowVolume:grid?.overflowVolume||0};
}
module.exports={DEFAULT_GRID,DEFAULT_LOWER_RADIUS,DEFAULT_UPPER_RADIUS,DEFAULT_POT_HEIGHT,DEFAULT_POUR_WIDTH,potVolumeAtHeight,createDepositGrid,depositSegment,finalizeDepositGrid,depositCells,depositStats,volumeHeight,diskRectangleArea};
