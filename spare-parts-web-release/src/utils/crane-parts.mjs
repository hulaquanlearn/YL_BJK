// Stable identifiers for the offline intelligent-crane display.
//
// Page numbers refer to the user's 168-page deck "古井贡76套智能行车调试培训".
// The deck is a commissioning/training document, not a CAD model or a motion
// program: every proportion, stroke and pose below is an offline illustration.
// No internal IP address, account, credential or commissioning command is
// copied into these identifiers, and nothing here is a field limit.
export const craneSystems=[
 {
  id:'runway',
  label:'轨道与供电',
  description:'大车沿车间两侧轨道行走，轨道梁与立柱承重，滑触线经集电器给整车取电。资料按车间给出轨道长度与行车台数，但本模型的跨度、柱距和轨道长度都是展示比例，不是现场尺寸。',
  sourceSlides:[8,93,94,95,96,97,101],
  parts:['runway','collector']
 },
 {
  id:'bridge',
  label:'大车与主梁',
  description:'大车为双梁桥式结构：两根主梁落在南北端梁上，南北端梁各一台伺服行走电机（资料编号 M1/M2，共两台，不是每端两台），配激光测距、读码定位、声光报警、无线网桥与拖链。总装布局已按第94—97及109—111页复核；梁高、端梁轴距仍为示意。',
  sourceSlides:[53,54,55,56,57,69,94,95,96,97,110],
  parts:['bridge-girder','bridge-walkway','endcarriage-south','endcarriage-north','travel-motors','bridge-cabinet','alarm-beacon','limit-switches','cable-chains','wireless-bridge','platform-lights','safety-door-switches','camera']
 },
 {
  id:'telescopic',
  label:'伸缩小车与提升',
  description:'伸缩小车在两根主梁上沿跨度方向行走，行走与提升都为成对驱动，并带防坠电缸、伸缩到位反馈、伸缩臂上限位和导轨润滑。模型把提升画成三节伸缩臂，行程比例仅用于演示，不是实测提升高度。',
  sourceSlides:[112,113,114,118,119,120,121,122,123,124,125,126,127,128,129,130,131],
  parts:['trolley-frame','trolley-drive','telescopic-mast','trolley-cabinet','trolley-laser','trolley-hoist-motors','trolley-slip-ring','trolley-junction-box','trolley-limit-switches','trolley-anti-fall','trolley-oiler']
 },
 {
  id:'grab',
  label:'抓斗与旋转',
  description:'抓斗通过回转支承相对提升臂旋转，两台电动推杆带动颚板开合，带上下限位磁性开关和起重量限制器。模型用两片颚板表示开合，开合角度和斗容均为示意，不是现场速度、载荷或精确轨迹。',
  sourceSlides:[132,133,134,135,136,137,138,139,140,141],
  parts:['grab','grab-jaws','grab-motors','grab-rotation-motor','grab-limit-switches','grab-load-limiter']
 },
 {
  id:'transfer',
  label:'周转小车与提升',
  description:'周转小车悬挂在双主梁内侧下方，沿跨度方向横移，两侧各有行走与提升驱动，配行程开关、卷扬机高度限位和起重量限制器；布置按总装图复核，尺寸为示意。',
  sourceSlides:[142,143,144,145,146,158,159,160,161,162],
  parts:['transfer-car','transfer-hoist','transfer-cabinet','transfer-laser','transfer-drive-motors','transfer-hoist-motors','transfer-hoist-limits','transfer-limit-switches','transfer-load-limiters']
 },
 {
  id:'turnover',
  label:'周转翻转与2D扫描',
  description:'周转翻转吊具由翻转伺服、四组电动推杆和插销接近开关组成，2D激光扫描仪装在独立的伺服云台上。翻转角度与云台位置为示意，资料没有给出翻转轴的实际方位和限位值。',
  sourceSlides:[147,148,149,151,152,155,165,166,167],
  parts:['turnover-flip','transfer-hopper','laser-gimbal','turnover-pushrods','turnover-pin-switches','turnover-flip-motor','turnover-stepper','turnover-oiler','turnover-level-sensor']
 },
 {
  id:'positioning',
  label:'定位与读码',
  description:'激光测距网关汇接伸缩小车与周转小车的激光传感器，大车南侧另有读码相机、北侧有读码传感器，用于行走方向定位。设备编号沿用资料，网关 IP、PN 名称和调试报文不属于展示内容。',
  sourceSlides:[84,85,86,87,88,89,90,96,102,103,104,105],
  parts:['laser-gateway','code-reader','read-code-sensor']
 }
];

// Every part appears in exactly one system. The model builder and the viewer
// both rely on this list being flat and duplicate-free.
export const craneSystemPartIds=Object.freeze(craneSystems.flatMap(system=>system.parts));

