export function locatedPartDisplay(part = {}) {
  const clean = value => String(value || '').replace(/[，,;；\s]+$/g, '').trim()
  const name = clean(part.materialDesc || part.name || part.materialCode)
  const spec = clean(part.spec)
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s,，、;；·-]+/g, '')
  return { name, code:String(part.materialCode || part.code || ''), spec:spec && !normalize(name).includes(normalize(spec)) ? spec : '' }
}
