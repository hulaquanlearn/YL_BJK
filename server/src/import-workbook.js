const ExcelJS = require('exceljs');

const WORKSHOP_IMPORT_SCHEMAS = {
  raw_grain: {
    name: '原粮车间',
    usesWarehouseArea: true,
    locationMode: 'rack',
    columns: ['物料编码', '物料名称', '单位', '规格型号', '库存量', '订购点', '最高储备', '不含税单价', '备件类型', '货区', '六位库位码', '存放位置', '用途', '备注', '模型名称']
  },
  qu_making: {
    name: '制曲车间',
    usesWarehouseArea: false,
    locationMode: 'free',
    columns: ['物料编码', '物料名称', '单位', '规格型号', '库存量', '订购点', '最高储备', '不含税单价', '备件类型', '存放位置', '用途', '备注', '模型名称']
  },
  brewing: {
    name: '酿酒车间',
    usesWarehouseArea: true,
    locationMode: 'mixed',
    columns: ['物料编码', '物料名称', '单位', '规格型号', '库存量', '订购点', '最高储备', '不含税单价', '备件类型', '货区', '六位库位码', '存放位置', '用途', '备注', '模型名称']
  }
};

function workshopImportSchema(code) {
  return WORKSHOP_IMPORT_SCHEMAS[code] || WORKSHOP_IMPORT_SCHEMAS.raw_grain;
}

async function makeWorkbook({ title, columns, example, notes = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '备件管理中心';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((header, index) => ({ header, key: `c${index}`, width: Math.max(14, Math.min(36, header.length * 3 + 5)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C2B' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 24;
  if (example) sheet.addRow(columns.map(column => example[column] ?? ''));
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(columns.length).letter}1` };
  if (notes.length) {
    const help = workbook.addWorksheet('填写说明');
    help.columns = [{ header: '说明', key: 'note', width: 90 }];
    help.getRow(1).font = { bold: true };
    notes.forEach(note => help.addRow([note]));
  }
  return workbook.xlsx.writeBuffer();
}

async function makePartsTemplate(workshopCode) {
  const schema = workshopImportSchema(workshopCode);
  const example = {
    物料编码: '示例-001', 物料名称: '示例轴承', 单位: '个', 规格型号: '6204', 库存量: 10,
    订购点: 2, 最高储备: 20, 不含税单价: 12.5, 备件类型: '易损件', 货区: '五粮货区',
    六位库位码: '011101', 存放位置: schema.locationMode === 'free' ? '备件库东侧A柜' : 'A区01架', 用途: '设备检修', 备注: '示例行，导入前可删除'
  };
  return makeWorkbook({
    title: `${schema.name}备件台账`, columns: schema.columns, example,
    notes: [
      '必填列只有“物料编码”和“物料名称”。请勿修改表头名称。',
      `当前模板适用于${schema.name}；${schema.usesWarehouseArea ? '支持货区字段。' : '该车间不要求货区，使用“存放位置”即可。'}`,
      '模型名称必须与模型库名称完全一致；留空保留已有绑定，新物料未绑定时展示公共模型，解除绑定请在页面操作。',
      '单价、订购点、最高储备等选填项留空表示未配置，不按0处理；单位留空默认为个，库存量留空默认为0。',
      '有固定货架库位时填写六位库位码；无固定库位时填写存放位置。',
      '正式导入采用整批校验：只要存在错误行，就不会写入任何数据。系统会显示具体行号、字段、原因和修改建议。'
    ]
  });
}

async function makePartsErrorWorkbook(sourceBuffer, errors) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('台账中没有可用工作表');

  let headerRowNumber = 1;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values.map(value => String(value ?? '').trim());
    if (values.some(value => ['物料编码', '编码'].includes(value)) && values.some(value => ['物料名称', '物料描述', '备件名称', '名称'].includes(value))) {
      headerRowNumber = rowNumber;
      break;
    }
  }

  const resultColumn = sheet.columnCount + 1;
  const reasonColumn = resultColumn + 1;
  const suggestionColumn = resultColumn + 2;
  const header = sheet.getRow(headerRowNumber);
  header.getCell(resultColumn).value = '校验结果';
  header.getCell(reasonColumn).value = '错误原因';
  header.getCell(suggestionColumn).value = '修改建议';
  for (const column of [resultColumn, reasonColumn, suggestionColumn]) {
    header.getCell(column).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } };
    header.getCell(column).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  sheet.getColumn(resultColumn).width = 12;
  sheet.getColumn(reasonColumn).width = 48;
  sheet.getColumn(suggestionColumn).width = 58;

  const grouped = new Map();
  for (const error of errors) {
    const rowNumber = Number(error.row);
    if (!Number.isInteger(rowNumber) || rowNumber <= headerRowNumber) continue;
    const list = grouped.get(rowNumber) || [];
    list.push(error);
    grouped.set(rowNumber, list);
  }
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rowErrors = grouped.get(rowNumber) || [];
    row.getCell(resultColumn).value = rowErrors.length ? '需修改' : '通过';
    row.getCell(reasonColumn).value = rowErrors.map(error => `${error.field}：${error.reason}`).join('\n');
    row.getCell(suggestionColumn).value = [...new Set(rowErrors.map(error => error.suggestion))].join('\n');
    row.getCell(resultColumn).font = { bold: true, color: { argb: rowErrors.length ? 'FFC2410C' : 'FF15803D' } };
    row.getCell(reasonColumn).alignment = { vertical: 'top', wrapText: true };
    row.getCell(suggestionColumn).alignment = { vertical: 'top', wrapText: true };
    if (rowErrors.length) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  }
  return workbook.xlsx.writeBuffer();
}

async function makeEquipmentTemplate() {
  return makeWorkbook({
    title: '设备型号与备件关系',
    columns: ['设备型号', '物料编码', '单台用量', '所属工段', '备注'],
    example: { 设备型号: '斗式提升机NE30', 物料编码: '示例-001', 单台用量: 2, 所属工段: '输送工段', 备注: '示例行，导入前可删除' },
    notes: [
      '“设备型号”为必填列；“物料编码”为选填列；不需要填写具体设备编码。',
      '只填写设备型号时建立型号台账；填写物料编码时同时建立该型号与备件的关系。',
      '设备型号不存在时会自动创建；同一型号可填写多行绑定多个备件，物料编码必须存在于所选车间。'
    ]
  });
}

function sendXlsx(res, filename, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(Buffer.from(buffer));
}

async function makeModelBindingsTemplate(models = []) {
  const buffer = await makeWorkbook({ title: '模型绑定', columns: ['物料编码', '模型名称'], notes: [
    '填写已有物料编码，以及模型库中的准确模型名称。不要修改表头。',
    '模型名称留空保留原绑定；未绑定物料展示公共模型。',
    '本导入只更新模型绑定，不修改库存、价格、库位或备件主信息。',
    '请先校验文件；任一错误都会阻止整批写入。可从“可用模型”工作表复制名称。'
  ] });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const sheet = workbook.addWorksheet('可用模型');
  sheet.columns = [{ header: '模型ID', key: 'id', width: 12 }, { header: '模型名称', key: 'name', width: 40 }];
  models.forEach(model => sheet.addRow(model)); sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}
module.exports = { WORKSHOP_IMPORT_SCHEMAS, workshopImportSchema, makePartsTemplate, makePartsErrorWorkbook, makeEquipmentTemplate, makeModelBindingsTemplate, sendXlsx };
