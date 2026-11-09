// Share only this page instance's complete shelf reads; never persist account data.
export function createShelfPartsCache({ ttl = 30000, now = Date.now } = {}) {
  const entries = new Map()
  return {
    peek(key) { return entries.get(key)?.rows },
    set(key, rows) { entries.set(key, { rows, at: now() }) },
    clear() { entries.clear() },
    async get(key, load) {
      const existing = entries.get(key)
      if (existing?.promise) return existing.promise
      if (existing?.rows && now() - existing.at < ttl) return existing.rows
      const entry = { rows: existing?.rows, at: existing?.at }
      entries.set(key, entry)
      entry.promise = Promise.resolve().then(load).then(rows => {
        if (!Array.isArray(rows)) throw new Error('货架备件读取未完成，请重新加载')
        if (entries.get(key) === entry) { entry.rows = rows; entry.at = now() }
        return rows
      }).finally(() => { if (entries.get(key) === entry) delete entry.promise })
      return entry.promise
    }
  }
}
