import fs from 'node:fs'
import crypto from 'node:crypto'

export const clean = value => /^(?:null|undefined)$/i.test(String(value ?? '').trim()) ? '' : String(value ?? '').normalize('NFKC').trim()

// Quoted CSV/TSV, including embedded separators, escaped quotes and newlines.
export function parseLedger(text) {
  text = text.replace(/^\uFEFF/, '')
  const delimiter = text.slice(0, text.indexOf('\n')).includes('\t') ? '\t' : ','
  const rows = []; let row = [], value = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ }
      else if (quoted || value === '') quoted = !quoted
      else value += c
    } else if (!quoted && (c === delimiter || c === '\n')) {
      row.push(value.replace(/\r$/, '')); value = ''
      if (c === '\n') { if (row.some(v => v.trim())) rows.push(row); row = [] }
    } else value += c
  }
  if (quoted) throw new Error('未闭合的引号，停止导入')
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row) }
  const headers = rows.shift() || []
  for (const header of ['物料编码', '名称', '品牌', '型号类别', '规格']) if (!headers.includes(header)) throw new Error(`缺少列：${header}`)
  const seen = new Set()
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`第 ${i + 2} 行列数不一致`)
    const r = Object.fromEntries(headers.map((h, n) => [h, clean(cells[n])]))
    if (!r.物料编码 || !r.名称 || seen.has(r.物料编码)) throw new Error(`第 ${i + 2} 行编码缺失、重复或名称缺失`)
    seen.add(r.物料编码)
    return { code:r.物料编码, name:r.名称, brand:r.品牌, existingCategory:r.型号类别, spec:r.规格 }
  })
}

export function readLedger(file) {
  const bytes = fs.readFileSync(file)
  const text = new TextDecoder('utf-8', { fatal:true }).decode(bytes)
  return { sha256:crypto.createHash('sha256').update(bytes).digest('hex'), records:parseLedger(text) }
}

export const fingerprint = part => crypto.createHash('sha256').update(JSON.stringify([part.code, part.name, part.brand, part.spec].map(clean))).digest('hex')

// Suggestions for research only. No database update and no claim of exact geometry.
const rules = [
  ['auxiliary-contact', /辅助触[点头]|辅助接点/],
  ['motor-protector', /电机保护|马达断路器|马达保护|\bGV[23][- ]?(?:ME|PM|P)\d/i],
  ['breaker-1p', /(?:断路器|空气开关|空开).*\b1P\b/i],
  ['breaker-2p', /(?:断路器|空气开关|空开).*\b2P\b/i],
  ['breaker-4p', /(?:断路器|空气开关|空开).*\b4P\b/i],
  ['bearing-unit', /带座.*轴承|轴承单元|\bU(?:CP|CF|CFL|CFU|KP)\d/i],
  ['bearing-housing', /轴承座|\bSNL?\d/i],
  ['bearing-cover', /轴承.*盖|ETCF|TSN\d/i],
  ['filter-bag', /滤袋|布筒/], ['wire-rope', /钢丝绳/], ['rupture-disc', /爆破片/],
  ['hydraulic-unit', /液压|纠偏装置/],
  ['reducer', /减速机|减速器|减速电机/],
  ['power-supply', /开关电源|电源模块|电源模组|直流电源/],
  ['level-sensor', /料位|液位/], ['barcode-scanner', /扫码|扫描|读码|条码/],
  ['soft-starter', /软启动/], ['contactor', /接触器/], ['vfd', /变频器/],
  ['relay', /继电器/], ['bearing', /轴承/], ['circuit-breaker', /断路器|空气开关|空开/],
  ['sensor', /传感器|接近开关|光电开关|磁性开关|热电阻|热电偶|跑偏开关/],
  ['v-belt', /三角带|V带|V型带|同步带|齿楔带/], ['belt', /输送带|皮带(?!机|清扫器)/],
  ['coupling', /联轴器/], ['encoder', /编码器/], ['electric-cylinder', /电动缸|电缸/],
  ['motor', /电机|电动机/],
  ['plc-module', /CPU|PLC|通讯模块|通信模块|接口模块|分站模块|分布式IO|通讯处理器|称重模块|网络耦合器|数字量.*模块|模拟量.*模块|输入.*模块|输出.*模块/i],
  ['instrument', /仪表|压力表|电流表|电压表|多功能表|变送器/], ['resistor', /电阻器|制动电阻/],
  ['junction-box', /接线盒|接线箱/], ['switch', /开关|按钮/], ['chain', /链条|滚子链/],
  ['cylinder', /气缸/], ['scraper', /刮板|刮刀/], ['flexible-connector', /软连/],
  ['filter-mesh', /滤网/], ['adapter-sleeve', /紧定套/], ['network-switch', /交换机/],
  ['pneumatic-unit', /气源处理|气动.*联件|二联件|三联件/], ['rgv-part', /RGV.*(?:胶垫|缓冲)/i],
  ['gear-sprocket', /齿轮|链轮/], ['seal', /密封|盘根|油封/], ['pipe-fitting', /管接|管件|弯头|接头/],
  ['clutch', /离合器/], ['cable', /电缆/], ['brake', /制动器|刹车/], ['fan', /风扇|风机/],
  ['5g-cpe', /CPE|5G/i], ['fuse', /熔断器|保险丝/], ['muffler', /消声器|消音器/],
  ['hmi-panel', /触摸屏|操作面板|HMI/i], ['control-board', /控制板|主控板|显示板|脉冲控制器/],
  ['sieve-mesh', /筛网|筛片|筛格|钢丝布/], ['bucket', /畚斗|料斗/], ['backstop', /止逆器|逆止器/],
  ['idler-roller', /托辊|辊筒|滚筒/], ['rubber-spring', /橡胶弹簧|减振弹簧/], ['caster-wheel', /万向轮|脚轮/]
]

export function reviewPart(part) {
  const text = `${part.name} ${part.spec}`
  const family = rules.find(([, pattern]) => pattern.test(text))?.[0] || null
  const issues = []
  if (!part.brand) issues.push('品牌缺失')
  if (!part.spec) issues.push('规格缺失')
  if (!part.existingCategory) issues.push('原类别为空')
  if (/3P|三极/i.test(part.existingCategory) && ['breaker-1p','breaker-2p','breaker-4p','motor-protector'].includes(family)) issues.push('原3P类别与极数或保护器结构不符')
  if (/电机|马达|减速/.test(part.existingCategory) && family === 'motor-protector') issues.push('电机保护器错配为电机')
  if (/禁止使用|停用/.test(text)) issues.push('物料标记停用或禁止使用，禁止自动关联')
  return { ...part, fingerprint:fingerprint(part), family, issues, researchStatus:'待核查厂家资料', quality:'类别示意', exactModel:null }
}
