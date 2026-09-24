const ExcelJS = require('exceljs');
const sharp = require('sharp');
const { ApiError } = require('./utils');
const I = require('./inspection-notice');

function cellStyle(cell,{bold=false,fill=null,align='left'}={}){
  cell.font={name:'微软雅黑',size:11,bold,color:{argb:'FF243047'}};
  cell.alignment={vertical:'middle',horizontal:align,wrapText:true};
  cell.border={top:{style:'thin',color:{argb:'FFCBD3DC'}},left:{style:'thin',color:{argb:'FFCBD3DC'}},bottom:{style:'thin',color:{argb:'FFCBD3DC'}},right:{style:'thin',color:{argb:'FFCBD3DC'}}};
  if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
  if(bold)cell.font={...cell.font,bold:true};
}
function cropBounds(width,height,box){
  const left=Math.min(width-1,Math.floor(box.x*width)),top=Math.min(height-1,Math.floor(box.y*height));
  return {left,top,width:Math.max(1,Math.min(width-left,Math.round(box.w*width))),height:Math.max(1,Math.min(height-top,Math.round(box.h*height)))};
}
function wrapLines(value,capacity){
  const result=[];let line='',size=0;
  for(const char of String(value??'')){
    if(char==='\n'){result.push(line);line='';size=0;continue}
    const width=char.charCodeAt(0)>255?2:1;
    if(size+width>capacity&&line){result.push(line);line='';size=0}
    line+=char;size+=width;
  }
  result.push(line);
  return result;
}
function chunks(value,capacity,perRow=17){
  const parts=[];let part='',lines=1,width=0;
  for(const char of String(value??'')){
    const charWidth=char.charCodeAt(0)>255?2:1;
    const nextLine=char==='\n'||width+charWidth>capacity;
    if(nextLine){lines++;width=0}
    if(lines>perRow){parts.push(part);part='';lines=1;width=0}
    part+=char;
    if(char!=='\n')width+=charWidth;
  }
  parts.push(part);
  return parts;
}
async function exportNotice(notice,sources){
  const issues=notice.issues;
  if(!issues.length||issues.some(item=>item.reviewStatus!=='confirmed'))throw new ApiError(400,'请先逐项确认问题，再导出通报');
  if(sources.some(source=>!source.reviewed))throw new ApiError(400,'还有原截图未核对，请先确认全部截图');
  if(issues.reduce((count,issue)=>count+(issue.photos||[]).length,0)>I.LIMITS.exportPhotos)throw new ApiError(400,'单份通报最多导出240张问题图片');
  const byId=new Map(sources.map(source=>[Number(source.id),source]));
  const workbook=new ExcelJS.Workbook();workbook.creator='检查通报整理';workbook.created=new Date();
  const sheet=workbook.addWorksheet('检查通报',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.25,right:.25,top:.4,bottom:.4,header:.15,footer:.15}}});
  sheet.columns=[{width:8},{width:22},{width:40},{width:17},{width:62},{width:48},{width:32},{width:24}];
  sheet.mergeCells('A1:H1');sheet.getCell('A1').value=notice.header.title;sheet.getCell('A1').font={name:'微软雅黑',size:19,bold:true};sheet.getCell('A1').alignment={horizontal:'center',vertical:'middle'};sheet.getRow(1).height=36;
  const labels=[['检查时间',notice.header.checkTime],['检查范围',notice.header.checkScope],['检查人员',notice.header.inspectors],['检查项目',notice.header.checkItems]];
  for(let i=0;i<labels.length;i++){const row=i+2;sheet.mergeCells(`A${row}:B${row}`);sheet.mergeCells(`C${row}:H${row}`);sheet.getCell(`A${row}`).value=labels[i][0];sheet.getCell(`C${row}`).value=labels[i][1];cellStyle(sheet.getCell(`A${row}`),{bold:true,fill:'FFF3F6FA'});cellStyle(sheet.getCell(`C${row}`));sheet.getRow(row).height=25;}
  const head=sheet.getRow(6);I.HEADERS.forEach((title,i)=>{const cell=head.getCell(i+1);cell.value=title;cellStyle(cell,{bold:true,fill:'FFEAF0F5',align:'center'});});head.height=29;
  sheet.views=[{state:'frozen',ySplit:6}];sheet.pageSetup.printTitlesRow='1:6';
  let rowNo=7;
  for(let i=0;i<issues.length;i++){
    const issue=issues[i],photos=issue.photos||[];
    const photoColumns=photos.length===1?1:2,slotW=photos.length===1?230:132,slotH=photos.length===1?140:98;
    const desc=[issue.location&&!issue.problem.includes(issue.location)?`位置：${issue.location}`:'',issue.equipment&&!issue.problem.includes(issue.equipment)?`设备编号：${issue.equipment}`:'',issue.problem].filter(Boolean).join('\n');
    const descriptionParts=chunks(desc,55),rectificationParts=chunks(issue.rectification,43),remarkParts=chunks(issue.remarks,21);
    const sections=Math.max(descriptionParts.length,rectificationParts.length,remarkParts.length);
    const firstRow=rowNo;
    for(let section=0;section<sections;section++){
      const row=sheet.getRow(rowNo),values=[section===0?i+1:'',section===0?issue.segment:'','',section===0?issue.category:'',descriptionParts[section]||'',rectificationParts[section]||'','',remarkParts[section]||''];
      values.forEach((value,col)=>{const cell=row.getCell(col+1);cell.value=value;cellStyle(cell,{align:col===0?'center':'left'});});
      const textLines=Math.max(1,...[values[4],values[5],values[7]].map((value,index)=>wrapLines(value,[55,43,21][index]).length));
      const imageHeight=section===0?Math.ceil(photos.length/photoColumns)*(slotH+7)+14:0;
      const pixelHeight=Math.max(62,textLines*20+16,imageHeight);
      row.height=Math.min(400,pixelHeight*.75);
      rowNo++;
    }
    for(let p=0;p<photos.length;p++){
      const photo=photos[p],source=byId.get(Number(photo.sourceId));if(!source)throw new ApiError(400,'问题图片引用的截图不存在');
      const bounds=cropBounds(source.width,source.height,photo.rect);
      const image=await sharp(source.image,{limitInputPixels:20_000_000}).extract(bounds).resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
      const info=await sharp(image).metadata();
      const scale=Math.min(slotW/info.width,slotH/info.height,1),w=info.width*scale,h=info.height*scale;
      const colOffset=photoColumns===1?(280-w)/2:(p%2)*140+(slotW-w)/2+6;
      const rowOffset=Math.floor(p/photoColumns)*(slotH+7)+(slotH-h)/2+6;
      const imageId=workbook.addImage({buffer:image,extension:'jpeg'});
      const emu=9525;
      sheet.addImage(imageId,{
        tl:{nativeCol:2,nativeColOff:Math.round(colOffset*emu),nativeRow:firstRow-1,nativeRowOff:Math.round(rowOffset*emu)},
        br:{nativeCol:2,nativeColOff:Math.round((colOffset+w)*emu),nativeRow:firstRow-1,nativeRowOff:Math.round((rowOffset+h)*emu)},
        editAs:'oneCell'
      });
    }
  }
  sheet.autoFilter={from:'A6',to:`H${rowNo-1}`};sheet.pageSetup.printArea=`A1:H${rowNo-1}`;
  return workbook.xlsx.writeBuffer();
}
module.exports={exportNotice,cropBounds,wrapLines,chunks};
