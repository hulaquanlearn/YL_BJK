// Share one source marker across ordinary API and weekly-duty requests.
export function clientPlatform(userAgent = globalThis.navigator?.userAgent || '', embeddedMini = globalThis.window?.__wxjs_environment === 'miniprogram') {
  if (embeddedMini || /\bminiProgram\b/i.test(userAgent)) return 'miniprogram'
  return /\bDigitalWorkbenchAndroid\//.test(userAgent) ? 'android' : 'web'
}
