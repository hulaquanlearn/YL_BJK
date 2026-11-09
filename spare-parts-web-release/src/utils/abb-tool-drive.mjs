// Source EIO: DO18/19 = belt forward/reverse, DO20/21 = rotor directions;
// DO22 is the program's combined spreading enable. Speed is a display ratio,
// not a field-calibrated belt velocity or RPM.
export function toolDrive(cell) {
 const s=cell?.signals||{}, enabled=name=>Number(s[name])===1
 const combined=enabled('do22_boji_zz_dk')
 const direction=(forward,reverse)=>forward&&reverse?0:reverse?-1:forward?1:0
 const reverseBelt=enabled('do19_pidai_fanzhuan'),reverseRotor=enabled('do21_dasan_fanzhuan')
 const ratio=value=>{const raw=Number(value);return Number.isFinite(raw)?Math.max(0,Math.min(3,raw/1000)):1}
 const speed=ratio(s.go32_47_boqi_zhuansu),rotorSpeed=ratio(s.go48_63_dasan_zhuansu)
 const automatic=cell?.profile==='brewing-cell@1',active=!automatic||!cell.complete&&!enabled('do99_bopi_zhuangliao')&&bucketHasMaterial(cell)
 const forward=(name,reverse)=>name in s?enabled(name):combined&&!reverse
 return {belt:active?direction(forward('do18_pidai_zhengzhuan',reverseBelt),reverseBelt):0,rotor:active?direction(forward('do20_dasan_zhengzhuan',reverseRotor),reverseRotor):0,speed,rotorSpeed}
}

export function toolGuardOpen(cell,signals=cell?.signals||{}){
 if(cell?.profile==='brewing-cell@1')return Number(!cell.complete&&!Number(signals.do99_bopi_zhuangliao)&&!!Number(signals.do22_boji_zz_dk)&&Number(cell.bucketVolume)>1e-8)
 return Number(!!Number(signals.do16_dakai_huzhao))
}

export function bucketHasMaterial(cell){const volume=Number(cell?.bucketVolume)||0,remaining=Number(cell?.targetVolume)-Number(cell?.depositedVolume);return volume>=.001||volume>1e-8&&remaining>0&&remaining<=.001}
