import path from 'node:path'

const text = source => typeof source === 'string' ? source : new TextDecoder().decode(source)
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]

// Vite first combines route/component CSS. Inline its emitted stylesheet in the
// entry so rendering does not depend on a second stylesheet resource request.
export function inlineStylesInBundle(bundle, base = '/') {
  const cssFiles = Object.keys(bundle).filter(name => bundle[name].type === 'asset' && name.endsWith('.css'))
  const inlined = new Set()
  for (const item of Object.values(bundle)) {
    if (item.type !== 'asset' || !item.fileName.endsWith('.html')) continue
    item.source = text(item.source).replace(/<link\b[^>]*>/gi, tag => {
      if (!String(attribute(tag, 'rel') || '').toLowerCase().split(/\s+/).includes('stylesheet')) return tag
      const href = attribute(tag, 'href') || ''
      if (/^(?:[a-z]+:)?\/\//i.test(href)) throw new Error(`Cannot inline an external stylesheet: ${href}`)
      let filename = href.split(/[?#]/)[0]
      if (base !== '/' && filename.startsWith(base)) filename = filename.slice(base.length)
      filename = path.posix.normalize(filename).replace(/^(?:\.\/|\/)/, '')
      const css = bundle[filename]
      if (!css || css.type !== 'asset' || !filename.endsWith('.css')) throw new Error(`Missing emitted stylesheet: ${href}`)
      inlined.add(filename)
      // HTML raw-text parsing ignores CSS strings/comments. Escape a possible
      // closing style tag before it can terminate this element; CSS restores /.
      const safeCss = text(css.source).replace(/<\/style/gi, match => match.replace('</', '<\\/'))
      return `<style data-built-styles>${safeCss}</style>`
    })
  }
  for (const filename of cssFiles) {
    if (!inlined.has(filename)) throw new Error(`Stylesheet was not included in an entry: ${filename}`)
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk' && chunk.code.includes(filename)) throw new Error(`JavaScript still preloads stylesheet: ${filename}`)
    }
  }
  for (const filename of inlined) delete bundle[filename]
  return inlined.size
}

export function inlineBuildStyles() {
  let base = '/'
  return {
    name: 'inline-built-styles',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { base = config.base },
    generateBundle: { order: 'post', handler(_options, bundle) { inlineStylesInBundle(bundle, base) } }
  }
}
