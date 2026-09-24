const sharp=require('sharp');
const {ApiError}=require('./utils');

const TILE_HEIGHT=1800;
const OVERLAP=180;
const MAX_TILES=24;
const MAX_RESPONSE_BYTES=2*1024*1024;

async function tilesForSource(sourceId,image){
  const meta=await sharp(image,{limitInputPixels:20_000_000}).metadata();
  const tiles=[];
  const scale=Math.min(1,1800/meta.width);
  const sliceHeight=Math.max(TILE_HEIGHT,Math.floor(TILE_HEIGHT/scale));
  const overlap=Math.floor(OVERLAP/scale);
  for(let top=0,index=0;top<meta.height;index++){
    const height=Math.min(sliceHeight,meta.height-top);
    const buffer=await sharp(image,{limitInputPixels:20_000_000})
      .extract({left:0,top,width:meta.width,height})
      .resize({width:1800,withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
    tiles.push({tileId:`${sourceId}-${index}`,sourceId,top,height,sourceHeight:meta.height,buffer});
    if(top+height>=meta.height)break;
    top+=height-overlap;
  }
  return tiles;
}

function mapTilePhoto(photo,tiles){
  if(!photo?.tileId)return photo;
  const tile=tiles.find(item=>item.tileId===photo.tileId);
  if(!tile||Number(photo.sourceId)!==Number(tile.sourceId))throw new ApiError(502,'识图结果的照片分段编号无效，请人工核对');
  const box=photo.rect||{};
  return {...photo,rect:{x:Number(box.x),y:(tile.top+Number(box.y)*tile.height)/tile.sourceHeight,w:Number(box.w),h:Number(box.h)*tile.height/tile.sourceHeight}};
}

async function readLimitedJson(response){
  const header=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(header)&&header>MAX_RESPONSE_BYTES)throw new ApiError(502,'识图响应过大，请缩小批次重试');
  if(!response.body?.getReader){const data=await response.json();if(Buffer.byteLength(JSON.stringify(data))>MAX_RESPONSE_BYTES)throw new ApiError(502,'识图响应过大，请缩小批次重试');return data;}
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw new ApiError(502,'识图响应过大，请缩小批次重试');chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ApiError(502,'识图响应不是有效 JSON，请重试失败截图')}
}

module.exports={TILE_HEIGHT,OVERLAP,MAX_TILES,MAX_RESPONSE_BYTES,tilesForSource,mapTilePhoto,readLimitedJson};
