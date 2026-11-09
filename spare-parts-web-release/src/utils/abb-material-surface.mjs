import {BufferGeometry,Float32BufferAttribute,Mesh,DynamicDrawUsage} from 'three'
import {depositEntries,depositColumn} from './abb-deposit-geometry.mjs'

// A single, shared-vertex surface. The inventory grid is data, never visible
// cubes. Smooth reconstruction is rescaled to the actual closed-mesh volume.
export function createMaterialSurface(dimensions,material,{rings=32,sectors=96}={}){
 const radius=dimensions.lowerRadius,alpha=(dimensions.upperRadius-radius)/dimensions.height/radius
 const points=[[0,0]],faces=[],rim=[]
 for(let ring=1;ring<=rings;ring++)for(let j=0;j<sectors;j++){
  const angle=j*2*Math.PI/sectors,r=ring/rings;points.push([r*Math.cos(angle),r*Math.sin(angle)])
 }
 const at=(ring,j)=>1+(ring-1)*sectors+(j+sectors)%sectors
 for(let j=0;j<sectors;j++)faces.push([0,at(1,j+1),at(1,j)])
 for(let ring=1;ring<rings;ring++)for(let j=0;j<sectors;j++)faces.push([at(ring,j),at(ring,j+1),at(ring+1,j)],[at(ring,j+1),at(ring+1,j+1),at(ring+1,j)])
 for(let j=0;j<sectors;j++)rim.push(at(rings,j))
 const count=points.length,geometry=new BufferGeometry(),positions=new Float32Array(count*2*3),heights=new Float64Array(count)
 geometry.setAttribute('position',new Float32BufferAttribute(positions,3).setUsage(DynamicDrawUsage))
 geometry.setAttribute('uv',new Float32BufferAttribute([...points,...points].flatMap(([u,v])=>[(u+1)/2,(v+1)/2]),2))
 const mesh=new Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;mesh.receiveShadow=true
 function vertex(i,scale){const [u,v]=points[i%count],h=i<count?heights[i]*scale:0,k=1+alpha*h;return [u*radius*k,h,v*radius*k]}
 function tetra(a,b,c){return (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6}
 const volume=scale=>{
  let sum=0;for(const [a,b,c] of faces)sum+=tetra(vertex(a,scale),vertex(b,scale),vertex(c,scale))
  for(let j=0;j<sectors;j++){const a=rim[j],b=rim[(j+1)%sectors];sum+=tetra(vertex(a+count,scale),vertex(a,scale),vertex(b,scale))+tetra(vertex(a+count,scale),vertex(b,scale),vertex(b+count,scale))}
  return Math.abs(sum)
 }
 function update(cell){
  const entries=depositEntries(cell).filter(e=>e.volume>1e-12),size=Number(cell.depositGrid?.gridSize||cell.depositGridSize)||24,map=new Map()
  for(const entry of entries){const ix=Math.round((entry.u+1)*size/2-.5),iy=Math.round((entry.v+1)*size/2-.5);map.set(ix+':'+iy,depositColumn(entry,{...cell,depositGridSize:size},dimensions).height)}
  for(let p=0;p<count;p++){
   const [u,v]=points[p],x=(u+1)*size/2-.5,y=(v+1)*size/2-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy
   let h=0,w=0
   for(const [dx,dy,weight] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
    const a=Math.max(0,Math.min(size-1,ix+dx)),b=Math.max(0,Math.min(size-1,iy+dy)),cu=(a+.5)/size*2-1,cv=(b+.5)/size*2-1
    if(Math.hypot(cu,cv)>1+Math.SQRT2/size)continue
    h+=(map.get(a+':'+b)||0)*weight;w+=weight
   }
   heights[p]=w?h/w:0
  }
  const logicalVolume=entries.reduce((n,e)=>n+e.volume,0)
  if(!(logicalVolume>1e-12)){mesh.visible=false;geometry.setDrawRange(0,0);return {volume:0,renderedVolume:0,cells:0}}
  const v1=volume(1),v2=volume(2),v3=volume(3),c3=(v3-3*v2+3*v1)/6,c2=(v2-2*v1-6*c3)/2,c1=v1-c2-c3
  const polynomial=s=>c1*s+c2*s*s+c3*s*s*s
  let lo=0,hi=2;while(polynomial(hi)<logicalVolume&&hi<64)hi*=2
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(polynomial(mid)>logicalVolume)hi=mid;else lo=mid}
  const scale=(lo+hi)/2,indices=[]
  for(let i=0;i<count*2;i++)positions.set(vertex(i,scale),i*3)
  for(const [a,b,c] of faces){if(heights[a]+heights[b]+heights[c]>1e-12)indices.push(a,b,c);indices.push(a+count,c+count,b+count)}
  for(let j=0;j<sectors;j++){const a=rim[j],b=rim[(j+1)%sectors];if(heights[a]+heights[b]>1e-12)indices.push(a+count,a,b,a+count,b,b+count)}
  geometry.getAttribute('position').array.set(positions);geometry.getAttribute('position').needsUpdate=true
  geometry.setIndex(indices);geometry.setDrawRange(0,indices.length);geometry.computeVertexNormals();geometry.computeBoundingSphere();mesh.visible=true
  let rendered=0;const values=geometry.getAttribute('position').array
  for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;rendered+=tetra(values.subarray(a,a+3),values.subarray(b,b+3),values.subarray(c,c+3))}
  return {volume:logicalVolume,renderedVolume:Math.abs(rendered),cells:entries.length,vertices:count,scale,maxHeight:Math.max(...heights)*scale,minHeight:Math.min(...heights)*scale}
 }
 return {mesh,update,dispose:()=>geometry.dispose()}
}
