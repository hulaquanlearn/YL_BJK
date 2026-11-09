// Geometry-only fingerprint for GLB files: world-space vertex/index/normal data,
// ignoring node names, extras, materials and asset metadata. Two files are
// geometry-identical when their multisets of primitive fingerprints match.
import crypto from 'node:crypto'

function multiply(a,b){
 const out=new Array(16).fill(0)
 for(let column=0;column<4;column++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[column*4+row]+=a[k*4+row]*b[column*4+k]
 return out
}
function localMatrix(node){
 if(node.matrix)return node.matrix.slice()
 const [tx,ty,tz]=node.translation||[0,0,0]
 const [x,y,z,w]=node.rotation||[0,0,0,1]
 const [sx,sy,sz]=node.scale||[1,1,1]
 const xx=1-2*(y*y+z*z),xy=2*(x*y-z*w),xz=2*(x*z+y*w)
 const yx=2*(x*y+z*w),yy=1-2*(x*x+z*z),yz=2*(y*z-x*w)
 const zx=2*(x*z-y*w),zy=2*(y*z+x*w),zz=1-2*(x*x+y*y)
 // Column-major 4x4 matrix.
 return [xx*sx,yx*sx,zx*sx,0, xy*sy,yy*sy,zy*sy,0, xz*sz,yz*sz,zz*sz,0, tx,ty,tz,1]
}
function apply(matrix,x,y,z){
 // Column-major: m11=0, m21=1, m31=2, m41=3, m12=4, ... m14=12, m24=13, m34=14.
 return [matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12], matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13], matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]]
}
export function geometryFingerprint(buffer){
 const jsonLength=buffer.readUInt32LE(12)
 const json=JSON.parse(buffer.subarray(20,20+jsonLength).toString('utf8'))
 const binStart=20+jsonLength+8
 const bin=buffer.subarray(binStart)
 const bufferViews=json.bufferViews||[]
 function accessorData(index){
  const accessor=json.accessors[index]
  if(!accessor)return null
  const view=bufferViews[accessor.bufferView]
  if(!view)return null
  const componentSize={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[accessor.componentType]||4
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[accessor.type]||1
  const stride=view.byteStride||componentSize*components
  const start=(view.byteOffset||0)+(accessor.byteOffset||0)
  const reader={5126:'f32',5123:'u16',5125:'u32'}[accessor.componentType]||'f32'
  const values=new Array(accessor.count*components)
  for(let i=0;i<accessor.count;i++)for(let c=0;c<components;c++){
   const offset=start+i*stride+c*componentSize
   values[i*components+c]=reader==='f32'?bin.readFloatLE(offset):reader==='u16'?bin.readUInt16LE(offset):bin.readUInt32LE(offset)
  }
  return {values,components,count:accessor.count}
 }
 const parent=new Map()
 for(let index=0;index<(json.nodes||[]).length;index++){
  const node=json.nodes[index]
  for(const child of node.children||[])parent.set(child,index)
 }
 const worldCache=new Map()
 function worldMatrix(index){
  if(worldCache.has(index))return worldCache.get(index)
  const node=json.nodes[index]
  const local=localMatrix(node)
  const parentIndex=parent.get(index)
  const matrix=parentIndex===undefined?local:multiply(worldMatrix(parentIndex),local)
  worldCache.set(index,matrix)
  return matrix
 }
 const fingerprints=[]
 for(let nodeIndex=0;nodeIndex<(json.nodes||[]).length;nodeIndex++){
  const node=json.nodes[nodeIndex]
  if(node.mesh===undefined)continue
  const matrix=worldMatrix(nodeIndex)
  const mesh=json.meshes[node.mesh]
  for(const primitive of mesh.primitives||[]){
   const hash=crypto.createHash('sha256')
   const position=accessorData(primitive.attributes.POSITION)
   if(position){
    const out=new Float64Array(position.count*3)
    for(let i=0;i<position.count;i++){
     const [px,py,pz]=apply(matrix,position.values[i*3],position.values[i*3+1],position.values[i*3+2])
     out[i*3]=Math.round(px*1e6)/1e6;out[i*3+1]=Math.round(py*1e6)/1e6;out[i*3+2]=Math.round(pz*1e6)/1e6
     if(!Number.isFinite(out[i*3])||!Number.isFinite(out[i*3+1])||!Number.isFinite(out[i*3+2]))throw new Error('non-finite transformed position')
    }
    hash.update(Buffer.from(out.buffer))
   }
   const index=accessorData(primitive.indices)
   if(index)hash.update(Buffer.from(new Uint32Array(index.values).buffer))
   const normal=accessorData(primitive.attributes.NORMAL)
   if(normal){
    const out=new Float64Array(normal.count*3)
    for(let i=0;i<normal.count;i++){
     const v=[normal.values[i*3],normal.values[i*3+1],normal.values[i*3+2]]
     const length=Math.hypot(v[0],v[1],v[2])||1
     out[i*3]=Math.round(v[0]/length*1e6)/1e6;out[i*3+1]=Math.round(v[1]/length*1e6)/1e6;out[i*3+2]=Math.round(v[2]/length*1e6)/1e6
    }
    hash.update(Buffer.from(out.buffer))
   }
   fingerprints.push(hash.digest('hex'))
  }
 }
 fingerprints.sort()
 return crypto.createHash('sha256').update(fingerprints.join('|')).digest('hex')
}
