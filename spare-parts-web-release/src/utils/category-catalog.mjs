import { pinyin } from 'pinyin-pro'

const collator = new Intl.Collator('en', { sensitivity:'base', numeric:true })
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase()

export function prepareCategoryCatalog(rows = []) {
  return rows.map(item => {
    const name = normalize(item.name)
    const romanized = pinyin(name, { toneType:'none', type:'array', nonZh:'consecutive' }).join('')
    const initials = pinyin(name, { pattern:'first', toneType:'none', type:'array', nonZh:'consecutive' }).join('')
    return { ...item, searchText:normalize(`${item.name} ${item.keywords || ''} ${item.description || ''} ${romanized} ${initials}`), sortText:romanized }
  }).sort((a,b)=>collator.compare(a.sortText,b.sortText) || collator.compare(a.name,b.name) || Number(a.id)-Number(b.id))
}

export function searchCategoryCatalog(rows, text) {
  const terms = normalize(text).split(/\s+/).filter(Boolean)
  return rows.filter(row => terms.every(term => row.searchText.includes(term)))
}

export function referenceImageForModel(modelUrl) {
  const url = String(modelUrl || '').trim()
  if (/^\/models\/categories\/[a-z0-9_-]+\.glb$/i.test(url)) return url.replace(/\.glb$/i, '.jpg')
  if (/^\/models\/reference-20260904\/[a-z0-9_-]+\.glb$/i.test(url)) return url.replace(/\.glb$/i, '.png')
  return ''
}
