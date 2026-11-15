// Connection topology transcribed from knowledge #19 PDF p2 and checked against
// #17 PDF p2 / #20 and #26 PDF pp23-24. This is not an installation routing map.
const connection=(id,from,to,kind,cable='')=>Object.freeze({id,from:Object.freeze(from),to:Object.freeze(to),kind,cable})
export const powerConnections=Object.freeze([
 connection('pickup-one',['pickup','THM 1'],['tpm','X21'],'pickup'),
 connection('pickup-two',['pickup','THM 2'],['tpm','X31'],'pickup'),
 connection('tpm-bus',['tpm','X11'],['power-bus','配电端子排'],'power','11715073'),
 connection('bus-supply',['power-bus','高压母线'],['dcdc','输入端'],'power'),
 connection('bus-ekk',['power-bus','高压母线'],['ekk','X1501'],'power','18158153'),
 connection('storage-power',['ekk','X2361'],['supercapacitor','ES+ / ES−'],'storage','18147356'),
 connection('storage-monitor',['ekk','X5221'],['supercapacitor','X5222'],'monitor','18161081'),
 connection('ekk-plc',['ekk','X4102'],['plc','SBus接口'],'communication'),
 connection('plc-vehicle',['plc','输入输出接口'],['control','充电状态与复位'],'signal')
])
export const powerTerminations=Object.freeze([
 Object.freeze({partId:'ekk',port:'X4101',component:'终端电阻',partNumber:'13287036'}),
 Object.freeze({partId:'supercapacitor',port:'X5221',component:'末端短接帽',partNumber:'28217063'})
])
export function powerCircuitFor(variant='old'){
 if(!['old','new'].includes(variant))throw new Error('Unknown AGV variant')
 return {connections:powerConnections,terminations:powerTerminations,referenceKnowledgeIds:[17,19,variant==='new'?26:20],
  sourcePages:[{knowledgeId:19,pdfPages:[2]},{knowledgeId:variant==='new'?26:20,pdfPages:[23,24]}],
  inputRatingNote:'接线示意资料标500V母线，整车图纸稳压电源另标AC600V转DC48V；输入额定值未按实车铭牌统一确认。',
  geometryNote:'连接关系依据原图；器件安装点和线束空间路线为结构示意。'}
}
export function connectionsForPart(partId,variant='old'){
 return powerCircuitFor(variant).connections.filter(c=>c.from[0]===partId||c.to[0]===partId)
}
export const powerPartDescriptions=Object.freeze({
 pickup:'车底两块THM取电板接收无线供能，分别连接TPM的X21、X31接口。两块取电板作为同一组件展示。',
 tpm:'车载无线取电变换器。两块THM分别接入X21、X31，X11经配电端子排向稳压电源和EKK支路供能；长散热壳体按实物辨识。',
 dcdc:'车载稳压电源向行走、顶升及后续配电回路提供48V电源。输入侧额定值在资料间存在差异，连接与位置按对应车型核对。',
 ekk:'EKK超级电容管理器，原厂名称为能量耦合器。X1501接车载母线，X2361接EKS储能功率端，X5221接储能监控，X4102与PLC通信。',
 supercapacitor:'EKS超级电容用于储存电能，通过ES+、ES−与EKK连接，并有独立监控连接。图纸以EKV表示储能组合；模型不把单元和组合重复计为两套设备。',
 plc:'SEW MOVI-PLC控制器与EKK通信，处理储能相关状态，并与车辆主控交换充电、低电量及复位信号。它与车辆主控制器分别展示。'
})
