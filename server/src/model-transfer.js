const fs=require('node:fs'),path=require('node:path');
// Installed after live-session authentication. Keep private/no-store and fall
// through to the original file when gzip or a sidecar is unavailable.
function compressedModelTransfer(roots){return (req,res,next)=>{
 if(!['GET','HEAD'].includes(req.method)||req.headers.range||!req.acceptsEncodings('gzip')||!/^\/abb-irb6700\/[\w-]+\.meshopt\.glb$/.test(req.path))return next();
 const find=index=>{
  if(index>=roots.length)return next();const original=path.join(roots[index],'models',req.path),file=original+'.gz';
  fs.stat(original,(error,stat)=>{if(error||!stat.isFile())return find(index+1);fs.stat(file,(error,packed)=>{if(error||!packed.isFile())return find(index+1);res.vary('Accept-Encoding');res.set({'Content-Type':'model/gltf-binary','Content-Encoding':'gzip','X-Model-Byte-Length':String(stat.size),'Accept-Ranges':'none'});res.sendFile(file,{cacheControl:false,etag:false,lastModified:false},error=>{if(error)next(error)})})})
 };find(0)
}}
module.exports={compressedModelTransfer};
