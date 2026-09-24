const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 4, color: '333333' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
const cell = (value, options = {}) => new TableCell({
  children: [new Paragraph({ text: String(value || ' '), alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT })],
  columnSpan: options.span || 1,
  shading: options.header ? { type: ShadingType.CLEAR, fill: 'E9EDF2' } : undefined,
  margins: { top: 100, bottom: 100, left: 120, right: 120 },
  verticalAlign: 'center',
});
const row = cells => new TableRow({ children: cells });

function createProductionReport({ record, leader, workshop, floor, check, createdAt = new Date() }) {
  const data = check.productionReport || {};
  const issueRows = (data.issues || []).flatMap((issue, index) => [
    row([cell(index === 0 ? '问题分析' : `问题 ${index + 1}`, { header: true }), cell(issue.category), cell(issue.description, { span: 3 })]),
    ...(issue.delay ? [row([cell('耽误总时长', { header: true }), cell(issue.delay, { span: 4 })])] : []),
  ]);
  const measureText = (data.measures || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1600, 2200, 2200, 2200, 2200],
    borders,
    rows: [
      row([cell('生产异常跟踪表', { span: 5, center: true, header: true })]),
      row([cell('开机时间', { header: true }), cell(data.startTime), cell('结束时间', { header: true }), cell(data.endTime), cell('')]),
      row([cell('AGV数量', { header: true }), cell(data.agvCount), cell('下线车号', { header: true }), cell(data.vehicleNo), cell('')]),
      row([cell('维修进度', { span: 5, header: true })]),
      row([cell(data.repairProgress, { span: 5 })]),
      ...issueRows,
      row([cell('改进措施', { span: 5, header: true })]),
      row([cell(measureText, { span: 5 })]),
      row([cell('填报人', { header: true }), cell(leader), cell('车间 / 楼层', { header: true }), cell(`${workshop} · ${floor}楼`), cell('')]),
      row([cell('填报日期', { header: true }), cell(String(record.record_date).slice(0, 10), { span: 4 })]),
    ],
  });
  const doc = new Document({
    creator: '数字工作台', title: '生产异常跟踪表', subject: '组长生产进度异常填报',
    styles: { default: { document: { run: { font: '宋体', size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children: [
      new Paragraph({ text: '生产异常跟踪表', alignment: AlignmentType.CENTER, spacing: { after: 240 }, style: 'Title' }),
      new Paragraph({ text: `${workshop} · ${floor}楼 · ${leader} · ${createdAt.toISOString().slice(0, 10)}`, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
      table,
    ] }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { createProductionReport };
