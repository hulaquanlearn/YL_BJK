// Relative schematic coordinates, not measured dimensions or fire equipment positions.
export const parkBuildings = [
  {id:'three',name:'三车间',facade:'upper-windows-long-sides',boxes:[[30,0,25,36]]},
  {id:'two',name:'二车间',facade:'upper-windows-long-sides',boxes:[[60,0,25,36]]},
  {id:'one',name:'一车间',facade:'upper-windows-long-sides',boxes:[[90,0,25,36]]},
  {id:'six',name:'六车间',facade:'upper-windows-long-sides',boxes:[[30,72,25,36]]},
  {id:'five',name:'五车间',facade:'upper-windows-long-sides',boxes:[[66.5,72,18.5,36]]},
  {id:'four',name:'四车间',facade:'upper-windows-long-sides',boxes:[[97,72,11,60]]},
  {id:'qu',name:'制曲车间',boxes:[[-12,0,24,15],[-12,15,11,21]]},
  {id:'breaking',name:'原粮破曲',boxes:[[1,17,11,19]]},
  {id:'grain',name:'原粮五粮',boxes:[[1,73,11,13]]},
  {id:'steam',name:'原粮蒸糠',boxes:[[1,94,11,13]]},
  {id:'seven',name:'七车间',facade:'upper-windows-long-sides',boxes:[[70,178,12,28]]}
]
export const parkCorridors = [
  {id:'breaking-three',from:[12,27],to:[30,27],style:'steel',name:'破曲—三车间'},
  {id:'three-two',from:[55,27],to:[60,27],style:'window',name:'三—二车间'},
  {id:'two-one',from:[85,27],to:[90,27],style:'window',name:'二—一车间'},
  {id:'three-six',from:[42.5,36],to:[42.5,72],style:'window',name:'三—六车间'},
  {id:'breaking-grain',from:[12,27],to:[12,80.5],style:'window',name:'破曲—五粮'},
  {id:'grain-six',from:[12,80.5],to:[30,80.5],style:'window',name:'五粮—六车间'},
  {id:'six-five',from:[55,80.5],to:[66.5,80.5],style:'solid',name:'六—五车间'},
  {id:'five-four',from:[85,80.5],to:[102.5,80.5],style:'window',name:'五—四车间'},
  {id:'one-four',from:[102.5,36],to:[102.5,80.5],style:'window',name:'一—四车间'},
  {id:'hexi-long',from:[102.5,132],to:[102.5,160],style:'panel',name:'河西连廊'},
  {id:'hexi-cross',from:[102.5,160],to:[76,160],style:'steel',name:'七车间外横向连廊'},
  {id:'hexi-seven',from:[76,160],to:[76,178],style:'steel',name:'河西连廊接七车间'}
]
export const parkLayoutNote='位置按已确认2D绘制；外观参考实景，尺寸与层高为示意。消防器材尚未标定坐标。'
// User confirmed a winding river behind five/six continuing beneath the long Hexi corridor.
export const parkRiverPoints=[[-10,116],[20,125],[50,132],[78,140],[102.5,146],[126,154],[152,159]]
export const parkRooms=[{id:'spare-room',name:'备件库',building:'grain',floor:1,box:[7.5,82,4.5,4]}]
