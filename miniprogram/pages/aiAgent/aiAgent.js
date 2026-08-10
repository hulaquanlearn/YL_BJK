const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const {
  classifyIntent,
  findShelfAreas,
  parseInventoryQuery
} = require('../../services/assistant-query.js');

const EMPTY_RESULT = {
  resultType: '',
  resultTitle: '',
  resultBadge: '',
  resultText: '',
  resultSummary: null,
  resultCards: [],
  resultTotal: 0,
  clarificationOptions: []
};

function stockState(item) {
  const stock = Number(item.totalStock) || 0;
  const hasReorderPoint = item.reorderPoint !== null && item.reorderPoint !== undefined;
  if (stock <= 0) return { stockStatus: 'zero', stockStatusText: '无库存' };
  if (hasReorderPoint && stock <= Number(item.reorderPoint)) {
    return { stockStatus: 'low', stockStatusText: '低库存' };
  }
  return { stockStatus: 'normal', stockStatusText: '库存正常' };
}

function formatLocation(item) {
  if (item.locationType === 'free_text') {
    return [item.warehouseAreaName, item.locationNote].filter(Boolean).join(' · ') || '位置未登记';
  }
  const sideMap = { 1: '东侧', 2: '西侧' };
  const side = sideMap[item.position] || (item.position ? String(item.position) : '');
  return [
    item.warehouseAreaName || '未分区',
    item.shelf === 0 || item.shelf ? `${item.shelf}号货架` : '货架未登记',
    side,
    item.layer === 0 || item.layer ? `${item.layer}层` : '层数未登记',
    item.location === 0 || item.location ? `${item.location}货位` : ''
  ].filter(Boolean).join(' · ');
}

