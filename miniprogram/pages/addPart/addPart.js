const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
    part: {},
    isLoading: false,
    areas: [],
    shelvesByArea: {},
    layersByAreaShelf: {},
    areaOptions: [],
    selectedAreaIndex: 0,
    selectedArea: '',
    shelfOptions: [],
    selectedShelfIndex: 0,
    selectedShelf: '',
    layerOptions: [],
    selectedLayerIndex: 0,
    selectedLayer: '',
    showAddModal: false,
    addType: '',
    addValue: '',
    locationTypeOptions: ['标准货架库位', '自由位置说明'],
    locationTypeIndex: 0,
    partTypeOptions: ['易损件', '质保件'],
    partTypeIndex: 0,
    currentStep: 1,
    existingMaterialHint: '',
    workshops: [
      { code: 'raw_grain', name: '原粮车间' },
      { code: 'qu_making', name: '制曲车间' },
      { code: 'brewing', name: '酿酒车间' }
    ],
    workshopNames: ['原粮车间', '制曲车间', '酿酒车间'],
    workshopIndex: 0,
    selectedWorkshopCode: 'raw_grain',
    selectedWorkshopName: '原粮车间',
    isAdmin: false,
    usesWarehouseArea: true
  },

  onLoad() {
    if (!auth.requireLogin({ editor: true })) return;
    const user = auth.getUser();
    const ownWorkshop = auth.userWorkshopCode();
    const initialCode = user?.role === 'admin' ? 'raw_grain' : ownWorkshop;
    const workshopIndex = Math.max(this.data.workshops.findIndex(item => item.code === initialCode), 0);
    const workshop = this.data.workshops[workshopIndex];
    this.setData({
      isAdmin: user?.role === 'admin',
      workshopIndex,
      selectedWorkshopCode: workshop.code,
      selectedWorkshopName: workshop.name,
      usesWarehouseArea: workshop.code !== 'qu_making',
      locationTypeIndex: workshop.code === 'qu_making' ? 1 : 0
    });
    this.loadLocationData();
  },

  onWorkshopChange(e) {
    if (!this.data.isAdmin) return;
    const workshopIndex = Number(e.detail.value) || 0;
    const workshop = this.data.workshops[workshopIndex];
    if (!workshop) return;
    this.setData({
      workshopIndex,
      selectedWorkshopCode: workshop.code,
      selectedWorkshopName: workshop.name,
      usesWarehouseArea: workshop.code !== 'qu_making',
      locationTypeIndex: workshop.code === 'qu_making' ? 1 : 0,
      areas: [],
      areaOptions: [],
      selectedAreaIndex: 0,
      selectedArea: '',
      shelfOptions: [],
      selectedShelfIndex: 0,
      selectedShelf: '',
      layerOptions: [],
      selectedLayerIndex: 0,
      selectedLayer: '',
      'part.warehouseArea': '',
      'part.locationNote': ''
    });
    this.loadLocationData();
  },

  async checkMaterialCode() {
    const code = String(this.data.part.materialCode || '').trim();
    if (!code) return;
    try {
      const res = await api.getParts({
        page: 1,
        pageSize: 20,
        searchKeyword: code,
        workshopCode: this.data.selectedWorkshopCode,
        sort: 'codeAsc'
      });
      const existing = (res.data || []).find(item => String(item.materialCode || '').trim() === code);
      this.setData({ existingMaterialHint: existing ? `该编码已存在：${existing.materialDesc}。继续提交将为它新增库位。` : '' });
    } catch (_) {
      this.setData({ existingMaterialHint: '' });
    }
  },

  nextStep() {
    const { currentStep, part, selectedArea, selectedShelf, selectedLayer, locationTypeIndex, usesWarehouseArea } = this.data;
    if (currentStep === 1 && (!(part.materialCode || '').trim() || !(part.materialDesc || '').trim())) {
      wx.showToast({ title: '请先填写物料编码和描述', icon: 'none' });
      return;
    }
    if (currentStep === 2 && usesWarehouseArea) {
      const freeText = locationTypeIndex === 1;
      if (!selectedArea || (!freeText && (!selectedShelf || !selectedLayer)) || (freeText && !(part.locationNote || '').trim())) {
        wx.showToast({ title: '请完善存放位置信息', icon: 'none' });
        return;
      }
    }
    this.setData({ currentStep: Math.min(currentStep + 1, 3) });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  previousStep() {
    this.setData({ currentStep: Math.max(this.data.currentStep - 1, 1) });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  async loadLocationData() {
    try {
      const res = await api.getFilters({ workshopCode: this.data.selectedWorkshopCode });
      
      if (res.success && res.data) {
        const { areas, shelfMap, layerMap } = res.data;
        
        const shelvesByArea = {};
        const layersByAreaShelf = {};
        
        areas.forEach(area => {
          shelvesByArea[area] = shelfMap[area] || [];
          layersByAreaShelf[area] = {};
          (shelfMap[area] || []).forEach(shelf => {
            layersByAreaShelf[area][shelf] = layerMap[area]?.[shelf] || [];
          });
        });
        
        this.setData({
          areas: areas || [],
          shelvesByArea: shelvesByArea,
          layersByAreaShelf: layersByAreaShelf,
          areaOptions: ['请选择', ...(areas || [])],
          selectedAreaIndex: 0
        });
      }
    } catch (err) {
      console.error('加载位置数据失败：', err);
      wx.showToast({ title: '加载位置数据失败', icon: 'none' });
    }
  },

  onAreaChange(e) {
    const index = e.detail.value;
    const area = this.data.areaOptions[index];

    if (area === '请选择') {
      this.setData({
        selectedAreaIndex: index,
        selectedArea: '',
        'part.warehouseArea': '',
        shelfOptions: ['请选择'],
        selectedShelfIndex: 0,
        selectedShelf: '',
        layerOptions: ['请选择'],
        selectedLayerIndex: 0,
        selectedLayer: ''
      });
      return;
    }

    const shelves = this.data.shelvesByArea[area] || [];

    this.setData({
      selectedAreaIndex: index,
      selectedArea: area,
      'part.warehouseArea': '',
      shelfOptions: ['请选择', ...shelves],
      selectedShelfIndex: 0,
      selectedShelf: '',
      layerOptions: ['请选择'],
      selectedLayerIndex: 0,
      selectedLayer: ''
    });
  },

  onShelfChange(e) {
    const index = e.detail.value;
    const shelf = this.data.shelfOptions[index];
    
    if (shelf === '请选择') {
      this.setData({
        selectedShelfIndex: index,
        selectedShelf: '',
        layerOptions: ['请选择'],
        selectedLayerIndex: 0,
        selectedLayer: ''
      });
      return;
    }
    
    const layers = this.data.layersByAreaShelf[this.data.selectedArea]?.[shelf] || [];
    
    this.setData({
      selectedShelfIndex: index,
      selectedShelf: shelf,
      layerOptions: ['请选择', ...layers],
      selectedLayerIndex: 0,
      selectedLayer: ''
    });
  },

  onLayerChange(e) {
    const index = e.detail.value;
    const layer = this.data.layerOptions[index];
    
    this.setData({
      selectedLayerIndex: index,
      selectedLayer: layer === '请选择' ? '' : layer
    });
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`part.${field}`]: e.detail.value
    });
  },

  onLocationTypeChange(e) {
    this.setData({ locationTypeIndex: Number(e.detail.value) || 0 });
  },

  onPartTypeChange(e) {
    this.setData({ partTypeIndex: Number(e.detail.value) || 0 });
  },

  showAddModal(e) {
    const type = e.currentTarget.dataset.type;
    
    if (type === 'shelf' && !this.data.selectedArea) {
      wx.showToast({ title: '请先选择货区', icon: 'none' });
      return;
    }
    if (type === 'layer' && !this.data.selectedShelf) {
      wx.showToast({ title: '请先选择货架', icon: 'none' });
      return;
    }
    
    this.setData({
      showAddModal: true,
      addType: type,
      addValue: ''
    });
  },

  closeAddModal() {
    this.setData({
      showAddModal: false,
      addType: '',
      addValue: ''
    });
  },

  onAddInputChange(e) {
    this.setData({
      addValue: e.detail.value
    });
  },

  confirmAdd() {
    const { addType, addValue, selectedArea, selectedShelf } = this.data;
    
    if (!addValue || !addValue.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    
    const value = addValue.trim();
    
    if (addType === 'area') {
      if (this.data.areas.includes(value)) {
        wx.showToast({ title: '该货区已存在', icon: 'none' });
        return;
      }
      
      const newAreas = [...this.data.areas, value];
      const newShelvesByArea = { ...this.data.shelvesByArea, [value]: [] };
      const newLayersByAreaShelf = { ...this.data.layersByAreaShelf, [value]: {} };
      
      this.setData({
        areas: newAreas,
        areaOptions: ['请选择', ...newAreas],
        shelvesByArea: newShelvesByArea,
        layersByAreaShelf: newLayersByAreaShelf,
        selectedArea: value,
        selectedAreaIndex: newAreas.indexOf(value) + 1,
        'part.warehouseArea': '',
        shelfOptions: ['请选择'],
        selectedShelf: '',
        selectedShelfIndex: 0,
        layerOptions: ['请选择'],
        selectedLayer: '',
        selectedLayerIndex: 0,
        showAddModal: false,
        addValue: ''
      });
      
      wx.showToast({ title: '已加入本次录入', icon: 'success' });
      
    } else if (addType === 'shelf') {
      const displayValue = value + '号';
      if (this.data.shelvesByArea[selectedArea].includes(displayValue)) {
        wx.showToast({ title: '该货架已存在', icon: 'none' });
        return;
      }
      
      const newShelves = [...this.data.shelvesByArea[selectedArea], displayValue].sort((a, b) => {
        return Number(a.replace('号', '')) - Number(b.replace('号', ''));
      });
      
      const newShelvesByArea = {
        ...this.data.shelvesByArea,
        [selectedArea]: newShelves
      };
      
      const newLayersByAreaShelf = {
        ...this.data.layersByAreaShelf,
        [selectedArea]: {
          ...this.data.layersByAreaShelf[selectedArea],
          [displayValue]: []
        }
      };
      
      this.setData({
        shelvesByArea: newShelvesByArea,
        shelfOptions: ['请选择', ...newShelves],
        layersByAreaShelf: newLayersByAreaShelf,
        selectedShelf: displayValue,
        selectedShelfIndex: newShelves.indexOf(displayValue) + 1,
        layerOptions: ['请选择'],
        selectedLayer: '',
        selectedLayerIndex: 0,
        showAddModal: false,
        addValue: ''
      });
      
      wx.showToast({ title: '货架添加成功', icon: 'success' });
      
    } else if (addType === 'layer') {
      const displayValue = value + '层';
      if (this.data.layersByAreaShelf[selectedArea][selectedShelf].includes(displayValue)) {
        wx.showToast({ title: '该层数已存在', icon: 'none' });
        return;
      }
      
      const newLayers = [...this.data.layersByAreaShelf[selectedArea][selectedShelf], displayValue].sort((a, b) => {
        return Number(a.replace('层', '')) - Number(b.replace('层', ''));
      });
      
      const newLayersByAreaShelf = {
        ...this.data.layersByAreaShelf,
        [selectedArea]: {
          ...this.data.layersByAreaShelf[selectedArea],
          [selectedShelf]: newLayers
        }
      };
      
      this.setData({
        layersByAreaShelf: newLayersByAreaShelf,
        layerOptions: ['请选择', ...newLayers],
        selectedLayer: displayValue,
        selectedLayerIndex: newLayers.indexOf(displayValue) + 1,
        showAddModal: false,
        addValue: ''
      });
      
      wx.showToast({ title: '层数添加成功', icon: 'success' });
    }
  },

  async submitAdd() {
    const { part, selectedArea, selectedShelf, selectedLayer } = this.data;
    
    if (!part.materialDesc || !part.materialDesc.trim()) {
      wx.showToast({ title: '请输入物料描述', icon: 'none' });
      return;
    }
    
    if (!part.materialCode || !part.materialCode.trim()) {
      wx.showToast({ title: '请输入物料编码', icon: 'none' });
      return;
    }

    const usesWarehouseArea = this.data.usesWarehouseArea;
    const isFreeTextLocation = !usesWarehouseArea || this.data.locationTypeIndex === 1;
    if (usesWarehouseArea && (!selectedArea || (!isFreeTextLocation && (!selectedShelf || !selectedLayer)))) {
      wx.showToast({ title: isFreeTextLocation ? '请选择货区' : '请选择完整的货区、货架和层数', icon: 'none' });
      return;
    }
    if (usesWarehouseArea && isFreeTextLocation && !(part.locationNote || '').trim()) {
      wx.showToast({ title: '请输入具体存放位置', icon: 'none' });
      return;
    }

    const totalStock = part.totalStock === undefined || part.totalStock === ''
      ? 0
      : Number(part.totalStock);
    if (!Number.isFinite(totalStock) || totalStock < 0) {
      wx.showToast({ title: '库存总量不能小于0', icon: 'none' });
      return;
    }
    
    this.setData({ isLoading: true });
    
    try {
      const shelfNum = isFreeTextLocation ? null : Number(selectedShelf.replace('号', ''));
      const layerNum = isFreeTextLocation ? null : Number(selectedLayer.replace('层', ''));
      const position = part.position === undefined || part.position === '' ? null : Number(part.position);
      const location = part.location === undefined || part.location === '' ? null : Number(part.location);
      if ((!isFreeTextLocation && ![shelfNum, layerNum].every(Number.isFinite)) ||
          (position !== null && !Number.isFinite(position)) ||
          (location !== null && !Number.isFinite(location))) {
        throw new Error('库位数字格式不正确');
      }
      
      const locationCode = isFreeTextLocation || position === null || location === null
        ? null
        : String(shelfNum).padStart(2, '0') +
          String(position).padStart(2, '0') +
          String(layerNum).padStart(2, '0') +
          String(location).padStart(2, '0');
      
      const newPart = {
        workshopCode: this.data.selectedWorkshopCode,
        materialCode: part.materialCode.trim(),
        materialDesc: part.materialDesc.trim(),
        totalStock,
        shelf: shelfNum,
        position: position,
        layer: layerNum,
        location: location,
        locationCode: locationCode,
        unit: part.unit || '个',
        maxStock: part.maxStock === undefined || part.maxStock === '' ? null : Number(part.maxStock),
        reorderPoint: part.reorderPoint === undefined || part.reorderPoint === '' ? null : Number(part.reorderPoint),
        price: part.price === undefined || part.price === '' ? null : Number(part.price),
        partType: this.data.partTypeOptions[this.data.partTypeIndex],
        usageDescription: (part.usageDescription || '').trim(),
        warehouseArea: usesWarehouseArea ? (String(part.warehouseArea || '').trim() || selectedArea) : '',
        warehouseAreaName: usesWarehouseArea ? (selectedArea || '') : '',
        locationType: isFreeTextLocation ? 'free_text' : 'shelf',
        locationNote: isFreeTextLocation ? String(part.locationNote || '').trim() : '',
        remark: part.remark || ''
      };

      if ([newPart.maxStock, newPart.reorderPoint, newPart.price].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
        throw new Error('储备、订购点和单价必须是非负数');
      }
      if (newPart.maxStock !== null && newPart.reorderPoint !== null && newPart.reorderPoint > newPart.maxStock) {
        throw new Error('订购点不能高于最高储备');
      }
      
      const res = await api.addPart(newPart);
      
      if (res.success) {
        wx.showToast({ title: '添加成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
      }
    } catch (err) {
      console.error('添加失败：', err);
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  }
});