// 部件 → 机器人机构/伺服轴 对照，用于让三维点选说明与控制器反馈一致。
// mechanism 取 craneProgramAxes 的机构名；axes 为 A0–A15 控制器轴。
export const cranePartMechanism=Object.freeze({
 'runway':{mechanism:'结构件·轨道',axes:[]},
 'collector':{mechanism:'大车供电',axes:[]},
 'bridge-girder':{mechanism:'结构件·双主梁',axes:[]},
 'bridge-walkway':{mechanism:'结构件·走台',axes:[]},
 'endcarriage-south':{mechanism:'大车行走',axes:['A0','A1']},
 'endcarriage-north':{mechanism:'大车行走',axes:['A0','A1']},
 'travel-motors':{mechanism:'大车行走',axes:['A0','A1']},
 'bridge-cabinet':{mechanism:'大车控制柜',axes:[]},
 'alarm-beacon':{mechanism:'声光报警',axes:[]},
 'limit-switches':{mechanism:'大车前后限位',axes:[]},
 'cable-chains':{mechanism:'拖链与线槽',axes:[]},
 'wireless-bridge':{mechanism:'无线网桥与摄像头',axes:[]},
 'platform-lights':{mechanism:'平台大灯',axes:[]},
 'safety-door-switches':{mechanism:'安全门开关',axes:[]},
 'camera':{mechanism:'监控摄像头',axes:[]},
 'trolley-frame':{mechanism:'伸缩小车结构',axes:[]},
 'trolley-drive':{mechanism:'伸缩小车行走',axes:['A2','A3']},
 'telescopic-mast':{mechanism:'伸缩提升',axes:['A4','A5']},
 'trolley-cabinet':{mechanism:'伸缩小车与抓斗动力柜',axes:[]},
 'trolley-laser':{mechanism:'伸缩小车激光定位',axes:[]},
 'trolley-hoist-motors':{mechanism:'伸缩提升',axes:['A4','A5']},
 'trolley-slip-ring':{mechanism:'伸缩提升',axes:['A4','A5']},
 'trolley-junction-box':{mechanism:'伸缩小车分线盒',axes:[]},
 'trolley-limit-switches':{mechanism:'伸缩限位与高度限制',axes:[]},
 'trolley-anti-fall':{mechanism:'防坠电缸',axes:[]},
 'trolley-oiler':{mechanism:'导轨电动加油器',axes:[]},
 'grab':{mechanism:'抓斗开合与旋转',axes:['A6','A7','A8']},
 'grab-jaws':{mechanism:'抓斗开合',axes:['A6','A7']},
 'grab-motors':{mechanism:'抓斗开合',axes:['A6','A7']},
 'grab-rotation-motor':{mechanism:'抓斗换向',axes:['A8']},
 'grab-limit-switches':{mechanism:'抓斗开合',axes:['A6','A7']},
 'grab-load-limiter':{mechanism:'抓斗开合',axes:[]},
 'transfer-car':{mechanism:'周转小车行走',axes:['A9','A10']},
 'transfer-hoist':{mechanism:'周转提升',axes:['A11','A12']},
 'transfer-cabinet':{mechanism:'周转动力柜',axes:[]},
 'transfer-laser':{mechanism:'周转激光定位',axes:[]},
 'transfer-drive-motors':{mechanism:'周转小车行走',axes:['A9','A10']},
 'transfer-hoist-motors':{mechanism:'周转提升',axes:['A11','A12']},
 'transfer-hoist-limits':{mechanism:'周转提升',axes:['A11','A12']},
 'transfer-limit-switches':{mechanism:'周转小车行走',axes:['A9','A10']},
 'transfer-load-limiters':{mechanism:'周转提升',axes:[]},
 'turnover-flip':{mechanism:'周转翻转',axes:['A13','A14']},
 'transfer-hopper':{mechanism:'周转翻转·料斗',axes:['A13','A14']},
 'laser-gimbal':{mechanism:'2D 扫描云台',axes:['A15']},
 'turnover-pushrods':{mechanism:'周转翻转',axes:['A13','A14']},
 'turnover-pin-switches':{mechanism:'周转翻转',axes:['A13','A14']},
 'turnover-flip-motor':{mechanism:'周转翻转',axes:['A13','A14']},
 'turnover-stepper':{mechanism:'周转翻转·步进',axes:[]},
 'turnover-oiler':{mechanism:'周转翻转·加油',axes:[]},
 'turnover-level-sensor':{mechanism:'周转翻转·水平仪',axes:[]},
 'laser-gateway':{mechanism:'激光测距网关',axes:[]},
 'code-reader':{mechanism:'大车定位读码相机',axes:[]},
 'read-code-sensor':{mechanism:'大车定位读码传感器',axes:[]}
});
