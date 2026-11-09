const crypto = require('node:crypto');
const Excel = require('exceljs');
const F = require('./fire-inspection');
function cell(value) {
 if (value === null || value === undefined) return '';
 if (value instanceof Date) return value.toISOString().slice(0, 10);
 if (typeof value === 'object') {
  if ('result' in value) return cell(value.result);
  if (value.richText) return value.richText.map(v => v.text || '').join('');
  return value.text || '';
 }
 return String(value).trim();
}
async function parseFireWorkbook(buffer) {
 if (!Buffer.isBuffer(buffer) || buffer.length > 12 * 1024 * 1024) F.fail(400, '请上传12MB以内的消防台账');
 const workbook = new Excel.Workbook();
 try { await workbook.xlsx.load(buffer); } catch { F.fail(400, '台账无法读取，请使用有效xlsx文件'); }
 const fileHash = crypto.createHash('sha256').update(buffer).digest('hex'), rows = [], sheets = [], warnings = [];
 for (const sheet of workbook.worksheets) {
  const type = /灭火器/.test(sheet.name) ? 'extinguisher' : /消火栓|消防栓/.test(sheet.name) ? 'hydrant' : null;
  if (!type) { sheets.push({ name: sheet.name, rows: 0, type: 'ignored' }); continue; }
  let headerRow = 0, headers = [];
  for (let n = 1; n <= Math.min(20, sheet.rowCount); n++) {
   const values = sheet.getRow(n).values.slice(1).map(cell);
   if (values.includes('部门') && values.includes('编号') && values.includes('数量')) { headerRow = n; headers = values; break; }
  }
  if (!headerRow) F.fail(400, `工作表“${sheet.name}”缺少部门、编号或数量表头`);
  const col = name => headers.indexOf(name) + 1;
  const locationColumn = col('位置') || 4;
  if(!col('位置'))warnings.push({sheet:sheet.name,row:headerRow,code:'location_header',message:'原表缺少位置表头，预览按第4列读取，请核对整列'});
  const countBefore = rows.length;
  for (let n = headerRow + 1; n <= sheet.rowCount; n++) {
   const row = sheet.getRow(n), get = name => col(name) ? cell(row.getCell(col(name)).value) : '';
   const area = get('部门'), location = cell(row.getCell(locationColumn).value), code = get('新编号') || get('编号');
   if (![area, location, code, get('型号'), get('数量'), get('备注')].some(Boolean)) continue;
   if (rows.length >= 5000) F.fail(400, '消防台账单次最多5000行');
   const quantityRaw = get('数量'), quantity = quantityRaw === '' ? null : Number(quantityRaw);
   const dateCell = col('出厂日期') ? row.getCell(col('出厂日期')) : null;
   const manufacturedDate = dateCell?.value instanceof Date && !/d/i.test(dateCell.numFmt || '') && /[ym]/i.test(dateCell.numFmt || '') ? dateCell.value.toISOString().slice(0,7) : get('出厂日期');
   if(Number.isFinite(quantity)&&quantity>100)F.fail(400,`${sheet.name}第${n}行数量超过100，请先拆分点位`);
   const item = { sheet: sheet.name, row: n, area: area || '待核实区域', location, code, type, name: type === 'hydrant' ? '消火栓' : '灭火器', spec: get('型号'), manufacturedDate, manufacturer:get('生产厂家'), quantity: Number.isInteger(quantity) && quantity >= 0 && quantity <= 100 ? quantity : null, notes: [get('备注'), get('中心') && `中心：${get('中心')}`].filter(Boolean).join('；'), warnings: [] };
   item.sectionName=get('工段');
   item.source = { sheet:sheet.name,row:n,center:get('中心'),department:area,sectionName:item.sectionName,originalCode:get('编号'),newCode:get('新编号'),manufacturedDateFormat:dateCell?.numFmt||'',fileHash,originalQuantity:item.quantity,originalQuantityRaw:quantityRaw };
   item.sourceKey = crypto.createHash('sha256').update(`${fileHash}\0${sheet.name}\0${n}`).digest('hex');
   item.pointCode = `FI-${type === 'hydrant' ? 'H' : 'E'}-${item.sourceKey.slice(0, 14).toUpperCase()}`;
   const warn = (code, message) => { item.warnings.push(message); warnings.push({ sheet: item.sheet, row: n, code, message }); };
   if (!area) warn('missing_area', '部门为空，将进入待核实区域');
   if (!location) warn('missing_location', '位置为空，需现场补充');
   if (!code) warn('missing_code', '器材编号为空，将保留为空并生成独立点位编号');
   if (item.quantity === null) warn('unknown_quantity', '数量缺失或无效，保留待核实，不默认填1');
   if (item.quantity === 0 || /暂未配置|未配置/.test(item.notes)) { item.status = 'unconfigured'; warn('unconfigured', '暂未配置，不计作可正常使用器材'); }
   else item.status = 'active';
   rows.push(item);
  }
  sheets.push({ name: sheet.name, rows: rows.length - countBefore, type });
 }
 if (!rows.length) F.fail(400, '未找到灭火器或消火栓明细工作表');
 const duplicateGroups = new Map();
 for (const row of rows) { if (!row.code) continue; const key = `${row.type}\0${row.code.toLowerCase()}`; if (!duplicateGroups.has(key)) duplicateGroups.set(key, []); duplicateGroups.get(key).push(row); }
 for (const group of duplicateGroups.values()) if (group.length > 1) for (const row of group) {
  const sameLocation = group.some(other => other !== row && other.area === row.area && other.location === row.location);
  const message = `编号“${row.code}”重复${sameLocation ? '且存在相同位置' : ''}，各源行保留独立记录，请确认是否重复登记`;
  row.warnings.push(message); warnings.push({ sheet: row.sheet, row: row.row, code: 'duplicate_code', message });
 }
 const assetCount=rows.reduce((n,r)=>n+(r.quantity>0?r.quantity:1),0);if(assetCount>10000)F.fail(400,'单次导入展开后超过10000件器材，请拆分文件');
 return { fileHash, rows, sample: rows.slice(0, 30), sheets, warnings, counts: { rows: rows.length, points: rows.length, assets: assetCount, physicalAssets:rows.reduce((n,r)=>n+(r.quantity>0?r.quantity:0),0), warningCount: warnings.length, unconfigured: rows.filter(r => r.status === 'unconfigured').length, unknownQuantity: rows.filter(r => r.quantity === null).length } };
}
function selectedImportWarnings(preview,selectedKeys) {
 const rows=selectedKeys ? preview.rows.filter(r=>selectedKeys.has(r.sourceKey)) : preview.rows;
 return preview.warnings.filter(w=>rows.some(r=>r.sheet===w.sheet&&(r.row===w.row||w.code==='location_header'))||!w.sheet);
}
function warnExistingAssets(preview, existing) {
 preview.existingFingerprint=existingAssetFingerprint(preview,existing);
 const imported=importedSourceKeys(existing);
 const byCode=new Map();for(const asset of existing){if(!asset.code)continue;const key=`${asset.type}\0${String(asset.code).trim().toLowerCase()}`;if(!byCode.has(key))byCode.set(key,[]);byCode.get(key).push(asset);}
 for(const row of preview.rows){const matches=byCode.get(`${row.type}\0${row.code.toLowerCase()}`)||[];if(imported.has(row.sourceKey)){row.alreadyImported=true;continue;}if(!matches.length)continue;
  const message=`现有台账已有${matches.length}项同类型编号“${row.code}”，本次不会覆盖，请核对是否应排除此行`;
  row.warnings.push(message);preview.warnings.push({sheet:row.sheet,row:row.row,code:'existing_code',message});
 }
 preview.counts.warningCount=preview.warnings.length;preview.counts.alreadyImported=preview.rows.filter(r=>r.alreadyImported).length;return preview;
}
function existingAssetFingerprint(preview,existing){
 const sourceKeys=new Set(preview.rows.map(r=>r.sourceKey)),codes=new Set(preview.rows.filter(r=>r.code).map(r=>`${r.type}\0${r.code.toLowerCase()}`));
 const relevant=existing.filter(a=>![...importedSourceKeys([a])].some(key=>sourceKeys.has(key))&&codes.has(`${a.type}\0${String(a.code).trim().toLowerCase()}`)).map(a=>[Number(a.id)||0,a.type,String(a.code).trim().toLowerCase(),a.source_key||'']).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return crypto.createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}
function importedSourceKeys(existing){const keys=new Set();for(const a of existing){if(a.source_key)keys.add(a.source_key);let source=a.source_json;if(typeof source==='string'){try{source=JSON.parse(source)}catch{source=null}}for(const key of (Array.isArray(source?.reconciledSourceKeys)?source.reconciledSourceKeys:[]))if(typeof key==='string')keys.add(key)}return keys;}
module.exports = { parseFireWorkbook, cell, warnExistingAssets, existingAssetFingerprint, selectedImportWarnings, importedSourceKeys };
