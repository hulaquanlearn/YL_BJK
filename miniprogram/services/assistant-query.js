const INVENTORY_WORDS = [
  '备件', '物料', '库存', '库位', '货位', '货架', '货区', '工段',
  '低库存', '补货', '缺货', '编码', '型号', '规格', '在途'
];

const MAINTENANCE_WORDS = [
  '故障', '报警', '报错', '维修', '检修', '保养', '点检', '异响',
  '发热', '漏油', '振动', '跑偏', '跳闸', '堵料', '不转', '无法启动',
  '怎么修', '怎么检查', '原因', '排查'
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function includesAny(text, words) {
  return words.some(word => text.includes(word));
}

function classifyIntent(query) {
  const text = normalizeText(query);
  if (!text) return 'empty';
  if (/^(你好|您好|嗨|hello|hi|在吗|早上好|下午好|晚上好)[！!。. ]*$/.test(text.toLowerCase())) {
    return 'greeting';
  }

  const looksLikeMaterialCode = /(?:^|\D)\d{7,}(?:\D|$)/.test(text);
  if (looksLikeMaterialCode || includesAny(text, INVENTORY_WORDS)) return 'inventory';
  if (includesAny(text, MAINTENANCE_WORDS)) return 'maintenance';
  return 'restricted';
}

function extractNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function normalizeShelf(value) {
  const match = String(value ?? '').match(/\d+/);
  return match ? String(Number(match[0])) : '';
}

function findKnownArea(query, areas = []) {
  const text = normalizeText(query);
  const normalizedAreas = (areas || []).filter(area => area && area !== '全部');
  return normalizedAreas.find(area => {
    const name = String(area);
    const shortName = name.replace(/(货区|工段|区域|车间)$/g, '');
    return text.includes(name) || (shortName.length >= 2 && text.includes(shortName));
  }) || null;
}

function cleanInventoryKeyword(query, parsed) {
  let text = normalizeText(query);
  const removable = [
    /第?\d+层(?:货架|层数)?/g,
    /第?\d+号(?:货架)?/g,
    /\d+#货架/g,
    /货架(?:第)?\d+号?/g,
    /(?:查询|查找|帮我查|请问|请查询|看一下|看看|当前|实时|现在|还有|有多少|多少|哪些|哪里|位置|在哪|在什么地方)/g,
    /(?:库存|备件|物料|货区|工段|区域|车间)/g,
    /(?:低库存|库存不足|需要补货|补货清单|缺货)/g
  ];
  removable.forEach(pattern => {
    text = text.replace(pattern, ' ');
  });
  if (parsed.area) {
    const shortName = String(parsed.area).replace(/(货区|工段|区域|车间)$/g, '');
    text = text.replace(parsed.area, ' ').replace(shortName, ' ');
  }
  return text.replace(/[，。！？、,!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseInventoryQuery(query, areas = []) {
  const text = normalizeText(query);
  const parsed = {
    area: findKnownArea(text, areas),
    shelf: extractNumber(text, [
      /第(\d+)号(?:货架)?/,
      /(\d+)号货架/,
      /(\d+)#货架/,
      /货架(?:第)?(\d+)号?/
    ]),
    layer: extractNumber(text, [
      /第(\d+)层(?:货架)?/,
      /(\d+)层(?:货架|层数)?/
    ]),
    lowStock: /(低库存|库存不足|需要补货|补货清单|缺货)/.test(text),
    summaryType: null,
    keyword: ''
  };

  if (/(多少种|几种|备件种类|物料种类|备件总数|物料总数)/.test(text)) {
    parsed.summaryType = 'partTypes';
  } else if (/(库存总量|总库存|一共有多少库存)/.test(text)) {
    parsed.summaryType = 'totalStock';
  } else if (/(低库存.*多少|多少.*低库存)/.test(text)) {
    parsed.summaryType = 'lowStock';
  }

  parsed.keyword = cleanInventoryKeyword(text, parsed);
  return parsed;
}

function findShelfAreas(shelf, shelfMap = {}) {
  const target = normalizeShelf(shelf);
  if (!target) return [];
  return Object.keys(shelfMap).filter(area =>
    (shelfMap[area] || []).some(item => normalizeShelf(item) === target)
  );
}

module.exports = {
  classifyIntent,
  findKnownArea,
  findShelfAreas,
  normalizeShelf,
  normalizeText,
  parseInventoryQuery
};
