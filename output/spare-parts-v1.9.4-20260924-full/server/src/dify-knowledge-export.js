const RECORD_SEPARATOR = '\n\n---\n\n';

function text(value, fallback = '未填写') {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDirection(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '1') return '东侧';
  if (normalized === '2') return '西侧';
  return text(value, '未确认');
}

function formatLocation(row) {
  const shelf = text(row.shelf, '未确认货架');
  const direction = formatDirection(row.position ?? row.direction);
  const layer = text(row.layer, '未确认层');
  const slot = text(row.location ?? row.slot, '未确认货位');
  const code = text(row.locationCode, '');
  const readable = `${shelf}号货架 / ${direction} / ${layer}层 / ${slot}货位`;
  return code ? `${readable}（库位码：${code}）` : readable;
}

function stockStatus(row) {
  const stock = number(row.totalStock ?? row.quantity);
  const safety = row.safetyStock === null || row.safetyStock === undefined
    ? null
    : number(row.safetyStock);
  if (stock <= 0) return '零库存';
  if (safety !== null && stock <= safety) return '低库存';
  if (safety === null) return '未设置安全库存';
  return '库存正常';
}

function inventoryQuantity(row) {
  return number(row.totalStock ?? row.quantity);
}

function materialCode(row) {
  return text(row.materialCode, `inventory-${row.id}`);
}

function partType(row) {
  return text(row.partType, '') || text(row.categoryName, '未分类');
}

function warehouseArea(row) {
  return text(row.warehouseAreaName, '') || text(row.warehouseArea, '未分区');
}

function uniqueParts(rows) {
  const parts = new Map();

  for (const row of rows) {
    const code = materialCode(row);
    const existing = parts.get(code);
    if (!existing) {
      parts.set(code, {
        ...row,
        materialCode: code,
        totalStock: inventoryQuantity(row),
        knowledgeLocations: [formatLocation(row)]
      });
      continue;
    }
    existing.totalStock += inventoryQuantity(row);
    const location = formatLocation(row);
    if (!existing.knowledgeLocations.includes(location)) {
      existing.knowledgeLocations.push(location);
    }
  }

  return [...parts.values()];
}

function formatSnapshotTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function summarizeInventory(rows) {
  const parts = uniqueParts(rows);
  const units = new Map();
  const areas = new Map();
  let lowStock = 0;
  let zeroStock = 0;

  for (const row of rows) {
    const quantity = inventoryQuantity(row);
    const unit = text(row.unit, '未标单位');
    const area = warehouseArea(row);
    units.set(unit, number(units.get(unit)) + quantity);
    areas.set(area, number(areas.get(area)) + 1);
  }

  for (const row of parts) {
    const status = stockStatus(row);
    if (status === '低库存' || status === '零库存') lowStock += 1;
    if (status === '零库存') zeroStock += 1;
  }

  return {
    recordCount: rows.length,
    partTypeCount: parts.length,
    lowStock,
    zeroStock,
    unitTotals: [...units.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN')),
    areaCounts: [...areas.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  };
}

function summarizeByPartType(rows) {
  const groups = new Map();

  for (const row of uniqueParts(rows)) {
    const type = partType(row);
    const current = groups.get(type) || {
      partType: type,
      partCount: 0,
      normalStock: 0,
      lowStock: 0,
      zeroStock: 0,
      safetyStockUnset: 0
    };
    const status = stockStatus(row);
    current.partCount += 1;
    if (status === '库存正常') current.normalStock += 1;
    if (status === '低库存') current.lowStock += 1;
    if (status === '零库存') current.zeroStock += 1;
    if (status === '未设置安全库存') current.safetyStockUnset += 1;
    groups.set(type, current);
  }

  return [...groups.values()].sort((a, b) => a.partType.localeCompare(b.partType, 'zh-CN'));
}

function summarizeByAreaAndPartType(rows) {
  const groups = new Map();

  for (const row of rows) {
    const area = warehouseArea(row);
    const type = partType(row);
    const key = `${area}\u0000${type}`;
    const current = groups.get(key) || {
      warehouseArea: area,
      partType: type,
      partCodes: new Set()
    };
    current.partCodes.add(materialCode(row));
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((item) => ({
      warehouseArea: item.warehouseArea,
      partType: item.partType,
      partCount: item.partCodes.size
    }))
    .sort((a, b) => {
      const areaOrder = a.warehouseArea.localeCompare(b.warehouseArea, 'zh-CN');
      return areaOrder || a.partType.localeCompare(b.partType, 'zh-CN');
    });
}

function buildSummaryBlock(rows, snapshotTime) {
  const summary = summarizeInventory(rows);
  const unitTotals = summary.unitTotals.length
    ? summary.unitTotals.map(([unit, quantity]) => `- ${unit}：${quantity}`).join('\n')
    : '- 暂无库存数据';
  const areaCounts = summary.areaCounts.length
    ? summary.areaCounts.map(([area, count]) => `- ${area}：${count} 条库位记录`).join('\n')
    : '- 暂无货区数据';

  return `# 原粮车间备件库存总览

记录类型：库存汇总
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
备件种类：${summary.partTypeCount}
库位记录：${summary.recordCount}
低库存记录：${summary.lowStock}
零库存记录：${summary.zeroStock}

## 按单位统计库存数量
${unitTotals}

## 按货区统计库位记录
${areaCounts}

检索关键词：备件库有多少种备件、库存总数、库存汇总、低库存数量、零库存数量、货区统计、库存快照时间

回答规则：引用本记录时必须明确说明数据快照时间，不得称为实时库存。`;
}

function buildPartTypeSummaryBlock(rows, snapshotTime) {
  const statistics = summarizeByPartType(rows);
  const table = statistics.length
    ? statistics.map((item) => `| ${item.partType} | ${item.partCount} | ${item.normalStock} | ${item.lowStock} | ${item.zeroStock} | ${item.safetyStockUnset} |`).join('\n')
    : '| 暂无数据 | 0 | 0 | 0 | 0 | 0 |';

  return `# 备件类型统计

记录类型：备件分类统计
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
统计口径：按物料编码去重；同一物料存在多个库位时只计为一种备件。

| 备件类型 | 备件种类 | 库存正常 | 低库存 | 零库存 | 未设置安全库存 |
| --- | ---: | ---: | ---: | ---: | ---: |
${table}

检索关键词：有多少易损件、有多少质保件、有多少厂家备件、备件分类统计、备件类型统计、各类备件数量、低库存类型统计、缺料类型统计

回答规则：数量必须直接引用本表，不得让模型根据检索片段临时估算或自行计数；必须同时说明数据快照时间。`;
}

function buildAreaPartTypeSummaryBlock(rows, snapshotTime) {
  const statistics = summarizeByAreaAndPartType(rows);
  const table = statistics.length
    ? statistics.map((item) => `| ${item.warehouseArea} | ${item.partType} | ${item.partCount} |`).join('\n')
    : '| 暂无数据 | 暂无数据 | 0 |';

  return `# 货区与备件类型统计

记录类型：货区分类统计
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
统计口径：在同一货区内按物料编码去重。

| 货区 | 备件类型 | 备件种类 |
| --- | --- | ---: |
${table}

检索关键词：各货区有多少备件、货区备件分类、五粮货区有多少易损件、蒸糠货区备件类型、破曲货区备件数量、输送货区分类统计

回答规则：货区与类型组合数量必须直接引用本表，不得跨货区合并或自行估算；必须同时说明数据快照时间。`;
}

function buildPartBlock(row, snapshotTime) {
  const code = text(row.materialCode);
  const name = text(row.materialDesc ?? row.partName);
  const stock = number(row.totalStock ?? row.quantity);
  const unit = text(row.unit, '未标单位');
  const area = text(row.warehouseAreaName ?? row.warehouseArea, '未分区');
  const safetyStock = row.safetyStock === null || row.safetyStock === undefined
    ? '未设置'
    : number(row.safetyStock);
  const maxStock = row.maxStock === null || row.maxStock === undefined
    ? '未设置'
    : number(row.maxStock);

  return `# 备件 ${code}｜${name}

记录类型：备件库存明细
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
物料编码：${code}
物料描述：${name}
规格型号：${text(row.spec)}
品牌：${text(row.brand)}
备件类型：${text(row.partType ?? row.categoryName)}
用途说明：${text(row.usageDescription)}
当前库存：${stock} ${unit}
库存状态：${stockStatus(row)}
安全库存：${safetyStock} ${unit}
最高库存：${maxStock} ${unit}
货区：${area}
具体位置：${formatLocation(row)}
位置说明：方位1代表货架东侧，方位2代表货架西侧；货位按货物在货架上从南到北依次排列。
备注：${text(row.remark)}

检索关键词：${code}、${name}、${text(row.spec, '')}、${text(row.brand, '')}、${area}、${text(row.locationCode, '')}、库存、库位、位置、规格型号`;
}

function markdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '｜')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildLowStockBlocks(rows, snapshotTime, pageSize = 25) {
  const items = uniqueParts(rows)
    .filter((row) => ['低库存', '零库存'].includes(stockStatus(row)))
    .sort((a, b) => {
      const statusOrder = stockStatus(a).localeCompare(stockStatus(b), 'zh-CN');
      if (statusOrder !== 0) return statusOrder;
      return text(a.materialCode).localeCompare(text(b.materialCode), 'zh-CN');
    });

  if (!items.length) {
    return [`# 缺料与补货清单

记录类型：缺料补货汇总
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
结论：本次快照没有低库存或零库存记录。

检索关键词：缺料、缺件、低库存、零库存、待补货、补货清单、需要补货的备件、生成缺料表格`];
  }

  const pages = [];
  for (let start = 0; start < items.length; start += pageSize) {
    const page = Math.floor(start / pageSize) + 1;
    const totalPages = Math.ceil(items.length / pageSize);
    const lines = items.slice(start, start + pageSize).map((row) => {
      const stock = inventoryQuantity(row);
      const safety = row.safetyStock === null || row.safetyStock === undefined
        ? '未设置'
        : number(row.safetyStock);
      const maxStock = row.maxStock === null || row.maxStock === undefined
        ? '未设置'
        : number(row.maxStock);
      const suggested = maxStock === '未设置'
        ? '待确认最高库存'
        : Math.max(number(maxStock) - stock, 0);
      const nameAndSpec = `${text(row.materialDesc ?? row.partName)} / ${text(row.spec)}`;
      const locations = row.knowledgeLocations?.length
        ? row.knowledgeLocations.join('；')
        : formatLocation(row);
      return `| ${markdownCell(materialCode(row))} | ${markdownCell(nameAndSpec)} | ${stock}（${stockStatus(row)}） | ${safety} | ${maxStock} | ${suggested} | ${markdownCell(text(row.unit, '未标单位'))} | ${markdownCell(`${warehouseArea(row)} / ${locations}`)} |`;
    });

    pages.push(`# 缺料与补货清单（第 ${page}/${totalPages} 页）

记录类型：缺料补货汇总
数据性质：离线知识库快照，不是实时数据
数据快照时间：${snapshotTime}
低库存及零库存合计：${items.length} 条
统计口径：按物料编码去重；建议补货量=最高库存-当前库存。最高库存未设置时标记为“待确认最高库存”。

| 物料编码 | 名称 / 规格 | 当前库存 | 安全库存 | 最高库存 | 建议补货 | 单位 | 货区 / 精确位置 |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
${lines.join('\n')}

检索关键词：缺料、缺件、低库存、零库存、待补货、补货清单、需要补货的备件、补货数量、生成缺料表格`);
  }
  return pages;
}

function buildInventoryKnowledge(rows, options = {}) {
  const snapshotTime = options.snapshotTime || formatSnapshotTime();
  const safeRows = Array.isArray(rows) ? rows : [];
  const blocks = [
    buildSummaryBlock(safeRows, snapshotTime),
    buildPartTypeSummaryBlock(safeRows, snapshotTime),
    buildAreaPartTypeSummaryBlock(safeRows, snapshotTime),
    ...buildLowStockBlocks(safeRows, snapshotTime, options.lowStockPageSize || 25),
    ...safeRows.map((row) => buildPartBlock(row, snapshotTime))
  ];
  return `${blocks.join(RECORD_SEPARATOR)}\n`;
}

module.exports = {
  RECORD_SEPARATOR,
  buildInventoryKnowledge,
  buildAreaPartTypeSummaryBlock,
  buildLowStockBlocks,
  buildPartBlock,
  buildPartTypeSummaryBlock,
  buildSummaryBlock,
  formatDirection,
  formatLocation,
  formatSnapshotTime,
  stockStatus,
  summarizeByAreaAndPartType,
  summarizeByPartType,
  summarizeInventory,
  uniqueParts
};
