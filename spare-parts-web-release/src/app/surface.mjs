// Shared business data, independent App presentation. A narrow desktop window
// stays a desktop website; embedded mini-program pages retain their own surface.
export function isAppSurface({userAgent=globalThis.navigator?.userAgent||'',windowObject=globalThis.window}={}) {
 if (/DigitalWorkbench(?:Android|IOS)\//.test(userAgent)) return true
 if (windowObject?.__wxjs_environment==='miniprogram') return false
 const narrow=windowObject?.matchMedia?.('(max-width: 760px)')?.matches
 const coarse=windowObject?.matchMedia?.('(pointer: coarse)')?.matches
 const standalone=windowObject?.navigator?.standalone===true||windowObject?.matchMedia?.('(display-mode: standalone)')?.matches
 return Boolean((narrow||standalone)&&(coarse||/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)))
}

const appPaths=new Set(['/portal','/account','/inventory','/movements','/replenishment','/warehouse-3d','/check','/robot-program','/knowledge','/raw-duties','/fire-inspection','/agv-vehicles','/control-passwords'])
export function appPathAllowed(path){
 const [pathname,query='']=String(path).split('?')
 if(!appPaths.has(pathname))return false
 if(pathname!=='/account')return true
 const params=new URLSearchParams(query)
 return [...params.keys()].every(key=>key==='tab')&&params.getAll('tab').length<=1&&(!params.has('tab')||params.get('tab')==='profile')
}