Page({
  data: {
    userQuestion: '',
    isLoading: false,
    messages: [],
    areas: [],
    shelfMap: {},
    pendingQuestion: '',
    inventorySuggestions: [
      '502000268还有多少库存',
      '查询五粮货区低库存备件',
      '备件库内有多少种备件'
    ],
    maintenanceSuggestions: [
      '输送机皮带跑偏怎么检查',
      '电机轴承日常如何保养',
      '减速机异响需要检查什么'
    ],
    ...EMPTY_RESULT
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.loadInventoryContext();
  },

  async loadInventoryContext() {
    try {
      const res = await api.getFilters();
      const data = res.data || {};
      this.setData({
        areas: (data.areas || []).filter(Boolean),
        shelfMap: data.shelfMap || {}
      });
    } catch (err) {
      console.warn('AI查询筛选上下文加载失败：', err);
    }
  },

  handleInput(e) {
    this.setData({ userQuestion: e.detail.value || '' });
  },

  useSuggestion(e) {
    this.setData({ userQuestion: e.currentTarget.dataset.text || '' });
  },

  clearResult() {
    this.setData({ ...EMPTY_RESULT });
  },

  setMessageResult(title, text, badge = '即时回答', type = 'message') {
    this.setData({
      ...EMPTY_RESULT,
      resultType: type,
      resultTitle: title,
      resultBadge: badge,
      resultText: text,
      isLoading: false
    });
  },

  async callAi() {
    const question = String(this.data.userQuestion || '').trim();
    if (this.data.isLoading) {
      wx.showToast({ title: '正在处理，请稍候', icon: 'none' });
      return;
    }
    if (!question) {
      wx.showToast({ title: '请输入要查询的问题', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true, pendingQuestion: question, ...EMPTY_RESULT });
    const intent = classifyIntent(question);

    if (intent === 'greeting') {
      this.setMessageResult(
        '您好，我是备件与设备助手',
        '我可以查询实时库存、备件位置和低库存清单，也可以协助排查原粮车间设备故障、维修、保养与点检问题。'
      );
      return;
    }

    if (intent === 'restricted' || intent === 'empty') {
      this.setMessageResult(
        '这个问题不在当前服务范围内',
        '您可以咨询：\n1. 备件库存、物料编码、规格型号和存放位置\n2. 低库存与补货相关信息\n3. 原粮车间设备故障排查、维修、保养和点检',
        '范围提醒'
      );
      return;
    }

    if (intent === 'inventory') {
      await this.queryInventory(question);
      return;
    }

    await this.queryMaintenance(question);
  },

  async queryInventory(question, forcedArea = '') {
    try {
      const parsed = parseInventoryQuery(question, this.data.areas);
      if (forcedArea) parsed.area = forcedArea;

      if (parsed.summaryType && !parsed.area && !parsed.shelf && !parsed.layer) {
        await this.queryInventorySummary(parsed.summaryType);
        return;
      }

      if (parsed.shelf && !parsed.area) {
        const candidateAreas = findShelfAreas(parsed.shelf, this.data.shelfMap);
        if (candidateAreas.length > 1) {
          this.setData({
            ...EMPTY_RESULT,
            resultType: 'clarify',
            resultTitle: '需要确认货区',
            resultBadge: '信息不足',
            resultText: `${parsed.shelf}号货架存在于多个货区，请选择要查询的货区：`,
            clarificationOptions: candidateAreas.map(area => ({ label: area, area })),
            pendingQuestion: question,
            isLoading: false
          });
          return;
        }
        if (candidateAreas.length === 1) parsed.area = candidateAreas[0];
      }

      if (parsed.layer && !parsed.shelf && !parsed.keyword) {
        this.setMessageResult(
          '需要补充货架信息',
          `已识别到第${parsed.layer}层，但不同货架都有相同层数。请补充货区和货架号，例如“五粮货区4号货架第${parsed.layer}层”。`,
          '请补充条件',
          'clarify'
        );
        return;
      }

      const params = { page: 1, pageSize: 12, sort: parsed.lowStock ? 'stockAsc' : 'codeAsc' };
      if (parsed.area) params.warehouseAreaName = parsed.area;
      if (parsed.shelf) params.shelf = parsed.shelf;
      if (parsed.layer) params.layer = parsed.layer;
      if (parsed.keyword) params.searchKeyword = parsed.keyword;
      if (parsed.lowStock) params.lowStock = '1';

      const res = await api.getParts(params);
      const rows = res.data || [];
      if (!rows.length) {
        const condition = [
          parsed.area,
          parsed.shelf ? `${parsed.shelf}号货架` : '',
          parsed.layer ? `${parsed.layer}层` : '',
          parsed.keyword
        ].filter(Boolean).join(' · ');
        this.setMessageResult(
          '未找到匹配备件',
          condition
            ? `没有查到符合“${condition}”的记录。请检查物料编码，或减少一个筛选条件后重试。`
            : '没有查到相关备件，请输入物料编码、名称、规格型号或明确的货区位置。',
          '实时数据库'
        );
        return;
      }

      const total = Number(res.total) || rows.length;
      const cards = rows.map(item => ({
        ...item,
        ...stockState(item),
        specDisplay: item.spec || '未登记',
        locationDisplay: formatLocation(item)
      }));
      this.setData({
        ...EMPTY_RESULT,
        resultType: 'inventory',
        resultTitle: parsed.lowStock ? '低库存查询结果' : '实时库存查询结果',
        resultBadge: '实时数据库',
        resultText: total > rows.length ? `共找到 ${total} 项，先显示前 ${rows.length} 项` : `共找到 ${total} 项`,
        resultCards: cards,
        resultTotal: total,
        isLoading: false
      });
    } catch (err) {
      console.error('实时库存查询失败：', err);
      this.setMessageResult(
        '实时库存暂时无法查询',
        `${err.message || '服务连接失败'}。请稍后重试；维修与保养咨询仍可正常使用。`,
        '服务异常'
      );
    }
  },

  async queryInventorySummary(summaryType) {
    try {
      const res = await api.getDashboard();
      const dashboard = res.data?.dashboard || {};
      const summaryMap = {
        partTypes: {
          value: Number(dashboard.partTypes) || 0,
          label: '种备件',
          detail: '按当前数据库中的有效物料统计'
        },
        totalStock: {
          value: Number(dashboard.totalStock) || 0,
          label: '库存总量',
          detail: '不同计量单位的数量合计，仅用于总览'
        },
        lowStock: {
          value: Number(dashboard.lowStock) || 0,
          label: '项低库存',
          detail: '库存达到或低于订购点'
        }
      };
      this.setData({
        ...EMPTY_RESULT,
        resultType: 'summary',
        resultTitle: '备件库实时汇总',
        resultBadge: '实时数据库',
        resultSummary: summaryMap[summaryType],
        isLoading: false
      });
    } catch (err) {
      console.error('库存汇总查询失败：', err);
      this.setMessageResult('库存汇总暂时不可用', err.message || '请稍后重试', '服务异常');
    }
  },

  chooseClarification(e) {
    const area = e.currentTarget.dataset.area;
    const question = this.data.pendingQuestion;
    if (!area || !question || this.data.isLoading) return;
    this.setData({
      userQuestion: `${area} ${question}`,
      isLoading: true,
      ...EMPTY_RESULT
    });
    this.queryInventory(question, area);
  },

  async queryMaintenance(question) {
    const recentMessages = (this.data.messages || []).slice(-4);
    const newMessages = [...recentMessages, { role: 'user', content: question }];
    try {
      const res = await api.chat(newMessages);
      const answer = res.data?.answer || '维修助手未返回内容，请补充设备名称和故障现象后重试。';
      this.setData({
        ...EMPTY_RESULT,
        resultType: 'maintenance',
        resultTitle: '设备维修建议',
        resultBadge: 'AI辅助判断',
        resultText: answer,
        messages: [...newMessages, { role: 'assistant', content: answer }].slice(-6),
        isLoading: false
      });
    } catch (err) {
      console.error('维修助手调用失败：', err);
      this.setMessageResult(
        '维修助手暂时不可用',
        `${err.message || '服务连接失败'}。请稍后重试；涉及设备异常时，请先停机并遵守现场安全规程。`,
        '服务异常'
      );
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  clearChatHistory() {
    this.setData({
      userQuestion: '',
      messages: [],
      pendingQuestion: '',
      ...EMPTY_RESULT
    });
    wx.showToast({ title: '查询记录已清空', icon: 'success' });
  }
});
