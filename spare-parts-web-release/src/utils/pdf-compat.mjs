// PDF.js' legacy build still uses structuredClone in its main-thread worker.
// Older Android WebViews need a real typed-array/cycle/transfer implementation.
let ready
export function ensurePdfCompatibility() {
  if (typeof globalThis.structuredClone === 'function') return Promise.resolve()
  if (!ready) ready = import('core-js/actual/structured-clone.js').then(() => {
    if (typeof globalThis.structuredClone !== 'function') throw new Error('PDF clone compatibility unavailable')
  }).catch(error => { ready = undefined; throw error })
  return ready
}
