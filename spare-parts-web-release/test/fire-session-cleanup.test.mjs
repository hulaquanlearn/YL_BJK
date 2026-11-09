import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function fixture() {
  const values = new Map(), storage = { get length() { return values.size }, key: i => [...values.keys()][i], getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) }
  const source = fs.readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/export /g, '')
  const context = vm.createContext({ localStorage: storage, window: { dispatchEvent() {} }, Event: class {} })
  vm.runInContext(source + '\nthis.api={getUser,setSession,clearSession};', context)
  return { ...context.api, storage }
}
test('fire drafts survive same-account refresh and are removed on account switch', () => {
  const f = fixture(); f.setSession('one', { id: 11 })
  f.storage.setItem('fire-inspection:draft:11:5:8', 'private draft')
  f.storage.setItem('fire-inspection:draft:22:5:8', 'other account')
  f.setSession('one', { id: 11, displayName: 'updated' })
  assert.equal(f.storage.getItem('fire-inspection:draft:11:5:8'), 'private draft')
  f.setSession('two', { id: 22 })
  assert.equal(f.storage.getItem('fire-inspection:draft:11:5:8'), null)
  assert.equal(f.storage.getItem('fire-inspection:draft:22:5:8'), 'other account')
})
test('logging out from any page clears only the outgoing account fire drafts', () => {
  const f = fixture(); f.setSession('one', { id: 11 })
  f.storage.setItem('fire-inspection:draft:11:5:8', 'private draft')
  f.storage.setItem('fire-inspection:draft:111:5:8', 'unrelated draft')
  f.clearSession()
  assert.equal(f.storage.getItem('fire-inspection:draft:11:5:8'), null)
  assert.equal(f.storage.getItem('fire-inspection:draft:111:5:8'), 'unrelated draft')
  assert.equal(f.getUser(), null)
})
